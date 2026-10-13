package group.bhumika.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Base64
import android.view.View
import android.view.WindowManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * Smart Class for interactive flat panels / touch panels.
 * The board UI lives in assets/classroom (HTML + JS) and talks to native
 * speech (TTS / speech recognition) and the AI teacher through [ClassroomBridge].
 */
class ClassroomActivity : AppCompatActivity() {

    lateinit var board: WebView
    private lateinit var libraryPanel: View
    private lateinit var libWeb: WebView
    private lateinit var libTitle: TextView
    private lateinit var bridge: ClassroomBridge

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingMicAction: (() -> Unit)? = null

    private val pickImage = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        fileCallback?.onReceiveValue(uri?.let { arrayOf(it) })
        fileCallback = null
    }

    private val micPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) pendingMicAction?.invoke()
        else sendToBoard("BH.onStt", "error", "Microphone permission denied")
        pendingMicAction = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_classroom)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        goImmersive()

        board = findViewById(R.id.board)
        libraryPanel = findViewById(R.id.libraryPanel)
        libWeb = findViewById(R.id.libWeb)
        libTitle = findViewById(R.id.libTitle)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        with(board.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            setSupportZoom(false)
        }
        board.setBackgroundColor(Color.WHITE)
        board.isHapticFeedbackEnabled = false
        board.overScrollMode = View.OVER_SCROLL_NEVER

        board.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (u.host == "appassets.androidplatform.net") return false
                try { startActivity(Intent(Intent.ACTION_VIEW, u)) } catch (_: Exception) {}
                return true
            }
        }
        board.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?, callback: ValueCallback<Array<Uri>>?, params: FileChooserParams?
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                val wantsImage = params?.acceptTypes?.any { it.startsWith("image") } == true
                val type = if (wantsImage) "image/*" else "*/*"   // lesson files (.json) have no reliable MIME type
                return try { pickImage.launch(type); true } catch (e: Exception) { fileCallback = null; false }
            }
        }

        bridge = ClassroomBridge(this)
        board.addJavascriptInterface(bridge, "Android")
        board.loadUrl("https://appassets.androidplatform.net/assets/classroom/index.html")

        setupLibrary()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    libraryPanel.visibility == View.VISIBLE && libWeb.canGoBack() -> libWeb.goBack()
                    libraryPanel.visibility == View.VISIBLE -> libraryPanel.visibility = View.GONE
                    else -> board.evaluateJavascript("window.BH && BH.onBack ? BH.onBack() : 'exit'") { r ->
                        if (r?.contains("exit") == true) finish()
                    }
                }
            }
        })
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupLibrary() {
        with(libWeb.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            builtInZoomControls = true
            displayZoomControls = false
        }
        libWeb.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                libTitle.text = view?.title ?: "Digital Library"
            }
        }
        findViewById<View>(R.id.libBack).setOnClickListener { libraryPanel.visibility = View.GONE }
        findViewById<View>(R.id.libCapture).setOnClickListener { captureLibraryToBoard() }
    }

    /** Opens the Bhumika digital library (or any URL) over the board. */
    fun openLibrary(url: String) = runOnUiThread {
        libraryPanel.visibility = View.VISIBLE
        if (libWeb.url == null || url != MainActivity.LIBRARY) libWeb.loadUrl(url)
    }

    /** Snapshots the visible library page and sends it to the board as a new page to write on. */
    private fun captureLibraryToBoard() {
        val w = libWeb.width; val h = libWeb.height
        if (w <= 0 || h <= 0) return
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.drawColor(Color.WHITE)
        libWeb.draw(c)
        Thread {
            val out = ByteArrayOutputStream()
            bmp.compress(Bitmap.CompressFormat.JPEG, 85, out)
            bmp.recycle()
            val data = "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
            runOnUiThread {
                libraryPanel.visibility = View.GONE
                sendToBoard("BH.onCapture", data)
            }
        }.start()
    }

    /** Calls a JS function on the board with string arguments (safely quoted). */
    fun sendToBoard(fn: String, vararg args: String?) {
        val js = args.joinToString(",", "$fn(", ")") { if (it == null) "null" else JSONObject.quote(it) }
        runOnUiThread { board.evaluateJavascript(js, null) }
    }

    fun withMicPermission(action: () -> Unit) = runOnUiThread {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            action()
        } else {
            pendingMicAction = action
            micPermission.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    fun backToWebsite(url: String) = runOnUiThread {
        val i = Intent(this, MainActivity::class.java)
            .setData(Uri.parse(url))
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        startActivity(i)
        finish()
    }

    private fun goImmersive() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) goImmersive()
    }

    override fun onPause() {
        bridge.stopSpeaking()
        super.onPause()
    }

    override fun onDestroy() {
        bridge.release()
        board.destroy()
        libWeb.destroy()
        super.onDestroy()
    }
}

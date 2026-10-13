package group.bhumika.app

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.view.View
import android.webkit.CookieManager
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.google.android.material.progressindicator.LinearProgressIndicator

/**
 * Website shell: shows bhumika.group in a WebView with native bottom navigation,
 * file downloads, external-link handling, offline screen and a shortcut into
 * the Smart Class (touch panel + AI teacher).
 */
class MainActivity : AppCompatActivity() {

    companion object {
        const val HOME = "https://www.bhumika.group/"
        const val LIBRARY = "https://www.bhumika.group/ebook"
        const val CATALOGUE = "https://www.bhumika.group/catalogue"
        const val DOWNLOADS = "https://bhumika.group/download"
        private val OWN_HOSTS = setOf("bhumika.group", "www.bhumika.group")
    }

    private lateinit var web: WebView
    private lateinit var swipe: SwipeRefreshLayout
    private lateinit var progress: LinearProgressIndicator
    private lateinit var offline: View
    private lateinit var nav: BottomNavigationView

    private lateinit var chrome: WebChromeClient
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var lastBack = 0L

    // Fullscreen video (site has learning videos + YouTube embeds)
    private var customView: View? = null
    private var customCallback: WebChromeClient.CustomViewCallback? = null

    private val pickFile = registerForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        fileCallback?.onReceiveValue(uris.toTypedArray())
        fileCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        web = findViewById(R.id.web)
        swipe = findViewById(R.id.swipe)
        progress = findViewById(R.id.progress)
        offline = findViewById(R.id.offline)
        nav = findViewById(R.id.bottomNav)

        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            builtInZoomControls = true
            displayZoomControls = false
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = "$userAgentString BhumikaApp/${BuildConfig.VERSION_NAME}"
        }
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                return handleUrl(req.url)
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                progress.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                swipe.isRefreshing = false
                progress.visibility = View.GONE
                syncNav(url)
            }

            override fun onReceivedError(view: WebView, req: WebResourceRequest, error: WebResourceError) {
                if (req.isForMainFrame) {
                    offline.visibility = View.VISIBLE
                    swipe.isRefreshing = false
                }
            }
        }

        chrome = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progress.setProgressCompat(newProgress, true)
            }

            override fun onShowFileChooser(
                webView: WebView?, callback: ValueCallback<Array<Uri>>?, params: FileChooserParams?
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                val type = params?.acceptTypes?.firstOrNull { it.isNotBlank() } ?: "*/*"
                return try { pickFile.launch(type); true } catch (e: Exception) { fileCallback = null; false }
            }

            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                customView = view
                customCallback = callback
                (window.decorView as FrameLayout).addView(
                    view, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
                )
            }

            override fun onHideCustomView() {
                customView?.let { (window.decorView as FrameLayout).removeView(it) }
                customView = null
                customCallback?.onCustomViewHidden()
                customCallback = null
            }
        }
        web.webChromeClient = chrome

        // PDFs / books from the Downloads page
        web.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            try {
                val name = URLUtil.guessFileName(url, contentDisposition, mimeType)
                val req = DownloadManager.Request(Uri.parse(url))
                    .setMimeType(mimeType)
                    .addRequestHeader("User-Agent", userAgent)
                    .addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url) ?: "")
                    .setTitle(name)
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "Bhumika/$name")
                (getSystemService(DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
                Toast.makeText(this, getString(R.string.download_started) + ": " + name, Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                openExternal(Uri.parse(url))
            }
        }

        swipe.setColorSchemeResources(R.color.brand_primary, R.color.brand_accent)
        swipe.setOnRefreshListener { offline.visibility = View.GONE; web.reload() }
        // Only allow pull-to-refresh when page is scrolled to the very top
        swipe.setOnChildScrollUpCallback { _, _ -> web.scrollY > 0 }

        findViewById<View>(R.id.btnRetry).setOnClickListener { offline.visibility = View.GONE; web.reload() }
        findViewById<View>(R.id.btnOfflineClass).setOnClickListener { openClassroom() }

        nav.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_home -> load(HOME)
                R.id.nav_library -> load(LIBRARY)
                R.id.nav_catalogue -> load(CATALOGUE)
                R.id.nav_downloads -> load(DOWNLOADS)
                R.id.nav_classroom -> { openClassroom(); return@setOnItemSelectedListener false }
            }
            true
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    customView != null -> chrome.onHideCustomView()
                    web.canGoBack() -> { offline.visibility = View.GONE; web.goBack() }
                    System.currentTimeMillis() - lastBack < 2000 -> finish()
                    else -> {
                        lastBack = System.currentTimeMillis()
                        Toast.makeText(this@MainActivity, R.string.press_back_again, Toast.LENGTH_SHORT).show()
                    }
                }
            }
        })

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState)
        } else {
            val deepLink = intent?.data?.takeIf { it.host in OWN_HOSTS }?.toString()
            load(deepLink ?: HOME)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        intent.data?.takeIf { it.host in OWN_HOSTS }?.let { load(it.toString()) }
    }

    private fun load(url: String) {
        offline.visibility = View.GONE
        web.loadUrl(url)
    }

    private fun openClassroom() = startActivity(Intent(this, ClassroomActivity::class.java))

    /** Returns true when the URL was handled outside the WebView. */
    private fun handleUrl(uri: Uri): Boolean {
        val scheme = uri.scheme ?: return false
        if (scheme == "http" || scheme == "https") {
            if (uri.host in OWN_HOSTS) return false
            // YouTube, Facebook, WhatsApp, maps etc. open in their own apps
            openExternal(uri)
            return true
        }
        if (scheme == "intent") {
            try {
                val i = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME)
                startActivity(i)
            } catch (e: Exception) { /* ignore */ }
            return true
        }
        // tel:, mailto:, whatsapp:, sms: ...
        openExternal(uri)
        return true
    }

    private fun openExternal(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(this, uri.toString(), Toast.LENGTH_SHORT).show()
        }
    }

    private fun syncNav(url: String?) {
        val u = url ?: return
        val id = when {
            u.contains("/ebook") || u.contains("/myebook") -> R.id.nav_library
            u.contains("/catalogue") -> R.id.nav_catalogue
            u.contains("/download") -> R.id.nav_downloads
            else -> R.id.nav_home
        }
        if (nav.selectedItemId != id) {
            // Update highlight without re-triggering navigation
            nav.menu.findItem(id)?.isChecked = true
        }
    }

    override fun onResume() { super.onResume(); web.onResume() }
    override fun onPause() { web.onPause(); super.onPause() }
    override fun onDestroy() { web.destroy(); super.onDestroy() }
}

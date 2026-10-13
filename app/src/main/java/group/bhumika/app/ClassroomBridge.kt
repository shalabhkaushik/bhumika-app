package group.bhumika.app

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Base64
import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.concurrent.Executors

/**
 * JavaScript <-> native bridge exposed to the board as `window.Android`.
 *
 *  - Text-to-speech in any installed language (the AI teacher's voice)
 *  - Speech recognition in the chosen language (talk to the AI teacher / voice commands)
 *  - AI teacher requests (Claude Messages API, key kept on the native side)
 *  - Saving board pages to the gallery, settings, navigation
 *
 * Results flow back to JS through BH.onTts / BH.onStt / BH.onAi.
 */
class ClassroomBridge(private val act: ClassroomActivity) {

    private val prefs = act.getSharedPreferences("bhumika_ai", Context.MODE_PRIVATE)
    private val io = Executors.newFixedThreadPool(2)

    // ---------------- Text to speech ----------------
    private var tts: TextToSpeech? = null
    @Volatile private var ttsReady = false
    private val lastChunkOf = java.util.concurrent.ConcurrentHashMap<String, String>()   // speakId -> id of its final chunk

    init {
        tts = TextToSpeech(act.applicationContext) { status ->
            ttsReady = status == TextToSpeech.SUCCESS
            act.sendToBoard("BH.onTts", "engine", if (ttsReady) "ready" else "error")
        }
        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String) {
                if (utteranceId.endsWith("#0")) act.sendToBoard("BH.onTts", utteranceId.substringBefore('#'), "start")
            }
            override fun onDone(utteranceId: String) {
                val id = utteranceId.substringBefore('#')
                if (lastChunkOf[id] == utteranceId) { lastChunkOf.remove(id); act.sendToBoard("BH.onTts", id, "done") }
            }
            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String) {
                val id = utteranceId.substringBefore('#')
                lastChunkOf.remove(id); act.sendToBoard("BH.onTts", id, "error")
            }
            override fun onStop(utteranceId: String, interrupted: Boolean) {
                val id = utteranceId.substringBefore('#')
                if (lastChunkOf.remove(id) != null) act.sendToBoard("BH.onTts", id, "stopped")
            }
        })
    }

    /** Returns "ok", "missing" (voice data not installed), "unsupported" or "noengine". */
    @JavascriptInterface
    fun ttsLangStatus(lang: String): String {
        val t = tts ?: return "noengine"
        if (!ttsReady) return "noengine"
        return when (t.isLanguageAvailable(Locale.forLanguageTag(lang))) {
            TextToSpeech.LANG_MISSING_DATA -> "missing"
            TextToSpeech.LANG_NOT_SUPPORTED -> "unsupported"
            else -> "ok"
        }
    }

    @JavascriptInterface
    fun speak(text: String, lang: String, rate: Float, pitch: Float, id: String) {
        val t = tts
        if (t == null || !ttsReady) { act.sendToBoard("BH.onTts", id, "error"); return }
        val res = t.setLanguage(Locale.forLanguageTag(lang))
        if (res == TextToSpeech.LANG_MISSING_DATA || res == TextToSpeech.LANG_NOT_SUPPORTED) {
            act.sendToBoard("BH.onTts", id, "nolang")
            return
        }
        t.setSpeechRate(rate.coerceIn(0.3f, 2.5f))
        t.setPitch(pitch.coerceIn(0.5f, 2f))
        val chunks = splitForTts(text)
        if (chunks.isEmpty()) { act.sendToBoard("BH.onTts", id, "done"); return }
        lastChunkOf[id] = "$id#${chunks.size - 1}"
        chunks.forEachIndexed { i, c ->
            val params = Bundle()
            t.speak(c, if (i == 0) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD, params, "$id#$i")
        }
    }

    @JavascriptInterface
    fun stopSpeaking() {
        tts?.stop()
        lastChunkOf.keys.toList().forEach { act.sendToBoard("BH.onTts", it, "stopped") }
        lastChunkOf.clear()
    }

    @JavascriptInterface
    fun openTtsSettings() {
        try {
            act.startActivity(Intent("com.android.settings.TTS_SETTINGS").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) {
            try { act.startActivity(Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA)) } catch (_: Exception) {}
        }
    }

    private fun splitForTts(text: String): List<String> {
        val max = (TextToSpeech.getMaxSpeechInputLength() - 100).coerceAtLeast(500)
        val clean = text.replace(Regex("[*_#`>]+"), " ").replace(Regex("\\s+"), " ").trim()
        if (clean.isEmpty()) return emptyList()
        // Sentence ends incl. Hindi/Bengali danda (।), Urdu (۔), Arabic (؟), CJK (。)
        val parts = clean.split(Regex("(?<=[.!?।۔؟。])\\s+"))
        val out = ArrayList<String>()
        val sb = StringBuilder()
        for (p in parts) {
            if (sb.length + p.length + 1 > max && sb.isNotEmpty()) { out.add(sb.toString()); sb.clear() }
            if (p.length > max) { p.chunked(max).forEach { out.add(it) } } else { if (sb.isNotEmpty()) sb.append(' '); sb.append(p) }
        }
        if (sb.isNotEmpty()) out.add(sb.toString())
        return out
    }

    // ---------------- Speech recognition ----------------
    private var recognizer: SpeechRecognizer? = null

    @JavascriptInterface
    fun sttAvailable(): Boolean = SpeechRecognizer.isRecognitionAvailable(act)

    @JavascriptInterface
    fun startListening(lang: String) {
        act.withMicPermission {
            if (!SpeechRecognizer.isRecognitionAvailable(act)) {
                act.sendToBoard("BH.onStt", "error",
                    "Speech recognition is not installed on this panel. Install the Google app / Speech Services, or type instead.")
                return@withMicPermission
            }
            tts?.stop()
            recognizer?.destroy()
            val r = SpeechRecognizer.createSpeechRecognizer(act)
            recognizer = r
            r.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) { act.sendToBoard("BH.onStt", "ready", "") }
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() { act.sendToBoard("BH.onStt", "end", "") }
                override fun onError(error: Int) {
                    val msg = when (error) {
                        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Didn't catch that — please try again."
                        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network problem during speech recognition."
                        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission is needed."
                        SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED, SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE ->
                            "This language isn't available for voice input on this device."
                        else -> "Voice input error ($error)."
                    }
                    act.sendToBoard("BH.onStt", "error", msg)
                }
                override fun onResults(results: Bundle?) {
                    val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: ""
                    act.sendToBoard("BH.onStt", "final", text)
                }
                override fun onPartialResults(partial: Bundle?) {
                    val text = partial?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: ""
                    if (text.isNotBlank()) act.sendToBoard("BH.onStt", "partial", text)
                }
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, lang)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L)
            }
            r.startListening(intent)
        }
    }

    @JavascriptInterface
    fun stopListening() = act.runOnUiThread { recognizer?.stopListening() }

    // ---------------- AI teacher ----------------
    /**
     * payload = {"system": "...", "messages": [...], "max_tokens": n}
     * Calls the Claude Messages API (or a school proxy endpoint) and returns the
     * text via BH.onAi(reqId, "ok"|"error", text).
     */
    @JavascriptInterface
    fun askAI(payload: String, reqId: String) {
        io.execute {
            try {
                val key = prefs.getString("apiKey", "")?.trim().orEmpty()
                val endpoint = prefs.getString("endpoint", "")?.trim().takeUnless { it.isNullOrEmpty() }
                    ?: "https://api.anthropic.com/v1/messages"
                val model = prefs.getString("model", "")?.trim().takeUnless { it.isNullOrEmpty() }
                    ?: DEFAULT_MODEL
                if (key.isEmpty() && endpoint.contains("api.anthropic.com")) {
                    act.sendToBoard("BH.onAi", reqId, "error", "NO_KEY")
                    return@execute
                }
                val body = JSONObject(payload)
                body.put("model", model)
                if (!body.has("max_tokens")) body.put("max_tokens", 2048)

                val conn = (URL(endpoint).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 20000
                    readTimeout = 120000
                    doOutput = true
                    setRequestProperty("content-type", "application/json")
                    setRequestProperty("anthropic-version", "2023-06-01")
                    if (key.isNotEmpty()) setRequestProperty("x-api-key", key)
                }
                conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                val code = conn.responseCode
                val stream = if (code in 200..299) conn.inputStream else conn.errorStream
                val resp = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
                conn.disconnect()
                if (code !in 200..299) {
                    val msg = try { JSONObject(resp).getJSONObject("error").getString("message") } catch (_: Exception) { resp.take(300) }
                    act.sendToBoard("BH.onAi", reqId, "error", "HTTP $code: $msg")
                    return@execute
                }
                val content: JSONArray = JSONObject(resp).optJSONArray("content") ?: JSONArray()
                val sb = StringBuilder()
                for (i in 0 until content.length()) {
                    val blk = content.getJSONObject(i)
                    if (blk.optString("type") == "text") sb.append(blk.optString("text"))
                }
                act.sendToBoard("BH.onAi", reqId, "ok", sb.toString())
            } catch (e: Exception) {
                act.sendToBoard("BH.onAi", reqId, "error", e.message ?: e.javaClass.simpleName)
            }
        }
    }

    // ---------------- Settings ----------------
    @JavascriptInterface
    fun setSetting(key: String, value: String) {
        if (key in ALLOWED_SETTINGS) prefs.edit().putString(key, value).apply()
    }

    /** The API key itself is never handed back to the page. */
    @JavascriptInterface
    fun getSetting(key: String): String = when (key) {
        "apiKey" -> if (prefs.getString("apiKey", "").isNullOrBlank()) "" else "SET"
        in ALLOWED_SETTINGS -> prefs.getString(key, "") ?: ""
        else -> ""
    }

    // ---------------- Files & navigation ----------------
    /** Saves a board page (data URL) to Pictures/Bhumika. Returns a short location string or "" on failure. */
    @JavascriptInterface
    fun saveImage(dataUrl: String, name: String): String {
        return try {
            val bytes = Base64.decode(dataUrl.substringAfter(","), Base64.DEFAULT)
            val file = "${name.replace(Regex("[^A-Za-z0-9_-]"), "_")}.png"
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val cv = ContentValues().apply {
                    put(MediaStore.Images.Media.DISPLAY_NAME, file)
                    put(MediaStore.Images.Media.MIME_TYPE, "image/png")
                    put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Bhumika")
                }
                val uri = act.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv) ?: return ""
                act.contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                "Pictures/Bhumika/$file"
            } else {
                val dir = File(act.getExternalFilesDir(Environment.DIRECTORY_PICTURES), "Bhumika").apply { mkdirs() }
                File(dir, file).writeBytes(bytes)
                File(dir, file).absolutePath
            }
        } catch (e: Exception) { "" }
    }

    @JavascriptInterface
    fun openLibrary(url: String) {
        val safe = if (url.startsWith("https://")) url else MainActivity.LIBRARY
        act.openLibrary(safe)
    }

    @JavascriptInterface
    fun openWebsite(url: String) = act.backToWebsite(if (url.startsWith("https://")) url else MainActivity.HOME)

    @JavascriptInterface
    fun exit() = act.runOnUiThread { act.finish() }

    fun release() {
        try { tts?.stop(); tts?.shutdown() } catch (_: Exception) {}
        act.runOnUiThread { recognizer?.destroy(); recognizer = null }
        io.shutdownNow()
    }

    companion object {
        const val DEFAULT_MODEL = "claude-sonnet-5-5"
        private val ALLOWED_SETTINGS = setOf("apiKey", "endpoint", "model")
    }
}

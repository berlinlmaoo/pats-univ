package id.znetworks.patsuniv

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.net.Uri
import android.provider.MediaStore
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.result.contract.ActivityResultContract
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.draw.clipToBounds
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.*
import kotlinx.serialization.json.JsonObject
import java.io.File

@Composable fun NetworkImage(api: Api, url: String) {
    var bitmap by remember(url) { mutableStateOf<android.graphics.Bitmap?>(null) }
    var failed by remember(url) { mutableStateOf(false) }
    LaunchedEffect(url) { try { val bytes = api.media(url); bitmap = withContext(Dispatchers.Default) { BitmapFactory.decodeByteArray(bytes, 0, bytes.size) }; failed = bitmap == null } catch(e: CancellationException) { throw e } catch (_: Exception) { failed = true } }
    bitmap?.let { Image(it.asImageBitmap(), tr("social.photo"), Modifier.fillMaxWidth().heightIn(max = Space.qr)) }
    if (failed) Notice(tr("errors.network"), true)
}
@Composable fun PhotoCapture(labelKey: String = "loyalty.takeReceipt", onPhoto: (ByteArray) -> Unit) {
    val context = LocalContext.current
    var open by remember { mutableStateOf(false) }; var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }; var failed by remember { mutableStateOf(false) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it }
    Action(tr(labelKey), secondary = true) { open = !open; if (open && !granted) permission.launch(Manifest.permission.CAMERA) }
    if (open) {
        if (!granted) { Notice(tr("loyalty.scanPermission")); Action(tr("app.scanOpenSettings"), secondary = true) { context.startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))) } }
        else {
            val lifecycle = LocalLifecycleOwner.current
            val preview = remember { PreviewView(context).apply { implementationMode = PreviewView.ImplementationMode.COMPATIBLE } }
            val capture = remember { ImageCapture.Builder().setJpegQuality(80).build() }
            var provider by remember { mutableStateOf<ProcessCameraProvider?>(null) }
            DisposableEffect(preview, lifecycle) {
                var active = true
                val future = ProcessCameraProvider.getInstance(context)
                future.addListener({ if (active) runCatching { provider = future.get(); val stream = Preview.Builder().build().also { it.surfaceProvider = preview.surfaceProvider }; provider!!.bindToLifecycle(lifecycle, CameraSelector.DEFAULT_BACK_CAMERA, stream, capture) }.onFailure { failed = true } }, ContextCompat.getMainExecutor(context))
                onDispose { active = false; provider?.unbind(capture); provider?.unbindAll() }
            }
            AndroidView({ preview }, Modifier.fillMaxWidth().height(Space.qr).clipToBounds())
            Action(tr("social.photo")) {
                val file = File.createTempFile("capture", ".jpg", context.cacheDir)
                capture.takePicture(ImageCapture.OutputFileOptions.Builder(file).build(), ContextCompat.getMainExecutor(context), object : ImageCapture.OnImageSavedCallback {
                    override fun onImageSaved(result: ImageCapture.OutputFileResults) { try { onPhoto(file.readBytes()); open = false } catch (_: Exception) { failed = true } finally { file.delete() } }
                    override fun onError(exception: ImageCaptureException) { failed = true; file.delete() }
                })
            }
            Action(tr("common.cancel"), secondary = true) { open = false }
        }
    }
    if (failed) Notice(tr("loyalty.invalidReceipt"), true)
}
@Composable fun ReceiptCapture(api: Api, value: String, onChange: (String) -> Unit) {
    val mutation = rememberMutation()
    Text(tr("phase5.optionalReceipt"), style = MaterialTheme.typography.bodySmall)
    if (value.isNotBlank()) { Notice(tr("loyalty.uploaded")); Action(tr("social.removeAttachment"), secondary = true) { onChange("") } }
    if (!mutation.busy) PhotoCapture { bytes -> mutation.run {
        if (bytes.size > 5 * 1024 * 1024) throw ApiFailure("MEDIA_INVALID")
        val signed = api.request("POST", "/api/loyalty/receipt-upload", body("contentType" to "image/jpeg"))
        api.media(signed.text("uploadUrl"), bytes); onChange(signed.text("key"))
    } }
    MutationStatus(mutation)
}
private class VideoContract(private val seconds: Int) : ActivityResultContract<Uri, Boolean>() {
    override fun createIntent(context: Context, input: Uri) = Intent(MediaStore.ACTION_VIDEO_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, input).putExtra(MediaStore.EXTRA_DURATION_LIMIT, seconds).putExtra(MediaStore.EXTRA_VIDEO_QUALITY, 0).addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
    override fun parseResult(resultCode: Int, intent: Intent?) = resultCode == Activity.RESULT_OK
}
@Composable fun MediaCapture(imageOnly: Boolean, seconds: Int, onCapture: (ByteArray, String, String) -> Unit) {
    val context = LocalContext.current; val scope = rememberCoroutineScope()
    var file by remember { mutableStateOf<File?>(null) }; var recorder by remember { mutableStateOf<MediaRecorder?>(null) }; var timer by remember { mutableStateOf<Job?>(null) }; var failed by remember { mutableStateOf(false) }
    var videoPath by rememberSaveable { mutableStateOf<String?>(null) }
    val audioPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { if (!it) failed = true }
    val cameraPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { if (!it) failed = true }
    fun stop() { timer?.cancel(); runCatching { recorder?.stop(); recorder?.release(); recorder = null; val f = file!!; onCapture(f.readBytes(), "audio/mp4", "VOICE"); f.delete(); file = null }.onFailure { failed = true; recorder?.release(); recorder = null } }
    val video = rememberLauncherForActivityResult(VideoContract(seconds.coerceAtLeast(1))) { success ->
        videoPath?.let { path -> val f = File(path); if (success) runCatching { require(f.length() > 0); onCapture(f.readBytes(), "video/mp4", "VIDEO") }.onFailure { failed = true }; f.delete() }
        videoPath = null
    }
    PhotoCapture("social.photo") { onCapture(it, "image/jpeg", "IMAGE") }
    if (!imageOnly) {
        Action(tr(if (recorder == null) "social.record" else "social.stop"), secondary = true) {
            if (recorder != null) stop()
            else if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) audioPermission.launch(Manifest.permission.RECORD_AUDIO)
            else runCatching {
                file = File.createTempFile("voice", ".m4a", context.cacheDir)
                @Suppress("DEPRECATION") val recording = if (android.os.Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else MediaRecorder()
                recording.setAudioSource(MediaRecorder.AudioSource.MIC); recording.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4); recording.setAudioEncoder(MediaRecorder.AudioEncoder.AAC); recording.setOutputFile(file!!.absolutePath); recording.prepare(); recording.start(); recorder = recording
                timer = scope.launch { delay(seconds.coerceAtLeast(1) * 1000L); stop() }
            }.onFailure { recorder?.release(); recorder = null; failed = true }
        }
        Action(tr("social.video"), recorder == null, true) {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) cameraPermission.launch(Manifest.permission.CAMERA)
            else { val output = File.createTempFile("video", ".mp4", context.cacheDir); videoPath = output.absolutePath; runCatching { video.launch(FileProvider.getUriForFile(context, "${context.packageName}.files", output)) }.onFailure { failed = true; output.delete(); videoPath = null } }
        }
    }
    if (failed) Notice(tr("social.permission"), true)
    DisposableEffect(Unit) { onDispose { timer?.cancel(); runCatching { recorder?.stop() }; recorder?.release(); file?.delete() } }
}
@Composable fun MediaPlayback(api: Api, url: String, type: String) {
    if (type == "IMAGE") NetworkImage(api, url) else {
        val context = LocalContext.current
        var player by remember(url) { mutableStateOf<MediaPlayer?>(null) }; var playing by remember { mutableStateOf(false) }; var failed by remember { mutableStateOf(false) }
        val mutation = rememberMutation()
        Action(tr(if (playing) "social.stop" else if (type == "VIDEO") "social.video" else "social.play"), !mutation.busy, true) {
            if (playing) { player?.stop(); player?.release(); player = null; playing = false }
            else mutation.run {
                val bytes = api.media(url); val file = File.createTempFile("play", if (type == "VIDEO") ".mp4" else ".m4a", context.cacheDir).apply { writeBytes(bytes) }
                if (type == "VIDEO") { val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file); runCatching { context.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "video/mp4").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)) }.onFailure { failed = true } }
                else runCatching { player = MediaPlayer().apply { setDataSource(file.absolutePath); setOnCompletionListener { playing = false; release(); player = null; file.delete() }; prepare(); start() }; playing = true }.onFailure { failed = true; file.delete() }
            }
        }
        MutationStatus(mutation)
        if (failed) Notice(tr("errors.generic"), true)
        DisposableEffect(url) { onDispose { player?.release() } }
    }
}

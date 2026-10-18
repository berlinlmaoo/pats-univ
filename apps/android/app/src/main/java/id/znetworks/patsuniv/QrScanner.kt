package id.znetworks.patsuniv

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.zxing.*
import com.google.zxing.common.HybridBinarizer
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

fun decodeQr(bytes: ByteArray, width: Int, height: Int): String? {
    if (width < 1 || height < 1 || bytes.size < width * height) return null
    var pixels = bytes; var w = width; var h = height
    val reader = MultiFormatReader().apply { setHints(mapOf(DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE), DecodeHintType.TRY_HARDER to true)) }
    repeat(4) {
        val source = PlanarYUVLuminanceSource(pixels, w, h, 0, 0, w, h, false)
        try { return reader.decodeWithState(BinaryBitmap(HybridBinarizer(source))).text } catch (_: ReaderException) { reader.reset() }
        val rotated = ByteArray(w * h) { i -> pixels[(i % h) * w + (w - 1 - i / h)] }
        pixels = rotated; val previous = w; w = h; h = previous
    }
    return null
}
@Composable fun QrScanner(onScan: (String) -> Unit) {
    val context = LocalContext.current; val lifecycle = LocalLifecycleOwner.current
    var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    androidx.lifecycle.compose.LifecycleResumeEffect(context) { granted = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED; onPauseOrDispose { } }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it }
    var error by remember { mutableStateOf(false) }; var torch by remember { mutableStateOf(false) }; var camera by remember { mutableStateOf<Camera?>(null) }
    val callback by rememberUpdatedState(onScan)
    if (!granted) {
        Notice(tr("app.scanPermissionBody"))
        Action(tr("app.scanAllow")) { permission.launch(Manifest.permission.CAMERA) }
        Action(tr("app.scanOpenSettings"), secondary = true) { context.startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))) }
        return
    }
    val preview = remember { PreviewView(context).apply { implementationMode = PreviewView.ImplementationMode.COMPATIBLE } }
    DisposableEffect(preview, lifecycle) {
        val executor = Executors.newSingleThreadExecutor(); val handled = AtomicBoolean(false); var active = true; var provider: ProcessCameraProvider? = null; var lastFrame = 0L
        val future = ProcessCameraProvider.getInstance(context)
        val analysis = ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
        analysis.setAnalyzer(executor) { image ->
            try {
                val now = android.os.SystemClock.elapsedRealtime()
                if (!handled.get() && active && now - lastFrame >= 200) {
                    lastFrame = now
                    val plane = image.planes[0]; val buffer = plane.buffer; val bytes = ByteArray(image.width * image.height)
                    for (y in 0 until image.height) for (x in 0 until image.width) bytes[y * image.width + x] = buffer.get(y * plane.rowStride + x * plane.pixelStride)
                    decodeQr(bytes, image.width, image.height)?.let { if (handled.compareAndSet(false, true)) ContextCompat.getMainExecutor(context).execute { if (active) callback(it) } }
                }
            } finally { image.close() }
        }
        future.addListener({ if (active) runCatching { provider = future.get(); val stream = Preview.Builder().build().also { it.surfaceProvider = preview.surfaceProvider }; camera = provider!!.bindToLifecycle(lifecycle, CameraSelector.DEFAULT_BACK_CAMERA, stream, analysis) }.onFailure { error = true } }, ContextCompat.getMainExecutor(context))
        onDispose { active = false; analysis.clearAnalyzer(); provider?.unbindAll(); executor.shutdown() }
    }
    AndroidView({ preview }, Modifier.fillMaxWidth().height(Space.qr).clipToBounds())
    Text(tr("app.scanHint"), style = MaterialTheme.typography.bodySmall)
    Action(tr("app.scanTorch"), camera?.cameraInfo?.hasFlashUnit() == true, true) { torch = !torch; camera?.cameraControl?.enableTorch(torch) }
    if (error) Notice(tr("app.scanUnavailableBody"), true)
}

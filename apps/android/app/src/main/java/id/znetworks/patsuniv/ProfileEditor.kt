package id.znetworks.patsuniv

import android.Manifest
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.core.content.FileProvider
import kotlinx.coroutines.*
import kotlinx.serialization.json.JsonObject
import java.io.ByteArrayOutputStream
import java.io.File

fun validProfile(drink: String, genre: String, song: String, quote: String) = drink.trim().length in 1..40 && genre.trim().length in 1..50 && song.trim().length in 1..100 && quote.trim().length <= 140
fun validPhotoSize(bytes: Int, width: Int, height: Int) = bytes in 1..5*1024*1024 && minOf(width,height) >= 400 && maxOf(width,height) <= 8000

@Composable fun MemberPhoto(api: Api, url: String) {
    var bitmap by remember(url) { mutableStateOf<Bitmap?>(null) }
    var error by remember(url) { mutableStateOf(false) }
    LaunchedEffect(url) { try { val bytes = api.media(url); bitmap = withContext(Dispatchers.Default) { BitmapFactory.decodeByteArray(bytes,0,bytes.size) }; error = bitmap == null } catch(e: CancellationException) { throw e } catch(_: Exception) { error = true } }
    if(bitmap != null) Image(bitmap!!.asImageBitmap(), tr("join.photoAlt"), Modifier.size(72.dp).clip(MaterialTheme.shapes.medium), contentScale = androidx.compose.ui.layout.ContentScale.Crop)
    else if(error) Notice(tr("errors.network"), true)
    else Box(Modifier.size(72.dp).background(tone("surfaceMuted"), MaterialTheme.shapes.medium))
}

@Composable fun ProfileEditor(member: JsonObject, api: Api) {
    val context = LocalContext.current
    var edit by remember { mutableStateOf(false) }
    var drink by remember(member) { mutableStateOf(member.text("favoriteDrink")) }
    var genre by remember(member) { mutableStateOf(member.text("favoriteGenre")) }
    var song by remember(member) { mutableStateOf(member.text("favoriteSong")) }
    var quote by remember(member) { mutableStateOf(member.text("quotes")) }
    val mutation = rememberMutation()
    var source by remember { mutableStateOf<Bitmap?>(null) }
    var photoError by remember { mutableStateOf<String?>(null) }
    var cameraPath by rememberSaveable { mutableStateOf<String?>(null) }
    fun read(uri: Uri) { mutation.run {
        source = withContext(Dispatchers.IO) {
            val bytes = context.contentResolver.openInputStream(uri)!!.use { stream -> val buffer = ByteArrayOutputStream(); val chunk = ByteArray(8192); while(buffer.size() <= 5*1024*1024) { val n = stream.read(chunk); if(n < 0) break; buffer.write(chunk,0,n) }; buffer.toByteArray() }
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }; BitmapFactory.decodeByteArray(bytes,0,bytes.size,bounds)
            if(bounds.outMimeType !in setOf("image/jpeg", "image/png", "image/webp")) { photoError = "validation.photoType"; return@withContext null }
            if(!validPhotoSize(bytes.size, bounds.outWidth, bounds.outHeight)) { photoError = if(bytes.size > 5*1024*1024) "validation.photoTooLarge" else "validation.photoDimensions"; return@withContext null }
            photoError = null
            val original = BitmapFactory.decodeByteArray(bytes,0,bytes.size)
            val orientation = runCatching { android.media.ExifInterface(java.io.ByteArrayInputStream(bytes)).getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION, 1) }.getOrDefault(1)
            val matrix = android.graphics.Matrix().apply { when(orientation) { 2 -> setScale(-1f,1f); 3 -> setRotate(180f); 4 -> setScale(1f,-1f); 5 -> { setRotate(90f); postScale(-1f,1f) }; 6 -> setRotate(90f); 7 -> { setRotate(270f); postScale(-1f,1f) }; 8 -> setRotate(270f) } }
            Bitmap.createBitmap(original,0,0,original.width,original.height,matrix,true).also { if(it !== original) original.recycle() }
        }
    } }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { it?.let(::read) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { success -> cameraPath?.let { path -> if(success) read(Uri.fromFile(File(path))) else File(path).delete() } }
    fun launchCamera() {
        val file = File.createTempFile("profile", ".jpg", context.cacheDir); cameraPath = file.absolutePath
        camera.launch(FileProvider.getUriForFile(context, "${context.packageName}.files", file))
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { if(it) launchCamera() else photoError = "native.photoPermission" }
    Tile {
        if(member.text("photoUrl").isNotBlank()) MemberPhoto(api, member.text("photoUrl")) else { SectionLabel(tr("members.noPhoto")); Text(tr("native.photoPrompt")) }
        Action(tr(if(member.text("photoUrl").isBlank()) "join.photoChoose" else "join.photoChange"), !mutation.busy, true) { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
        Action(tr("native.photoCamera"), !mutation.busy, true) { permission.launch(Manifest.permission.CAMERA) }
        photoError?.let { Notice(tr(it, "px" to "400"), true) }
        Action(tr("native.profileEdit"), secondary = true) { edit = !edit }
        if(edit) {
            Detail(tr("ktm.name"), member.text("fullName"))
            Field(tr("join.favoriteDrink"), drink, { drink = it })
            Field(tr("app.genre"), genre, { genre = it })
            Field(tr("app.song"), song, { song = it })
            Field(tr("app.quotes"), quote, { quote = it }, multiline = true)
            Action(tr("common.save"), !mutation.busy && validProfile(drink,genre,song,quote)) { mutation.run {
                api.request("PATCH", "/api/me", body("favoriteDrink" to drink.trim(), "favoriteGenre" to genre.trim(), "favoriteSong" to song.trim(), "quotes" to quote.trim())); api.reload(); edit = false; mutation.notice = "native.saved"
            } }
        }
        MutationStatus(mutation)
    }
    source?.let { bitmap -> PhotoCrop(bitmap, { source = null; bitmap.recycle(); cameraPath?.let { File(it).delete() }; cameraPath = null }) { bytes ->
        source = null; bitmap.recycle(); cameraPath?.let { File(it).delete() }; cameraPath = null
        mutation.run { api.uploadPhoto(bytes,"image/jpeg") }
    } }
}

@Composable private fun PhotoCrop(bitmap: Bitmap, dismiss: () -> Unit, save: (ByteArray) -> Unit) {
    var zoom by remember { mutableFloatStateOf(1f) }; var offset by remember { mutableStateOf(Offset.Zero) }
    var previewPx by remember { mutableFloatStateOf(1f) }
    val minSide = minOf(bitmap.width,bitmap.height).toFloat()
    fun bound(value: Offset, scale: Float): Offset {
        val sx = bitmap.width / minSide * scale; val sy = bitmap.height / minSide * scale
        return Offset(value.x.coerceIn(-(sx-1)/2, (sx-1)/2), value.y.coerceIn(-(sy-1)/2, (sy-1)/2))
    }
    Dialog(onDismissRequest = dismiss) {
        Column(Modifier.background(tone("surface"), MaterialTheme.shapes.large).padding(Space.page), verticalArrangement = Arrangement.spacedBy(Space.gap)) {
            Text(tr("native.photoCrop"), style = MaterialTheme.typography.titleLarge)
            Text(tr("native.photoHint"), style = MaterialTheme.typography.bodySmall)
            BoxWithConstraints(Modifier.fillMaxWidth().aspectRatio(1f).clip(MaterialTheme.shapes.medium)) {
                val density = androidx.compose.ui.platform.LocalDensity.current
                previewPx = with(density) { maxWidth.toPx() }
                Image(bitmap.asImageBitmap(), tr("join.photoAlt"), Modifier.fillMaxSize().graphicsLayer { scaleX = zoom; scaleY = zoom; translationX = offset.x * previewPx; translationY = offset.y * previewPx }.pointerInput(zoom) { detectDragGestures { change, delta -> change.consume(); offset = bound(offset + delta / previewPx, zoom) } }, contentScale = androidx.compose.ui.layout.ContentScale.Crop)
            }
            Slider(zoom, { zoom = it; offset = bound(offset,it) }, valueRange = 1f..minOf(4f,minSide/400f).coerceAtLeast(1.01f))
            Action(tr("common.save")) {
                val crop = minSide / zoom
                val left = ((bitmap.width-crop)/2 - offset.x * minSide/zoom).toInt().coerceIn(0,bitmap.width-crop.toInt())
                val top = ((bitmap.height-crop)/2 - offset.y * minSide/zoom).toInt().coerceIn(0,bitmap.height-crop.toInt())
                val square = Bitmap.createBitmap(bitmap,left,top,crop.toInt(),crop.toInt())
                val output = Bitmap.createScaledBitmap(square,minOf(1024,square.width),minOf(1024,square.height),true)
                val bytes = ByteArrayOutputStream().use { output.compress(Bitmap.CompressFormat.JPEG,90,it); it.toByteArray() }
                if(output !== square) output.recycle(); if(square !== bitmap) square.recycle()
                save(bytes)
            }
            Action(tr("common.cancel"), secondary = true, onClick = dismiss)
        }
    }
}

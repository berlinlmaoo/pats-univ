package id.znetworks.patsuniv

import android.animation.ValueAnimator
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.core.content.res.ResourcesCompat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import kotlinx.serialization.json.*

fun qrMatrix(value: String, onTile: Boolean = false) = QRCodeWriter().encode(value, com.google.zxing.BarcodeFormat.QR_CODE, 0, 0, mapOf(EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M, EncodeHintType.MARGIN to if(onTile) 0 else 4))

@Composable fun TileQr(value: String, modifier: Modifier = Modifier) {
    val modules = remember(value) { qrMatrix(value, true) }; val label = tr("ktm.qrLabel")
    Canvas(modifier.semantics { contentDescription = label }) {
        val step = size.minDimension / modules.width
        for(y in 0 until modules.height) for(x in 0 until modules.width) if(modules[x,y]) drawRect(Color.White, androidx.compose.ui.geometry.Offset(x * step, y * step), androidx.compose.ui.geometry.Size(step + .1f, step + .1f))
    }
}

/** Geometry comes directly from shared tokens; values are measured in artwork coordinates. */
@Composable fun KtmCard(member: JsonObject, qr: String? = null, thumbnail: Boolean = false, onOpen: (() -> Unit)? = null) {
    val geometry = LocalDesign.current.obj("ktm")
    fun g(key: String) = geometry[key]!!.jsonPrimitive.float
    val context = LocalContext.current
    val face = remember { ResourcesCompat.getFont(context, R.font.card_value) }
    val tracking = LocalDesign.current["cardValueTracking"]!!.jsonPrimitive.float
    var flipped by remember { mutableStateOf(false) }
    val reduced = !ValueAnimator.areAnimatorsEnabled()
    val rotation by animateFloatAsState(if(flipped) 180f else 0f, tween(if(reduced) 200 else 500), label = "KTM flip")
    val label = tr("native.cardAccessibility", "name" to member.text("fullName"), "drink" to member.text("favoriteDrink"), "genre" to member.text("favoriteGenre"))
    Column(verticalArrangement = Arrangement.spacedBy(Space.small)) {
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val width = maxWidth
            val shape = RoundedCornerShape(width * g("radius"))
            Box(Modifier.fillMaxWidth().aspectRatio(g("ratio")).shadow(6.dp, shape).clip(shape).clickable { if(onOpen != null) onOpen() else if(!thumbnail) flipped = !flipped }.semantics(mergeDescendants = true) { contentDescription = label; stateDescription = if(flipped) "back" else "front" }.graphicsLayer {
                rotationY = if(reduced) 0f else rotation
                cameraDistance = 16 * density
                alpha = if(reduced) kotlin.math.abs(rotation - 90f).div(90f).coerceAtLeast(.05f) else 1f
            }) {
                val back = rotation > 90f
                Box(Modifier.fillMaxSize().graphicsLayer { rotationY = if(back && !reduced) 180f else 0f }) {
                    Image(painterResource(if(back) R.drawable.ktm_back else R.drawable.ktm_front), null, Modifier.fillMaxSize(), contentScale = androidx.compose.ui.layout.ContentScale.FillBounds)
                    if(!back) {
                        Canvas(Modifier.fillMaxSize()) {
                            val textView = android.widget.TextView(context).apply { typeface = face; setTextColor(android.graphics.Color.BLACK); letterSpacing = tracking; includeFontPadding = false; setSingleLine(true) }
                            listOf(Triple("fullName", "nameY", "nameMaxW"), Triple("favoriteDrink", "drinkY", "valueMaxW"), Triple("favoriteGenre", "genreY", "valueMaxW")).forEach { (field, y, max) ->
                                val value = member.text(field).uppercase(java.util.Locale.ROOT)
                                textView.text = value
                                val fontPx = size.width * g("valueCap") / .7f
                                textView.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, fontPx)
                                textView.measure(0, 0)
                                val fit = (size.width * g(max) / textView.measuredWidth.coerceAtLeast(1)).coerceAtMost(1f)
                                textView.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, fontPx * fit)
                                textView.measure(0, 0); textView.layout(0, 0, textView.measuredWidth, textView.measuredHeight)
                                val bounds = android.graphics.Rect(); textView.paint.getTextBounds(value, 0, value.length, bounds)
                                drawIntoCanvas { val canvas = it.nativeCanvas; canvas.save(); canvas.translate(size.width * g("valueX"), size.height * g(y) - textView.baseline - bounds.top); textView.draw(canvas); canvas.restore() }
                            }
                        }
                        if(!thumbnail && !qr.isNullOrBlank()) {
                            val q = geometry.obj("qr")
                            TileQr(qr, Modifier.offset(x = width * q["x"]!!.jsonPrimitive.float, y = width / g("ratio") * q["y"]!!.jsonPrimitive.float).size(width * q["w"]!!.jsonPrimitive.float))
                        }
                    }
                }
            }
        }
        if(!thumbnail) Action(tr(if(flipped) "ktm.showFront" else "ktm.showBack"), secondary = true) { flipped = !flipped }
    }
}
@Composable fun QrEnlarge(value: String) {
    var open by remember { mutableStateOf(false) }
    Action(tr("native.enlargeQr"), secondary = true) { open = true }
    if(open) Dialog(onDismissRequest = { open = false }) {
        Column(Modifier.fillMaxWidth().background(tone("band"), MaterialTheme.shapes.large).padding(Space.page), verticalArrangement = Arrangement.spacedBy(Space.page)) {
            Box(Modifier.fillMaxWidth().aspectRatio(1f).background(MaterialTheme.colorScheme.secondary).padding(Space.large)) { TileQr(value, Modifier.fillMaxSize()) }
            Action(tr("common.close"), secondary = true) { open = false }
        }
    }
}

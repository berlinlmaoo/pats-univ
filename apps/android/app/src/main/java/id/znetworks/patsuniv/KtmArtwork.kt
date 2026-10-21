package id.znetworks.patsuniv

import android.animation.ValueAnimator
import android.text.TextUtils
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import androidx.core.content.res.ResourcesCompat
import kotlinx.serialization.json.*

/** Owner-supplied artwork and its replaceable normalized field layout. */
@Composable fun KtmArtwork(member: JsonObject, qr: String?, thumbnail: Boolean, onOpen: (() -> Unit)?) {
    val context = LocalContext.current
    val layout = remember { PatsJson.parseToJsonElement(context.assets.open("ktm-layout.json").bufferedReader().use { it.readText() }).jsonObject }
    fun g(key: String) = layout[key]!!.jsonPrimitive.float
    val ratio = g("width") / g("height")
    val face = remember { ResourcesCompat.getFont(context, R.font.card_value) }
    val tracking = LocalDesign.current["cardValueTracking"]!!.jsonPrimitive.float
    val capHeight = LocalDesign.current["cardValueCapHeight"]!!.jsonPrimitive.float
    var flipped by remember(member.text("id"), member.text("fullName")) { mutableStateOf(false) }
    val reduced = !ValueAnimator.areAnimatorsEnabled()
    val rotation by animateFloatAsState(if (flipped) 180f else 0f, tween(if (reduced) 0 else 500), label = "KTM flip")
    val label = tr("uxShell.cardAccessibility", "name" to member.text("fullName"), "drink" to member.text("favoriteDrink"), "quote" to member.text("quotes"))
    val side = tr(if (flipped) "ktm.backAlt" else "ktm.cardLabel", "name" to member.text("fullName"))
    Column(verticalArrangement = Arrangement.spacedBy(Space.small)) {
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            val width = maxWidth
            val shape = RoundedCornerShape(width * g("radius"))
            Box(Modifier.fillMaxWidth().aspectRatio(ratio).shadow(6.dp, shape).clip(shape).clickable {
                if (onOpen != null) onOpen() else if (!thumbnail) flipped = !flipped
            }.semantics(mergeDescendants = true) { contentDescription = label; stateDescription = side }.graphicsLayer {
                rotationY = if (reduced) 0f else rotation
                cameraDistance = 16 * density
            }) {
                val back = if (reduced) flipped else rotation > 90f
                Box(Modifier.fillMaxSize().graphicsLayer { rotationY = if (back && !reduced) 180f else 0f }) {
                    Image(painterResource(if (back) R.drawable.ktm_back_current else R.drawable.ktm_front_current), null, Modifier.fillMaxSize(), contentScale = androidx.compose.ui.layout.ContentScale.FillBounds)
                    if (!back) {
                        Canvas(Modifier.fillMaxSize()) {
                            layout.rows("fields").forEach { field ->
                                fun f(key: String) = field[key]!!.jsonPrimitive.float
                                val value = member.text(field.text("key")).trim().uppercase(java.util.Locale.ROOT)
                                if (value.isNotEmpty()) {
                                    val textView = android.widget.TextView(context).apply {
                                        typeface = face; setTextColor(android.graphics.Color.BLACK); letterSpacing = tracking
                                        includeFontPadding = false; setSingleLine(false); maxLines = field.number("lines"); ellipsize = TextUtils.TruncateAt.END
                                        setLineSpacing(0f, 1.04f); text = value
                                    }
                                    val availableWidth = (size.width * f("width")).toInt()
                                    val availableHeight = (size.height * f("height")).toInt()
                                    val naturalFont = size.width * g("valueCap") / capHeight
                                    var scale = 1f
                                    fun measure() {
                                        textView.setTextSize(android.util.TypedValue.COMPLEX_UNIT_PX, naturalFont * scale)
                                        textView.measure(android.view.View.MeasureSpec.makeMeasureSpec(availableWidth, android.view.View.MeasureSpec.EXACTLY), android.view.View.MeasureSpec.makeMeasureSpec(0, android.view.View.MeasureSpec.UNSPECIFIED))
                                    }
                                    measure()
                                    while (scale > .43f && (textView.measuredHeight > availableHeight || textView.layout?.let { it.getEllipsisCount(it.lineCount - 1) > 0 } == true)) { scale -= .025f; measure() }
                                    textView.layout(0, 0, availableWidth, textView.measuredHeight)
                                    val bounds = android.graphics.Rect(); textView.paint.getTextBounds("H", 0, 1, bounds)
                                    drawIntoCanvas { canvas ->
                                        val native = canvas.nativeCanvas; native.save()
                                        native.clipRect(size.width * f("x"), size.height * f("y"), size.width * (f("x") + f("width")), size.height * (f("y") + f("height")))
                                        native.translate(size.width * f("x"), size.height * f("y") - textView.baseline - bounds.top)
                                        textView.draw(native); native.restore()
                                    }
                                }
                            }
                        }
                        if (!thumbnail && !qr.isNullOrBlank()) {
                            val box = layout.obj("qr")
                            TileQr(qr, Modifier.offset(width * box["x"]!!.jsonPrimitive.float, width / ratio * box["y"]!!.jsonPrimitive.float).size(width * box["width"]!!.jsonPrimitive.float))
                        }
                    }
                }
            }
        }
        if (!thumbnail) Action(tr(if (flipped) "ktm.showFront" else "ktm.showBack"), secondary = true) { flipped = !flipped }
    }
}

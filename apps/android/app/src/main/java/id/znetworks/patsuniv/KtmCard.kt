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

data class CardValueFit(val scale: Float, val wrap: Boolean)
fun cardValueFit(available: Float, natural: Float): CardValueFit {
    val ratio = available / natural.coerceAtLeast(1f)
    return if (ratio < .6f) CardValueFit((ratio * 1.9f).coerceIn(.42f, .6f), true)
    else CardValueFit(ratio.coerceAtMost(1f), false)
}

fun qrMatrix(value: String, onTile: Boolean = false) = QRCodeWriter().encode(value, com.google.zxing.BarcodeFormat.QR_CODE, 0, 0, mapOf(EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M, EncodeHintType.MARGIN to if(onTile) 0 else 4))

@Composable fun TileQr(value: String, modifier: Modifier = Modifier) {
    val modules = remember(value) { qrMatrix(value, true) }; val label = tr("ktm.qrLabel")
    Canvas(modifier.semantics { contentDescription = label }) {
        // One filled path, like the web SVG: separate anti-aliased rects left maroon hairlines between modules.
        val step = size.minDimension / modules.width
        val path = Path()
        for(y in 0 until modules.height) for(x in 0 until modules.width) if(modules[x,y]) path.addRect(androidx.compose.ui.geometry.Rect(x * step, y * step, (x + 1) * step, (y + 1) * step))
        drawPath(path, Color.White)
    }
}

/** Geometry comes directly from shared tokens; values are measured in artwork coordinates. */
@Composable fun KtmCard(member: JsonObject, qr: String? = null, thumbnail: Boolean = false, onOpen: (() -> Unit)? = null) = KtmArtwork(member, qr, thumbnail, onOpen)

@Composable fun QrEnlarge(value: String, member: JsonObject? = null) {
    var open by remember { mutableStateOf(false) }
    Action(tr("uxShell.qrDoor"), maroon = true) { open = true }
    if(open) Dialog(onDismissRequest = { open = false }) {
        Column(Modifier.fillMaxWidth().background(tone("band"), MaterialTheme.shapes.large).padding(Space.page), verticalArrangement = Arrangement.spacedBy(Space.page)) {
            Text(tr("uxShell.digital"), color = tone("bandText"), style = MaterialTheme.typography.titleMedium)
            if (member != null) Text(member.text("fullName"), color = tone("bandText"))
            Text(tr("uxShell.qrPurpose"), color = tone("bandText"), style = MaterialTheme.typography.bodySmall)
            Box(Modifier.fillMaxWidth().aspectRatio(1f).background(MaterialTheme.colorScheme.secondary).padding(Space.large)) { TileQr(value, Modifier.fillMaxSize()) }
            Action(tr("common.close"), secondary = true) { open = false }
        }
    }
}

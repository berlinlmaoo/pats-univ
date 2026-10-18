package id.znetworks.patsuniv

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.semantics.*
import kotlinx.serialization.json.JsonObject

/** The server supplies the winner; the wheel only presents that saved result. */
@Composable fun PrizeWheel(entries: List<JsonObject>, winnerId: String, running: Boolean) {
    val primary = MaterialTheme.colorScheme.primary; val background = MaterialTheme.colorScheme.surfaceVariant
    val winner = entries.indexOfFirst { it.text("id") == winnerId }
    val target = if (winner >= 0) 1440f + 360f - (winner + .5f) * 360f / entries.size.coerceAtLeast(1) else 0f
    val angle by animateFloatAsState(target, tween(if (winner >= 0) 1200 else 0), label = "draw")
    val label = tr("phase5.draw")
    Canvas(Modifier.fillMaxWidth().height(Space.qr).semantics { contentDescription = label }) {
        val diameter = size.minDimension * .9f; val corner = Offset((size.width - diameter) / 2, (size.height - diameter) / 2)
        rotate(angle + if (running) 15f else 0f) {
            val count = entries.size.coerceAtLeast(5)
            repeat(count) { index -> drawArc(if (index % 2 == 0) primary else background, index * 360f / count, 360f / count, true, corner, Size(diameter, diameter)); drawArc(primary, index * 360f / count, 360f / count, false, corner, Size(diameter, diameter), style = Stroke(2f)) }
        }
        drawCircle(background, diameter * .09f); drawLine(primary, Offset(size.width / 2, 0f), Offset(size.width / 2, size.height * .13f), 6f)
    }
}

package id.znetworks.patsuniv

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.semantics.*
import kotlinx.serialization.json.JsonObject

fun wheelTarget(winner: Int, count: Int) = if (winner >= 0 && count > 0) 1440f + 270f - (winner + .5f) * 360f / count else 0f

/** The server supplies the winner; the wheel only presents that saved result. */
@Composable fun PrizeWheel(entries: List<JsonObject>, winnerId: String, running: Boolean) {
    val primary = MaterialTheme.colorScheme.primary; val background = MaterialTheme.colorScheme.surfaceVariant
    val winner = entries.indexOfFirst { it.text("id") == winnerId }
    val target = wheelTarget(winner, entries.size)
    val angle by animateFloatAsState(target, tween(if (winner >= 0) 1200 else 0), label = "draw")
    val label = tr("phase5.draw")
    val onPrimary = MaterialTheme.colorScheme.onPrimary
    val onBackground = MaterialTheme.colorScheme.onSurfaceVariant
    Canvas(Modifier.fillMaxWidth().height(Space.qr).semantics { contentDescription = label }) {
        val diameter = size.minDimension * .9f; val corner = Offset((size.width - diameter) / 2, (size.height - diameter) / 2)
        rotate(angle + if (running) 15f else 0f) {
            val count = entries.size.coerceAtLeast(5)
            repeat(count) { index ->
                drawArc(if (index % 2 == 0) primary else background, index * 360f / count, 360f / count, true, corner, Size(diameter, diameter)); drawArc(onPrimary, index * 360f / count, 360f / count, true, corner, Size(diameter, diameter), style = Stroke(2f))
                entries.getOrNull(index)?.let { entry ->
                    val radians = Math.toRadians((index + .5) * 360 / count)
                    val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = (if (index % 2 == 0) onPrimary else onBackground).toArgb(); textSize = diameter * .052f; textAlign = android.graphics.Paint.Align.CENTER; typeface = android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL) }
                    val point = Offset(center.x + (kotlin.math.cos(radians) * diameter * .31).toFloat(), center.y + (kotlin.math.sin(radians) * diameter * .31).toFloat())
                    rotate(-angle - if (running) 15f else 0f, point) { drawIntoCanvas { canvas -> canvas.nativeCanvas.drawText(entry.text("name").substringBefore(' '), point.x, point.y + paint.textSize / 3, paint) } }
                }
            }
        }
        drawCircle(background, diameter * .09f); drawLine(primary, Offset(size.width / 2, 0f), Offset(size.width / 2, size.height * .13f), 6f)
    }
}

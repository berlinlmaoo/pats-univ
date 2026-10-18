package id.znetworks.patsuniv

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.unit.dp
import androidx.core.content.res.ResourcesCompat
import kotlinx.serialization.json.*

/** Graduate's native outline uses the same 0.045 em stroke as web. */
@Composable fun VarsityText(text: String, color: Color = MaterialTheme.colorScheme.onSurface, small: Boolean = false, hero: Boolean = false) {
    val context = LocalContext.current
    val face = remember { ResourcesCompat.getFont(context, R.font.graduate) }
    val spec = LocalDesign.current.obj("varsity").obj(if(hero) "hero" else if(small) "small" else "title")
    val fontSize = spec.number("size"); val lineHeight = spec.number("lineHeight")
    val tracking = spec["tracking"]!!.jsonPrimitive.float
    val stroke = LocalDesign.current["varsityStroke"]!!.jsonPrimitive.float
    Canvas(Modifier.fillMaxWidth().height(lineHeight.dp).semantics { contentDescription = text; heading() }) {
        val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            typeface = face; this.color = color.toArgb(); textSize = fontSize.dp.toPx()

        }
        val caps = text.uppercase(java.util.Locale.ROOT)
        val available = size.width - 2 * paint.textSize * stroke
        paint.textSize *= (available / (paint.measureText(caps) + paint.textSize * tracking * (caps.length-1)).coerceAtLeast(1f)).coerceAtMost(1f)
        val baseline = (size.height - paint.fontMetrics.ascent - paint.fontMetrics.descent) / 2
        drawIntoCanvas {
            paint.strokeWidth = paint.textSize * stroke
            val widths = FloatArray(caps.length); paint.getTextWidths(caps,widths)
            var x = paint.strokeWidth
            caps.forEachIndexed { index, letter ->
                paint.style = android.graphics.Paint.Style.STROKE
                it.nativeCanvas.drawText(letter.toString(), x, baseline, paint)
                paint.style = android.graphics.Paint.Style.FILL
                it.nativeCanvas.drawText(letter.toString(), x, baseline, paint)
                x += widths[index] + paint.textSize * tracking
            }
        }
    }
}

@Composable fun PatsIcon(name: String, color: Color = MaterialTheme.colorScheme.onSurface, modifier: Modifier = Modifier.size(20.dp)) {
    val resource = when(name) {
        "home" -> R.drawable.lucide_house; "events" -> R.drawable.lucide_calendar_days
        "card" -> R.drawable.lucide_id_card; "hub" -> R.drawable.lucide_messages_square
        "profile" -> R.drawable.lucide_user_round; "tools" -> R.drawable.lucide_scan_line
        "back" -> R.drawable.lucide_chevron_left; "bell" -> R.drawable.lucide_bell
        else -> R.drawable.lucide_inbox
    }
    Icon(painterResource(resource), null, modifier, tint = color)
}
fun Modifier.dashedBorder(color: Color) = drawBehind {
    drawRoundRect(color, cornerRadius = androidx.compose.ui.geometry.CornerRadius(6.dp.toPx()), style = Stroke(1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx()))))
}
@Composable fun SectionLabel(text: String) { Text(text.uppercase(java.util.Locale.ROOT), style = MaterialTheme.typography.labelSmall, color = tone("textMuted")) }
@Composable fun CardHeading(text: String) { Column(verticalArrangement = Arrangement.spacedBy(Space.small)) { Box(Modifier.width(24.dp).height(3.dp).background(tone("gold"))); Text(text, style = MaterialTheme.typography.titleMedium) } }
@Composable fun Detail(label: String, value: String) { Column(verticalArrangement = Arrangement.spacedBy(Space.tiny)) { SectionLabel(label); Text(value.ifBlank { tr("common.notSet") }) } }
@Composable fun Badge(text: String, status: String = "") {
    val family = when(status.uppercase()) {
        "ACTIVE", "DELIVERED", "APPROVED", "OPEN" -> "success"
        "PENDING", "ENCODED", "CLOSED" -> "warning"
        "REVOKED", "REJECTED", "INACTIVE" -> "danger"
        "UPCOMING", "IN_BATCH", "SENT_TO_VENDOR", "RECEIVED_HQ" -> "accent"
        else -> ""
    }
    Surface(color = tone(if(family.isEmpty()) "surfaceMuted" else "${family}Subtle"), contentColor = tone(if(family.isEmpty()) "textMuted" else if(family == "accent") "accentSubtleText" else "${family}Text"), shape = MaterialTheme.shapes.small) {
        Text(text.uppercase(java.util.Locale.ROOT), Modifier.padding(horizontal = Space.small, vertical = Space.tiny), style = MaterialTheme.typography.labelSmall)
    }
}
@Composable fun LoadingSkeleton() {
    val label = tr("common.loading")
    Column(Modifier.fillMaxWidth().semantics { contentDescription = label }, verticalArrangement = Arrangement.spacedBy(Space.gap)) {
        repeat(3) { Box(Modifier.fillMaxWidth(if(it == 0) .6f else 1f).height(if(it == 0) Space.large else Space.control).background(tone("surfaceMuted"), MaterialTheme.shapes.medium)) }
    }
}
@Composable fun Tabs(options: List<Pair<String, String>>, selected: String, counts: Map<String, Int> = emptyMap(), onSelect: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).selectableGroup(), horizontalArrangement = Arrangement.spacedBy(Space.small)) {
        options.forEach { (id, label) ->
            Column(Modifier.width(IntrinsicSize.Max).widthIn(min = 72.dp).clickable(role = Role.Tab, onClick = { onSelect(id) }).semantics { this.selected = id == selected }) {
                Row(Modifier.heightIn(min = Space.control).padding(horizontal = Space.small), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.tiny)) {
                    Text(label.uppercase(java.util.Locale.ROOT), style = MaterialTheme.typography.labelSmall, color = tone(if(id == selected) "text" else "textMuted"))
                    counts[id]?.takeIf { it > 0 }?.let { CountChip(it) }
                }
                Box(Modifier.fillMaxWidth().height(3.dp).background(if(id == selected) tone("gold") else Color.Transparent))
            }
        }
    }
}
@Composable fun CountChip(count: Int) { Surface(color = tone("secondary"), contentColor = tone("secondaryText"), shape = MaterialTheme.shapes.small) { Text(count(count), Modifier.padding(horizontal = Space.tiny, vertical = Space.tiny / 2), style = MaterialTheme.typography.labelSmall) } }
@Composable fun LanguageToggle(language: String, onBand: Boolean = false, setLanguage: (String) -> Unit) {
    Row(Modifier.background(if(onBand) Color.White.copy(alpha = .1f) else tone("surfaceMuted"), MaterialTheme.shapes.medium)) {
        listOf("id" to "ID", "en" to "EN").forEach { (code, label) ->
            TextButton({ setLanguage(code) }, Modifier.heightIn(min = Space.control), shape = MaterialTheme.shapes.medium, colors = ButtonDefaults.textButtonColors(containerColor = if(code == language) (if(onBand) tone("bandText") else tone("surface")) else Color.Transparent, contentColor = if(onBand) (if(code == language) tone("band") else tone("bandText")) else tone("text"))) { Text(label, style = MaterialTheme.typography.labelSmall) }
        }
    }
}
@Composable fun OtpField(value: String, onChange: (String) -> Unit) {
    val label = tr("otp.codeLabel")
    Column(verticalArrangement = Arrangement.spacedBy(Space.small)) {
        SectionLabel(label)
        androidx.compose.foundation.text.BasicTextField(value, onChange, Modifier.fillMaxWidth().semantics { contentDescription = label; contentType = ContentType.SmsOtpCode }, singleLine = true, keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.NumberPassword), textStyle = MaterialTheme.typography.bodyLarge.copy(color = Color.Transparent), cursorBrush = SolidColor(Color.Transparent), decorationBox = { inner ->
            Box {
                Row(horizontalArrangement = Arrangement.spacedBy(Space.tiny)) {
                    repeat(6) { index -> Box(Modifier.weight(1f).height(Space.control).border(if(index == value.length) 2.dp else 1.dp, if(index == value.length) tone("accent") else tone("borderStrong"), MaterialTheme.shapes.medium), contentAlignment = Alignment.Center) { Text(value.getOrNull(index)?.toString() ?: "", style = MaterialTheme.typography.titleLarge) } }
                }
                Box(Modifier.fillMaxWidth().height(Space.control)) { inner() }
            }
        })
    }
}

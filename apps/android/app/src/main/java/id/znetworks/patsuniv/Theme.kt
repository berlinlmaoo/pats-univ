package id.znetworks.patsuniv

import android.content.Context
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.RoundedCornerShape
import kotlinx.serialization.json.*

object Space { val tiny = 4.dp; val small = 8.dp; val gap = 12.dp; val page = 16.dp; val large = 24.dp; val hero = 40.dp; val control = 48.dp; val qr = 224.dp }
val LocalCopy = staticCompositionLocalOf<(String, Map<String, String>) -> String> { { key, _ -> key } }
val LocalPalette = staticCompositionLocalOf { JsonObject(emptyMap()) }
val LocalDesign = staticCompositionLocalOf { JsonObject(emptyMap()) }
@Composable fun tone(key: String) = Color(android.graphics.Color.parseColor(LocalPalette.current.text(key)))
@Composable fun design(group: String, key: String) = LocalDesign.current.obj(group)[key]!!.jsonPrimitive.float
@OptIn(ExperimentalTextApi::class)
val Figtree = FontFamily((400..900 step 100).map { Font(R.font.figtree, FontWeight(it), variationSettings = FontVariation.Settings(FontVariation.weight(it))) })
val LocalLanguage = staticCompositionLocalOf { "id" }
@Composable fun tr(key: String, vararg args: Pair<String, String>) = LocalCopy.current(key, args.toMap())
class Copy(context: Context, language: String) {
    private val dictionary = run {
        val merged = PatsJson.parseToJsonElement(context.assets.open("$language.json").bufferedReader().use { it.readText() }).jsonObject.toMutableMap()
        context.assets.list("").orEmpty().filter { it.startsWith("ux-") && it.endsWith("-$language.json") }.sorted().forEach { file ->
            val additions = PatsJson.parseToJsonElement(context.assets.open(file).bufferedReader().use { it.readText() }).jsonObject
            require(additions.keys.none { it in merged }) { "Duplicate localization namespace" }
            merged.putAll(additions)
        }
        JsonObject(merged)
    }
    fun get(key: String, args: Map<String, String> = emptyMap()): String {
        var entry: JsonElement? = dictionary
        key.split('.').forEach { entry = (entry as? JsonObject)?.get(it) }
        var result = (entry as? JsonPrimitive)?.contentOrNull ?: key
        args.forEach { (name, value) -> result = result.replace("{$name}", value) }
        return result
    }
}
@Composable fun PatsTheme(context: Context, language: String, content: @Composable () -> Unit) {
    SideEffect { java.util.Locale.setDefault(java.util.Locale.forLanguageTag(language)) }
    val dark = isSystemInDarkTheme()
    val colors = remember(dark) { PatsJson.parseToJsonElement(context.assets.open("colors.json").bufferedReader().use { it.readText() }).jsonObject.obj(if (dark) "dark" else "light") }
    fun c(key: String) = Color(android.graphics.Color.parseColor(colors.text(key)))
    val scheme = (if (dark) darkColorScheme() else lightColorScheme()).copy(
        primary = c("primary"), onPrimary = c("primaryText"), primaryContainer = c("accentSubtle"), onPrimaryContainer = c("accentSubtleText"), secondary = c("secondary"), onSecondary = c("secondaryText"), secondaryContainer = c("secondarySubtle"), onSecondaryContainer = c("secondarySubtleText"), surfaceTint = c("primary"),
        background = c("bg"), onBackground = c("text"), surface = c("surface"), onSurface = c("text"),
        surfaceVariant = c("surfaceMuted"), onSurfaceVariant = c("textMuted"), outline = c("borderStrong"), outlineVariant = c("border"),
        surfaceContainerLowest = c("surface"), surfaceContainerLow = c("bg"), surfaceContainer = c("surfaceMuted"), surfaceContainerHigh = c("surfaceHover"), surfaceContainerHighest = c("border"), inverseSurface = c("primary"), inverseOnSurface = c("primaryText"),
        error = c("dangerText"), errorContainer = c("dangerSubtle"), onErrorContainer = c("dangerText")
    )
    val design = remember { PatsJson.parseToJsonElement(context.assets.open("design.json").bufferedReader().use { it.readText() }).jsonObject }
    fun style(key: String): TextStyle {
        val t = design.obj("type").obj(key)
        return TextStyle(fontFamily = Figtree, fontSize = t.number("size").sp, lineHeight = t.number("lineHeight").sp, fontWeight = FontWeight(t.number("weight")), letterSpacing = (t["tracking"]!!.jsonPrimitive.float * t.number("size")).sp, fontFeatureSettings = "tnum")
    }
    val typography = Typography(
        headlineLarge = style("display"), headlineMedium = style("title1"),
        titleLarge = style("title2"), titleMedium = style("title3"),
        bodyLarge = style("bodyLg"), bodyMedium = style("body"), bodySmall = style("caption"),
        labelLarge = style("bodySm").copy(fontWeight = FontWeight.Bold), labelMedium = style("label"), labelSmall = style("label")
    )
    val copy = remember(language) { Copy(context, language) }
    val density = androidx.compose.ui.platform.LocalDensity.current
    CompositionLocalProvider(LocalPalette provides colors, LocalDesign provides design, LocalLanguage provides language, LocalCopy provides { key, args -> copy.get(key, args) }, androidx.compose.ui.platform.LocalDensity provides androidx.compose.ui.unit.Density(density.density, density.fontScale.coerceAtMost(1.4f))) {
        MaterialTheme(colorScheme = scheme, typography = typography, shapes = Shapes(small = RoundedCornerShape(4.dp), medium = RoundedCornerShape(6.dp), large = RoundedCornerShape(10.dp), extraLarge = RoundedCornerShape(10.dp)), content = content)
    }
}

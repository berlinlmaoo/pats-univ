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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.RoundedCornerShape
import kotlinx.serialization.json.*

object Space { val tiny = 4.dp; val small = 8.dp; val gap = 12.dp; val page = 16.dp; val large = 24.dp; val hero = 40.dp; val control = 48.dp; val qr = 224.dp }
val LocalCopy = staticCompositionLocalOf<(String, Map<String, String>) -> String> { { key, _ -> key } }
@Composable fun tr(key: String, vararg args: Pair<String, String>) = LocalCopy.current(key, args.toMap())
class Copy(context: Context, language: String) {
    private val dictionary = PatsJson.parseToJsonElement(context.assets.open("$language.json").bufferedReader().use { it.readText() }).jsonObject
    fun get(key: String, args: Map<String, String> = emptyMap()): String {
        var entry: JsonElement? = dictionary
        key.split('.').forEach { entry = (entry as? JsonObject)?.get(it) }
        var result = (entry as? JsonPrimitive)?.contentOrNull ?: key
        args.forEach { (name, value) -> result = result.replace("{$name}", value) }
        return result
    }
}
@Composable fun PatsTheme(context: Context, language: String, content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val colors = remember(dark) { PatsJson.parseToJsonElement(context.assets.open("colors.json").bufferedReader().use { it.readText() }).jsonObject.obj(if (dark) "dark" else "light") }
    fun c(key: String) = Color(android.graphics.Color.parseColor(colors.text(key)))
    val scheme = (if (dark) darkColorScheme() else lightColorScheme()).copy(
        primary = c("primary"), onPrimary = c("primaryText"), primaryContainer = c("accentSubtle"), onPrimaryContainer = c("accentSubtleText"), secondary = c("secondary"), onSecondary = c("secondaryText"), secondaryContainer = c("accentSubtle"), onSecondaryContainer = c("accentSubtleText"), surfaceTint = c("primary"),
        background = c("bg"), onBackground = c("text"), surface = c("surface"), onSurface = c("text"),
        surfaceVariant = c("surfaceMuted"), onSurfaceVariant = c("textMuted"), outline = c("borderStrong"), outlineVariant = c("border"),
        error = c("dangerText"), errorContainer = c("dangerSubtle"), onErrorContainer = c("dangerText")
    )
    val inter = remember { FontFamily(Font(R.font.inter)) }
    val jakarta = remember { FontFamily(Font(R.font.plus_jakarta_sans)) }
    val typography = Typography(
        headlineLarge = TextStyle(fontFamily = jakarta, fontSize = 32.sp, lineHeight = 40.sp, fontWeight = FontWeight.ExtraBold),
        headlineMedium = TextStyle(fontFamily = jakarta, fontSize = 26.sp, lineHeight = 32.sp, fontWeight = FontWeight.Bold),
        titleLarge = TextStyle(fontFamily = jakarta, fontSize = 20.sp, lineHeight = 28.sp, fontWeight = FontWeight.Bold),
        titleMedium = TextStyle(fontFamily = inter, fontSize = 17.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold),
        bodyLarge = TextStyle(fontFamily = inter, fontSize = 16.sp, lineHeight = 24.sp),
        bodyMedium = TextStyle(fontFamily = inter, fontSize = 15.sp, lineHeight = 22.sp),
        bodySmall = TextStyle(fontFamily = inter, fontSize = 13.sp, lineHeight = 18.sp),
        labelLarge = TextStyle(fontFamily = inter, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold)
    )
    val copy = remember(language) { Copy(context, language) }
    CompositionLocalProvider(LocalCopy provides { key, args -> copy.get(key, args) }) {
        MaterialTheme(colorScheme = scheme, typography = typography, shapes = Shapes(medium = RoundedCornerShape(12.dp), large = RoundedCornerShape(20.dp)), content = content)
    }
}

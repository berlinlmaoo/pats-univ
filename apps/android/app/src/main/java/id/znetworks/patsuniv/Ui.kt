package id.znetworks.patsuniv

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.scale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.semantics.*
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.ui.graphics.Color
import kotlinx.coroutines.*
import kotlinx.serialization.json.JsonObject

private class PageRefresh {
    var version by mutableIntStateOf(0)
    var refreshing by mutableStateOf(false)
    var pending = 0
    var listeners = 0
    fun refresh(force: Boolean) { if (listeners > 0 || force) { pending = 0; refreshing = true; version++ } }
    fun started(epoch: Int) { if (epoch == version) pending++ }
    fun finished(epoch: Int) { if (epoch == version) { pending--; if (pending <= 0) refreshing = false } }
}
private val LocalPageRefresh = staticCompositionLocalOf<PageRefresh?> { null }
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun Page(onRefresh: (suspend () -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    val refresh = remember { PageRefresh() }
    val scope = rememberCoroutineScope()
    PullToRefreshBox(refresh.refreshing, {
        refresh.refresh(onRefresh != null)
        onRefresh?.let { action -> val epoch = refresh.version; refresh.started(epoch); scope.launch { try { action() } catch(e: CancellationException) { throw e } catch (_: Exception) { } finally { refresh.finished(epoch) } } }
    }) {
        CompositionLocalProvider(LocalPageRefresh provides refresh) {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(Space.page), verticalArrangement = Arrangement.spacedBy(Space.page), content = content)
        }
    }
}
@Composable fun Title(text: String, subtitle: String = "") {
    Column(Modifier.fillMaxWidth().background(tone("band"), MaterialTheme.shapes.medium).padding(Space.page), verticalArrangement = Arrangement.spacedBy(Space.small)) {
        VarsityText(text, tone("bandText"))
        Box(Modifier.fillMaxWidth().height(3.dp).background(tone("gold")))
        if (subtitle.isNotBlank()) Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = tone("bandMuted"))
    }
}
@Composable fun Tile(content: @Composable ColumnScope.() -> Unit) {
    Card(Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.large, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), elevation = CardDefaults.cardElevation(1.dp)) { Column(Modifier.padding(Space.page), verticalArrangement = Arrangement.spacedBy(Space.gap), content = content) }
}
@Composable fun Action(label: String, enabled: Boolean = true, secondary: Boolean = false, maroon: Boolean = false, danger: Boolean = false, onClick: () -> Unit) {
    val interactions = remember { MutableInteractionSource() }; val pressed by interactions.collectIsPressedAsState()
    val fill = when { !enabled -> Color.Transparent; danger -> tone("dangerSolid"); maroon -> tone("secondary"); secondary -> tone("surface"); else -> tone("primary") }
    val ink = when { !enabled -> tone("textMuted"); danger -> tone("onSolid"); maroon -> tone("secondaryText"); secondary -> tone("text"); else -> tone("primaryText") }
    val edge = tone("borderStrong")
    Button(onClick, Modifier.fillMaxWidth().heightIn(min = Space.control).scale(if (pressed) .98f else 1f).then(if (!enabled) Modifier.dashedBorder(edge) else Modifier), enabled = enabled, shape = MaterialTheme.shapes.medium, interactionSource = interactions, border = if (secondary && enabled) BorderStroke(1.dp, edge) else null, colors = ButtonDefaults.buttonColors(containerColor = fill, contentColor = ink, disabledContainerColor = Color.Transparent, disabledContentColor = ink)) { Text(label, fontWeight = FontWeight.Bold) }
}
@Composable fun Field(label: String, value: String, onChange: (String) -> Unit, keyboard: KeyboardType = KeyboardType.Text, multiline: Boolean = false) {
    Column(verticalArrangement = Arrangement.spacedBy(Space.small)) {
        SectionLabel(label)
        OutlinedTextField(value, onChange, Modifier.fillMaxWidth().heightIn(min = Space.control).semantics { contentDescription = label }, keyboardOptions = KeyboardOptions(keyboardType = keyboard), singleLine = !multiline, minLines = if (multiline) 3 else 1, shape = MaterialTheme.shapes.medium, colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = tone("accent"), unfocusedBorderColor = tone("borderStrong")))
    }
}
@Composable fun Notice(message: String, error: Boolean = false, kind: String = "info") {
    val family = if(error) "danger" else if(kind == "info") "accent" else kind
    Surface(color = tone("${family}Subtle"), shape = MaterialTheme.shapes.medium) {
        Text(message, Modifier.fillMaxWidth().padding(Space.page).semantics { if(error) liveRegion = LiveRegionMode.Assertive }, color = tone(if(family == "accent") "accentSubtleText" else "${family}Text"))
    }
}
@Composable fun Empty(title: String, description: String = tr("app.eventsEmptyBody", "city" to "")) { Tile {
    Column(Modifier.size(48.dp).background(tone("band"), MaterialTheme.shapes.small), horizontalAlignment = Alignment.CenterHorizontally) { Box(Modifier.weight(1f), contentAlignment = Alignment.Center) { PatsIcon("inbox", tone("bandText")) }; Box(Modifier.fillMaxWidth().height(3.dp).background(tone("gold"))) }
    Text(title, style = MaterialTheme.typography.titleMedium); Text(description, color = MaterialTheme.colorScheme.onSurfaceVariant)
} }
@Composable fun Brand() {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.page)) {
        Image(painterResource(R.drawable.official_crest), tr("common.appName"), Modifier.size(72.dp))
        Image(painterResource(R.drawable.lockup_cream), null, Modifier.width(160.dp).height(80.dp))
    }
}
@Composable fun Confirm(label: String, message: String, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(onDismissRequest = onDismiss, title = { Text(label) }, text = { Text(message) }, confirmButton = { TextButton(onConfirm, colors = ButtonDefaults.textButtonColors(contentColor = tone("dangerText"))) { Text(label) } }, dismissButton = { TextButton(onDismiss) { Text(tr("common.cancel")) } })
}
/** Request ownership follows the visible screen; stale responses cannot update another route. */
@Composable fun Remote(api: Api, path: String, refresh: Int = 0, pollMs: Long = 0, authenticated: Boolean = true, onForbidden: () -> Unit = {}, content: @Composable ColumnScope.(JsonObject, () -> Unit) -> Unit) {
    var result by remember(path) { mutableStateOf<JsonObject?>(null) }
    var error by remember(path) { mutableStateOf<String?>(null) }
    var errorParams by remember(path) { mutableStateOf<Array<Pair<String, String>>>(emptyArray()) }
    var version by remember(path) { mutableIntStateOf(0) }
    var loading by remember(path) { mutableStateOf(true) }
    val pageRefresh = LocalPageRefresh.current; val pageVersion = pageRefresh?.version ?: 0
    DisposableEffect(pageRefresh) { pageRefresh?.let { it.listeners++ }; onDispose { pageRefresh?.let { it.listeners--; if (it.listeners == 0) it.refreshing = false } } }
    LaunchedEffect(path, refresh, version, pageVersion) {
        do {
            loading = result == null
            pageRefresh?.started(pageVersion)
            try { result = api.request("GET", path, authenticated = authenticated); error = null }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { error = errorKey((e as? ApiFailure)?.code ?: "NETWORK"); errorParams = errorArgs(e); if ((e as? ApiFailure)?.code in setOf("FORBIDDEN", "ACCOUNT_DISABLED", "UNAUTHENTICATED")) { result = null; onForbidden() } }
            finally { loading = false; pageRefresh?.finished(pageVersion) }
            if (pollMs > 0) delay(pollMs)
        } while (pollMs > 0 && isActive)
    }
    Column(verticalArrangement = Arrangement.spacedBy(Space.page)) {
        if (loading) LoadingSkeleton()
        error?.let { Notice(tr(it, *errorParams), true); Action(tr("common.retry"), secondary = true) { version++ } }
        result?.let { content(it) { version++ } }
    }
}

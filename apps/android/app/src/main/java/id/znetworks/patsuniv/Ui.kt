package id.znetworks.patsuniv

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.*
import kotlinx.serialization.json.JsonObject

@Composable fun Page(content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(Space.page), verticalArrangement = Arrangement.spacedBy(Space.page), content = content)
}
@Composable fun Title(text: String, subtitle: String = "") {
    Column(verticalArrangement = Arrangement.spacedBy(Space.small)) {
        Text(text, style = MaterialTheme.typography.headlineMedium)
        if (subtitle.isNotBlank()) Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
@Composable fun Tile(content: @Composable ColumnScope.() -> Unit) {
    OutlinedCard(Modifier.fillMaxWidth()) { Column(Modifier.padding(Space.page), verticalArrangement = Arrangement.spacedBy(Space.gap), content = content) }
}
@Composable fun Action(label: String, enabled: Boolean = true, secondary: Boolean = false, onClick: () -> Unit) {
    if (secondary) OutlinedButton(onClick, Modifier.fillMaxWidth().heightIn(min = Space.control), enabled = enabled, shape = MaterialTheme.shapes.medium) { Text(label) }
    else Button(onClick, Modifier.fillMaxWidth().heightIn(min = Space.control), enabled = enabled, shape = MaterialTheme.shapes.medium) { Text(label) }
}
@Composable fun Field(label: String, value: String, onChange: (String) -> Unit, keyboard: KeyboardType = KeyboardType.Text, multiline: Boolean = false) {
    OutlinedTextField(value, onChange, Modifier.fillMaxWidth(), label = { Text(label) }, keyboardOptions = KeyboardOptions(keyboardType = keyboard), singleLine = !multiline, minLines = if (multiline) 3 else 1, shape = MaterialTheme.shapes.medium)
}
@Composable fun Notice(message: String, error: Boolean = false) {
    Surface(color = if (error) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.surfaceVariant, shape = MaterialTheme.shapes.medium) {
        Text(message, Modifier.fillMaxWidth().padding(Space.page), color = if (error) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
@Composable fun Empty(title: String, description: String = tr("app.eventsEmptyBody", "city" to "")) { Tile { Text(title, style = MaterialTheme.typography.titleMedium); Text(description, color = MaterialTheme.colorScheme.onSurfaceVariant) } }
@Composable fun Brand() {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Space.gap)) {
        Image(painterResource(R.drawable.crest), tr("common.appName"), Modifier.size(64.dp))
        Text(tr("common.appName"), style = MaterialTheme.typography.titleLarge)
    }
}
@Composable fun Confirm(label: String, message: String, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(onDismissRequest = onDismiss, title = { Text(label) }, text = { Text(message) }, confirmButton = { TextButton(onConfirm) { Text(label) } }, dismissButton = { TextButton(onDismiss) { Text(tr("common.cancel")) } })
}
/** Request ownership follows the visible screen; stale responses cannot update another route. */
@Composable fun Remote(api: Api, path: String, refresh: Int = 0, pollMs: Long = 0, authenticated: Boolean = true, content: @Composable ColumnScope.(JsonObject, () -> Unit) -> Unit) {
    var result by remember(path) { mutableStateOf<JsonObject?>(null) }
    var error by remember(path) { mutableStateOf<String?>(null) }
    var version by remember(path) { mutableIntStateOf(0) }
    var loading by remember(path) { mutableStateOf(true) }
    LaunchedEffect(path, refresh, version) {
        do {
            loading = result == null
            try { result = api.request("GET", path, authenticated = authenticated); error = null }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { error = errorKey((e as? ApiFailure)?.code ?: "NETWORK") }
            finally { loading = false }
            if (pollMs > 0) delay(pollMs)
        } while (pollMs > 0 && isActive)
    }
    Column(verticalArrangement = Arrangement.spacedBy(Space.page)) {
        if (loading) { CircularProgressIndicator(); Text(tr("common.loading")) }
        error?.let { Notice(tr(it), true); Action(tr("common.retry"), secondary = true) { version++ } }
        result?.let { content(it) { version++ } }
    }
}

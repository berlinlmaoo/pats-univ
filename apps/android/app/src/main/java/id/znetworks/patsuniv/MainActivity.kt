package id.znetworks.patsuniv

import android.app.Application
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.compose.BackHandler
import androidx.activity.viewModels
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import kotlinx.coroutines.*
import java.io.File
import kotlinx.serialization.json.*

class AppModel(application: Application) : AndroidViewModel(application) {
    val store = SessionStore(File(application.noBackupFilesDir, "session"), KeystoreSessionCipher())
    val api = Api(store)
    var incoming by mutableStateOf<String?>(null)
    var requestedRoute by mutableStateOf<String?>(null)
    var qaCapture by mutableStateOf(false)
    var offline by mutableStateOf(false)
}
class MainActivity : ComponentActivity() {
    private val model: AppModel by viewModels()
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        readIntent(intent)
        setContent { App(model) }
    }
    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); readIntent(intent) }
    private fun readIntent(intent: Intent) {
        cardToken(intent.dataString.orEmpty())?.let { model.incoming = it }
        if (BuildConfig.DEBUG && intent.hasExtra("qaRoute")) { model.incoming = null; model.requestedRoute = intent.getStringExtra("qaRoute"); model.qaCapture = intent.getBooleanExtra("qaCapture", false) }
    }
}
@Composable fun App(model: AppModel) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val prefs = remember { context.getSharedPreferences("preferences", 0) }
    var language by rememberSaveable { mutableStateOf(prefs.getString("language", "id") ?: "id") }
    val session by model.store.session.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var route by rememberSaveable { mutableStateOf("profile") }
    LaunchedEffect(session?.me?.obj("user")?.text("id")) {
        route = if (session?.me?.obj("member")?.isNotEmpty() == true) "card" else "tools"
        if (session != null) {
            try { model.api.reload(); model.offline = false } catch (e: CancellationException) { throw e } catch (_: Exception) { model.offline = true }
        }
    }
    fun setLanguage(next: String) {
        language = next; prefs.edit().putString("language", next).apply()
        if (session != null) scope.launch { runCatching { model.api.request("PATCH", "/api/me", body("locale" to next)) } }
    }
    PatsTheme(context, language) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Scaffold(containerColor = MaterialTheme.colorScheme.background) { padding ->
                Box(Modifier.padding(padding)) {
                    val token = model.incoming
                    if (token != null) {
                        BackHandler { model.incoming = null }
                        Page {
                            Action(tr("common.back"), secondary = true) { model.incoming = null }
                            Remote(model.api, "/api/c/$token", authenticated = session != null) { data, _ ->
                                Title(tr("app.cardTitle")); Notice(tr("cardPage." + when(data.text("state")) { "active" -> "active"; "pending" -> "pending"; "revoked" -> "revokedTitle"; "inactive" -> "inactiveTitle"; else -> "notFoundTitle" }))
                                val member = data.obj("member")
                                if (member.isNotEmpty()) Tile { Text(member.text("fullName"), style = MaterialTheme.typography.titleLarge); Text(member.text("nim")); Text(member.text("city")); Text(tr("app.song") + ": " + member.text("favoriteSong")); Text(tr("app.genre") + ": " + member.text("favoriteGenre")); if (member.text("quotes").isNotBlank()) Text(member.text("quotes")); if (member.text("joinedAt").isNotBlank()) Text(tr("members.joined") + ": " + runCatching { java.time.Instant.parse(member.text("joinedAt")).atZone(java.time.ZoneId.of("Asia/Jakarta")).format(java.time.format.DateTimeFormatter.ofPattern("d MMM yyyy", java.util.Locale.forLanguageTag(language))) }.getOrDefault(member.text("joinedAt"))) }
                                if (data.flag("isMine") && session?.me?.obj("member")?.isNotEmpty() == true) Action(tr("app.cardLinkOpen")) { model.incoming = null; model.requestedRoute = "card" }
                                if (session == null) Action(tr("auth.title"), secondary = true) { model.incoming = null }
                            }
                        }
                    } else if (session == null) Login(model.api, language, ::setLanguage)
                    else Shell(model, session!!, language, ::setLanguage, model.offline)
                }
            }
        }
    }
}
@Composable fun Login(api: Api, language: String, setLanguage: (String) -> Unit) {
    var email by rememberSaveable { mutableStateOf("") }
    var code by rememberSaveable { mutableStateOf("") }
    var otp by remember { mutableStateOf<JsonObject?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var errorParams by remember { mutableStateOf<Array<Pair<String, String>>>(emptyArray()) }
    var cooldown by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(cooldown) { if (cooldown > 0) { delay(1000); cooldown-- } }
    fun submit(verify: Boolean) {
        busy = true; error = null
        scope.launch {
            try {
                if (verify) api.signIn(email, code)
                else { otp = api.request("POST", "/api/auth/otp/request", body("email" to email.trim(), "locale" to language, "audience" to "app"), false); cooldown = otp!!.number("resendAfter") }
            } catch (e: CancellationException) { throw e } catch (e: Exception) { error = errorKey((e as? ApiFailure)?.code ?: "NETWORK"); errorParams = errorArgs(e) }
            finally { busy = false }
        }
    }
    Page {
        Spacer(Modifier.height(Space.hero)); Brand()
        Title(tr(if (otp == null) "app.loginTitle" else "otp.title"), tr(if (otp == null) "app.loginSubtitle" else "otp.subtitle", "email" to email))
        if (otp == null) Field(tr("auth.emailLabel"), email, { email = it }, KeyboardType.Email)
        else {
            val demo = otp!!.text("demoCode")
            if (demo.isNotBlank()) Notice(tr("otp.demoCode", "code" to demo))
            Field(tr("otp.codeLabel"), code, { value -> code = value.filter(Char::isDigit).take(6) }, KeyboardType.NumberPassword)
        }
        error?.let { Notice(tr(it, *errorParams), true) }
        Action(tr(if (busy) "common.loading" else if (otp == null) "auth.sendCode" else "otp.verify"), !busy && if (otp == null) validEmail(email) else validOtp(code)) { submit(otp != null) }
        if (otp != null) {
            Action(if (cooldown > 0) tr("otp.resendIn", "seconds" to cooldown.toString()) else tr("otp.resend"), !busy && cooldown == 0, true) { submit(false) }
            Action(tr("otp.changeEmail"), !busy, true) { otp = null; code = ""; error = null }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(Space.small)) { FilterChip(language == "id", { setLanguage("id") }, { Text("Bahasa Indonesia") }); FilterChip(language == "en", { setLanguage("en") }, { Text("English") }) }
    }
}
@Composable fun Profile(session: Session, api: Api, language: String, setLanguage: (String) -> Unit, go: (String) -> Unit = {}) {
    val user = session.me.obj("user"); val member = session.me.obj("member")
    var confirm by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val mutation = rememberMutation()
    Title(member.text("fullName", user.text("name")), member.text("nim", tr("role." + user.text("role"))))
    Tile {
        Text(user.text("email")); Text(user.text("phone")); Text(member.obj("city").text("name", user.obj("city").text("name")))
        if (member.isNotEmpty()) { Text(member.text("favoriteSong")); Text(member.text("favoriteGenre")); Text(member.text("quotes")) }
    }
    if (member.isNotEmpty()) {
        Remote(api, "/api/loyalty/wallet", refresh = liveVersion(api, "wallet", member.text("id"))) { data, _ -> Text(count(data.number("balance")) + " XP", style = MaterialTheme.typography.titleLarge) }
        if (member.flag("isPromoter")) Notice(tr("phase5.prBadge"))
        Action(tr("phase5.claimTitle"), secondary = true) { go("claims") }
        Action(tr("phase5.regionChange"), secondary = true) { go("region-change") }
        Action(tr("app.historyTitle"), secondary = true) { go("history") }
    }
    Action(tr("app.notificationsTitle"), secondary = true) { go("notifications") }
    Action(tr("app.notificationSettingsTitle"), secondary = true) { go("notification-settings") }
    Text(tr("common.language"), style = MaterialTheme.typography.titleMedium)
    Row(horizontalArrangement = Arrangement.spacedBy(Space.small)) { FilterChip(language == "id", { setLanguage("id") }, { Text("Bahasa Indonesia") }); FilterChip(language == "en", { setLanguage("en") }, { Text("English") }) }
    Action(tr("common.signOut"), secondary = true) { confirm = true }
    if (member.isNotEmpty()) Decide(tr("phase5.leave"), tr("phase5.leaveConfirm"), !mutation.busy, true) { mutation.run { api.request("POST", "/api/me/leave"); api.signOut() } }
    MutationStatus(mutation)
    if (confirm) Confirm(tr("common.signOut"), tr("app.signOutBody"), { confirm = false }) { confirm = false; scope.launch { api.signOut() } }
    Text(tr("app.version", "version" to BuildConfig.VERSION_NAME), style = MaterialTheme.typography.bodySmall)
}

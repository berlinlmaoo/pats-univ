package id.znetworks.patsuniv

import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.nio.file.Files
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec
import kotlinx.coroutines.*
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.util.concurrent.atomic.AtomicInteger

class FoundationTest {
    private fun store(): SessionStore {
        val key = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
        return SessionStore(File(Files.createTempDirectory("pats-session").toFile(), "session"), object : SessionCipher {
            override fun seal(plain: ByteArray): ByteArray {
                val c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.ENCRYPT_MODE, key)
                return c.iv + c.doFinal(plain)
            }
            override fun open(sealed: ByteArray): ByteArray {
                val c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, sealed.copyOfRange(0, 12)))
                return c.doFinal(sealed.copyOfRange(12, sealed.size))
            }
        })
    }
    @Test fun tokensValidateExpiryAndUnknownFields() {
        val tokens = PatsJson.decodeFromString<Tokens>("""{"accessToken":"a","refreshToken":"r","accessTokenExpiresAt":"2026-10-18T00:00:00Z","future":true}""")
        assertFalse(tokens.needsRefresh(java.time.Instant.parse("2026-10-17T23:59:00Z").toEpochMilli()))
        assertTrue(tokens.needsRefresh(java.time.Instant.parse("2026-10-17T23:59:40Z").toEpochMilli()))
        assertTrue(tokens.copy(accessTokenExpiresAt = "invalid").needsRefresh())
    }
    @Test fun validationAndDeepLinksRejectInvalidInput() {
        assertTrue(validEmail("rara.anindya@patsuniv.test")); assertFalse(validEmail("x@"))
        assertTrue(validOtp("123456")); assertFalse(validOtp("12345a"))
        val token = "a".repeat(32)
        assertEquals(token, cardToken("https://patsuniv.znetworks.id/c/$token?source=nfc"))
        assertNull(cardToken("https://patsuniv.znetworks.id/c/${token}x"))
        assertNull(cardToken("https://patsuniv.znetworks.id/c/short"))
    }
    @Test fun concurrentRequestsRotateRefreshTokenOnce() = runBlocking {
        val store = store()
        store.save(Session(Tokens("expired", "2020-01-01T00:00:00Z", "old"), body("user" to body("id" to "rara"))))
        val refreshes = AtomicInteger()
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/api/auth/refresh") { exchange ->
            refreshes.incrementAndGet()
            val bytes = """{"accessToken":"new","refreshToken":"rotated","accessTokenExpiresAt":"2099-01-01T00:00:00Z"}""".toByteArray()
            exchange.sendResponseHeaders(200, bytes.size.toLong()); exchange.responseBody.use { it.write(bytes) }
        }
        server.createContext("/api/me") { exchange ->
            assertEquals("Bearer new", exchange.requestHeaders.getFirst("Authorization"))
            val bytes = "{}".toByteArray(); exchange.sendResponseHeaders(200, bytes.size.toLong()); exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
        try {
            val api = Api(store, "http://127.0.0.1:${server.address.port}")
            (1..8).map { async { api.request("GET", "/api/me") } }.awaitAll()
            assertEquals(1, refreshes.get()); assertEquals("rotated", store.current!!.tokens.refreshToken)
            api.signOut(); assertNull(store.current)
        } finally { server.stop(0) }
    }
    @Test fun corruptedStoreSignsOutRatherThanCrashing() {
        val file = File(Files.createTempDirectory("pats-corrupt").toFile(), "session").apply { writeText("broken") }
        val store = SessionStore(file, object : SessionCipher {
            override fun seal(plain: ByteArray) = plain
            override fun open(sealed: ByteArray): ByteArray = error("bad authentication tag")
        })
        assertNull(store.current); assertFalse(file.exists())
    }
}

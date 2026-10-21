package id.znetworks.patsuniv

import java.nio.file.Files
import org.junit.Assert.*
import org.junit.Test

class PendingEncodeStoreTest {
    private val cipher = object : SessionCipher {
        override fun seal(plain: ByteArray) = plain.reversedArray()
        override fun open(sealed: ByteArray) = sealed.reversedArray()
    }
    @Test fun completedWriteSurvivesRestartAndIsIsolatedByOriginAndUser() {
        val directory = Files.createTempDirectory("pats-encode-report").toFile()
        try {
            val claim = body("card" to body("id" to "card-1"))
            val report = body("leaseId" to "lease-1", "nfcUid" to "041234", "protectedNow" to true)
            val store = PendingEncodeStore(directory, "https://dev.test", "crew-1", cipher)
            store.save(claim, report)
            val restarted = PendingEncodeStore(directory, "https://dev.test/", "crew-1", cipher)
            assertEquals(claim, restarted.load()!!.obj("claim"))
            assertEquals(report, restarted.load()!!.obj("report"))
            assertNull(PendingEncodeStore(directory, "https://prod.test", "crew-1", cipher).load())
            assertNull(PendingEncodeStore(directory, "https://dev.test", "crew-2", cipher).load())
            restarted.clear()
            assertNull(store.load())
        } finally { directory.deleteRecursively() }
    }
}

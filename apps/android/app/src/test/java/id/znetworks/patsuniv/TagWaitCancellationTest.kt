package id.znetworks.patsuniv

import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

class TagWaitCancellationTest {
    private class WaitingReader : CardReader {
        val tagArrives = CompletableDeferred<Unit>()
        override fun support() = NfcSupport.READY
        override suspend fun <T> withTag(block: suspend (TagIo) -> T): T {
            tagArrives.await()
            return block(object : TagIo {
                override val uid = "fixture"
                override fun transceive(command: Bytes): Bytes = error("No physical IO in this test")
            })
        }
    }

    @Test fun cancelBeforeTagPreventsWriteAndReleasesBusyGuard() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        val mutation = Mutation(scope); val wait = TagWait(); val reader = WaitingReader()
        var writes = 0
        mutation.run {
            wait.start()
            try { reader.withTag { wait.acquired(); writes++ } }
            finally { wait.finish() }
        }
        assertTrue(mutation.busy)
        assertTrue(wait.waitingForTag)
        if (wait.cancelWaiting()) mutation.cancel()
        reader.tagArrives.complete(Unit)
        yield()
        assertEquals(0, writes)
        assertFalse(mutation.busy)
        assertFalse(wait.waitingForTag)
        scope.cancel()
    }

    @Test fun tagAcquisitionRemovesCancelBeforeKeyRequestAndWrite() = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
        val mutation = Mutation(scope); val wait = TagWait(); val reader = WaitingReader()
        val keyReply = CompletableDeferred<Unit>()
        var writes = 0
        mutation.run {
            wait.start()
            try { reader.withTag { wait.acquired(); keyReply.await(); writes++ } }
            finally { wait.finish() }
        }
        reader.tagArrives.complete(Unit)
        yield()
        assertTrue(mutation.busy)
        assertFalse(wait.waitingForTag)
        assertFalse(wait.cancelWaiting())
        keyReply.complete(Unit)
        yield()
        assertEquals(1, writes)
        assertFalse(mutation.busy)
        scope.cancel()
    }
}

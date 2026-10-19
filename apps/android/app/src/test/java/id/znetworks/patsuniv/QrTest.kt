package id.znetworks.patsuniv

import com.google.zxing.BarcodeFormat
import com.google.zxing.MultiFormatWriter
import org.junit.Test
import org.junit.Assert.*

class QrTest {
    @Test fun scannerReadsWhiteOnMaroonAtDimLuminance() {
        val value = "P1.member.nonce.1792297235.signature"
        val modules = qrMatrix(value, true)
        val step = 5; val quiet = 5; val width = (modules.width + quiet * 2) * step
        for(bright in listOf(255, 77)) {
            val dark = bright * 36 / 255
            val frame = ByteArray(width * width) { i ->
                val x = i % width / step - quiet; val y = i / width / step - quiet
                (if(x in 0 until modules.width && y in 0 until modules.height && modules[x,y]) bright else dark).toByte()
            }
            assertEquals("brightness=" + bright, value, decodeQr(frame,width,width))
        }
    }
    @Test fun cameraDecoderReadsRotatedLuminanceAndRejectsEmptyFrames() {
        val value = "P1.member.nonce.1792297235.signature"
        val matrix = MultiFormatWriter().encode(value, BarcodeFormat.QR_CODE, 256, 256)
        val frame = ByteArray(256 * 256) { i -> if (matrix[i % 256, i / 256]) 0 else 255.toByte() }
        assertEquals(value, decodeQr(frame, 256, 256))
        val rotated = ByteArray(frame.size) { i -> frame[(255 - i % 256) * 256 + i / 256] }
        assertEquals(value, decodeQr(rotated, 256, 256)); assertNull(decodeQr(ByteArray(frame.size) { 255.toByte() }, 256, 256)); assertNull(decodeQr(byteArrayOf(), 256, 256))
    }
}

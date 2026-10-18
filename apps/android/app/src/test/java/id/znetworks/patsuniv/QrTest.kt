package id.znetworks.patsuniv

import com.google.zxing.BarcodeFormat
import com.google.zxing.MultiFormatWriter
import org.junit.Test
import org.junit.Assert.*

class QrTest {
    @Test fun cameraDecoderReadsRotatedLuminanceAndRejectsEmptyFrames() {
        val value = "P1.member.nonce.1792297235.signature"
        val matrix = MultiFormatWriter().encode(value, BarcodeFormat.QR_CODE, 256, 256)
        val frame = ByteArray(256 * 256) { i -> if (matrix[i % 256, i / 256]) 0 else 255.toByte() }
        assertEquals(value, decodeQr(frame, 256, 256))
        val rotated = ByteArray(frame.size) { i -> frame[(255 - i % 256) * 256 + i / 256] }
        assertEquals(value, decodeQr(rotated, 256, 256)); assertNull(decodeQr(ByteArray(frame.size) { 255.toByte() }, 256, 256)); assertNull(decodeQr(byteArrayOf(), 256, 256))
    }
}

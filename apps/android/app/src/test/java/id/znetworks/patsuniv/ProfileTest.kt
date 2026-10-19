package id.znetworks.patsuniv

import org.junit.Assert.*
import org.junit.Test

class ProfileTest {
    @Test fun editableProfileUsesTheWebLimitsAfterTrimming() {
        assertTrue(validProfile(" Tequila ","House","Song",""))
        assertFalse(validProfile(" ","House","Song",""))
        assertFalse(validProfile("x".repeat(41),"House","Song",""))
        assertFalse(validProfile("Tea","x".repeat(51),"Song",""))
        assertFalse(validProfile("Tea","House","x".repeat(101),""))
        assertFalse(validProfile("Tea","House","Song","x".repeat(141)))
    }
    @Test fun photosRejectOversizedAndUnusableDimensionsBeforeDecode() {
        assertTrue(validPhotoSize(5*1024*1024,400,400))
        assertFalse(validPhotoSize(5*1024*1024+1,400,400))
        assertFalse(validPhotoSize(1024,400,399))
        assertFalse(validPhotoSize(1024,8001,400))
        assertFalse(validPhotoSize(0,400,400))
    }
}

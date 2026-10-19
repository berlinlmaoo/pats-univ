package id.znetworks.patsuniv

import org.junit.Assert.*
import org.junit.Test

class CardValueFitTest {
    @Test fun shortValuesKeepTheirSizeAndBoundaryValuesStayOnOneLine() {
        assertEquals(CardValueFit(1f, false), cardValueFit(200f, 100f))
        assertEquals(CardValueFit(.6f, false), cardValueFit(60f, 100f))
        assertEquals(CardValueFit(1f, false), cardValueFit(200f, 0f))
    }
    @Test fun longValuesWrapInsteadOfShrinkingBelowTheWebMinimum() {
        assertEquals(CardValueFit(.6f, true), cardValueFit(59f, 100f))
        assertEquals(.475f, cardValueFit(25f, 100f).scale, .00001f)
        assertEquals(CardValueFit(.42f, true), cardValueFit(5f, 100f))
    }
}

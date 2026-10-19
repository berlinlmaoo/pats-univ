import XCTest
import CoreText
@testable import PATSCore

final class CardTypographyTests: XCTestCase {
    private func typeface() -> CardTypeface {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        return CardTypeface(url: root.appendingPathComponent("packages/shared/assets/fonts/card-value.ttf"))
    }
    func testDescriptorSelectsLicensedFileDespiteSystemPostScriptName() throws {
        let face = typeface(), font = face.font(size: 100)
        XCTAssertEqual(face.source, .bundledFile)
        XCTAssertEqual(CTFontCopyPostScriptName(font) as String, "Avenir-Black")
        XCTAssertEqual((CTFontCopyAttribute(font, kCTFontURLAttribute) as? URL)?.standardizedFileURL, face.url?.standardizedFileURL)
        XCTAssertEqual(CTFontGetCapHeight(font), 70.8, accuracy: 0.001)
        // Licensed-file hmtx advances (including GPOS kerning), minus 0.065em per glyph.
        // These values also define the same-size web/print comparison, without a system font lookup.
        for (text, expected) in [("MICHAEL WIBOWO", 858.6), ("TEQUILA", 391.6), ("HIPHOP, BREAKBEAT", 920.6)] {
            let width = CTLineGetTypographicBounds(face.line(text, size: 100), nil, nil, nil)
            XCTAssertEqual(width, expected, accuracy: 0.01, text)
        }
    }
    func testSampleUsesSharedCapSizeAndGlyphOriginWithoutNativeLinePadding() throws {
        let face = typeface()
        for width: CGFloat in [120, 390, 1600] {
            let layout = face.layout("MICHAEL WIBOWO", cardWidth: width, maxWidth: width * KTMGeometry.nameMaxW)
            XCTAssertEqual(layout.lines.count, 1)
            XCTAssertEqual(layout.size, width * 0.0312 / 0.708, accuracy: 0.0001)
            // Web: top = y - capTop em in a line-height-1 box, baseline 0.5 + (ascent - descent) / 2 below it.
            XCTAssertEqual(layout.baseline, width * 0.0312 / 0.708 * 0.7315, accuracy: 0.0001)
            XCTAssertEqual(KTMGeometry.valueX * width, 0.0492 * width, accuracy: 0.0001)
        }
    }
    func testShrinkAndWrapKeepCapTopFixedAndScaleTracking() throws {
        let face = typeface()
        let regular = face.layout("MICHAEL WIBOWO", cardWidth: 390, maxWidth: 110)
        let wrapped = face.layout("MICHAEL WIBOWO", cardWidth: 390, maxWidth: 60)
        XCTAssertEqual(regular.lines.count, 1)
        XCTAssertLessThan(regular.size, 390 * KTMGeometry.valueCap / CardValueMetrics.capHeight)
        XCTAssertGreaterThan(wrapped.lines.count, 1)
        for layout in [regular, wrapped] {
            XCTAssertEqual(layout.baseline / layout.size, layout.lines.count > 1 ? 0.7515 : 0.7315, accuracy: 0.0001)
            for line in layout.lines {
                let runs = CTLineGetGlyphRuns(line) as! [CTRun]
                for run in runs {
                    let attrs = CTRunGetAttributes(run) as NSDictionary
                    XCTAssertEqual(try XCTUnwrap(attrs[kCTKernAttributeName] as? CGFloat), CardValueMetrics.tracking * layout.size, accuracy: 0.0001)
                }
            }
        }
    }
    func testDataFallbackDrawsTheSameLicensedGlyphs() throws {
        let url = try XCTUnwrap(typeface().url)
        let data = try XCTUnwrap(CardTypeface.fromData(url))
        XCTAssertEqual(CTFontCopyPostScriptName(data) as String, "Avenir-Black")
        XCTAssertEqual(CTFontGetCapHeight(data), 70.8, accuracy: 0.001)
        let file = typeface()
        for text in ["MICHAEL WIBOWO", "TEQUILA", "HIPHOP, BREAKBEAT"] {
            let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: [
                NSAttributedString.Key(kCTFontAttributeName as String): data,
                NSAttributedString.Key(kCTKernAttributeName as String): CardValueMetrics.tracking * 100
            ]))
            XCTAssertEqual(CTLineGetTypographicBounds(line, nil, nil, nil), CTLineGetTypographicBounds(file.line(text, size: 100), nil, nil, nil), accuracy: 0.01, text)
        }
    }
    func testMissingFileFallsBackWithoutCrashing() {
        let face = CardTypeface(url: nil)
        XCTAssertEqual(face.source, .systemFallback)
        XCTAssertNotEqual(CTFontCopyPostScriptName(face.font(size: 20)) as String, "Avenir-Black")
        XCTAssertEqual(face.layout("TEQUILA", cardWidth: 390, maxWidth: 234).lines.count, 1)
        let missing = CardTypeface(url: URL(fileURLWithPath: "/nonexistent/card-value.ttf"))
        XCTAssertEqual(missing.source, .systemFallback)
    }
}

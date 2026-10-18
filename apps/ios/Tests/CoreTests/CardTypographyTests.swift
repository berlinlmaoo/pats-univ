import XCTest
import CoreText
@testable import PATSCore

final class CardTypographyTests: XCTestCase {
    private func typeface() throws -> CardTypeface {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        return try CardTypeface(url: root.appendingPathComponent("packages/shared/assets/fonts/card-value.ttf"))
    }
    func testDescriptorSelectsLicensedFileDespiteSystemPostScriptName() throws {
        let face = try typeface(), font = face.font(size: 100)
        XCTAssertEqual(CTFontCopyPostScriptName(font) as String, "Avenir-Black")
        XCTAssertEqual((CTFontCopyAttribute(font, kCTFontURLAttribute) as? URL)?.standardizedFileURL, face.url.standardizedFileURL)
        XCTAssertEqual(CTFontGetCapHeight(font), 70.8, accuracy: 0.001)
        // Licensed-file hmtx advances (including GPOS kerning), minus 0.065em per glyph.
        // These values also define the same-size web/print comparison, without a system font lookup.
        for (text, expected) in [("MICHAEL WIBOWO", 858.6), ("TEQUILA", 391.6), ("HIPHOP, BREAKBEAT", 920.6)] {
            let width = CTLineGetTypographicBounds(face.line(text, size: 100), nil, nil, nil)
            XCTAssertEqual(width, expected, accuracy: 0.01, text)
        }
    }
    func testSampleUsesSharedCapSizeAndGlyphOriginWithoutNativeLinePadding() throws {
        let face = try typeface()
        for width: CGFloat in [120, 390, 1600] {
            let layout = face.layout("MICHAEL WIBOWO", cardWidth: width, maxWidth: width * KTMGeometry.nameMaxW)
            XCTAssertEqual(layout.lines.count, 1)
            XCTAssertEqual(layout.size, width * 0.0312 / 0.708, accuracy: 0.0001)
            XCTAssertEqual(layout.baseline, width * 0.0312, accuracy: 0.0001)
            XCTAssertEqual(KTMGeometry.valueX * width, 0.0492 * width, accuracy: 0.0001)
        }
    }
    func testShrinkAndWrapKeepCapTopFixedAndScaleTracking() throws {
        let face = try typeface()
        let regular = face.layout("MICHAEL WIBOWO", cardWidth: 390, maxWidth: 110)
        let wrapped = face.layout("MICHAEL WIBOWO", cardWidth: 390, maxWidth: 60)
        XCTAssertEqual(regular.lines.count, 1)
        XCTAssertLessThan(regular.size, 390 * KTMGeometry.valueCap / CardValueMetrics.capHeight)
        XCTAssertGreaterThan(wrapped.lines.count, 1)
        for layout in [regular, wrapped] {
            XCTAssertEqual(layout.baseline / layout.size, CardValueMetrics.capHeight, accuracy: 0.0001)
            for line in layout.lines {
                let runs = CTLineGetGlyphRuns(line) as! [CTRun]
                for run in runs {
                    let attrs = CTRunGetAttributes(run) as NSDictionary
                    XCTAssertEqual(try XCTUnwrap(attrs[kCTKernAttributeName] as? CGFloat), CardValueMetrics.tracking * layout.size, accuracy: 0.0001)
                }
            }
        }
    }
}

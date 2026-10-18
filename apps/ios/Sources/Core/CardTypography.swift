import Foundation
import CoreText
import CoreGraphics

/// The file descriptor carries the licensed font's URL, even when iOS has an Avenir-Black.
struct CardTypeface {
    let url: URL
    private let descriptor: CTFontDescriptor
    init(url: URL) throws {
        CTFontManagerRegisterFontURLs([url] as CFArray, .process, true, nil)
        guard let descriptors = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor],
              let descriptor = descriptors.first else { throw CardFontError.missingFont }
        self.url = url; self.descriptor = descriptor
    }
    func font(size: CGFloat) -> CTFont {
        let font = CTFontCreateWithFontDescriptor(descriptor, size, nil)
        // Fail visibly instead of silently substituting the same-named system face.
        let loadedURL = CTFontCopyAttribute(font, kCTFontURLAttribute) as? URL
        precondition(loadedURL?.standardizedFileURL.resolvingSymlinksInPath() == url.standardizedFileURL.resolvingSymlinksInPath(), "Card font resolved outside its bundled file")
        return font
    }
    func line(_ text: String, size: CGFloat) -> CTLine { CTLineCreateWithAttributedString(attributed(text, size: size)) }
    func attributed(_ text: String, size: CGFloat) -> NSAttributedString {
        NSAttributedString(string: text, attributes: [
            NSAttributedString.Key(kCTFontAttributeName as String): font(size: size),
            NSAttributedString.Key(kCTKernAttributeName as String): CardValueMetrics.tracking * size,
            NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(gray: 0, alpha: 1)
        ])
    }
    func layout(_ value: String, cardWidth: CGFloat, maxWidth: CGFloat) -> CardValueLayout {
        let text = value.trimmingCharacters(in: .whitespacesAndNewlines).uppercased(with: Locale(identifier: "id_ID"))
        let fullSize = cardWidth * KTMGeometry.valueCap / CardValueMetrics.capHeight
        let naturalWidth = CGFloat(CTLineGetTypographicBounds(line(text, size: fullSize), nil, nil, nil))
        let ratio = maxWidth / max(1, naturalWidth)
        let wrap = ratio < 0.6
        let scale = wrap ? max(0.42, min(0.6, ratio * 1.9)) : min(1, ratio)
        let size = fullSize * scale
        let typesetter = CTTypesetterCreateWithAttributedString(attributed(text, size: size))
        var lines: [CTLine] = []
        var offset = 0
        while offset < text.utf16.count {
            let count = wrap ? max(1, CTTypesetterSuggestLineBreak(typesetter, offset, Double(maxWidth))) : text.utf16.count
            lines.append(CTTypesetterCreateLine(typesetter, CFRange(location: offset, length: count)))
            offset += count
        }
        // Same box as web/print: a CSS line box (1, or 1.04 when wrapped) whose top sits capTop above y,
        // with the hhea content area centred in it (docs/NATIVE-DESIGN.md section 2.1).
        let lineHeight: CGFloat = wrap ? 1.04 : 1
        let baseline = size * ((lineHeight - CardValueMetrics.ascent - CardValueMetrics.descent) / 2 + CardValueMetrics.ascent - CardValueMetrics.capTop)
        return CardValueLayout(lines: lines, size: size, baseline: baseline, lineAdvance: size * lineHeight)
    }
}
enum CardFontError: Error { case missingFont }
struct CardValueLayout {
    let lines: [CTLine]
    let size: CGFloat
    /// Distance from the value's y token to the first baseline (0.7315 em on one line, as on web).
    let baseline: CGFloat
    let lineAdvance: CGFloat
    func draw(in context: CGContext) {
        context.saveGState(); defer { context.restoreGState() }
        context.textMatrix = .identity
        context.translateBy(x: 0, y: baseline); context.scaleBy(x: 1, y: -1)
        for (index, line) in lines.enumerated() {
            context.textPosition = CGPoint(x: 0, y: -CGFloat(index) * lineAdvance)
            CTLineDraw(line, context)
        }
    }
}

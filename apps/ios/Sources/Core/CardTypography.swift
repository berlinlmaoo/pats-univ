import Foundation
import CoreText
import CoreGraphics
import os

/// The licensed card font is only ever created from the bundled file, never looked up by name:
/// iOS ships a system Avenir with the same PostScript name ("Avenir-Black"). Loading never crashes.
struct CardTypeface {
    enum Source: Equatable { case bundledFile, bundledData, systemFallback }
    let url: URL?
    let source: Source
    private let base: CTFont
    private static let log = Logger(subsystem: "id.znetworks.patsuniv", category: "card-font")
    init(url: URL?) {
        self.url = url
        if let url, let font = Self.fromDescriptor(url) { base = font; source = .bundledFile }
        else if let url, let font = Self.fromData(url) {
            Self.log.error("Card font descriptor did not resolve to the bundled file; using its data directly")
            base = font; source = .bundledData
        } else {
            Self.log.fault("Card font missing from the bundle; using a system heavy face")
            base = Self.systemHeavy(); source = .systemFallback
        }
    }
    /// Descriptor made from the file itself, accepted only if the font really comes from that file.
    static func fromDescriptor(_ url: URL) -> CTFont? {
        guard let descriptors = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor],
              let descriptor = descriptors.first else { return nil }
        let font = CTFontCreateWithFontDescriptor(descriptor, 100, nil)
        let loaded = (CTFontCopyAttribute(font, kCTFontURLAttribute) as? URL)?.standardizedFileURL.resolvingSymlinksInPath()
        return loaded == url.standardizedFileURL.resolvingSymlinksInPath() ? font : nil
    }
    /// The file's bytes as a graphics font: no name lookup is involved at all.
    static func fromData(_ url: URL) -> CTFont? {
        guard let provider = CGDataProvider(url: url as CFURL), let graphics = CGFont(provider) else { return nil }
        return CTFontCreateWithGraphicsFont(graphics, 100, nil, nil)
    }
    static func systemHeavy() -> CTFont {
        let system = CTFontCreateUIFontForLanguage(.system, 100, nil) ?? CTFontCreateWithName("Helvetica-Bold" as CFString, 100, nil)
        let traits = [kCTFontWeightTrait: 0.56] as CFDictionary
        let descriptor = CTFontDescriptorCreateCopyWithAttributes(CTFontCopyFontDescriptor(system), [kCTFontTraitsAttribute: traits] as CFDictionary)
        return CTFontCreateCopyWithAttributes(system, 100, nil, descriptor)
    }
    /// Size copies keep the exact face that was loaded.
    func font(size: CGFloat) -> CTFont { CTFontCreateCopyWithAttributes(base, size, nil, nil) }
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

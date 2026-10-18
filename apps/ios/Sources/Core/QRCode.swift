import Foundation
import CoreImage.CIFilterBuiltins
import CoreGraphics

/// One vector path of horizontal runs. Adjacent modules share edges in a single fill.
enum QRCode {
    static func path(_ value: String, in rect: CGRect) -> CGPath {
        let path = CGMutablePath()
        let filter = CIFilter.qrCodeGenerator(); filter.message = Data(value.utf8); filter.correctionLevel = "M"
        guard let output = filter.outputImage else { return path }
        // Core Image adds one border module. The card tile supplies the quiet zone.
        let extent = output.extent.insetBy(dx: 1, dy: 1)
        let count = Int(extent.width)
        guard count > 0 else { return path }
        var pixels = [UInt8](repeating: 0, count: count * count * 4)
        CIContext().render(output, toBitmap: &pixels, rowBytes: count * 4, bounds: extent, format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())
        let module = min(rect.width, rect.height) / CGFloat(count)
        for y in 0..<count {
            var x = 0
            while x < count {
                if pixels[(y * count + x) * 4] < 128 {
                    let start = x
                    while x < count && pixels[(y * count + x) * 4] < 128 { x += 1 }
                    path.addRect(CGRect(x: rect.minX + CGFloat(start) * module, y: rect.minY + CGFloat(y) * module, width: CGFloat(x - start) * module, height: module))
                } else { x += 1 }
            }
        }
        return path
    }
}

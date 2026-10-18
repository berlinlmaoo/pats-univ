import XCTest
import CoreImage
import Vision
@testable import PATSCore

final class DesignTests: XCTestCase {
    func testInputFormattingAlwaysUsesDayFirstAnd24HourWIB() throws {
        let date = try XCTUnwrap(Dates.parse("2026-10-19T16:05:00Z"))
        for locale in ["en", "id"] {
            UserDefaults.standard.set(locale, forKey: "locale")
            XCTAssertEqual(L.inputDate(date), "19/10/2026")
            XCTAssertEqual(L.inputDate(date, time: true), "23.05")
        }
        UserDefaults.standard.removeObject(forKey: "locale")
    }
    func testSinglePathQRDecodesAtCardAndEnlargedSizes() throws {
        // A realistic UUIDv7 check-in payload; no assumptions about CUID length/shape.
        let token = "eyJhbGciOiJIUzI1NiJ9.eyJtZW1iZXJJZCI6IjAxOWEwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDAwMSJ9.signature"
        for side in [90, 230, 640] {
          for onTile in [false, true] {
            let size = side + 48
            let context = try XCTUnwrap(CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
            context.setFillColor(onTile ? CGColor(red: 54.0/255, green: 12.0/255, blue: 12.0/255, alpha: 1) : CGColor(gray: 1, alpha: 1)); context.fill(CGRect(x: 0, y: 0, width: size, height: size))
            context.addPath(QRCode.path(token, in: CGRect(x: 24, y: 24, width: side, height: side)))
            context.setFillColor(CGColor(gray: onTile ? 1 : 0, alpha: 1)); context.fillPath()
            let image = try XCTUnwrap(context.makeImage())
            let request = VNDetectBarcodesRequest(); request.symbologies = [.qr]
            try VNImageRequestHandler(cgImage: image).perform([request])
            XCTAssertEqual(request.results?.first?.payloadStringValue, token, "side=\(side), onTile=\(onTile)")
          }
        }
    }
}

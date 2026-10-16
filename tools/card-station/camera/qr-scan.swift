// pats-qr-scan: reads one QR code with the Mac's camera (or from an image) and prints its text.
// Used by `card-station encode --camera` to identify a printed card. Build:
//   swiftc -O camera/qr-scan.swift -o target/release/pats-qr-scan
// Usage: pats-qr-scan [--timeout <seconds>] | pats-qr-scan --image <file>
// The first run asks for camera access for the terminal app (System Settings → Privacy → Camera).
import AVFoundation
import AppKit
import Vision

func fail(_ message: String) -> Never {
  FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
  exit(1)
}

func decode(_ image: CGImage) -> String? {
  let request = VNDetectBarcodesRequest()
  request.symbologies = [.qr]
  try? VNImageRequestHandler(cgImage: image).perform([request])
  return request.results?.compactMap(\.payloadStringValue).first
}

let args = CommandLine.arguments
if let i = args.firstIndex(of: "--image"), i + 1 < args.count {
  guard let img = NSImage(contentsOfFile: args[i + 1]), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fail("Can't open \(args[i + 1])")
  }
  guard let text = decode(cg) else { fail("No QR code in the image") }
  print(text)
  exit(0)
}

let timeout = args.firstIndex(of: "--timeout").flatMap { Double(args[$0 + 1]) } ?? 60

final class Scanner: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
  let session = AVCaptureSession()
  let context = CIContext()

  func start() {
    guard let device = AVCaptureDevice.default(for: .video) else { fail("No camera found") }
    guard let input = try? AVCaptureDeviceInput(device: device) else { fail("Camera access denied. Allow it in System Settings → Privacy & Security → Camera.") }
    session.addInput(input)
    let output = AVCaptureVideoDataOutput()
    output.setSampleBufferDelegate(self, queue: DispatchQueue(label: "qr"))
    session.addOutput(output)
    session.startRunning()
  }

  func captureOutput(_ output: AVCaptureOutput, didOutput sample: CMSampleBuffer, from connection: AVCaptureConnection) {
    guard let buffer = CMSampleBufferGetImageBuffer(sample) else { return }
    let image = CIImage(cvPixelBuffer: buffer)
    guard let cg = context.createCGImage(image, from: image.extent), let text = decode(cg) else { return }
    session.stopRunning()
    print(text)
    exit(0)
  }
}

AVCaptureDevice.requestAccess(for: .video) { granted in
  if !granted { fail("Camera access denied. Allow it in System Settings → Privacy & Security → Camera.") }
}
let scanner = Scanner()
scanner.start()
DispatchQueue.main.asyncAfter(deadline: .now() + timeout) { fail("No QR code seen within \(Int(timeout)) seconds") }
RunLoop.main.run()

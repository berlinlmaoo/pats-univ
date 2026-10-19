import Foundation
import CoreNFC

struct CardScan { let token: String; let uid: String }
extension TagFailure: LocalizedError {
    var errorDescription: String? {
        let key: String
        switch self {
        case .unsupported: key = "nfc.notNtag"
        case .format: key = "nfc.notFormatted"
        case .locked: key = "nfc.locked"
        case .readOnly: key = "nfc.readOnly"
        case .password: key = "nfc.wrongPassword"
        case .write: key = "nfc.writeFailed"
        case .verify: key = "nfc.verifyFailed"
        case .protect: key = "nfc.protectFailed"
        case .lost: key = "nfc.tagLost"
        case .capacity: key = "nfc.writeFailed"
        }
        return L.t(key)
    }
}
@MainActor protocol CardReader: AnyObject {
    var available: Bool { get }
    func read() async throws -> CardScan
    func encode(credentials: @escaping (TagInspection) async throws -> TagCredentials) async throws -> EncodeResult
    func cancel()
}
struct MiFareIO: TagIO {
    let tag: NFCMiFareTag
    func transceive(_ bytes: [UInt8]) async throws -> [UInt8] {
        try await withCheckedThrowingContinuation { continuation in
            tag.sendMiFareCommand(commandPacket: Data(bytes)) { data, error in
                if let error { continuation.resume(throwing: error) } else { continuation.resume(returning: Array(data)) }
            }
        }
    }
}
@MainActor final class CoreNFCCardReader: NSObject, CardReader, NFCTagReaderSessionDelegate {
    var available: Bool { NFCTagReaderSession.readingAvailable }
    private var session: NFCTagReaderSession?
    private var continuation: CheckedContinuation<CardScan, Error>?
    private var encoding: CheckedContinuation<EncodeResult, Error>?
    private var credentials: ((TagInspection) async throws -> TagCredentials)?
    private var operation: Task<Void, Never>?
    func read() async throws -> CardScan {
        try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { c in continuation = c; begin() }
        } onCancel: { Task { @MainActor in self.cancel() } }
    }
    func encode(credentials: @escaping (TagInspection) async throws -> TagCredentials) async throws -> EncodeResult {
        self.credentials = credentials
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { c in encoding = c; begin() }
        } onCancel: { Task { @MainActor in self.cancel() } }
    }
    private func begin() {
        guard available, session == nil, let reader = NFCTagReaderSession(pollingOption: .iso14443, delegate: self, queue: .main) else { finish(error: TagFailure.unsupported); return }
        session = reader; reader.alertMessage = L.t("native.nfcPrompt"); reader.begin()
    }
    nonisolated func tagReaderSessionDidBecomeActive(_ session: NFCTagReaderSession) {}
    nonisolated func tagReaderSession(_ session: NFCTagReaderSession, didInvalidateWithError error: Error) {
        // Closing the system NFC sheet is a cancel, not an error to show.
        let canceled = (error as? NFCReaderError)?.code == .readerSessionInvalidationErrorUserCanceled
        Task { @MainActor in guard session === self.session else { return }; self.finish(error: canceled ? CancellationError() : error) }
    }
    nonisolated func tagReaderSession(_ session: NFCTagReaderSession, didDetect tags: [NFCTag]) {
        Task { @MainActor in
            guard session === self.session, operation == nil else { return }
            guard tags.count == 1, let tag = tags.first, case .miFare(let mifare) = tag, mifare.mifareFamily == .ultralight else { self.finish(error: TagFailure.unsupported); return }
            operation = Task {
                do {
                    try await session.connect(to: tag)
                    if let credentials = self.credentials {
                        let io = MiFareIO(tag: mifare); let inspection = try await NTAG.inspect(io)
                        let key = try await credentials(inspection)
                        try Task.checkCancellation()
                        let result = try await NTAG.encode(io, tag: inspection, credentials: key)
                        self.encoding?.resume(returning: result); self.encoding = nil
                    } else {
                        let message = try await mifare.readNDEF()
                        let url = message.records.compactMap { $0.wellKnownTypeURIPayload() }.first
                        guard let url, let token = CardLink.token(url.absoluteString) else { throw TagFailure.format }
                        self.continuation?.resume(returning: CardScan(token: token, uid: Hex.string(Array(mifare.identifier)))); self.continuation = nil
                    }
                    self.credentials = nil; self.operation = nil; self.session = nil
                    session.alertMessage = L.t("native.saved"); session.invalidate()
                } catch { self.finish(error: error) }
            }
        }
    }
    private func finish(error: Error) {
        continuation?.resume(throwing: error); continuation = nil
        encoding?.resume(throwing: error); encoding = nil
        credentials = nil; operation?.cancel(); operation = nil
        let old = session; session = nil; old?.invalidate()
    }
    func cancel() { finish(error: CancellationError()) }
}

/// NDEF-only foreground reader for opening a public member card. Admin flows use TAG for the UID.
@MainActor final class NDEFLinkReader: NSObject, NFCNDEFReaderSessionDelegate, ObservableObject {
    var available: Bool { NFCNDEFReaderSession.readingAvailable }
    private var session: NFCNDEFReaderSession?
    var complete: ((URL) -> Void)?
    func begin() {
        guard NFCNDEFReaderSession.readingAvailable else { return }
        let s = NFCNDEFReaderSession(delegate: self, queue: .main, invalidateAfterFirstRead: true)
        session = s; s.alertMessage = L.t("native.nfcPrompt"); s.begin()
    }
    nonisolated func readerSession(_ session: NFCNDEFReaderSession, didInvalidateWithError error: Error) { Task { @MainActor in self.session = nil } }
    nonisolated func readerSession(_ session: NFCNDEFReaderSession, didDetectNDEFs messages: [NFCNDEFMessage]) {
        let url = messages.flatMap(\.records).compactMap { $0.wellKnownTypeURIPayload() }.first
        Task { @MainActor in if let url { self.complete?(url) } }
    }
    func cancel() { session?.invalidate(); session = nil }
}

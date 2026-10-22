import XCTest
@testable import PATSCore

private final class ProofSessionStorage: SessionStorage {
    var data: Data?
    func load() -> Data? { data }
    func save(_ data: Data?) throws { self.data = data }
}
private actor ProofServer {
    struct Request {
        var path: String
        var method: String
        var authorization: String
        var contentType: String
        var body: Data
    }
    var requests: [Request] = []
    private var requestWaiters: [CheckedContinuation<Void, Never>] = []
    private var responseGate: CheckedContinuation<Void, Never>?
    var mode = "success"
    let image = Data([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 255])
    func setMode(_ value: String) { mode = value }
    func waitForRequest() async {
        if !requests.isEmpty { return }
        await withCheckedContinuation { requestWaiters.append($0) }
    }
    func releaseResponse() { responseGate?.resume(); responseGate = nil }
    func handle(_ request: URLRequest) async throws -> (Int, Data) {
        var body = request.httpBody ?? Data()
        if let stream = request.httpBodyStream {
            stream.open(); defer { stream.close() }
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let count = stream.read(&buffer, maxLength: buffer.count)
                guard count > 0 else { break }; body.append(buffer, count: count)
            }
        }
        let path = request.url!.path
        let authorization = request.value(forHTTPHeaderField: "Authorization") ?? ""
        requests.append(Request(path: path, method: request.httpMethod ?? "", authorization: authorization, contentType: request.value(forHTTPHeaderField: "Content-Type") ?? "", body: body))
        requestWaiters.forEach { $0.resume() }; requestWaiters = []
        if path == "/api/auth/refresh" {
            return (200, JSON.object(["accessToken": .str("next-proof-access"), "refreshToken": .str("next-proof-refresh"), "accessTokenExpiresAt": .str("2099-01-01T00:00:00Z")]).encoded)
        }
        if mode == "slow" || mode == "slowUnauthorized" { await withCheckedContinuation { responseGate = $0 } }
        if ["unauthorized", "slowUnauthorized"].contains(mode), authorization == "Bearer proof-access" {
            return (401, JSON.object(["error": .object(["code": .str("UNAUTHENTICATED")])]).encoded)
        }
        if mode == "noPoster" {
            return (422, JSON.object(["error": .object(["code": .str("VALIDATION"), "fields": .object(["eventId": .str("ux.posterProof.noPoster")])])]).encoded)
        }
        if path.hasSuffix("/image") || path.hasSuffix("/flyer") { return (200, image) }
        return (201, JSON.object(["proof": .object(["id": .str("019a0000-0000-7000-8000-000000000002"), "status": .str("PENDING")]), "journey": .array([])]).encoded)
    }
}
private final class ProofProtocol: URLProtocol {
    static var server = ProofServer()
    private var work: Task<Void, Never>?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        work = Task {
            do {
                let (status, data) = try await Self.server.handle(request)
                guard !Task.isCancelled else { return }
                let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
                client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
                client?.urlProtocol(self, didLoad: data); client?.urlProtocolDidFinishLoading(self)
            } catch { if !Task.isCancelled { client?.urlProtocol(self, didFailWithError: error) } }
        }
    }
    override func stopLoading() { work?.cancel() }
}
final class PosterTransportTests: XCTestCase {
    private let eventID = "019a0000-0000-7000-8000-000000000001"
    private let imagePath = "/api/poster-proofs/019a0000-0000-7000-8000-000000000002/image?v=1"
    private func make() async throws -> (APIClient, ProofSessionStorage) {
        ProofProtocol.server = ProofServer()
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [ProofProtocol.self]
        let storage = ProofSessionStorage()
        let api = APIClient(transport: URLSession(configuration: config), storage: storage)
        try await api.install(.object(["accessToken": .str("proof-access"), "refreshToken": .str("proof-refresh"), "accessTokenExpiresAt": .str("2099-01-01T00:00:00Z")]))
        return (api, storage)
    }
    func testMultipartUploadCarriesExactImageAndEventAsAuthenticatedForm() async throws {
        let (api, _) = try await make(); let image = ProofProtocol.server.image
        let result = try await api.uploadPosterProof(eventID: eventID, image: image, contentType: "image/png")
        XCTAssertEqual(result["proof"]["status"].text, "PENDING")
        let requests = await ProofProtocol.server.requests
        let request = try XCTUnwrap(requests.first)
        XCTAssertEqual(request.method, "POST"); XCTAssertEqual(request.path, "/api/me/poster-proof")
        XCTAssertEqual(request.authorization, "Bearer proof-access")
        let boundary = try XCTUnwrap(request.contentType.components(separatedBy: "boundary=").last)
        XCTAssertTrue(request.body.starts(with: Data(("--" + boundary + "\r\n").utf8)))
        XCTAssertNotNil(request.body.range(of: Data(("name=\"eventId\"\r\n\r\n" + eventID + "\r\n").utf8)))
        XCTAssertNotNil(request.body.range(of: Data("name=\"image\"; filename=\"proof.png\"\r\nContent-Type: image/png\r\n\r\n".utf8)))
        XCTAssertNotNil(request.body.range(of: image)); XCTAssertTrue(request.body.suffix(Data(("\r\n--" + boundary + "--\r\n").utf8).count) == Data(("\r\n--" + boundary + "--\r\n").utf8))
    }
    func testUnauthorizedUploadRefreshesOnceAndReplaysTheSameMultipartBytes() async throws {
        let (api, _) = try await make(); await ProofProtocol.server.setMode("unauthorized")
        _ = try await api.uploadPosterProof(eventID: eventID, image: Data([1, 2]), contentType: "image/jpeg")
        let requests = await ProofProtocol.server.requests
        let uploads = requests.filter { $0.path == "/api/me/poster-proof" }
        XCTAssertEqual(uploads.count, 2); XCTAssertEqual(uploads.first?.body, uploads.last?.body)
        XCTAssertEqual(uploads.last?.authorization, "Bearer next-proof-access")
        XCTAssertEqual(requests.filter { $0.path == "/api/auth/refresh" }.count, 1)
    }
    func testInvalidUploadsNeverReachTheTransport() async throws {
        let (api, _) = try await make()
        for (data, type) in [(Data(), "image/png"), (Data([1]), "image/svg+xml"), (Data(repeating: 1, count: 5 * 1024 * 1024 + 1), "image/png")] {
            do { _ = try await api.uploadPosterProof(eventID: eventID, image: data, contentType: type); XCTFail("Invalid evidence must not upload") } catch { }
        }
        let requests = await ProofProtocol.server.requests; XCTAssertTrue(requests.isEmpty)
    }
    func testPrivateProofImageUsesBearerAndRejectsExternalOrUnrelatedPaths() async throws {
        let (api, _) = try await make(); let expected = ProofProtocol.server.image
        let result = try await api.privateImage(path: imagePath); XCTAssertEqual(result, expected)
        for path in ["https://external.invalid" + imagePath, "/api/me", "/api/poster-proofs/not-an-id/image"] {
            do { _ = try await api.privateImage(path: path); XCTFail("Credential-bearing image requests must remain scoped") } catch { }
        }
        let requests = await ProofProtocol.server.requests; XCTAssertEqual(requests.count, 1)
        XCTAssertEqual(requests.first?.authorization, "Bearer proof-access")
    }
    func testOldUnauthorizedUploadCannotRetryAsAnotherAccount() async throws {
        let (api, _) = try await make(); await ProofProtocol.server.setMode("slowUnauthorized")
        let upload = Task { try await api.uploadPosterProof(eventID: eventID, image: Data([1]), contentType: "image/png") }
        await ProofProtocol.server.waitForRequest()
        try await api.install(.object(["accessToken": .str("other-access"), "refreshToken": .str("other-refresh"), "accessTokenExpiresAt": .str("2099-01-01T00:00:00Z")]))
        await ProofProtocol.server.releaseResponse()
        do { _ = try await upload.value; XCTFail("Old-account upload response must be discarded") } catch { }
        let requests = await ProofProtocol.server.requests; XCTAssertEqual(requests.count, 1)
        let session = await api.snapshot(); XCTAssertEqual(session["accessToken"].text, "other-access")
    }
    func testPrivateImageResponseIsDiscardedAfterLogout() async throws {
        let (api, storage) = try await make(); await ProofProtocol.server.setMode("slow")
        let image = Task { try await api.privateImage(path: imagePath) }
        await ProofProtocol.server.waitForRequest(); await api.clear(); await ProofProtocol.server.releaseResponse()
        do { _ = try await image.value; XCTFail("Private image must not cross a logout boundary") } catch { }
        XCTAssertNil(storage.data)
    }
    func testProofValidationFieldsSurviveTheErrorEnvelope() async throws {
        let (api, _) = try await make(); await ProofProtocol.server.setMode("noPoster")
        do { _ = try await api.uploadPosterProof(eventID: eventID, image: Data([1]), contentType: "image/png"); XCTFail() }
        catch let error as APIError { XCTAssertEqual(error.status, 422); XCTAssertEqual(error.fields["eventId"]?.text, "ux.posterProof.noPoster") }
    }
    func testPublicPosterSharingDownloadsOnlyTheApprovedFlyerRouteWithoutCredentials() async throws {
        let (api, _) = try await make(); let expected = ProofProtocol.server.image
        let result = try await api.eventPosterImage(path: "/api/events/" + eventID + "/flyer?v=1")
        XCTAssertEqual(result, expected)
        for path in ["https://external.invalid/api/events/" + eventID + "/flyer", imagePath, "/api/events/not-an-id/flyer"] {
            do { _ = try await api.eventPosterImage(path: path); XCTFail("Only the approved flyer route is public") } catch { }
        }
        let requests = await ProofProtocol.server.requests
        XCTAssertEqual(requests.count, 1); XCTAssertEqual(requests.first?.authorization, "")
    }
}

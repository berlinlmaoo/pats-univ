import XCTest
@testable import PATSCore

private final class MemorySessionStorage: SessionStorage {
    var data: Data?
    func load() -> Data? { data }
    func save(_ data: Data?) throws { self.data = data }
}
private actor StubServer {
    var refreshes = 0
    var reads = 0
    var mode = "success"
    var photoRequests: [(String, String, String)] = []
    func setMode(_ value: String) { mode = value }
    func handle(_ request: URLRequest) async throws -> (Int, JSON) {
        if request.url?.path == "/api/auth/refresh" {
            refreshes += 1
            try await Task.sleep(for: .milliseconds(30))
            if mode == "network" { throw URLError(.notConnectedToInternet) }
            if mode == "revoked" { return (401, .object(["error": .object(["code": .str("UNAUTHENTICATED")])])) }
            return (200, .object(["accessToken": .str("next-access"), "refreshToken": .str("next-refresh"), "accessTokenExpiresAt": .str("2099-01-01T00:00:00Z")]))
        }
        if request.url?.path == "/api/me/photo" {
            photoRequests.append((request.httpMethod ?? "", request.value(forHTTPHeaderField: "Content-Type") ?? "", request.value(forHTTPHeaderField: "Authorization") ?? ""))
        }
        if mode == "uuid" { return (200, .object(["user": .object(["id": .str("019a0000-0000-7000-8000-000000000001")]), "member": .object(["id": .str("019a0000-0000-7000-8000-000000000002")])])) }
        reads += 1
        if mode == "slow" || mode == "slowUnauthorized" { try await Task.sleep(for: .milliseconds(80)) }
        if ["unauthorized", "slowUnauthorized"].contains(mode) && request.value(forHTTPHeaderField: "Authorization") == "Bearer old-access" {
            return (401, .object(["error": .object(["code": .str("UNAUTHENTICATED")])]))
        }
        return (200, .object(["user": .object(["id": .str("member")])]))
    }
}
private final class StubProtocol: URLProtocol {
    static var server = StubServer()
    private var work: Task<Void, Never>?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        work = Task {
            do {
                let (status, value) = try await Self.server.handle(request)
                guard !Task.isCancelled else { return }
                let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
                client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
                client?.urlProtocol(self, didLoad: value.encoded); client?.urlProtocolDidFinishLoading(self)
            } catch { if !Task.isCancelled { client?.urlProtocol(self, didFailWithError: error) } }
        }
    }
    override func stopLoading() { work?.cancel() }
}
final class SessionTests: XCTestCase {
    private func make(expired: Bool = true) async throws -> (APIClient, MemorySessionStorage) {
        StubProtocol.server = StubServer()
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [StubProtocol.self]
        let storage = MemorySessionStorage()
        let api = APIClient(transport: URLSession(configuration: config), storage: storage)
        try await api.install(.object(["accessToken": .str("old-access"), "refreshToken": .str("old-refresh"), "accessTokenExpiresAt": .str(expired ? "2000-01-01T00:00:00Z" : "2099-01-01T00:00:00Z"), "me": .object(["user": .object(["id": .str("member")])])]))
        return (api, storage)
    }
    func testLaunchRefreshPersistsMigratedUUIDIdentities() async throws {
        let (api, storage) = try await make(expired: false)
        await StubProtocol.server.setMode("uuid")
        let value = try await api.refreshMe()
        XCTAssertEqual(value["user"].id, "019a0000-0000-7000-8000-000000000001")
        let restored = APIClient(storage: storage)
        let me = await restored.cachedMe
        XCTAssertEqual(me["user"].id, value["user"].id)
        XCTAssertEqual(me["member"].id, "019a0000-0000-7000-8000-000000000002")
    }
    func testLaunchRefreshCannotPersistPreviousAccountAfterLogout() async throws {
        let (api, storage) = try await make(expired: false)
        await StubProtocol.server.setMode("slow")
        let refresh = Task { try await api.refreshMe() }
        try await Task.sleep(for: .milliseconds(10)); await api.clear()
        do { _ = try await refresh.value; XCTFail("Old profile must not restore the session") } catch { }
        XCTAssertNil(storage.data)
    }
    func testPhotoReplacementUsesAuthenticatedImageBodyAndRetriesExpiredToken() async throws {
        let (api, _) = try await make(expired: false)
        await StubProtocol.server.setMode("unauthorized")
        _ = try await api.replacePhoto(Data([0xff, 0xd8, 0xff, 0xd9]))
        let photos = await StubProtocol.server.photoRequests
        XCTAssertEqual(photos.count, 2)
        XCTAssertEqual(photos.first?.0, "PUT")
        XCTAssertEqual(photos.first?.1, "image/jpeg")
        XCTAssertEqual(photos.last?.2, "Bearer next-access")
    }
    func testPhotoReplacementRejectsOversizedImageWithoutSendingIt() async throws {
        let (api, _) = try await make(expired: false)
        do { _ = try await api.replacePhoto(Data(repeating: 0, count: 5 * 1024 * 1024 + 1)); XCTFail() } catch { }
        let photos = await StubProtocol.server.photoRequests
        XCTAssertTrue(photos.isEmpty)
    }
    func testPhotoReplacementCannotRestoreLoggedOutSession() async throws {
        let (api, storage) = try await make(expired: false)
        await StubProtocol.server.setMode("slow")
        let photo = Task { try await api.replacePhoto(Data([1])) }
        try await Task.sleep(for: .milliseconds(10)); await api.clear()
        do { _ = try await photo.value; XCTFail() } catch { }
        XCTAssertNil(storage.data)
    }
    func testConcurrentCallsRotateRefreshTokenOnce() async throws {
        let (api, storage) = try await make()
        try await withThrowingTaskGroup(of: JSON.self) { group in
            for _ in 0..<20 { group.addTask { try await api.call("GET", "/api/me") } }
            for try await value in group { XCTAssertEqual(value["user"].id, "member") }
        }
        let refreshes = await StubProtocol.server.refreshes
        XCTAssertEqual(refreshes, 1)
        XCTAssertEqual(try JSON.parse(XCTUnwrap(storage.data))["refreshToken"].text, "next-refresh")
    }
    func testNetworkFailureKeepsSessionAndCachedProfile() async throws {
        let (api, storage) = try await make(); await StubProtocol.server.setMode("network")
        do { _ = try await api.call("GET", "/api/me"); XCTFail() } catch { XCTAssertEqual((error as? APIError)?.code, "NETWORK") }
        let signedIn = await api.signedIn; XCTAssertTrue(signedIn); XCTAssertNotNil(storage.data)
        let me = await api.cachedMe; XCTAssertEqual(me["user"].id, "member")
    }
    func testRevokedRefreshClearsPersistedSession() async throws {
        let (api, storage) = try await make(); await StubProtocol.server.setMode("revoked")
        do { _ = try await api.call("GET", "/api/me"); XCTFail() } catch { }
        let signedIn = await api.signedIn; XCTAssertFalse(signedIn); XCTAssertNil(storage.data)
    }
    func testRejectedAccessTokenRefreshesAndRetries() async throws {
        let (api, _) = try await make(expired: false); await StubProtocol.server.setMode("unauthorized")
        let response = try await api.call("GET", "/api/me")
        XCTAssertEqual(response["user"].id, "member")
        let refreshes = await StubProtocol.server.refreshes; XCTAssertEqual(refreshes, 1)
    }
    func testLogoutDuringRefreshCannotRestoreSession() async throws {
        let (api, storage) = try await make()
        let request = Task { try await api.call("GET", "/api/me") }
        try await Task.sleep(for: .milliseconds(10)); await api.clear()
        do { _ = try await request.value; XCTFail() } catch { }
        let signedIn = await api.signedIn; XCTAssertFalse(signedIn); XCTAssertNil(storage.data)
    }
    func testResponseFromPreviousAccountIsDiscardedAfterLogout() async throws {
        let (api, _) = try await make(expired: false); await StubProtocol.server.setMode("slow")
        let request = Task { try await api.call("GET", "/api/me") }
        try await Task.sleep(for: .milliseconds(10)); await api.clear()
        do { _ = try await request.value; XCTFail("Old response must not re-open the old account") } catch { }
    }
    func testSessionIsBoundToItsServerOrigin() async throws {
        let (_, storage) = try await make()
        var value = try JSON.parse(XCTUnwrap(storage.data)); value["_origin"] = .str("https://another.invalid")
        storage.data = value.encoded
        let api = APIClient(storage: storage)
        let signedIn = await api.signedIn; XCTAssertFalse(signedIn)
    }
    func testOldUnauthorizedRequestDoesNotRetryAsTheNextAccount() async throws {
        let (api, _) = try await make(expired: false); await StubProtocol.server.setMode("slowUnauthorized")
        let request = Task { try await api.call("POST", "/api/me/leave", .object([:])) }
        try await Task.sleep(for: .milliseconds(10))
        try await api.install(.object(["accessToken": .str("another-access"), "refreshToken": .str("another-refresh"), "accessTokenExpiresAt": .str("2099-01-01T00:00:00Z"), "me": .object(["user": .object(["id": .str("another")])])]))
        do { _ = try await request.value; XCTFail() } catch { }
        let reads = await StubProtocol.server.reads; XCTAssertEqual(reads, 1)
        let me = await api.cachedMe; XCTAssertEqual(me["user"].id, "another")
    }
}

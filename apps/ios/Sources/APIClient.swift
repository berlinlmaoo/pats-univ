import Foundation
import Security

enum Config {
    static let production = URL(string: "https://patsuniv.znetworks.id")!
    static var baseURL: URL {
        #if PATS_DEV_SERVER
        if UserDefaults.standard.string(forKey: "server") != "production" {
            return URL(string: Bundle.main.object(forInfoDictionaryKey: "PATSDevServerURL") as? String ?? "https://pats-dev.invalid") ?? production
        }
        #endif
        return production
    }
    static func url(_ path: String) -> URL { URL(string: path, relativeTo: baseURL)!.absoluteURL }
    static func mediaURL(_ raw: String) -> URL? {
        guard let url = URL(string: raw, relativeTo: baseURL)?.absoluteURL else { return nil }
        #if PATS_DEV_SERVER
        if url.host == production.host, baseURL.host != production.host,
           ["/api/social/media-file", "/api/loyalty/receipt-file", "/api/photos/file"].contains(url.path),
           let signed = URLComponents(url: url, resolvingAgainstBaseURL: true),
           var target = URLComponents(url: baseURL, resolvingAgainstBaseURL: true) {
            target.percentEncodedPath = signed.percentEncodedPath; target.percentEncodedQuery = signed.percentEncodedQuery
            return target.url
        }
        #endif
        return url
    }
}

private final class NoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

struct APIError: LocalizedError {
    let code: String
    var status: Int = 0
    var params: [String: JSON] = [:]
    var errorDescription: String? { L.error(code, params: params) }
    var invalidSession: Bool { status == 401 || ["UNAUTHENTICATED", "ACCOUNT_DISABLED"].contains(code) }
}

enum Keychain {
    static let service = "id.znetworks.patsuniv"
    static func load(_ account: String) -> Data? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                               kSecAttrAccount as String: account, kSecReturnData as String: true]
        var result: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }
    static func save(_ data: Data?, _ account: String) throws {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        guard let data else { SecItemDelete(q as CFDictionary); return }
        let attributes: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let status = SecItemUpdate(q as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var add = q; attributes.forEach { add[$0.key] = $0.value }
            guard SecItemAdd(add as CFDictionary, nil) == errSecSuccess else { throw APIError(code: "INTERNAL") }; return
        }
        guard status == errSecSuccess else { throw APIError(code: "INTERNAL") }
    }
}

protocol SessionStorage {
    func load() -> Data?
    func save(_ data: Data?) throws
}
struct KeychainSessionStorage: SessionStorage {
    func load() -> Data? { Keychain.load("session") }
    func save(_ data: Data?) throws { try Keychain.save(data, "session") }
}
extension Notification.Name { static let patsSessionChanged = Notification.Name("pats.session.changed") }

/// Actor isolation plus a shared refresh task prevents concurrent refresh-token rotation.
actor APIClient {
    static let shared = APIClient()
    private var session: JSON = .null
    private var generation = 0
    private struct RefreshFlight { let id: UUID; let task: Task<JSON, Error> }
    private var refresh: RefreshFlight?
    private let storage: SessionStorage
    private let transport: URLSession
    static func makeTransport() -> URLSession {
        let c = URLSessionConfiguration.ephemeral
        c.httpCookieStorage = nil; c.httpShouldSetCookies = false; c.urlCache = nil; c.timeoutIntervalForRequest = 30
        return URLSession(configuration: c, delegate: NoRedirects(), delegateQueue: nil)
    }
    init(transport: URLSession = APIClient.makeTransport(), storage: SessionStorage = KeychainSessionStorage()) {
        self.transport = transport; self.storage = storage
        let cached = storage.load().flatMap { try? JSON.parse($0) } ?? .null
        session = cached["_origin"].text == Config.baseURL.absoluteString ? cached : .null
    }
    var cachedMe: JSON { session["me"] }
    var signedIn: Bool { !session["accessToken"].text.isEmpty }
    func snapshot() -> JSON { session }
    private func persist() throws { try storage.save(session.exists ? session.encoded : nil) }
    func install(_ login: JSON) throws {
        guard !login["accessToken"].text.isEmpty, !login["refreshToken"].text.isEmpty else { throw APIError(code: "INTERNAL") }
        generation += 1; refresh?.task.cancel(); refresh = nil
        session = login
        session["_origin"] = .str(Config.baseURL.absoluteString)
        do { try persist() } catch { session = .null; throw error }
    }
    func clear() {
        generation += 1; refresh?.task.cancel(); refresh = nil; session = .null
        try? storage.save(nil)
        NotificationCenter.default.post(name: .patsSessionChanged, object: nil)
    }
    func updateMe(_ me: JSON) throws { guard session.exists else { return }; session["me"] = me; try persist() }
    /// Refresh identity on launch as well as profile data: UUID migration can replace both IDs.
    func refreshMe() async throws -> JSON {
        let epoch = generation
        let me = try await call("GET", "/api/me")
        guard epoch == generation, session.exists else { throw CancellationError() }
        try updateMe(me)
        return me
    }
    func replacePhoto(_ bytes: Data) async throws -> JSON {
        guard !bytes.isEmpty, bytes.count <= 5 * 1024 * 1024 else { throw APIError(code: "MEDIA_INVALID") }
        let epoch = generation
        func send(_ token: String) async throws -> JSON {
            var request = URLRequest(url: Config.url("/api/me/photo")); request.httpMethod = "PUT"; request.httpBody = bytes
            request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            let (data, response) = try await transport.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let value = (try? JSON.parse(data)) ?? .null
            guard (200..<300).contains(status) else { throw APIError(code: value["error"]["code"].text.isEmpty ? "MEDIA_INVALID" : value["error"]["code"].text, status: status) }
            guard value.exists else { throw APIError(code: "MEDIA_INVALID") }
            return value
        }
        do {
            let token = try await accessToken()
            guard epoch == generation, session.exists else { throw CancellationError() }
            let result: JSON
            do { result = try await send(token) }
            catch let error as APIError where error.status == 401 {
                guard epoch == generation, session.exists else { throw CancellationError() }
                let next = try await accessToken(forceFor: token)
                guard epoch == generation, session.exists else { throw CancellationError() }
                result = try await send(next)
            }
            guard epoch == generation, session.exists else { throw CancellationError() }
            try updateMe(result); return result
        } catch let error as APIError {
            if error.invalidSession && epoch == generation { clear() }
            throw error
        }
    }
    func logout() async {
        let token = session["refreshToken"].text
        clear()
        if !token.isEmpty { _ = try? await raw("POST", "/api/auth/logout", .object(["refreshToken": .str(token)])) }
    }
    func call(_ method: String = "GET", _ path: String, _ body: JSON? = nil, auth: Bool = true) async throws -> JSON {
        if !auth { return try await raw(method, path, body) }
        let epoch = generation
        do {
            let token = try await accessToken()
            guard epoch == generation, session.exists else { throw CancellationError() }
            do {
                let result = try await raw(method, path, body, token: token)
                guard epoch == generation, session.exists else { throw CancellationError() }
                return result
            }
            catch let e as APIError where e.status == 401 {
                guard epoch == generation, session.exists else { throw CancellationError() }
                let next = try await accessToken(forceFor: token)
                guard epoch == generation, session.exists else { throw CancellationError() }
                let result = try await raw(method, path, body, token: next)
                guard epoch == generation, session.exists else { throw CancellationError() }
                return result
            }
        } catch let e as APIError {
            if e.invalidSession && epoch == generation { clear() }
            throw e
        }
    }
    private func accessToken(forceFor rejected: String? = nil) async throws -> String {
        guard session.exists, session["_origin"].text == Config.baseURL.absoluteString else { throw APIError(code: "UNAUTHENTICATED", status: 401) }
        let current = session["accessToken"].text
        if let rejected, rejected != current { return current }
        if rejected == nil, let expiry = Dates.parse(session["accessTokenExpiresAt"].text), expiry.timeIntervalSinceNow > 30 { return current }
        let epoch = generation
        if refresh == nil {
            let token = session["refreshToken"]
            refresh = RefreshFlight(id: UUID(), task: Task { try await self.raw("POST", "/api/auth/refresh", .object(["refreshToken": token])) })
        }
        let flight = refresh!
        do {
            let next = try await flight.task.value
            guard epoch == generation, session.exists else { throw CancellationError() }
            if refresh?.id == flight.id {
                guard !next["accessToken"].text.isEmpty, !next["refreshToken"].text.isEmpty else { throw APIError(code: "INTERNAL") }
                for (k, v) in next.object { session[k] = v }
                try persist(); refresh = nil
            }
            return session["accessToken"].text
        } catch { if epoch == generation && refresh?.id == flight.id { refresh = nil }; throw error }
    }
    private func raw(_ method: String, _ path: String, _ body: JSON? = nil, token: String? = nil) async throws -> JSON {
        var request = URLRequest(url: Config.url(path)); request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body { request.httpBody = body.encoded; request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let data: Data; let response: URLResponse
        do { (data, response) = try await transport.data(for: request) }
        catch { if Task.isCancelled { throw CancellationError() }; throw APIError(code: "NETWORK") }
        let result = (try? JSON.parse(data)) ?? .null
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            var params = result["params"].object
            if result["error"]["retryAfter"].exists { params["seconds"] = result["error"]["retryAfter"] }
            throw APIError(code: result["error"]["code"].text.isEmpty ? "INTERNAL" : result["error"]["code"].text, status: status, params: params)
        }
        guard result.exists else { throw APIError(code: "INTERNAL") }
        return result
    }
    /// Signed object URLs never carry the bearer token. No cross-origin credential leakage.
    func upload(_ bytes: Data, to url: URL, contentType: String) async throws {
        var request = URLRequest(url: url); request.httpMethod = "PUT"; request.httpBody = bytes
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        let (_, r) = try await transport.data(for: request)
        guard let h = r as? HTTPURLResponse, (200..<300).contains(h.statusCode) else { throw APIError(code: "MEDIA_INVALID") }
    }
}

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

/// Actor isolation plus a shared refresh task prevents concurrent refresh-token rotation.
actor APIClient {
    static let shared = APIClient()
    private var session: JSON = .null
    private var generation = 0
    private var refreshTask: Task<JSON, Error>?
    private let transport: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.httpCookieStorage = nil; c.httpShouldSetCookies = false; c.urlCache = nil; c.timeoutIntervalForRequest = 30
        return URLSession(configuration: c)
    }()
    init() { session = Keychain.load("session").flatMap { try? JSON.parse($0) } ?? .null }
    var cachedMe: JSON { session["me"] }
    var signedIn: Bool { !session["accessToken"].text.isEmpty }
    private func persist() throws { try Keychain.save(session.exists ? session.encoded : nil, "session") }
    func install(_ login: JSON) throws {
        generation += 1; refreshTask?.cancel(); refreshTask = nil
        session = login
        do { try persist() } catch { session = .null; throw error }
    }
    func clear() {
        generation += 1; refreshTask?.cancel(); refreshTask = nil; session = .null
        try? Keychain.save(nil, "session")
    }
    func updateMe(_ me: JSON) throws { guard session.exists else { return }; session["me"] = me; try persist() }
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
            do { return try await raw(method, path, body, token: token) }
            catch let e as APIError where e.status == 401 {
                let next = try await accessToken(forceFor: token)
                return try await raw(method, path, body, token: next)
            }
        } catch let e as APIError {
            if e.invalidSession && epoch == generation { clear() }
            throw e
        }
    }
    private func accessToken(forceFor rejected: String? = nil) async throws -> String {
        guard session.exists else { throw APIError(code: "UNAUTHENTICATED", status: 401) }
        let current = session["accessToken"].text
        if let rejected, rejected != current { return current }
        if rejected == nil, let expiry = Dates.parse(session["accessTokenExpiresAt"].text), expiry.timeIntervalSinceNow > 30 { return current }
        let epoch = generation
        if refreshTask == nil {
            let refresh = session["refreshToken"]
            refreshTask = Task { try await self.raw("POST", "/api/auth/refresh", .object(["refreshToken": refresh])) }
        }
        let task = refreshTask!
        do {
            let next = try await task.value
            guard epoch == generation, session.exists else { throw CancellationError() }
            // All waiters use the same result. Persist before anyone can initiate another rotation.
            for (k, v) in next.object { session[k] = v }
            try persist(); refreshTask = nil
            return session["accessToken"].text
        } catch { if epoch == generation { refreshTask = nil }; throw error }
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

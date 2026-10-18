import Foundation
import Combine

/// NEXUS's URLSessionWebSocketTask approach, adapted to PATS's Engine.IO v4 auth and rooms.
/// No binary Socket.IO packets are used by this server; media uses signed HTTP uploads.
@MainActor final class RealtimeRoom: ObservableObject {
    @Published var connected = false
    @Published var accessLost = false
    private var task: Task<Void, Never>?
    private var expiry: Task<Void, Never>?
    private var socket: URLSessionWebSocketTask?
    private var session: URLSession?
    private var runID = UUID()
    private var nextAck = 0
    private var ackHandlers: [Int: CheckedContinuation<JSON, Error>] = [:]
    private var lastPacket = Date()
    func start(kind: String, id: String, changed: @escaping @MainActor () async -> Void) {
        stop(); accessLost = false
        guard !id.isEmpty else { return }
        let run = runID
        task = Task { [weak self] in
            guard let self else { return }
            var backoff: UInt64 = 1
            while !Task.isCancelled && !self.accessLost && run == self.runID {
                do {
                    let credentials = try await APIClient.shared.call("GET", "/api/social/token")
                    guard !Task.isCancelled else { break }
                    guard var c = URLComponents(string: credentials["url"].text) else { throw APIError(code: "NETWORK") }
                    c.scheme = c.scheme == "https" ? "wss" : "ws"; c.path = "/socket.io/"
                    c.queryItems = [URLQueryItem(name: "EIO", value: "4"), URLQueryItem(name: "transport", value: "websocket")]
                    guard let url = c.url else { throw APIError(code: "NETWORK") }
                    let config = URLSessionConfiguration.ephemeral; config.httpCookieStorage = nil; config.urlCache = nil
                    let session = URLSession(configuration: config); self.session = session
                    let ws = session.webSocketTask(with: url); self.socket = ws; ws.resume()
                    self.lastPacket = Date()
                    let watchdog = Task { [weak self, weak ws] in
                        while !Task.isCancelled {
                            try? await Task.sleep(for: .seconds(10))
                            guard let self, Date().timeIntervalSince(self.lastPacket) <= 65 else { ws?.cancel(with: .goingAway, reason: nil); return }
                        }
                    }
                    defer { watchdog.cancel() }
                    while !Task.isCancelled {
                        let frame = try await ws.receive()
                        let text: String
                        switch frame { case .string(let s): text = s; case .data(let d): text = String(data: d, encoding: .utf8) ?? ""; @unknown default: continue }
                        self.lastPacket = Date()
                        if text.hasPrefix("0") { try await ws.send(.string("40" + JSON.object(["token": credentials["token"]]).wire)) }
                        else if text == "2" { try await ws.send(.string("3")) }
                        else if text.hasPrefix("40") {
                            self.connected = true; backoff = 1
                            Task {
                                do {
                                    let joined = try await self.emit("join", .object(["kind": .str(kind), "id": .str(id)]))
                                    guard run == self.runID else { return }
                                    guard joined["ok"].bool else { self.accessLost = true; ws.cancel(with: .normalClosure, reason: nil); return }
                                    if let deadline = Dates.parse(joined["expiresAt"].text) {
                                        self.expiry = Task {
                                            try? await Task.sleep(for: .seconds(max(0, deadline.timeIntervalSinceNow)))
                                            if !Task.isCancelled && run == self.runID { self.accessLost = true; ws.cancel(with: .normalClosure, reason: nil) }
                                        }
                                    }
                                    await changed()
                                } catch { if run == self.runID { ws.cancel(with: .goingAway, reason: nil) } }
                            }
                        } else if text.hasPrefix("43"), let bracket = text.firstIndex(of: "[") {
                            let number = Int(text[text.index(text.startIndex, offsetBy: 2)..<bracket])
                            let payload = (try? JSON.parse(Data(text[bracket...].utf8)))?.rows.first ?? .null
                            if let number { self.ackHandlers.removeValue(forKey: number)?.resume(returning: payload) }
                        } else if text.hasPrefix("42"), let bracket = text.firstIndex(of: "[") {
                            let values = (try? JSON.parse(Data(text[bracket...].utf8)))?.rows ?? []
                            if values.first?.text == "access_lost" { self.accessLost = true; break }
                            if ["changed", "message"].contains(values.first?.text ?? "") { await changed() }
                        } else if text.hasPrefix("41") || text.hasPrefix("44") { break }
                    }
                } catch { /* REST refresh remains available during reconnect. */ }
                guard run == self.runID else { return }
                self.connected = false; self.expiry?.cancel(); self.closeSocket()
                if Task.isCancelled || self.accessLost { break }
                try? await Task.sleep(for: .seconds(backoff)); backoff = min(30, backoff * 2)
            }
        }
    }
    private func emit(_ name: String, _ value: JSON) async throws -> JSON {
        guard let socket, connected else { throw APIError(code: "NETWORK") }
        nextAck += 1; let id = nextAck
        return try await withCheckedThrowingContinuation { continuation in
            ackHandlers[id] = continuation
            Task {
                do { try await socket.send(.string("42\(id)" + JSON.array([.str(name), value]).wire)) }
                catch { ackHandlers.removeValue(forKey: id)?.resume(throwing: error) }
            }
            Task {
                try? await Task.sleep(for: .seconds(10))
                ackHandlers.removeValue(forKey: id)?.resume(throwing: APIError(code: "NETWORK"))
            }
        }
    }
    func send(_ body: JSON) async throws {
        let result = try await emit("message", body)
        guard result["ok"].bool else { throw APIError(code: result["error"].text) }
    }
    private func closeSocket() {
        socket?.cancel(with: .goingAway, reason: nil); socket = nil
        session?.invalidateAndCancel(); session = nil
        let pending = ackHandlers; ackHandlers.removeAll()
        for c in pending.values { c.resume(throwing: CancellationError()) }
    }
    func stop() { runID = UUID(); task?.cancel(); task = nil; expiry?.cancel(); expiry = nil; connected = false; closeSocket() }
    deinit { task?.cancel(); expiry?.cancel(); socket?.cancel(with: .goingAway, reason: nil); session?.invalidateAndCancel() }
}

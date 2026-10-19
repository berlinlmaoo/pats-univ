import Foundation

protocol TagIO { func transceive(_ bytes: [UInt8]) async throws -> [UInt8] }
enum TagFailure: Error, Equatable { case unsupported, format, locked, readOnly, password, write, verify, protect, lost, capacity }
struct Chip: Equatable, Sendable {
    let name: String
    let version: UInt8
    let cc: UInt8
    let end: UInt8
    var dynamic: UInt8 { end + 1 }
    var cfg0: UInt8 { end + 2 }
    var cfg1: UInt8 { end + 3 }
    var pwd: UInt8 { end + 4 }
    var pack: UInt8 { end + 5 }
    var capacity: Int { (Int(end) - 3) * 4 }
    static let all = [Chip(name: "NTAG213", version: 0x0f, cc: 0x12, end: 0x27), Chip(name: "NTAG215", version: 0x11, cc: 0x3e, end: 0x81), Chip(name: "NTAG216", version: 0x13, cc: 0x6d, end: 0xe1)]
}
struct TagInspection: Sendable {
    let chip: Chip
    let uid: String
    let cfg: [UInt8]
    let user: [UInt8]
    let offset: Int
    var auth0: UInt8 { cfg[7] }
    var access: UInt8 { cfg[8] }
    var protected: Bool { auth0 <= chip.end }
}
struct TagCredentials: Sendable { let url: String; let pwd: [UInt8]; let pack: [UInt8] }
struct EncodeResult: Codable, Sendable { let nfcUid: String; let chipType: String; let protectedNow: Bool }

enum Hex {
    static func string(_ bytes: [UInt8]) -> String { bytes.map { String(format: "%02X", $0) }.joined() }
    static func bytes(_ value: String) throws -> [UInt8] {
        let s = value.filter { !$0.isWhitespace && $0 != ":" }
        guard s.count % 2 == 0 else { throw TagFailure.format }
        var result: [UInt8] = []; var i = s.startIndex
        while i < s.endIndex {
            let end = s.index(i, offsetBy: 2)
            guard let b = UInt8(s[i..<end], radix: 16) else { throw TagFailure.format }
            result.append(b); i = end
        }
        return result
    }
}

enum NTAG {
    static func read(_ io: TagIO, _ page: UInt8) async throws -> [UInt8] {
        let result = try await io.transceive([0x30, page])
        guard result.count >= 16 else { throw TagFailure.lost }; return Array(result.prefix(16))
    }
    static func write(_ io: TagIO, _ page: UInt8, _ bytes: [UInt8]) async throws {
        guard bytes.count == 4 else { throw TagFailure.write }
        for _ in 0..<3 {
            do { let ack = try await io.transceive([0xa2, page] + bytes)
                if ack.isEmpty || (ack.count == 1 && ack[0] & 0x0f == 0x0a) { return }
            } catch { if Task.isCancelled { throw CancellationError() } }
        }
        throw TagFailure.write
    }
    /// Finds complete TLVs without mistaking FE inside a URI payload for a terminator.
    static func terminated(_ bytes: [UInt8]) -> Bool {
        var i = 0
        while i < bytes.count {
            let kind = bytes[i]
            if kind == 0xfe { return true }
            if kind == 0 { i += 1; continue }
            guard i + 1 < bytes.count else { return false }
            var length = Int(bytes[i + 1]); var start = i + 2
            if length == 255 {
                guard i + 3 < bytes.count else { return false }
                length = Int(bytes[i + 2]) * 256 + Int(bytes[i + 3]); start = i + 4
            }
            guard length <= bytes.count - start else { return false }; i = start + length
        }
        return false
    }
    static func offset(_ bytes: [UInt8]) throws -> Int {
        var i = 0
        while i < bytes.count {
            if bytes[i] == 0 { i += 1; continue }
            if bytes[i] == 1 || bytes[i] == 2 {
                guard i + 1 < bytes.count, bytes[i + 1] != 255, i + 2 + Int(bytes[i + 1]) <= bytes.count else { throw TagFailure.format }
                i += 2 + Int(bytes[i + 1]); continue
            }
            return i
        }
        throw TagFailure.format
    }
    static func inspect(_ io: TagIO) async throws -> TagInspection {
        let version = try await io.transceive([0x60])
        guard version.count >= 8, Array(version.prefix(6)) == [0, 4, 4, 2, 1, 0], version[7] == 3,
              let chip = Chip.all.first(where: { $0.version == version[6] }) else { throw TagFailure.unsupported }
        let head = try await read(io, 0)
        guard head[12] == 0xe1, head[13] == 0x10, head[14] == chip.cc else { throw TagFailure.format }
        guard head[15] == 0 else { throw TagFailure.readOnly }
        let cfg = try await read(io, chip.dynamic)
        guard head[10] == 0, head[11] == 0, cfg[0] == 0, cfg[1] == 0, cfg[2] == 0 else { throw TagFailure.locked }
        guard cfg[8] & 0x40 == 0 else { throw TagFailure.locked }
        var user: [UInt8] = []
        for page in stride(from: 4, through: Int(chip.end), by: 4) {
            let bytes = try await read(io, UInt8(page))
            user += bytes.prefix(min(16, (Int(chip.end) - page + 1) * 4))
            if terminated(user) { break }
        }
        return TagInspection(chip: chip, uid: Hex.string(Array(head[0..<3]) + Array(head[4..<8])), cfg: cfg, user: user, offset: try offset(user))
    }
    static func uriTLV(_ url: String) throws -> [UInt8] {
        let prefix = url.hasPrefix("https://") ? "https://" : url.hasPrefix("http://") ? "http://" : ""
        let code: UInt8 = prefix == "https://" ? 4 : prefix == "http://" ? 3 : 0
        let body = Array(url.dropFirst(prefix.count).utf8)
        guard body.allSatisfy({ (0x21...0x7e).contains($0) }), body.count + 5 <= 254 else { throw TagFailure.capacity }
        let record: [UInt8] = [0xd1, 1, UInt8(body.count + 1), 0x55, code] + body
        return [3, UInt8(record.count)] + record + [0xfe]
    }
    struct Page: Equatable { let page: UInt8; let bytes: [UInt8] }
    static func pages(_ bytes: [UInt8]) -> [Page] {
        stride(from: 0, to: bytes.count, by: 4).map { offset in
            var part = Array(bytes[offset..<min(offset + 4, bytes.count)])
            while part.count < 4 { part.append(0) }
            return Page(page: UInt8(4 + offset/4), bytes: part)
        }
    }
    static func encode(_ io: TagIO, tag: TagInspection, credentials: TagCredentials) async throws -> EncodeResult {
        let c = tag.chip, pwd = credentials.pwd, pack = credentials.pack
        guard pwd.count == 4, pack.count == 2 else { throw TagFailure.password }
        if tag.protected {
            let proof = try await io.transceive([0x1b] + pwd)
            guard Array(proof.prefix(2)) == pack else { throw TagFailure.password }
        }
        let prefix = Array(tag.user.prefix(tag.offset)), tlv = try uriTLV(credentials.url)
        guard prefix.count + tlv.count <= c.capacity else { throw TagFailure.capacity }
        let first = 4 + tag.offset/4
        let header = Set([4 + tag.offset/4, 4 + (tag.offset + 1)/4])
        let full = pages(prefix + tlv).filter { Int($0.page) >= first }
        let empty = pages(prefix + [3, 0, 0xfe]).filter { Int($0.page) >= first }
        for p in empty + full.filter({ !header.contains(Int($0.page)) }) + full.filter({ header.contains(Int($0.page)) }) { try await write(io, p.page, p.bytes) }
        for attempt in 0...1 {
            var bad: [Page] = []
            for i in stride(from: 0, to: full.count, by: 4) {
                let chunk = try await read(io, full[i].page)
                for j in 0..<min(4, full.count - i) {
                    if Array(chunk[j*4..<j*4+4]) != full[i+j].bytes { bad.append(full[i+j]) }
                }
            }
            if bad.isEmpty { break }; if attempt == 1 { throw TagFailure.verify }
            for p in bad { try await write(io, p.page, p.bytes) }
        }
        let cfg0 = Array(tag.cfg[4..<7]), cfg1: [UInt8] = [0] + Array(tag.cfg[9..<12])
        var protectedNow = false
        if !tag.protected {
            if tag.auth0 != 255 {
                if tag.auth0 > c.cfg0 { try await write(io, c.cfg0, cfg0 + [255]) }
                else {
                    let proof = try await io.transceive([0x1b] + pwd)
                    guard Array(proof.prefix(2)) == pack else { throw TagFailure.password }
                }
            }
            try await write(io, c.pwd, pwd); try await write(io, c.pack, pack + [0, 0])
            try await write(io, c.cfg1, cfg1); try await write(io, c.cfg0, cfg0 + [c.pack])
            let proof = (try? await io.transceive([0x1b] + pwd)) ?? []
            guard Array(proof.prefix(2)) == pack else {
                try? await write(io, c.cfg0, cfg0 + [255]); throw TagFailure.protect
            }
            try await write(io, c.cfg0, cfg0 + [4]); protectedNow = true
        } else if tag.auth0 != 4 || tag.access != 0 {
            try await write(io, c.cfg1, cfg1); try await write(io, c.cfg0, cfg0 + [4])
        }
        let after = try await read(io, c.dynamic)
        guard after[7] == 4, after[8] == 0 else { throw TagFailure.verify }
        return EncodeResult(nfcUid: tag.uid, chipType: c.name, protectedNow: protectedNow)
    }
}

import Foundation
@testable import PATSCore

final class FakeTag: TagIO {
    let chip: Chip
    var memory: [UInt8]
    var commands: [[UInt8]] = []
    var authenticated = false
    var failOn: Int?
    var wrongPack = false
    var corruptReadback = false
    init(chip: Chip) {
        self.chip = chip; memory = Array(repeating: 0, count: (Int(chip.pack) + 1) * 4)
        memory.replaceSubrange(0..<16, with: [4, 0xa1, 0xb2, 0, 0xc3, 0xd4, 0xe5, 0xf6, 0, 0x48, 0, 0, 0xe1, 0x10, chip.cc, 0])
        let lock: [UInt8] = [1, 3, 0xa0, chip.name == "NTAG213" ? 0x0c : 0x10, chip.name == "NTAG213" ? 0x34 : 0x44]
        memory.replaceSubrange(16..<24, with: lock + [3, 0, 0xfe])
        set(chip.cfg0, [4, 0, 0, 255]); set(chip.pwd, [255,255,255,255])
    }
    var auth0: UInt8 { memory[Int(chip.cfg0)*4 + 3] }
    func page(_ p: UInt8) -> [UInt8] { Array(memory[Int(p)*4..<Int(p)*4+4]) }
    func set(_ p: UInt8, _ bytes: [UInt8]) { memory.replaceSubrange(Int(p)*4..<Int(p)*4+4, with: bytes) }
    func reset() { authenticated = false; failOn = nil; commands = [] }
    func transceive(_ c: [UInt8]) async throws -> [UInt8] {
        commands.append(c)
        if let failOn, commands.count >= failOn { throw TagFailure.lost }
        switch c[0] {
        case 0x60: return [0,4,4,2,1,0,chip.version,3]
        case 0x30:
            var bytes: [UInt8] = []
            for i in 0..<4 {
                let p = UInt8((Int(c[1])+i) % (Int(chip.pack)+1))
                bytes += p == chip.pwd || p == chip.pack ? [0,0,0,0] : page(p)
            }
            if corruptReadback && commands.contains(where: { $0[0] == 0xa2 }) && c[1] >= 4 && c[1] < chip.dynamic { bytes[0] ^= 1 }
            return bytes
        case 0xa2:
            let p = c[1]
            if p < 4 || p == chip.dynamic { throw TagFailure.locked }
            if p >= auth0 && !authenticated { return [0] }
            set(p, Array(c[2..<6])); return [0x0a]
        case 0x1b:
            guard Array(c[1..<5]) == page(chip.pwd) else { throw TagFailure.password }
            authenticated = true; return wrongPack ? [0,0] : Array(page(chip.pack).prefix(2))
        default: throw TagFailure.unsupported
        }
    }
}

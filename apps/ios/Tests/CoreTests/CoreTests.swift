import XCTest
@testable import PATSCore

final class CoreTests: XCTestCase {
    let key = TagCredentials(url: "https://patsuniv.znetworks.id/c/AbCdEfGhIjKlMnOpQrStUvWxYz012345", pwd: [0x12,0x34,0x56,0x78], pack: [0xab,0xcd])
    func encode(_ fake: FakeTag) async throws -> EncodeResult { try await NTAG.encode(fake, tag: NTAG.inspect(fake), credentials: key) }
    func testSharedStationCommandFixtures() async throws {
        let url = Bundle.module.url(forResource: "encode", withExtension: "json", subdirectory: "Fixtures")!
        let rows = try JSON.parse(Data(contentsOf: url)).rows
        for row in rows {
            let chip = try XCTUnwrap(Chip.all.first { $0.name == row["chip"].text })
            let fake = FakeTag(chip: chip)
            if row["protected"].bool { _ = try await encode(fake); fake.reset() }
            let fixtureKey = TagCredentials(url: row["url2"].exists ? row["url2"].text : row["url"].text, pwd: try Hex.bytes(row["pwd"].text), pack: try Hex.bytes(row["pack"].text))
            let inspection = try await NTAG.inspect(fake)
            let result = try await NTAG.encode(fake, tag: inspection, credentials: fixtureKey)
            XCTAssertEqual(result.nfcUid, row["uid"].text)
            XCTAssertEqual(fake.commands.map(Hex.string), row["commands"].rows.map(\.text), row["name"].text)
        }
    }
    func testAllChipsPreserveFactoryControlTLVAndNeverWriteLockPages() async throws {
        for chip in Chip.all {
            let fake = FakeTag(chip: chip); let before = fake.page(4)
            let result = try await encode(fake)
            XCTAssertEqual(result.chipType, chip.name); XCTAssertTrue(result.protectedNow)
            XCTAssertEqual(fake.page(4), before); XCTAssertEqual(fake.auth0, 4); XCTAssertEqual(fake.page(chip.cfg1)[0], 0)
            XCTAssertFalse(fake.commands.contains { $0[0] == 0xa2 && ($0[1] < 4 || $0[1] == chip.dynamic) })
            fake.reset(); let second = try await encode(fake)
            XCTAssertFalse(second.protectedNow)
        }
    }
    func testInterruptedEveryCommandCanRecoverForEveryChip() async throws {
        for chip in Chip.all {
            let baseline = FakeTag(chip: chip); _ = try await encode(baseline)
            for failure in 1...baseline.commands.count {
                let fake = FakeTag(chip: chip); fake.failOn = failure
                do { _ = try await encode(fake); XCTFail("Expected interruption at \(failure)") } catch { }
                XCTAssertEqual(fake.page(chip.cfg1)[0] & 7, 0, "No permanent attempt limit")
                if fake.auth0 <= chip.end { XCTAssertEqual(fake.page(chip.pwd), key.pwd) }
                fake.reset(); _ = try await encode(fake)
                XCTAssertEqual(fake.auth0, 4, "Recovery at \(failure), \(chip.name)")
            }
        }
    }
    func testWrongPasswordDoesNotWriteAnAlreadyProtectedCard() async throws {
        let fake = FakeTag(chip: Chip.all[0]); _ = try await encode(fake); fake.reset()
        let before = fake.memory; let tag = try await NTAG.inspect(fake)
        do { _ = try await NTAG.encode(fake, tag: tag, credentials: TagCredentials(url: key.url, pwd: [0,0,0,0], pack: key.pack)); XCTFail() } catch { }
        XCTAssertEqual(fake.memory, before); XCTAssertFalse(fake.commands.contains { $0[0] == 0xa2 })
    }
    func testFailedPackProofDisablesProtection() async throws {
        let fake = FakeTag(chip: Chip.all[0]); fake.wrongPack = true
        do { _ = try await encode(fake); XCTFail() } catch { XCTAssertEqual(error as? TagFailure, .protect) }
        XCTAssertEqual(fake.auth0, 255)
    }
    func testReadbackMismatchDoesNotReportSuccessOrProtect() async throws {
        let fake = FakeTag(chip: Chip.all[0]); fake.corruptReadback = true
        do { _ = try await encode(fake); XCTFail() } catch { XCTAssertEqual(error as? TagFailure, .verify) }
        XCTAssertEqual(fake.auth0, 255)
    }
    func testRejectsStaticDynamicConfigLocksAndReadOnlyCC() async throws {
        for offset in [10, 11, Int(Chip.all[0].dynamic)*4, Int(Chip.all[0].cfg1)*4, 15] {
            let fake = FakeTag(chip: Chip.all[0]); fake.memory[offset] = offset == Int(Chip.all[0].cfg1)*4 ? 0x40 : 1
            do { _ = try await NTAG.inspect(fake); XCTFail() } catch { }
            XCTAssertFalse(fake.commands.contains { $0[0] == 0xa2 })
        }
    }
    func testNDEFLengthsAndTerminatorInsidePayload() throws {
        let tlv = try NTAG.uriTLV(key.url)
        XCTAssertTrue(NTAG.terminated(tlv)); XCTAssertFalse(NTAG.terminated(Array(tlv.dropLast())))
        XCTAssertFalse(NTAG.terminated([3, 4, 0xfe, 0, 0]))
        XCTAssertThrowsError(try NTAG.uriTLV("https://" + String(repeating: "x", count: 255)))
    }
    func testQRClockSkewAndExpiry() throws {
        let response = try JSON.parse(Data(#"{"token":"signed","ttlSeconds":45,"serverTime":"2026-10-18T10:00:00.000Z","expiresAt":"2026-10-18T10:00:45.000Z"}"#.utf8))
        let received = Dates.parse("2026-10-18T13:00:00Z")!
        let qr = QRDeadline(response: response, receivedAt: received)
        XCTAssertEqual(qr.remaining(at: received), 45)
        XCTAssertEqual(qr.remaining(at: received.addingTimeInterval(46)), 0)
        let delayed = QRDeadline(response: response, receivedAt: received, requestStartedAt: received.addingTimeInterval(-10))
        XCTAssertEqual(delayed.remaining(at: received), 35)
    }
    func testCardLinksAndQueryEscaping() {
        let token = "AbCdEfGhIjKlMnOpQrStUvWxYz012345"
        XCTAssertEqual(CardLink.token("https://patsuniv.znetworks.id/c/\(token)"), token)
        XCTAssertNil(CardLink.token("https://example.org/c/too-short"))
        XCTAssertNil(CardLink.token("https://example.org/c/\(token)extra"))
        let url = query("/api/social/feed", ["id": "a&other=x", "kind": "channel"])
        XCTAssertTrue(url.contains("a%26other%3Dx")); XCTAssertFalse(url.contains("&other="))
    }
    func testSocketIOHandshakeHeartbeatEventsAndAcknowledgements() throws {
        XCTAssertEqual(SocketPacket.parse(#"0{"sid":"session","pingInterval":25000,"pingTimeout":20000}"#), .open)
        XCTAssertEqual(SocketPacket.parse("2"), .ping(""))
        XCTAssertEqual(SocketPacket.parse("2probe"), .ping("probe"))
        XCTAssertEqual(SocketPacket.parse(#"40{"sid":"socket"}"#), .connected)
        let value = JSON.object(["kind": .str("wallet"), "id": .str("member")])
        XCTAssertEqual(SocketPacket.parse(SocketPacket.emit("join", value: value, ack: 17)), .event("join", value))
        XCTAssertEqual(SocketPacket.parse(#"4317[{"ok":true}]"#), .ack(17, .object(["ok": .bool(true)])))
        XCTAssertEqual(SocketPacket.parse(#"42["access_lost",{"kind":"wallet","id":"member"}]"#), .event("access_lost", value))
        XCTAssertEqual(SocketPacket.parse("41"), .closed)
        XCTAssertEqual(SocketPacket.parse(#"44{"message":"UNAUTHENTICATED"}"#), .closed)
        XCTAssertEqual(SocketPacket.parse("43[{}]"), .unsupported)
        XCTAssertEqual(SocketPacket.parse("42broken"), .unsupported)
    }
    func testHouseNumberCurrencyAndCityTimezoneFormatting() {
        XCTAssertEqual(L.count(3800), "3.800")
        XCTAssertEqual(L.money(6000000), "Rp 6.000.000")
        XCTAssertTrue(L.date("2026-10-18T12:30:00Z").hasSuffix("19.30 WIB"))
        XCTAssertTrue(L.date("2026-10-18T12:30:00Z", zone: "Asia/Makassar").hasSuffix("20.30 WITA"))
    }
}

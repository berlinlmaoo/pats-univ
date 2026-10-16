# Card Station

HQ tool that encodes the printed member cards (**NTAG213, NTAG215 or NTAG216**) on an
**ACR122U** reader (macOS, PC/SC). Flow and chip layout: [PLAN.md §2.2](../../docs/PLAN.md).
HQ phones run the same encoder in the app (Admin → Encode cards); several stations can work on
one batch at the same time, and the server hands each card to one station at a time (lease).

## Build

```sh
# once: Rust toolchain (Homebrew's rustup is keg-only)
brew install rustup
export PATH="/opt/homebrew/opt/rustup/bin:$PATH"
rustup toolchain install stable --profile minimal -c clippy

cd tools/card-station
cargo test
cargo build --release                                            # -> target/release/card-station
swiftc -O camera/qr-scan.swift -o target/release/pats-qr-scan    # optional: Mac camera for --camera
```

## Everyday use

```sh
export PATS_API_URL=https://patsuniv.znetworks.id      # or http://localhost:3000 in dev
card-station login --email hq@…                        # 6-digit code by email (shown on screen in demo mode)
card-station batches                                   # batches back at HQ, with progress
card-station encode --batch JKT-3                      # scan QR / type NIM → check name → tap → done, next
```

For each card the operator scans the printed QR (USB QR scanner, or `--camera`) or types the
NIM, checks that the name on screen matches the printed card, and taps the card. The tool reads
the chip, asks the server for that chip's password, writes the URL, proves the password, protects
the chip and reports it `ENCODED`. Scanning a card that is already encoded says so and writes
nothing; `--reencode` writes it again (same chip: same password; `--new-token` issues a new
token, the old one stops working).

## Commands

| Command | What it does |
|---|---|
| `readers` | Lists PC/SC readers and whether a card is on each. |
| `uid` | UID of the card on the reader (read-only). |
| `status` | Chip type, UID, lock bits, AUTH0/ACCESS, the TLVs before the NDEF, the NDEF URL (read-only). |
| `read` | Dumps every page (read-only; PWD and PACK always read as zero). |
| `plan <url> --chip 213\|215\|216` | Prints the exact APDUs of an encode against a simulated blank chip. No reader needed. |
| `ndef-preview <url>` | The NDEF pages for a URL. |
| `lookup <scan or NIM>` | Parses a scanned card URL or a typed NIM. |
| `ping` | Checks the API (`/api/health`). |
| `login --email …` / `logout` | HQ session, stored in `~/.config/pats-card-station/session.json` (0600). |
| `batches` | Batches back at HQ or being encoded. |
| `encode [--batch L] [--reencode [--new-token]] [--camera] [--station NAME]` | The encode loop. |
| `encode --dry-run` | Reads the card (or simulates one with `--sim-chip 215` when there is no reader), prints every APDU it would send, writes nothing, reports nothing. The card's password is masked. |

Global: `--api`, `--reader <name>`, `--verbose` (prints every APDU and answer). `encode --direct`
sends READ/WRITE through the PN532 pass-through instead of Read/Update Binary (fallback, see
below).

## What gets sent (ACR122U pseudo-APDUs)

| NTAG command | APDU |
|---|---|
| READ 30h (16 bytes) | `FF B0 00 <page> 10` |
| WRITE A2h (4 bytes) | `FF D6 00 <page> 04 <data>` |
| GET_VERSION 60h | `FF 00 00 00 03 D4 42 60` (Direct Transmit + InCommunicateThru) |
| PWD_AUTH 1Bh | `FF 00 00 00 07 D4 42 1B <pwd>` |
| GET UID | `FF CA 00 00 00` |

Read/Update Binary are what was verified on the HQ reader (16 Oct). If a firmware drops the
PWD_AUTH session between pseudo-APDUs (re-encode then fails with a NAK on the first write), run
with `--direct`.

## Chips

| | NTAG213 | NTAG215 | NTAG216 |
|---|---|---|---|
| GET_VERSION storage byte | 0Fh | 11h | 13h |
| CC size byte (page 3) | 12h | 3Eh | 6Dh |
| User memory | 144 B (pages 4–39) | 504 B (4–129) | 888 B (4–225) |
| Dynamic lock · CFG0 · CFG1 · PWD · PACK | 28h · 29h · 2Ah · 2Bh · 2Ch | 82h · 83h · 84h · 85h · 86h | E2h · E3h · E4h · E5h · E6h |

The chip type is detected (GET_VERSION, cross-checked with the CC) and stored with the card.

## Encode sequence (same as the phone encoder, tested against one fixture)

1. GET_VERSION → chip; READ 0 → UID, static lock bytes, CC; READ dynamic-lock page → lock bytes,
   AUTH0, ACCESS; READ from page 4 until the TLV terminator → existing TLVs and URL.
2. Refuse lock bits, a non-NDEF or read-only CC, a chip that holds another PATS card.
3. Server: `key` → PWD/PACK for this UID (derived on the server, never stored).
4. Already protected: PWD_AUTH, PACK must match.
5. NDEF after the factory **Lock Control TLV** (kept byte for byte): a zero-length message first,
   then the body, then the type/length bytes; read back and compare.
6. First encode: PWD, PACK, ACCESS = 00h (PROT 0: reads open, AUTHLIM 0), then **AUTH0 = PACK
   page** (staging: only PACK is protected), PWD_AUTH must return PACK, then **AUTH0 = 04h** (write
   protection from the first NDEF page). If the proof fails, AUTH0 goes back to FFh.
7. Read the config back (AUTH0 04h, ACCESS 00h), then report `ENCODED` with the UID and chip type.

A session cut at any step leaves the chip either unprotected or protected with the server's
password for its UID, and the next encode recovers it (tested by cutting the simulated session at
every command).

## macOS setup for the ACR122U

macOS ships PC/SC (`com.apple.ifdreader`) with a CCID driver that recognises the ACR122U; no ACS
driver is needed.

1. Plug the reader in directly (avoid unpowered hubs). The LED turns red.
2. `card-station readers` should list `ACS ACR122U PICC Interface`.
3. If it does not show up: unplug, `sudo killall -9 com.apple.ifdreader`, plug back in.
4. Older ACS installer packages (`ifd-acsccid.bundle` in `/usr/local/libexec/SmartCardServices/drivers`)
   can conflict with the built-in driver; remove them if the reader is listed but never sees cards.
5. The buzzer beeps on every tap; it is left on as the operator's tap feedback.

## Safety rules

- Write protection uses PWD/PACK with `AUTH0 = 04h`, `PROT = 0` (reads stay open), `AUTHLIM = 0`.
- Static/dynamic lock bits and the capability container are **never** written: cards stay re-encodable by HQ.
- The factory TLVs before the NDEF are read and kept as they are, on every chip type.
- The NDEF is verified by reading it back **before** protection is switched on, and the password
  is proven before AUTH0 covers the NDEF.

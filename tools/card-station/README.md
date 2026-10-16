# Card Station

HQ tool that writes the printed NTAG213 member cards on an **ACR122U** reader (macOS, PC/SC).
Flow and chip layout: [PLAN.md §2.2](../../docs/PLAN.md). Encoding ships in Phase 2; Phase 0
has the CLI, the NDEF/APDU code with tests, and hardware checks.

## Build

```sh
# once: Rust toolchain (Homebrew's rustup is keg-only)
brew install rustup
export PATH="/opt/homebrew/opt/rustup/bin:$PATH"
rustup toolchain install stable --profile minimal -c clippy

cd tools/card-station
cargo test
cargo build --release   # -> target/release/card-station
```

## Commands

| Command | What it does |
|---|---|
| `card-station readers` | Lists PC/SC readers and whether a card is on each. First check after plugging in the ACR122U. |
| `card-station uid` | Prints the UID of the card on the reader (read-only). |
| `card-station ndef-preview <url>` | Shows the pages that would be written for a card URL. Writes nothing. |
| `card-station lookup <scan or NIM>` | Parses a scanned card URL or a typed NIM. |
| `card-station ping --api <origin>` | Checks the API is reachable (`/api/health`). |
| `card-station encode` | Phase 2. |

`--api` defaults to `https://patsuniv.znetworks.id` (or `PATS_API_URL`).

## macOS setup for the ACR122U

macOS ships PC/SC (`com.apple.ifdreader`) with a CCID driver that recognises the ACR122U; no
ACS driver is needed.

1. Plug the reader in directly (avoid unpowered hubs). The LED turns red.
2. `card-station readers` should list `ACS ACR122U PICC Interface`.
3. If it does not show up: unplug, `sudo killall -9 com.apple.ifdreader`, plug back in.
4. Older ACS installer packages (`ifd-acsccid.bundle` in `/usr/local/libexec/SmartCardServices/drivers`)
   can conflict with the built-in driver; remove them if the reader is listed but never sees cards.
5. The buzzer beeps on every tap by default; Phase 2 turns it off with the reader's escape command.

## Safety rules (from PLAN.md §2.2)

- Write protection uses PWD/PACK with `AUTH0 = 0x03`, `PROT = 0` (reads stay open), `AUTHLIM = 0`.
- Static/dynamic lock bits and the capability container are **never** written: cards stay re-encodable by HQ.
- The NDEF is verified by reading it back **before** protection is switched on.

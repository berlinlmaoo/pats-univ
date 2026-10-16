//! ACR122U over PC/SC: turns raw NTAG commands into the reader's pseudo-APDUs.
//!
//!   READ 30h        -> FF B0 00 <page> 10             (Read Binary, 16 bytes)
//!   WRITE A2h       -> FF D6 00 <page> 04 <4 bytes>   (Update Binary)
//!   GET_VERSION 60h -> FF 00 00 00 Lc D4 42 60        (Direct Transmit + PN532 InCommunicateThru)
//!   PWD_AUTH 1Bh    -> FF 00 00 00 Lc D4 42 1B <pwd>
//!
//! Read Binary / Update Binary are what the owner verified on this Mac's reader (16 Oct). With
//! `direct` set, READ and WRITE also go through InCommunicateThru, as a fallback if a reader
//! firmware drops the PWD_AUTH session between pseudo-APDUs.

use crate::ntag::{hex, Tag};
use anyhow::{bail, Context, Result};
use std::ffi::CString;
use std::time::{Duration, Instant};

pub const APDU_GET_UID: [u8; 5] = [0xFF, 0xCA, 0x00, 0x00, 0x00];

/// The pseudo-APDU the ACR122U gets for a raw NTAG command.
pub fn apdu_for(raw: &[u8], direct: bool) -> Vec<u8> {
    match raw[0] {
        0x30 if !direct => vec![0xFF, 0xB0, 0x00, raw[1], 0x10],
        0xA2 if !direct => {
            let mut a = vec![0xFF, 0xD6, 0x00, raw[1], 0x04];
            a.extend_from_slice(&raw[2..6]);
            a
        }
        _ => {
            let mut a = vec![0xFF, 0x00, 0x00, 0x00, (raw.len() + 2) as u8, 0xD4, 0x42];
            a.extend_from_slice(raw);
            a
        }
    }
}

/// PWD pages of NTAG213 / 215 / 216: their writes, like PWD_AUTH, carry the card's password.
const PWD_PAGES: [u8; 3] = [0x2B, 0x85, 0xE5];

/// An APDU for logs, with the password replaced.
pub fn masked(apdu: &[u8]) -> String {
    let pass_through = apdu.len() >= 12 && apdu[5..7] == [0xD4, 0x42];
    let secret = (pass_through && (apdu[7] == 0x1B || (apdu[7] == 0xA2 && PWD_PAGES.contains(&apdu[8])))) || (apdu.len() == 9 && apdu[1] == 0xD6 && PWD_PAGES.contains(&apdu[3]));
    let mut out = hex(apdu);
    if secret {
        out.replace_range(out.len() - 8.., "********");
    }
    out
}

pub fn is_success(response: &[u8]) -> bool {
    response.len() >= 2 && response[response.len() - 2..] == [0x90, 0x00]
}

/// Back from the reader's answer to what the chip said (data, or 0Ah for a WRITE ACK).
pub fn response_for(raw: &[u8], apdu: &[u8], res: &[u8]) -> Result<Vec<u8>, String> {
    let direct = apdu[1] == 0x00;
    if !direct {
        return match raw[0] {
            0x30 if is_success(res) => Ok(res[..res.len() - 2].to_vec()),
            0xA2 if is_success(res) => Ok(vec![0x0A]),
            0xA2 => Ok(vec![0x00]), // 63 00: the chip refused (NAK)
            _ => Err(format!("reader returned {}", hex(res))),
        };
    }
    // D5 43 <status> <data…> 90 00; status 00 = the chip answered.
    if !is_success(res) || res.len() < 5 || res[0] != 0xD5 || res[1] != 0x43 {
        return Err(format!("reader returned {}", hex(res)));
    }
    if res[2] != 0x00 {
        return Err(format!("chip did not answer (PN532 status {:02X})", res[2]));
    }
    let data = res[3..res.len() - 2].to_vec();
    Ok(if raw[0] == 0xA2 && data.is_empty() { vec![0x0A] } else { data })
}

pub fn context() -> Result<pcsc::Context> {
    pcsc::Context::establish(pcsc::Scope::User).context("PC/SC service unavailable (see README: macOS setup)")
}

pub fn reader_names(ctx: &pcsc::Context) -> Result<Vec<CString>> {
    let len = ctx.list_readers_len()?;
    let mut buf = vec![0u8; len];
    match ctx.list_readers(&mut buf) {
        Ok(names) => Ok(names.map(|n| n.to_owned()).collect()),
        Err(pcsc::Error::NoReadersAvailable) => Ok(Vec::new()),
        Err(e) => Err(e.into()),
    }
}

/// The reader to use: by name, else the first ACR122U, else the first reader.
pub fn pick_reader(ctx: &pcsc::Context, preferred: Option<&str>) -> Result<CString> {
    let names = reader_names(ctx)?;
    match preferred {
        Some(p) => names.iter().find(|n| n.to_string_lossy() == p).cloned(),
        None => names.iter().find(|n| n.to_string_lossy().contains("ACR122")).or_else(|| names.first()).cloned(),
    }
    .context("no reader found: plug in the ACR122U (see `card-station readers`)")
}

pub struct Acr122u {
    card: pcsc::Card,
    pub direct: bool,
    /// Print every APDU and response (`--verbose`).
    pub trace: bool,
}

impl Acr122u {
    pub fn connect(ctx: &pcsc::Context, reader: &CString) -> Result<Option<Acr122u>> {
        match ctx.connect(reader, pcsc::ShareMode::Shared, pcsc::Protocols::ANY) {
            Ok(card) => Ok(Some(Acr122u { card, direct: false, trace: false })),
            Err(pcsc::Error::NoSmartcard) | Err(pcsc::Error::RemovedCard) | Err(pcsc::Error::UnpoweredCard) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Waits up to `timeout` for a card on the reader.
    pub fn wait(ctx: &pcsc::Context, reader: &CString, timeout: Duration) -> Result<Acr122u> {
        let start = Instant::now();
        loop {
            if let Some(r) = Acr122u::connect(ctx, reader)? {
                return Ok(r);
            }
            if start.elapsed() > timeout {
                bail!("no card was tapped within {} seconds", timeout.as_secs());
            }
            std::thread::sleep(Duration::from_millis(200));
        }
    }

    pub fn raw_apdu(&self, apdu: &[u8]) -> Result<Vec<u8>, String> {
        let mut buf = [0u8; pcsc::MAX_BUFFER_SIZE];
        let res = self.card.transmit(apdu, &mut buf).map_err(|e| e.to_string())?;
        if self.trace {
            eprintln!("  > {}\n  < {}", masked(apdu), hex(res));
        }
        Ok(res.to_vec())
    }

    pub fn uid(&self) -> Result<String> {
        let res = self.raw_apdu(&APDU_GET_UID).map_err(anyhow::Error::msg)?;
        if !is_success(&res) {
            bail!("reader returned {}", hex(&res));
        }
        Ok(hex(&res[..res.len() - 2]))
    }
}

impl Tag for Acr122u {
    fn transceive(&mut self, raw: &[u8]) -> Result<Vec<u8>, String> {
        let apdu = apdu_for(raw, self.direct);
        let res = self.raw_apdu(&apdu)?;
        response_for(raw, &apdu, &res)
    }
}

/// Dry run: nothing is sent to the card. Every APDU that would be sent is printed, and a
/// simulator answers instead; it starts as a copy of the real card (read with READ only, see
/// `mirror`) or as a factory-blank chip when no card is on the reader.
pub struct DryRun {
    pub sim: crate::ntag::SimTag,
    pub direct: bool,
    pub printed: usize,
    /// Hide the card's real password in the listing (live dry runs); `plan` shows its dummy one.
    pub mask_pwd: bool,
}

impl Tag for DryRun {
    fn transceive(&mut self, raw: &[u8]) -> Result<Vec<u8>, String> {
        self.printed += 1;
        let apdu = apdu_for(raw, self.direct);
        let secret = raw[0] == 0x1B || (raw[0] == 0xA2 && raw[1] == self.sim.chip.pwd_page());
        let shown = if self.mask_pwd { masked(&apdu) } else { hex(&apdu) };
        println!("  {:>3}  {:<46} {}", self.printed, shown, describe(raw, self.mask_pwd && secret));
        self.sim.transceive(raw)
    }
}

/// Copies a real chip into a simulator using only GET_VERSION and READ (writes nothing).
pub fn mirror(reader: &mut Acr122u) -> Result<crate::ntag::SimTag, String> {
    use crate::ntag::{chip_from_version, cmd, SimTag};
    let version = reader.transceive(&cmd::get_version())?;
    let chip = chip_from_version(&version).ok_or_else(|| format!("not an NTAG213/215/216 (GET_VERSION {})", hex(&version)))?;
    let head = reader.transceive(&cmd::read(0))?;
    let uid: [u8; 7] = [head[0], head[1], head[2], head[4], head[5], head[6], head[7]];
    let mut sim = SimTag::blank(chip.kind, &uid);
    let mut page = 0u8;
    while page <= chip.pack_page() {
        let chunk = reader.transceive(&cmd::read(page))?;
        for i in 0..4u8 {
            let p = page + i;
            if p > chip.pack_page() || p == chip.pwd_page() || p == chip.pack_page() {
                continue;
            }
            let at = p as usize * 4;
            sim.memory[at..at + 4].copy_from_slice(&chunk[i as usize * 4..i as usize * 4 + 4]);
        }
        page = page.saturating_add(4);
        if page == 0 {
            break;
        }
    }
    Ok(sim)
}

/// One line per command for the dry-run listing.
pub fn describe(raw: &[u8], mask: bool) -> String {
    match raw[0] {
        0x60 => "GET_VERSION".into(),
        0x30 => format!("READ page {}", raw[1]),
        0xA2 if mask => format!("WRITE page {} = ******** (PWD)", raw[1]),
        0xA2 => format!("WRITE page {} = {}", raw[1], hex(&raw[2..6])),
        0x1B if mask => "PWD_AUTH ********".into(),
        0x1B => format!("PWD_AUTH {}", hex(&raw[1..5])),
        _ => format!("{:02X}", raw[0]),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wraps_commands_in_acr122u_apdus() {
        assert_eq!(apdu_for(&[0x30, 0x04], false), vec![0xFF, 0xB0, 0x00, 0x04, 0x10]);
        assert_eq!(apdu_for(&[0xA2, 0x83, 1, 2, 3, 4], false), vec![0xFF, 0xD6, 0x00, 0x83, 0x04, 1, 2, 3, 4]);
        assert_eq!(apdu_for(&[0x60], false), vec![0xFF, 0x00, 0x00, 0x00, 0x03, 0xD4, 0x42, 0x60]);
        assert_eq!(apdu_for(&[0x1B, 9, 8, 7, 6], false), vec![0xFF, 0x00, 0x00, 0x00, 0x07, 0xD4, 0x42, 0x1B, 9, 8, 7, 6]);
        assert_eq!(apdu_for(&[0x30, 0x04], true), vec![0xFF, 0x00, 0x00, 0x00, 0x04, 0xD4, 0x42, 0x30, 0x04]);
    }

    #[test]
    fn masks_the_password_in_logs() {
        assert_eq!(masked(&apdu_for(&[0x1B, 1, 2, 3, 4], false)), "FF00000007D4421B********");
        assert_eq!(masked(&apdu_for(&[0xA2, 0x85, 1, 2, 3, 4], false)), "FFD6008504********");
        assert_eq!(masked(&apdu_for(&[0xA2, 0x05, 1, 2, 3, 4], false)), "FFD600050401020304");
        assert_eq!(masked(&apdu_for(&[0xA2, 0xE5, 1, 2, 3, 4], true)), "FF00000008D442A2E5********");
    }

    #[test]
    fn unwraps_reader_responses() {
        let read = [0x30, 4];
        let mut ok = vec![0u8; 16];
        ok.extend_from_slice(&[0x90, 0x00]);
        assert_eq!(response_for(&read, &apdu_for(&read, false), &ok).unwrap().len(), 16);
        let w = [0xA2, 5, 0, 0, 0, 0];
        assert_eq!(response_for(&w, &apdu_for(&w, false), &[0x90, 0x00]).unwrap(), vec![0x0A]);
        assert_eq!(response_for(&w, &apdu_for(&w, false), &[0x63, 0x00]).unwrap(), vec![0x00]);
        let auth = [0x1B, 1, 2, 3, 4];
        assert_eq!(response_for(&auth, &apdu_for(&auth, false), &[0xD5, 0x43, 0x00, 0xAB, 0xCD, 0x90, 0x00]).unwrap(), vec![0xAB, 0xCD]);
        assert!(response_for(&auth, &apdu_for(&auth, false), &[0xD5, 0x43, 0x01, 0x90, 0x00]).is_err());
    }
}

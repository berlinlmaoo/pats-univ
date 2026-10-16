//! NTAG213 / 215 / 216: chip detection, NDEF encoding, and the encode sequence.
//!
//! This mirrors packages/shared/src/ntag.ts (the phones' encoder) step for step; both are tested
//! against the same command fixture (tests/fixtures/encode.json). Everything here speaks raw
//! NTAG21x commands (READ 30h, WRITE A2h, PWD_AUTH 1Bh, GET_VERSION 60h) through the `Tag` trait;
//! `reader.rs` wraps them in ACR122U APDUs.
//!
//! Safety rules (PRODUCT.md §10.1): lock bits and the capability container are never written; the
//! factory TLVs before the NDEF (Lock Control) are kept; the password is proven with PWD_AUTH
//! while AUTH0 only covers the PACK page, before AUTH0 drops to the first NDEF page (rolled back
//! to FFh if the proof fails); AUTHLIM stays 0.

use std::fmt;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ChipType {
    Ntag213,
    Ntag215,
    Ntag216,
}

impl ChipType {
    pub fn name(self) -> &'static str {
        match self {
            ChipType::Ntag213 => "NTAG213",
            ChipType::Ntag215 => "NTAG215",
            ChipType::Ntag216 => "NTAG216",
        }
    }

    pub fn parse(s: &str) -> Option<ChipType> {
        match s.to_ascii_uppercase().as_str() {
            "NTAG213" | "213" => Some(ChipType::Ntag213),
            "NTAG215" | "215" => Some(ChipType::Ntag215),
            "NTAG216" | "216" => Some(ChipType::Ntag216),
            _ => None,
        }
    }
}

/// Where things live on each chip (datasheets §8.5: CFG0 at 29h / 83h / E3h).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Chip {
    pub kind: ChipType,
    /// GET_VERSION byte 6.
    pub storage_size: u8,
    /// Capability container byte 2.
    pub cc_size: u8,
    pub user_end_page: u8,
}

pub const USER_START_PAGE: u8 = 4;

impl Chip {
    pub const fn new(kind: ChipType, storage_size: u8, cc_size: u8, user_end_page: u8) -> Chip {
        Chip { kind, storage_size, cc_size, user_end_page }
    }
    pub fn of(kind: ChipType) -> Chip {
        match kind {
            ChipType::Ntag213 => NTAG213,
            ChipType::Ntag215 => NTAG215,
            ChipType::Ntag216 => NTAG216,
        }
    }
    pub fn user_bytes(&self) -> usize {
        (self.user_end_page as usize - 3) * 4
    }
    pub fn dynamic_lock_page(&self) -> u8 {
        self.user_end_page + 1
    }
    pub fn cfg0_page(&self) -> u8 {
        self.user_end_page + 2
    }
    pub fn cfg1_page(&self) -> u8 {
        self.user_end_page + 3
    }
    pub fn pwd_page(&self) -> u8 {
        self.user_end_page + 4
    }
    pub fn pack_page(&self) -> u8 {
        self.user_end_page + 5
    }
}

pub const NTAG213: Chip = Chip::new(ChipType::Ntag213, 0x0F, 0x12, 0x27);
pub const NTAG215: Chip = Chip::new(ChipType::Ntag215, 0x11, 0x3E, 0x81);
pub const NTAG216: Chip = Chip::new(ChipType::Ntag216, 0x13, 0x6D, 0xE1);

pub fn chip_from_version(v: &[u8]) -> Option<Chip> {
    if v.len() < 8 || v[0] != 0x00 || v[1] != 0x04 || v[2] != 0x04 || v[3] != 0x02 || v[4] != 0x01 || v[5] != 0x00 || v[7] != 0x03 {
        return None;
    }
    [NTAG213, NTAG215, NTAG216].into_iter().find(|c| c.storage_size == v[6])
}

/// Write protection from the first NDEF page on (reads stay open: PROT = 0).
pub const AUTH0_PROTECTED: u8 = 0x04;
pub const AUTH0_DISABLED: u8 = 0xFF;

pub mod cmd {
    pub fn get_version() -> Vec<u8> {
        vec![0x60]
    }
    pub fn read(page: u8) -> Vec<u8> {
        vec![0x30, page]
    }
    pub fn write(page: u8, data: [u8; 4]) -> Vec<u8> {
        vec![0xA2, page, data[0], data[1], data[2], data[3]]
    }
    pub fn pwd_auth(pwd: [u8; 4]) -> Vec<u8> {
        vec![0x1B, pwd[0], pwd[1], pwd[2], pwd[3]]
    }
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02X}")).collect()
}

pub fn from_hex(s: &str) -> Result<Vec<u8>, String> {
    let clean: String = s.chars().filter(|c| !c.is_whitespace() && *c != ':').collect();
    if !clean.len().is_multiple_of(2) {
        return Err(format!("not hex: {s}"));
    }
    (0..clean.len()).step_by(2).map(|i| u8::from_str_radix(&clean[i..i + 2], 16).map_err(|_| format!("not hex: {s}"))).collect()
}

// ─── NDEF ─────────────────────────────────────────────────────────────────────

const URI_PREFIXES: [(&str, u8); 2] = [("https://", 0x04), ("http://", 0x03)];

/// One short URI record in an NDEF TLV (`03 len … FE`).
pub fn ndef_uri_tlv(url: &str) -> Result<Vec<u8>, String> {
    let (code, rest) = URI_PREFIXES
        .iter()
        .find_map(|(prefix, code)| url.strip_prefix(prefix).map(|rest| (*code, rest)))
        .unwrap_or((0x00, url));
    if !rest.bytes().all(|b| (0x21..=0x7E).contains(&b)) {
        return Err("only printable ASCII URLs are supported".into());
    }
    let payload_len = 1 + rest.len();
    if payload_len > 255 {
        return Err(format!("URL too long for a short record ({payload_len} bytes)"));
    }
    // MB=1 ME=1 SR=1 TNF=well-known -> D1; type "U".
    let mut record = vec![0xD1, 0x01, payload_len as u8, b'U', code];
    record.extend_from_slice(rest.as_bytes());
    if record.len() > 254 {
        return Err("NDEF message too long for a 1-byte TLV length".into());
    }
    let mut tlv = vec![0x03, record.len() as u8];
    tlv.extend_from_slice(&record);
    tlv.push(0xFE);
    Ok(tlv)
}

/// 4-byte pages from page 4, last one zero-padded.
pub fn to_pages(bytes: &[u8]) -> Vec<(u8, [u8; 4])> {
    bytes
        .chunks(4)
        .enumerate()
        .map(|(i, chunk)| {
            let mut page = [0u8; 4];
            page[..chunk.len()].copy_from_slice(chunk);
            (USER_START_PAGE + i as u8, page)
        })
        .collect()
}

/// The URI of the first NDEF URI record in user memory, or None.
pub fn parse_ndef_uri(user: &[u8]) -> Option<String> {
    let mut i = 0;
    while i < user.len() {
        let t = user[i];
        if t == 0x00 {
            i += 1;
            continue;
        }
        if t == 0xFE {
            return None;
        }
        let mut len = *user.get(i + 1)? as usize;
        let mut start = i + 2;
        if len == 0xFF {
            len = ((*user.get(i + 2)? as usize) << 8) | *user.get(i + 3)? as usize;
            start = i + 4;
        }
        if t != 0x03 {
            i = start + len;
            continue;
        }
        let msg = user.get(start..(start + len).min(user.len()))?;
        let header = *msg.first()?;
        let short = header & 0x10 != 0;
        let has_id = header & 0x08 != 0;
        let type_len = *msg.get(1)? as usize;
        let mut p = 2;
        let payload_len = if short {
            *msg.get(p)? as usize
        } else {
            u32::from_be_bytes([*msg.get(p)?, *msg.get(p + 1)?, *msg.get(p + 2)?, *msg.get(p + 3)?]) as usize
        };
        p += if short { 1 } else { 4 };
        let id_len = if has_id {
            p += 1;
            *msg.get(p - 1)? as usize
        } else {
            0
        };
        let typ = msg.get(p..p + type_len)?;
        p += type_len + id_len;
        if header & 0x07 != 0x01 || typ != b"U" {
            return None;
        }
        let payload = msg.get(p..(p + payload_len).min(msg.len()))?;
        let prefix = URI_PREFIXES.iter().find(|(_, c)| Some(c) == payload.first()).map(|(p, _)| *p).unwrap_or("");
        return Some(format!("{prefix}{}", String::from_utf8_lossy(&payload[1..])));
    }
    None
}

/// Byte offset of the NDEF TLV: after any NULL, Lock Control and Memory Control TLVs.
pub fn ndef_offset_of(user: &[u8]) -> usize {
    let mut i = 0;
    while i < user.len() {
        match user[i] {
            0x00 => i += 1,
            0x01 | 0x02 => match user.get(i + 1) {
                Some(&len) if len != 0xFF => i += 2 + len as usize,
                _ => return 0,
            },
            _ => return i,
        }
    }
    0
}

pub struct Layout {
    pub pages: Vec<(u8, [u8; 4])>,
    pub empty: Vec<(u8, [u8; 4])>,
    pub body: Vec<(u8, [u8; 4])>,
    pub header: Vec<(u8, [u8; 4])>,
}

/// The TLVs before the NDEF kept as they are, then the URL message. Written as: a zero-length
/// message, the body, then the type/length pages, so a cut-off write never leaves a half message.
pub fn ndef_layout(url: &str, prefix: &[u8], chip: &Chip) -> Result<Layout, String> {
    let offset = prefix.len();
    let tlv = ndef_uri_tlv(url)?;
    if offset + tlv.len() > chip.user_bytes() {
        return Err(format!("NDEF needs {} bytes; {} has {}", offset + tlv.len(), chip.kind.name(), chip.user_bytes()));
    }
    let first_page = USER_START_PAGE + (offset / 4) as u8;
    let mut full = prefix.to_vec();
    full.extend_from_slice(&tlv);
    let pages: Vec<_> = to_pages(&full).into_iter().filter(|(p, _)| *p >= first_page).collect();
    let header_pages = [USER_START_PAGE + (offset / 4) as u8, USER_START_PAGE + ((offset + 1) / 4) as u8];
    let mut empty_bytes = prefix.to_vec();
    empty_bytes.extend_from_slice(&[0x03, 0x00, 0xFE]);
    let empty = to_pages(&empty_bytes).into_iter().filter(|(p, _)| *p >= first_page).collect();
    let header = pages.iter().copied().filter(|(p, _)| header_pages.contains(p)).collect();
    let body = pages.iter().copied().filter(|(p, _)| !header_pages.contains(p)).collect();
    Ok(Layout { pages, empty, body, header })
}

// ─── Inspect & write ──────────────────────────────────────────────────────────

/// Sends one raw NTAG command; Err when the tag doesn't answer.
pub trait Tag {
    fn transceive(&mut self, command: &[u8]) -> Result<Vec<u8>, String>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TagError {
    NotNtag(String),
    NotNdefFormatted(String),
    ReadOnly(String),
    LockBitsSet(String),
    WrongPassword(String),
    WriteFailed(String),
    VerifyFailed(String),
    ProtectFailed(String),
    TagLost(String),
}

impl TagError {
    /// Same codes as the TS encoder, for the server's audit log.
    pub fn code(&self) -> &'static str {
        match self {
            TagError::NotNtag(_) => "NOT_NTAG",
            TagError::NotNdefFormatted(_) => "NOT_NDEF_FORMATTED",
            TagError::ReadOnly(_) => "READ_ONLY",
            TagError::LockBitsSet(_) => "LOCK_BITS_SET",
            TagError::WrongPassword(_) => "WRONG_PASSWORD",
            TagError::WriteFailed(_) => "WRITE_FAILED",
            TagError::VerifyFailed(_) => "VERIFY_FAILED",
            TagError::ProtectFailed(_) => "PROTECT_FAILED",
            TagError::TagLost(_) => "TAG_LOST",
        }
    }
    pub fn detail(&self) -> &str {
        match self {
            TagError::NotNtag(d)
            | TagError::NotNdefFormatted(d)
            | TagError::ReadOnly(d)
            | TagError::LockBitsSet(d)
            | TagError::WrongPassword(d)
            | TagError::WriteFailed(d)
            | TagError::VerifyFailed(d)
            | TagError::ProtectFailed(d)
            | TagError::TagLost(d) => d,
        }
    }
}

impl fmt::Display for TagError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code(), self.detail())
    }
}

impl std::error::Error for TagError {}

#[derive(Debug, Clone)]
pub struct Inspection {
    pub chip: Chip,
    pub uid: String,
    pub protected: bool,
    pub auth0: u8,
    pub access: u8,
    /// Dynamic lock, CFG0, CFG1, PWD (reads as zero).
    pub cfg: [u8; 16],
    pub url: Option<String>,
    pub ndef_offset: usize,
    pub user: Vec<u8>,
}

fn send(tag: &mut dyn Tag, c: &[u8]) -> Result<Vec<u8>, TagError> {
    tag.transceive(c).map_err(TagError::TagLost)
}

fn read16(tag: &mut dyn Tag, page: u8) -> Result<[u8; 16], TagError> {
    let res = send(tag, &cmd::read(page))?;
    if res.len() < 16 {
        return Err(TagError::TagLost(format!("READ {page} returned {} bytes", res.len())));
    }
    let mut out = [0u8; 16];
    out.copy_from_slice(&res[..16]);
    Ok(out)
}

fn is_ack(res: &[u8]) -> bool {
    res.is_empty() || (res.len() == 1 && res[0] & 0x0F == 0x0A)
}

fn write_page(tag: &mut dyn Tag, page: u8, data: [u8; 4]) -> Result<(), TagError> {
    let mut last = String::new();
    for _ in 0..3 {
        match tag.transceive(&cmd::write(page, data)) {
            Ok(res) if is_ack(&res) => return Ok(()),
            Ok(res) => last = format!("NAK {}", hex(&res)),
            Err(e) => last = e,
        }
    }
    Err(TagError::WriteFailed(format!("page {page}: {last}")))
}

/// Reads everything needed before talking to the server. Writes nothing.
pub fn inspect(tag: &mut dyn Tag) -> Result<Inspection, TagError> {
    let version = send(tag, &cmd::get_version())?;
    let chip = chip_from_version(&version).ok_or_else(|| TagError::NotNtag(format!("GET_VERSION {}", hex(&version))))?;
    let head = read16(tag, 0)?;
    let uid = hex(&[head[0], head[1], head[2], head[4], head[5], head[6], head[7]]);
    let cc = &head[12..16];
    if cc[0] != 0xE1 || cc[1] != 0x10 {
        return Err(TagError::NotNdefFormatted(format!("CC {}", hex(cc))));
    }
    if cc[2] != chip.cc_size {
        return Err(TagError::NotNtag(format!("CC size {:02X} does not match {}", cc[2], chip.kind.name())));
    }
    if cc[3] != 0x00 {
        return Err(TagError::ReadOnly(format!("CC {}", hex(cc))));
    }
    let cfg = read16(tag, chip.dynamic_lock_page())?;
    if head[10] != 0 || head[11] != 0 || cfg[0] != 0 || cfg[1] != 0 || cfg[2] != 0 {
        return Err(TagError::LockBitsSet(format!("static {} dynamic {}", hex(&head[10..12]), hex(&cfg[0..3]))));
    }
    let mut user = Vec::new();
    let mut page = USER_START_PAGE;
    while page <= chip.user_end_page {
        let chunk = read16(tag, page)?;
        let pages_left = (chip.user_end_page - page + 1) as usize;
        user.extend_from_slice(&chunk[..16.min(pages_left * 4)]);
        if chunk.contains(&0xFE) {
            break;
        }
        page = page.saturating_add(4);
    }
    Ok(Inspection {
        chip,
        uid,
        protected: cfg[7] <= chip.user_end_page,
        auth0: cfg[7],
        access: cfg[8],
        cfg,
        url: parse_ndef_uri(&user),
        ndef_offset: ndef_offset_of(&user),
        user,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WriteResult {
    pub pages_written: usize,
    pub protected_now: bool,
}

/// Writes the URL and protects the chip with the server's PWD/PACK for this UID.
pub fn write(tag: &mut dyn Tag, t: &Inspection, url: &str, pwd: [u8; 4], pack: [u8; 2]) -> Result<WriteResult, TagError> {
    let chip = t.chip;
    if t.protected {
        let res = tag.transceive(&cmd::pwd_auth(pwd)).unwrap_or_default();
        if res.len() < 2 || res[..2] != pack {
            return Err(TagError::WrongPassword(format!("PACK {}", hex(&res))));
        }
    }

    let layout = ndef_layout(url, &t.user[..t.ndef_offset.min(t.user.len())], &chip).map_err(TagError::WriteFailed)?;
    for (p, d) in &layout.empty {
        write_page(tag, *p, *d)?;
    }
    for (p, d) in &layout.body {
        write_page(tag, *p, *d)?;
    }
    for (p, d) in &layout.header {
        write_page(tag, *p, *d)?;
    }
    let mut written = layout.empty.len() + layout.pages.len();

    let mut attempt = 0;
    loop {
        let mut bad = Vec::new();
        for group in layout.pages.chunks(4) {
            let chunk = read16(tag, group[0].0)?;
            for (j, (p, d)) in group.iter().enumerate() {
                if chunk[j * 4..j * 4 + 4] != d[..] {
                    bad.push((*p, *d));
                }
            }
        }
        if bad.is_empty() {
            break;
        }
        if attempt >= 1 {
            let list: Vec<String> = bad.iter().map(|(p, _)| p.to_string()).collect();
            return Err(TagError::VerifyFailed(format!("pages {}", list.join(","))));
        }
        for (p, d) in &bad {
            write_page(tag, *p, *d)?;
        }
        written += bad.len();
        attempt += 1;
    }

    let cfg0 = [t.cfg[4], t.cfg[5], t.cfg[6], t.cfg[7]];
    let access = [0x00, t.cfg[9], t.cfg[10], t.cfg[11]];
    let with_auth0 = |a: u8| [cfg0[0], cfg0[1], cfg0[2], a];

    let mut protected_now = false;
    if !t.protected {
        // A run cut short after the staging step leaves AUTH0 on a config page; CFG0 is still
        // writable then, so protection goes off and the steps start over.
        if t.auth0 != AUTH0_DISABLED {
            if t.auth0 > chip.cfg0_page() {
                write_page(tag, chip.cfg0_page(), with_auth0(AUTH0_DISABLED))?;
                written += 1;
            } else {
                let res = tag.transceive(&cmd::pwd_auth(pwd)).unwrap_or_default();
                if res.len() < 2 || res[..2] != pack {
                    return Err(TagError::WrongPassword(format!("PACK {}", hex(&res))));
                }
            }
        }
        write_page(tag, chip.pwd_page(), pwd)?;
        write_page(tag, chip.pack_page(), [pack[0], pack[1], 0x00, 0x00])?;
        write_page(tag, chip.cfg1_page(), access)?;
        write_page(tag, chip.cfg0_page(), with_auth0(chip.pack_page()))?;
        written += 4;
        let proof = tag.transceive(&cmd::pwd_auth(pwd)).unwrap_or_default();
        if proof.len() < 2 || proof[..2] != pack {
            let _ = write_page(tag, chip.cfg0_page(), with_auth0(AUTH0_DISABLED));
            return Err(TagError::ProtectFailed(format!("PACK {}", hex(&proof))));
        }
        write_page(tag, chip.cfg0_page(), with_auth0(AUTH0_PROTECTED))?;
        written += 1;
        protected_now = true;
    } else if t.auth0 != AUTH0_PROTECTED || t.access != 0x00 {
        write_page(tag, chip.cfg1_page(), access)?;
        write_page(tag, chip.cfg0_page(), with_auth0(AUTH0_PROTECTED))?;
        written += 2;
    }

    let after = read16(tag, chip.dynamic_lock_page())?;
    if after[7] != AUTH0_PROTECTED || after[8] != 0x00 {
        return Err(TagError::VerifyFailed(format!("config {}", hex(&after[4..12]))));
    }
    Ok(WriteResult { pages_written: written, protected_now })
}

// ─── Simulator (tests, dry runs) ──────────────────────────────────────────────

/// An in-memory NTAG21x that answers like the real chip (see the TS SimulatedNtag).
pub struct SimTag {
    pub chip: Chip,
    pub memory: Vec<u8>,
    pub authenticated: bool,
    pub commands: Vec<Vec<u8>>,
    pub fail_on: Option<usize>,
}

impl SimTag {
    pub fn blank(kind: ChipType, uid: &[u8; 7]) -> SimTag {
        let chip = Chip::of(kind);
        let mut memory = vec![0u8; (chip.pack_page() as usize + 1) * 4];
        let bcc0 = 0x88 ^ uid[0] ^ uid[1] ^ uid[2];
        let bcc1 = uid[3] ^ uid[4] ^ uid[5] ^ uid[6];
        memory[..12].copy_from_slice(&[uid[0], uid[1], uid[2], bcc0, uid[3], uid[4], uid[5], uid[6], bcc1, 0x48, 0x00, 0x00]);
        memory[12..16].copy_from_slice(&[0xE1, 0x10, chip.cc_size, 0x00]);
        let lock: &[u8] = if kind == ChipType::Ntag213 { &[0x01, 0x03, 0xA0, 0x0C, 0x34] } else { &[0x01, 0x03, 0xA0, 0x10, 0x44] };
        memory[16..16 + lock.len()].copy_from_slice(lock);
        memory[16 + lock.len()..16 + lock.len() + 3].copy_from_slice(&[0x03, 0x00, 0xFE]);
        let c0 = chip.cfg0_page() as usize * 4;
        memory[c0..c0 + 4].copy_from_slice(&[0x04, 0x00, 0x00, 0xFF]);
        let pw = chip.pwd_page() as usize * 4;
        memory[pw..pw + 4].copy_from_slice(&[0xFF; 4]);
        SimTag { chip, memory, authenticated: false, commands: Vec::new(), fail_on: None }
    }

    pub fn page(&self, n: u8) -> [u8; 4] {
        let i = n as usize * 4;
        [self.memory[i], self.memory[i + 1], self.memory[i + 2], self.memory[i + 3]]
    }

    pub fn auth0(&self) -> u8 {
        self.memory[self.chip.cfg0_page() as usize * 4 + 3]
    }

    /// A new NFC session: authentication does not survive taking the card away.
    #[cfg(test)]
    pub fn reset(&mut self) {
        self.authenticated = false;
        self.fail_on = None;
    }
}

impl Tag for SimTag {
    fn transceive(&mut self, c: &[u8]) -> Result<Vec<u8>, String> {
        self.commands.push(c.to_vec());
        if matches!(self.fail_on, Some(n) if self.commands.len() >= n) {
            return Err("tag connection lost".into());
        }
        let last = self.chip.pack_page();
        match c[0] {
            0x60 => Ok(vec![0x00, 0x04, 0x04, 0x02, 0x01, 0x00, self.chip.storage_size, 0x03]),
            0x30 => {
                let mut out = Vec::with_capacity(16);
                for i in 0..4u16 {
                    let p = ((c[1] as u16 + i) % (last as u16 + 1)) as u8;
                    if p == self.chip.pwd_page() || p == self.chip.pack_page() {
                        out.extend_from_slice(&[0; 4]);
                    } else {
                        out.extend_from_slice(&self.page(p));
                    }
                }
                Ok(out)
            }
            0xA2 => {
                let p = c[1];
                if p < 2 || p > last || (p >= self.auth0() && !self.authenticated) {
                    return Ok(vec![0x00]);
                }
                if p == 2 || p == 3 || p == self.chip.dynamic_lock_page() {
                    return Err("simulator refuses lock/CC writes".into());
                }
                let i = p as usize * 4;
                self.memory[i..i + 4].copy_from_slice(&c[2..6]);
                Ok(vec![0x0A])
            }
            0x1B => {
                if c[1..5] == self.page(self.chip.pwd_page()) {
                    self.authenticated = true;
                    Ok(self.page(self.chip.pack_page())[..2].to_vec())
                } else {
                    Err("NAK".into())
                }
            }
            _ => Ok(vec![0x00]),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const UID: [u8; 7] = [0x04, 0xA1, 0xB2, 0xC3, 0xD4, 0xE5, 0xF6];
    const PWD: [u8; 4] = [0x12, 0x34, 0x56, 0x78];
    const PACK: [u8; 2] = [0xAB, 0xCD];
    const URL: &str = "https://patsuniv.znetworks.id/c/AbCdEfGhIjKlMnOpQrStUvWxYz012345";

    fn encode(tag: &mut SimTag) -> Result<WriteResult, TagError> {
        let t = inspect(tag)?;
        write(tag, &t, URL, PWD, PACK)
    }

    #[test]
    fn chip_profiles_match_the_datasheets() {
        assert_eq!((NTAG213.cfg0_page(), NTAG213.pack_page(), NTAG213.user_bytes()), (0x29, 0x2C, 144));
        assert_eq!((NTAG215.cfg0_page(), NTAG215.pack_page(), NTAG215.user_bytes()), (0x83, 0x86, 504));
        assert_eq!((NTAG216.cfg0_page(), NTAG216.pack_page(), NTAG216.user_bytes()), (0xE3, 0xE6, 888));
        assert_eq!(chip_from_version(&[0, 4, 4, 2, 1, 0, 0x11, 3]).map(|c| c.kind), Some(ChipType::Ntag215));
        assert_eq!(chip_from_version(&[0, 4, 4, 2, 1, 0, 0x99, 3]), None);
    }

    #[test]
    fn encodes_every_chip_and_keeps_the_lock_control_tlv() {
        for kind in [ChipType::Ntag213, ChipType::Ntag215, ChipType::Ntag216] {
            let mut tag = SimTag::blank(kind, &UID);
            let lock: Vec<u8> = tag.memory[16..21].to_vec();
            let res = encode(&mut tag).unwrap();
            assert!(res.protected_now);
            assert_eq!(tag.memory[16..21], lock[..], "{kind:?} lock TLV changed");
            assert_eq!(parse_ndef_uri(&tag.memory[16..]).as_deref(), Some(URL));
            assert_eq!(tag.auth0(), AUTH0_PROTECTED);
            assert_eq!(tag.page(tag.chip.pwd_page()), PWD);
            // Lock bytes and CC untouched.
            assert_eq!(&tag.memory[10..16], &[0, 0, 0xE1, 0x10, tag.chip.cc_size, 0][..]);
        }
    }

    #[test]
    fn protected_chip_refuses_writes_without_the_password() {
        let mut tag = SimTag::blank(ChipType::Ntag215, &UID);
        encode(&mut tag).unwrap();
        tag.reset();
        let t = inspect(&mut tag).unwrap();
        assert!(t.protected);
        assert_eq!(tag.transceive(&cmd::write(5, [1, 2, 3, 4])).unwrap(), vec![0x00]);
        assert!(matches!(write(&mut tag, &t, URL, [9, 9, 9, 9], PACK), Err(TagError::WrongPassword(_))));
    }

    #[test]
    fn re_encodes_with_the_same_password() {
        let mut tag = SimTag::blank(ChipType::Ntag213, &UID);
        encode(&mut tag).unwrap();
        tag.reset();
        let t = inspect(&mut tag).unwrap();
        let other = "https://patsuniv.znetworks.id/c/ZyXwVuTsRqPoNmLkJiHgFeDcBa987654";
        let res = write(&mut tag, &t, other, PWD, PACK).unwrap();
        assert!(!res.protected_now);
        assert_eq!(parse_ndef_uri(&tag.memory[16..]).as_deref(), Some(other));
    }

    #[test]
    fn interrupted_write_never_leaves_an_unknown_password() {
        // Cut the session at every command in turn: afterwards the chip is either unprotected or
        // protected with the server's password, and a fresh encode always succeeds.
        let total = {
            let mut t = SimTag::blank(ChipType::Ntag216, &UID);
            encode(&mut t).unwrap();
            t.commands.len()
        };
        for cut in 1..=total {
            let mut tag = SimTag::blank(ChipType::Ntag216, &UID);
            tag.fail_on = Some(cut);
            let _ = encode(&mut tag);
            tag.reset();
            let pwd_ok = tag.auth0() > tag.chip.user_end_page || tag.page(tag.chip.pwd_page()) == PWD;
            assert!(pwd_ok, "cut at {cut}: protected with an unknown password");
            encode(&mut tag).unwrap_or_else(|e| panic!("cut at {cut}: recovery failed: {e}"));
            assert_eq!(parse_ndef_uri(&tag.memory[16..]).as_deref(), Some(URL));
        }
    }

    #[test]
    fn refuses_locked_or_unformatted_chips() {
        let mut tag = SimTag::blank(ChipType::Ntag213, &UID);
        tag.memory[10] = 0x08;
        assert!(matches!(inspect(&mut tag), Err(TagError::LockBitsSet(_))));
        let mut tag = SimTag::blank(ChipType::Ntag213, &UID);
        tag.memory[12..16].copy_from_slice(&[0; 4]);
        assert!(matches!(inspect(&mut tag), Err(TagError::NotNdefFormatted(_))));
        let mut tag = SimTag::blank(ChipType::Ntag215, &UID);
        tag.memory[14] = 0x12; // 213's CC on a 215
        assert!(matches!(inspect(&mut tag), Err(TagError::NotNtag(_))));
    }

    #[test]
    fn production_card_url_fits_every_chip() {
        let tlv = ndef_uri_tlv(&format!("https://patsuniv.znetworks.id/c/{}", "a".repeat(32))).unwrap();
        assert!(5 + tlv.len() <= NTAG213.user_bytes());
    }

    #[test]
    fn rejects_oversized_or_non_ascii_urls() {
        assert!(ndef_uri_tlv(&format!("https://x.id/{}", "a".repeat(300))).is_err());
        assert!(ndef_uri_tlv("https://x.id/é").is_err());
    }

    #[test]
    fn parses_an_existing_foreign_url() {
        // The owner's R&D card: https://znetworks.id after the factory Lock Control TLV.
        let mut user = vec![0x01, 0x03, 0xA0, 0x0C, 0x34];
        user.extend(ndef_uri_tlv("https://znetworks.id").unwrap());
        assert_eq!(parse_ndef_uri(&user).as_deref(), Some("https://znetworks.id"));
        assert_eq!(ndef_offset_of(&user), 5);
    }
}

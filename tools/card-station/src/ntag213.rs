//! NTAG213 over an ACR122U (PC/SC): APDU builders and NDEF encoding.
//!
//! Commands go through the reader's pseudo-APDU pass-through `FF 00 00 00 Lc <ISO 14443-3A cmd>`.
//! The chip is write-protected with PWD/PACK + AUTH0 (PROT = 0: reads stay open) and is never
//! permanently locked: static and dynamic lock bits and the capability container are not
//! touched (PLAN.md §2.2). Phase 0 ships the pure encoding/building parts with tests; the write
//! sequence lands in Phase 2.

// Write/protect builders are exercised by tests now and wired to the encode loop in Phase 2.
#![allow(dead_code)]

/// First user-memory page.
pub const USER_START_PAGE: u8 = 4;
/// Last user-memory page (inclusive): 144 bytes = pages 4..=39.
pub const USER_END_PAGE: u8 = 39;
pub const USER_BYTES: usize = 144;
/// Configuration pages (NTAG213 datasheet §8.5).
pub const CFG0_PAGE: u8 = 41; // MIRROR, RFUI, MIRROR_PAGE, AUTH0
pub const CFG1_PAGE: u8 = 42; // ACCESS (PROT, CFGLCK, AUTHLIM), RFUI x3
pub const PWD_PAGE: u8 = 43;
pub const PACK_PAGE: u8 = 44;
/// Write protection starts at this page (keeps pages 0..=2, UID and lock bytes, untouched).
pub const AUTH0_FIRST_PROTECTED_PAGE: u8 = 0x03;

/// ACR122U "Get Data" for the card UID.
pub const APDU_GET_UID: [u8; 5] = [0xFF, 0xCA, 0x00, 0x00, 0x00];

fn passthrough(cmd: &[u8]) -> Vec<u8> {
    let mut apdu = vec![0xFF, 0x00, 0x00, 0x00, cmd.len() as u8];
    apdu.extend_from_slice(cmd);
    apdu
}

/// READ (0x30): returns 16 bytes = 4 pages starting at `page`.
pub fn apdu_read(page: u8) -> Vec<u8> {
    passthrough(&[0x30, page])
}

/// WRITE (0xA2): one 4-byte page.
pub fn apdu_write(page: u8, data: [u8; 4]) -> Vec<u8> {
    passthrough(&[0xA2, page, data[0], data[1], data[2], data[3]])
}

/// PWD_AUTH (0x1B): returns the 2-byte PACK on success.
pub fn apdu_pwd_auth(pwd: [u8; 4]) -> Vec<u8> {
    passthrough(&[0x1B, pwd[0], pwd[1], pwd[2], pwd[3]])
}

/// URI identifier codes (NFC Forum RTD URI §3.2.2) for the prefixes we use.
const URI_PREFIXES: [(&str, u8); 2] = [("https://", 0x04), ("http://", 0x03)];

/// NDEF message with a single short URI record, wrapped in a TLV (`03 len … FE`), ready to be
/// written from page 4. Errors when it doesn't fit the 144-byte user memory.
pub fn ndef_uri_tlv(url: &str) -> Result<Vec<u8>, String> {
    let (code, rest) = URI_PREFIXES
        .iter()
        .find_map(|(prefix, code)| url.strip_prefix(prefix).map(|rest| (*code, rest)))
        .unwrap_or((0x00, url));
    let payload_len = 1 + rest.len();
    if payload_len > 255 {
        return Err(format!("URL too long for a short record ({payload_len} bytes)"));
    }
    // Record header: MB=1 ME=1 CF=0 SR=1 IL=0 TNF=0x01 (well-known) -> 0xD1; type "U".
    let mut record = vec![0xD1, 0x01, payload_len as u8, b'U', code];
    record.extend_from_slice(rest.as_bytes());
    if record.len() > 254 {
        return Err("NDEF message too long for a 1-byte TLV length".into());
    }
    let mut tlv = vec![0x03, record.len() as u8];
    tlv.extend_from_slice(&record);
    tlv.push(0xFE);
    if tlv.len() > USER_BYTES {
        return Err(format!("NDEF needs {} bytes; NTAG213 has {USER_BYTES}", tlv.len()));
    }
    Ok(tlv)
}

/// Splits bytes into 4-byte pages starting at page 4, zero-padding the last page.
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

/// Reader status words: `90 00` is success.
pub fn is_success(response: &[u8]) -> bool {
    response.len() >= 2 && response[response.len() - 2..] == [0x90, 0x00]
}

/// Hex for logs and the API ("04A1B2C3D4E5F6").
pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02X}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_passthrough_apdus() {
        assert_eq!(apdu_read(4), vec![0xFF, 0x00, 0x00, 0x00, 0x02, 0x30, 0x04]);
        assert_eq!(apdu_write(43, [1, 2, 3, 4]), vec![0xFF, 0x00, 0x00, 0x00, 0x06, 0xA2, 43, 1, 2, 3, 4]);
        assert_eq!(apdu_pwd_auth([9, 8, 7, 6]), vec![0xFF, 0x00, 0x00, 0x00, 0x05, 0x1B, 9, 8, 7, 6]);
    }

    #[test]
    fn encodes_card_url_as_ndef_uri() {
        let url = "https://patsuniv.znetworks.id/c/abc";
        let tlv = ndef_uri_tlv(url).unwrap();
        let rest = b"patsuniv.znetworks.id/c/abc";
        assert_eq!(&tlv[..7], &[0x03, (5 + rest.len()) as u8, 0xD1, 0x01, (1 + rest.len()) as u8, b'U', 0x04]);
        assert_eq!(&tlv[7..7 + rest.len()], rest);
        assert_eq!(*tlv.last().unwrap(), 0xFE);
    }

    #[test]
    fn production_card_url_fits_ntag213() {
        let token = "a".repeat(32);
        let tlv = ndef_uri_tlv(&format!("https://patsuniv.znetworks.id/c/{token}")).unwrap();
        assert!(tlv.len() <= USER_BYTES);
        let pages = to_pages(&tlv);
        assert_eq!(pages[0].0, USER_START_PAGE);
        assert!(pages.last().unwrap().0 <= USER_END_PAGE);
    }

    #[test]
    fn rejects_oversized_urls() {
        assert!(ndef_uri_tlv(&format!("https://x.id/{}", "a".repeat(200))).is_err());
    }

    #[test]
    fn protection_never_touches_lock_pages() {
        assert!(AUTH0_FIRST_PROTECTED_PAGE >= 3);
        assert!(CFG0_PAGE > USER_END_PAGE && PACK_PAGE == 44);
    }

    #[test]
    fn reads_status_words() {
        assert!(is_success(&[0x04, 0x90, 0x00]));
        assert!(!is_success(&[0x63, 0x00]));
        assert_eq!(hex(&[0x04, 0xA1, 0x0F]), "04A10F");
    }
}

//! Identifying a printed card: the QR printed by the vendor holds the card URL, whose token is
//! also what gets written to the chip (print first, encode after; PLAN.md §2.2). The operator
//! scans it with a USB QR scanner (it types like a keyboard), the Mac camera (`--camera`, through
//! the small `pats-qr-scan` helper in camera/), or types the NIM. The server does the lookup.

use std::path::PathBuf;
use std::process::Command;

/// Token from a scanned card URL, e.g. `https://patsuniv.znetworks.id/c/<token>`.
pub fn token_from_card_url(scanned: &str) -> Option<String> {
    let after = scanned.trim().split("/c/").nth(1)?;
    let token: String = after.chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').collect();
    (token.len() == 32).then_some(token)
}

#[derive(Debug, PartialEq, Eq)]
pub enum CardLookup {
    Token(String),
    Nim(String),
}

pub fn parse_lookup(input: &str) -> Option<CardLookup> {
    if let Some(token) = token_from_card_url(input) {
        return Some(CardLookup::Token(token));
    }
    let nim: String = input.trim().to_ascii_uppercase().chars().filter(|c| !c.is_whitespace()).collect();
    let valid = nim.len() == 10 && nim[..3].chars().all(|c| c.is_ascii_uppercase()) && nim[3..].chars().all(|c| c.is_ascii_digit());
    valid.then_some(CardLookup::Nim(nim))
}

/// The camera helper, next to the card-station binary or on PATH.
pub fn camera_helper() -> Option<PathBuf> {
    let beside = std::env::current_exe().ok()?.parent()?.join("pats-qr-scan");
    if beside.exists() {
        return Some(beside);
    }
    std::env::var_os("PATH")?.to_str()?.split(':').map(|d| PathBuf::from(d).join("pats-qr-scan")).find(|p| p.exists())
}

/// Opens the Mac camera until a QR is in view; returns its text.
pub fn scan_with_camera(timeout_secs: u32) -> Result<String, String> {
    let helper = camera_helper().ok_or("Camera helper not found. Build it (README: camera) or scan with a USB scanner / type the NIM.")?;
    let out = Command::new(helper).args(["--timeout", &timeout_secs.to_string()]).output().map_err(|e| e.to_string())?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_scanned_urls_and_nims() {
        let token = "AbCdEfGhIjKlMnOpQrStUvWxYz01_-45";
        assert_eq!(parse_lookup(&format!("https://patsuniv.znetworks.id/c/{token}?x=1")), Some(CardLookup::Token(token.into())));
        assert_eq!(parse_lookup(" jkt2600042 "), Some(CardLookup::Nim("JKT2600042".into())));
        assert_eq!(parse_lookup("JKT26"), None);
        assert_eq!(parse_lookup("https://patsuniv.znetworks.id/c/short"), None);
    }
}

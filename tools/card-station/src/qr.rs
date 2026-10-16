//! Identifying a printed card: the QR printed by the vendor holds the card URL, whose token is
//! also what gets written to the chip (print first, encode after; PLAN.md §2.2).
//! Phase 2 adds reading the QR from the Mac camera (AVFoundation); typing the NIM or pasting
//! the scanned URL works through the same parser.

/// Token from a scanned card URL, e.g. `https://patsuniv.znetworks.id/c/<token>`.
pub fn token_from_card_url(scanned: &str) -> Option<String> {
    let trimmed = scanned.trim();
    let after = trimmed.split("/c/").nth(1)?;
    let token: String = after.chars().take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').collect();
    (token.len() >= 16).then_some(token)
}

/// What the operator typed or scanned.
#[derive(Debug, PartialEq, Eq)]
pub enum CardLookup {
    Token(String),
    Nim(String),
}

pub fn parse_lookup(input: &str) -> Option<CardLookup> {
    if let Some(token) = token_from_card_url(input) {
        return Some(CardLookup::Token(token));
    }
    let nim = input.trim().to_ascii_uppercase();
    let valid = nim.len() == 10 && nim[..3].chars().all(|c| c.is_ascii_uppercase()) && nim[3..].chars().all(|c| c.is_ascii_digit());
    valid.then_some(CardLookup::Nim(nim))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_scanned_urls_and_nims() {
        let token = "AbCdEf0123456789_-xyz";
        assert_eq!(
            parse_lookup(&format!("https://patsuniv.znetworks.id/c/{token}?x=1")),
            Some(CardLookup::Token(token.into()))
        );
        assert_eq!(parse_lookup(" jkt2600042 "), Some(CardLookup::Nim("JKT2600042".into())));
        assert_eq!(parse_lookup("JKT26"), None);
        assert_eq!(parse_lookup("https://patsuniv.znetworks.id/c/short"), None);
    }
}

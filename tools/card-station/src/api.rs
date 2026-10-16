//! HTTP client for the PATS University API: HQ login (email + OTP), the stored session, and the
//! station endpoints (PLAN.md §2.2):
//!   GET  /api/hq/batches                 batches back at HQ or being encoded
//!   POST /api/hq/cards/prepare           identify + hold a card (lease)
//!   POST /api/hq/cards/{id}/key          PWD/PACK for this chip UID
//!   POST /api/hq/cards/{id}/encoded      bind the UID, card -> ENCODED
//!   POST /api/hq/cards/{id}/release      give the card back (failures are audited)

// Response types mirror the API; the CLI doesn't read every field.
#![allow(dead_code)]

use anyhow::{anyhow, bail, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::time::Duration;

#[derive(Debug, Deserialize)]
pub struct Health {
    pub ok: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub api: String,
    pub access_token: String,
    pub access_token_expires_at: String,
    pub refresh_token: String,
    pub email: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct City {
    pub code: String,
    pub name: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Batch {
    pub id: String,
    pub label: String,
    pub city: City,
    pub status: String,
    pub card_count: u32,
    pub encoded_count: u32,
    pub claimed_count: u32,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CardInfo {
    pub id: String,
    pub status: String,
    pub nfc_uid: Option<String>,
    pub chip_type: Option<String>,
    pub encoded_station: Option<String>,
    pub encoded_at: Option<String>,
    pub batch: Option<BatchRef>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct BatchRef {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Member {
    pub nim: String,
    pub full_name: String,
    pub city: City,
    pub status: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Lease {
    pub id: String,
    pub expires_at: String,
    pub station: String,
    pub mode: String,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Claim {
    pub lease: Option<Lease>,
    pub card: CardInfo,
    pub member: Member,
    pub url: String,
    pub already_encoded: bool,
}

#[derive(Debug, Deserialize)]
pub struct Key {
    pub pwd: String,
    pub pack: String,
    pub url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchProgress {
    pub label: String,
    pub card_count: u32,
    pub encoded_count: u32,
}

#[derive(Debug, Deserialize)]
pub struct Encoded {
    pub card: CardInfo,
    pub batch: Option<BatchProgress>,
}

/// An API error with its stable code, so the CLI can explain it.
#[derive(Debug)]
pub struct ApiError {
    pub status: u16,
    pub code: String,
    pub params: Value,
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} ({})", explain(&self.code, &self.params), self.code)
    }
}

impl std::error::Error for ApiError {}

/// Operator-facing text for the station's error codes (English: HQ tooling).
pub fn explain(code: &str, p: &Value) -> String {
    let s = |k: &str| p.get(k).map(|v| v.as_str().map(str::to_string).unwrap_or_else(|| v.to_string())).unwrap_or_default();
    match code {
        "CARD_NOT_FOUND" => "No card has this code. Check the QR or the NIM.".into(),
        "CARD_INVALID" => "This isn't a PATS University card QR.".into(),
        "CARD_REVOKED" => "This card was revoked. Set it aside.".into(),
        "CARD_STATUS" => format!("This card can't be encoded now (status {}). Is its batch marked back at HQ?", s("status")),
        "CARD_CLAIMED" => format!("{} is encoding this card. Try again in {} s.", s("station"), s("seconds")),
        "CARD_OTHER_BATCH" => format!("This card belongs to batch {}.", s("batch")),
        "CARD_UID_MISMATCH" => "This card is bound to another chip. Use `encode --reencode` to move it.".into(),
        "UID_IN_USE" => format!("This chip already belongs to {}'s card ({}).", s("nim"), s("status")),
        "LEASE_LOST" => "This station no longer holds the card. Scan it again.".into(),
        "GRANT_INVALID" => "The re-encode permission expired or was used.".into(),
        "FORBIDDEN" => "This account may not encode cards.".into(),
        "UNAUTHENTICATED" => "Session ended. Run `card-station login` again.".into(),
        "RATE_LIMITED" => "Too many requests. Wait a moment.".into(),
        _ => "The server refused the request.".into(),
    }
}

fn session_path() -> PathBuf {
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."));
    home.join(".config/pats-card-station/session.json")
}

pub fn load_session() -> Option<Session> {
    serde_json::from_str(&fs::read_to_string(session_path()).ok()?).ok()
}

pub fn save_session(s: &Session) -> Result<()> {
    let path = session_path();
    fs::create_dir_all(path.parent().unwrap())?;
    fs::write(&path, serde_json::to_vec_pretty(s)?)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600))?;
    }
    Ok(())
}

pub fn clear_session() {
    let _ = fs::remove_file(session_path());
}

pub struct ApiClient {
    base: String,
    http: reqwest::blocking::Client,
    session: Option<Session>,
}

impl ApiClient {
    pub fn new(base: &str) -> Result<Self> {
        let http = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(15))
            .user_agent(concat!("card-station/", env!("CARGO_PKG_VERSION")))
            .build()?;
        let base = base.trim_end_matches('/').to_string();
        let session = load_session().filter(|s| s.api == base);
        Ok(Self { base, http, session })
    }

    pub fn signed_in_as(&self) -> Option<&str> {
        self.session.as_ref().map(|s| s.email.as_str())
    }

    fn send(&self, method: reqwest::Method, path: &str, body: Option<&Value>, token: Option<&str>) -> Result<Value> {
        let url = format!("{}{path}", self.base);
        let mut req = self.http.request(method.clone(), &url);
        if let Some(t) = token {
            req = req.bearer_auth(t);
        }
        if let Some(b) = body {
            req = req.json(b);
        }
        let res = req.send().with_context(|| format!("{method} {url}"))?;
        let status = res.status();
        let json: Value = res.json().unwrap_or(Value::Null);
        if !status.is_success() {
            let code = json.pointer("/error/code").and_then(Value::as_str).unwrap_or("INTERNAL").to_string();
            return Err(ApiError { status: status.as_u16(), code, params: json.get("params").cloned().unwrap_or(Value::Null) }.into());
        }
        Ok(json)
    }

    pub fn health(&self) -> Result<Health> {
        Ok(serde_json::from_value(self.send(reqwest::Method::GET, "/api/health", None, None)?)?)
    }

    /// Step 1 of login: sends the code (shown in the response in demo mode).
    pub fn request_code(&self, email: &str) -> Result<Option<String>> {
        let r = self.send(reqwest::Method::POST, "/api/auth/otp/request", Some(&json!({ "email": email, "audience": "hq", "locale": "en" })), None)?;
        Ok(r.get("demoCode").and_then(Value::as_str).map(str::to_string))
    }

    pub fn verify_code(&mut self, email: &str, code: &str) -> Result<()> {
        let r = self.send(reqwest::Method::POST, "/api/auth/otp/verify", Some(&json!({ "email": email, "code": code, "client": "station" })), None)?;
        let s = Session {
            api: self.base.clone(),
            access_token: r["accessToken"].as_str().context("no access token")?.into(),
            access_token_expires_at: r["accessTokenExpiresAt"].as_str().unwrap_or_default().into(),
            refresh_token: r["refreshToken"].as_str().context("no refresh token")?.into(),
            email: email.into(),
        };
        save_session(&s)?;
        self.session = Some(s);
        Ok(())
    }

    /// Authenticated call; refreshes the access token once when it has expired.
    fn call(&mut self, method: reqwest::Method, path: &str, body: Option<Value>) -> Result<Value> {
        let token = self.session.as_ref().map(|s| s.access_token.clone()).ok_or_else(|| anyhow!("Not signed in. Run `card-station login --email <hq email>` first."))?;
        match self.send(method.clone(), path, body.as_ref(), Some(&token)) {
            Err(e) if e.downcast_ref::<ApiError>().is_some_and(|a| a.code == "UNAUTHENTICATED") => {
                self.refresh()?;
                let token = self.session.as_ref().unwrap().access_token.clone();
                self.send(method, path, body.as_ref(), Some(&token))
            }
            other => other,
        }
    }

    fn refresh(&mut self) -> Result<()> {
        let s = self.session.clone().context("not signed in")?;
        let r = self
            .send(reqwest::Method::POST, "/api/auth/refresh", Some(&json!({ "refreshToken": s.refresh_token })), None)
            .map_err(|_| anyhow!("Session ended. Run `card-station login` again."))?;
        let next = Session {
            access_token: r["accessToken"].as_str().unwrap_or_default().into(),
            access_token_expires_at: r["accessTokenExpiresAt"].as_str().unwrap_or_default().into(),
            refresh_token: r["refreshToken"].as_str().unwrap_or_default().into(),
            ..s
        };
        save_session(&next)?;
        self.session = Some(next);
        Ok(())
    }

    pub fn logout(&mut self) {
        if let Some(s) = self.session.take() {
            let _ = self.send(reqwest::Method::POST, "/api/auth/logout", Some(&json!({ "refreshToken": s.refresh_token })), None);
        }
        clear_session();
    }

    pub fn batches(&mut self) -> Result<Vec<Batch>> {
        let r = self.call(reqwest::Method::GET, "/api/hq/batches", None)?;
        Ok(serde_json::from_value(r["batches"].clone())?)
    }

    pub fn prepare(&mut self, lookup: &str, station: &str, reencode: bool, batch: Option<&str>, rotate: bool) -> Result<Claim> {
        let mut body = json!({ "lookup": lookup, "station": station, "mode": if reencode { "reencode" } else { "encode" }, "rotateToken": rotate });
        if let Some(b) = batch {
            body["batchId"] = json!(b);
        }
        Ok(serde_json::from_value(self.call(reqwest::Method::POST, "/api/hq/cards/prepare", Some(body))?)?)
    }

    pub fn key(&mut self, card_id: &str, lease: &str, uid: &str) -> Result<Key> {
        let r = self.call(reqwest::Method::POST, &format!("/api/hq/cards/{card_id}/key"), Some(json!({ "leaseId": lease, "nfcUid": uid })))?;
        Ok(serde_json::from_value(r)?)
    }

    pub fn encoded(&mut self, card_id: &str, lease: &str, uid: &str, protected_now: bool, chip: &str) -> Result<Encoded> {
        let body = json!({ "leaseId": lease, "nfcUid": uid, "protectedNow": protected_now, "chipType": chip });
        Ok(serde_json::from_value(self.call(reqwest::Method::POST, &format!("/api/hq/cards/{card_id}/encoded"), Some(body))?)?)
    }

    pub fn release(&mut self, card_id: &str, lease: &str, failure: Option<(&str, &str)>) -> Result<()> {
        let mut body = json!({ "leaseId": lease });
        if let Some((code, detail)) = failure {
            body["failure"] = json!(code);
            body["detail"] = json!(detail.chars().take(300).collect::<String>());
        }
        self.call(reqwest::Method::POST, &format!("/api/hq/cards/{card_id}/release"), Some(body))?;
        Ok(())
    }
}

/// Fails fast on an obviously wrong origin, before any network call.
pub fn check_origin(api: &str) -> Result<()> {
    if !(api.starts_with("https://") || api.starts_with("http://")) {
        bail!("--api must be an http(s) origin, got {api}");
    }
    Ok(())
}

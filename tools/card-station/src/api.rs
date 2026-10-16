//! HTTP client for the PATS University API. Phase 0: reachability check. Phase 2 adds
//! login (HQ email + OTP), `POST /api/hq/cards/prepare`, `/key` and `/encoded`.

use anyhow::{Context, Result};
use serde::Deserialize;
use std::time::Duration;

#[derive(Debug, Deserialize)]
pub struct Health {
    pub ok: bool,
}

pub struct ApiClient {
    base: String,
    http: reqwest::blocking::Client,
}

impl ApiClient {
    pub fn new(base: &str) -> Result<Self> {
        let http = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(10))
            .user_agent(concat!("card-station/", env!("CARGO_PKG_VERSION")))
            .build()?;
        Ok(Self { base: base.trim_end_matches('/').to_string(), http })
    }

    pub fn health(&self) -> Result<Health> {
        let url = format!("{}/api/health", self.base);
        let res = self.http.get(&url).send().with_context(|| format!("GET {url}"))?;
        let status = res.status();
        let body: Health = res.json().with_context(|| format!("GET {url} returned {status}"))?;
        Ok(body)
    }
}

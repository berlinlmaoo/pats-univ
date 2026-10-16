//! Card Station: the HQ tool that writes printed NTAG213 member cards on an ACR122U.
//! See README.md for macOS setup and PLAN.md §2.2 for the encode flow.

mod api;
mod ntag213;
mod qr;

use anyhow::{bail, Context, Result};
use clap::{Parser, Subcommand};
use std::ffi::CString;

#[derive(Parser)]
#[command(name = "card-station", version, about = "Encode PATS University member cards (NTAG213 + ACR122U)")]
struct Cli {
    /// API origin.
    #[arg(long, global = true, env = "PATS_API_URL", default_value = "https://patsuniv.znetworks.id")]
    api: String,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Check the reader setup: lists PC/SC readers and whether a card is on each.
    Readers,
    /// Read the UID of the card on the reader (read-only).
    Uid {
        /// Reader name (defaults to the first ACR122U, else the first reader).
        #[arg(long)]
        reader: Option<String>,
    },
    /// Show the NDEF bytes that would be written for a card URL (nothing is written).
    NdefPreview { url: String },
    /// Parse what the operator scanned or typed: a printed card URL or a NIM.
    Lookup { input: String },
    /// Check that the API is reachable.
    Ping,
    /// Encode printed cards of a batch (Phase 2).
    Encode,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Readers => readers(),
        Command::Uid { reader } => uid(reader.as_deref()),
        Command::NdefPreview { url } => {
            let tlv = ntag213::ndef_uri_tlv(&url).map_err(anyhow::Error::msg)?;
            println!("{} bytes of {} available", tlv.len(), ntag213::USER_BYTES);
            for (page, data) in ntag213::to_pages(&tlv) {
                println!("page {page:>2}: {}", ntag213::hex(&data));
            }
            Ok(())
        }
        Command::Lookup { input } => {
            match qr::parse_lookup(&input) {
                Some(qr::CardLookup::Token(t)) => println!("card token: {t}"),
                Some(qr::CardLookup::Nim(n)) => println!("NIM: {n}"),
                None => bail!("not a card URL or NIM: {input}"),
            }
            Ok(())
        }
        Command::Ping => {
            let health = api::ApiClient::new(&cli.api)?.health()?;
            println!("{}: {}", cli.api, if health.ok { "ok" } else { "database unreachable" });
            Ok(())
        }
        Command::Encode => {
            eprintln!("Encoding arrives in Phase 2 (PLAN.md §2.2). Use `readers` and `uid` to check the hardware now.");
            std::process::exit(2);
        }
    }
}

fn context() -> Result<pcsc::Context> {
    pcsc::Context::establish(pcsc::Scope::User).context("PC/SC service unavailable (see README: macOS setup)")
}

fn reader_names(ctx: &pcsc::Context) -> Result<Vec<CString>> {
    let len = ctx.list_readers_len()?;
    let mut buf = vec![0u8; len];
    match ctx.list_readers(&mut buf) {
        Ok(names) => Ok(names.map(|n| n.to_owned()).collect()),
        Err(pcsc::Error::NoReadersAvailable) => Ok(Vec::new()),
        Err(e) => Err(e.into()),
    }
}

fn readers() -> Result<()> {
    let ctx = context()?;
    let names = reader_names(&ctx)?;
    if names.is_empty() {
        println!("No readers found. Plug in the ACR122U and check README.md.");
        return Ok(());
    }
    for name in names {
        let card = match ctx.connect(&name, pcsc::ShareMode::Shared, pcsc::Protocols::ANY) {
            Ok(_) => "card present",
            Err(pcsc::Error::NoSmartcard) | Err(pcsc::Error::RemovedCard) => "no card",
            Err(e) => {
                println!("{}  (error: {e})", name.to_string_lossy());
                continue;
            }
        };
        println!("{}  ({card})", name.to_string_lossy());
    }
    Ok(())
}

fn uid(preferred: Option<&str>) -> Result<()> {
    let ctx = context()?;
    let names = reader_names(&ctx)?;
    let name = match preferred {
        Some(p) => names.iter().find(|n| n.to_string_lossy() == p).cloned(),
        None => names
            .iter()
            .find(|n| n.to_string_lossy().contains("ACR122"))
            .or_else(|| names.first())
            .cloned(),
    }
    .context("no reader found")?;
    let card = ctx
        .connect(&name, pcsc::ShareMode::Shared, pcsc::Protocols::ANY)
        .context("no card on the reader")?;
    let mut buf = [0u8; pcsc::MAX_BUFFER_SIZE];
    let res = card.transmit(&ntag213::APDU_GET_UID, &mut buf)?;
    if !ntag213::is_success(res) {
        bail!("reader returned {}", ntag213::hex(res));
    }
    println!("{}", ntag213::hex(&res[..res.len() - 2]));
    Ok(())
}

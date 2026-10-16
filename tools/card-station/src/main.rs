//! Card Station: the HQ tool that writes printed NTAG213/215/216 member cards on an ACR122U.
//! See README.md for macOS setup and PLAN.md §2.2 for the encode flow.

mod api;
mod ntag;
mod qr;
mod reader;

use anyhow::{anyhow, bail, Context, Result};
use clap::{Parser, Subcommand};
use ntag::{from_hex, hex, ChipType, SimTag, Tag};
use reader::{Acr122u, DryRun};
use std::io::{self, BufRead, Write};
use std::time::Duration;

#[derive(Parser)]
#[command(name = "card-station", version, about = "Encode PATS University member cards (NTAG213/215/216 + ACR122U)")]
struct Cli {
    /// API origin.
    #[arg(long, global = true, env = "PATS_API_URL", default_value = "https://patsuniv.znetworks.id")]
    api: String,
    /// Reader name (defaults to the first ACR122U, else the first reader).
    #[arg(long, global = true)]
    reader: Option<String>,
    /// Print every APDU sent to the reader and its answer.
    #[arg(long, global = true)]
    verbose: bool,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// List PC/SC readers and whether a card is on each.
    Readers,
    /// Print the UID of the card on the reader (read-only).
    Uid,
    /// What is on the card: chip type, UID, lock bits, protection, NDEF URL (read-only).
    Status,
    /// Dump every page of the card (read-only; PWD and PACK always read as zero).
    Read,
    /// Show the NDEF bytes that would be written for a card URL (nothing is written).
    NdefPreview {
        url: String,
        #[arg(long, default_value = "213")]
        chip: String,
    },
    /// Print the exact APDUs an encode would send, against a simulated factory-blank chip.
    Plan {
        url: String,
        #[arg(long, default_value = "213")]
        chip: String,
        #[arg(long, default_value = "04A1B2C3D4E5F6")]
        uid: String,
        #[arg(long, default_value = "12345678")]
        pwd: String,
        #[arg(long, default_value = "ABCD")]
        pack: String,
    },
    /// Parse what the operator scanned or typed: a printed card URL or a NIM.
    Lookup { input: String },
    /// Check that the API is reachable.
    Ping,
    /// Sign in with an HQ account (email + 6-digit code).
    Login {
        #[arg(long)]
        email: String,
    },
    /// Forget the stored session.
    Logout,
    /// Batches back at HQ or being encoded, with progress.
    Batches,
    /// Encode printed cards: scan the QR (or type the NIM), check the name, tap the card.
    Encode {
        /// Only accept cards of this batch (id or label, e.g. JKT-3).
        #[arg(long)]
        batch: Option<String>,
        /// Write a card that is already encoded (fix a bad encode, move it to another chip).
        #[arg(long)]
        reencode: bool,
        /// With --reencode: give the card a new token (the old one stops working).
        #[arg(long, requires = "reencode")]
        new_token: bool,
        /// Print the APDUs instead of writing; the card is only read. Nothing is reported as encoded.
        #[arg(long)]
        dry_run: bool,
        /// Read the printed QR with the Mac camera (needs the pats-qr-scan helper).
        #[arg(long)]
        camera: bool,
        /// How this station shows up on the dashboard.
        #[arg(long, env = "PATS_STATION")]
        station: Option<String>,
        /// Send READ/WRITE through the PN532 pass-through instead of Read/Update Binary.
        #[arg(long)]
        direct: bool,
        /// Skip the "is this the printed name?" question (only for scripted dry runs).
        #[arg(long)]
        yes: bool,
        /// Dry run without a reader: simulate this chip (213, 215 or 216).
        #[arg(long)]
        sim_chip: Option<String>,
        /// Encode just this one card (QR text or NIM), then stop.
        #[arg(long)]
        once: Option<String>,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match &cli.command {
        Command::Readers => readers(),
        Command::Uid => {
            let r = connect(&cli)?;
            println!("{}", r.uid()?);
            Ok(())
        }
        Command::Status => status(&cli),
        Command::Read => dump(&cli),
        Command::NdefPreview { url, chip } => {
            let chip = parse_chip(chip)?;
            let tlv = ntag::ndef_uri_tlv(url).map_err(anyhow::Error::msg)?;
            println!("{} bytes (+5 for the factory Lock Control TLV) of {} on {}", tlv.len(), ntag::Chip::of(chip).user_bytes(), chip.name());
            for (page, data) in ntag::to_pages(&tlv) {
                println!("page {page:>3}: {}", hex(&data));
            }
            Ok(())
        }
        Command::Plan { url, chip, uid, pwd, pack } => plan(url, parse_chip(chip)?, uid, pwd, pack),
        Command::Lookup { input } => {
            match qr::parse_lookup(input) {
                Some(qr::CardLookup::Token(t)) => println!("card token: {t}"),
                Some(qr::CardLookup::Nim(n)) => println!("NIM: {n}"),
                None => bail!("not a card URL or NIM: {input}"),
            }
            Ok(())
        }
        Command::Ping => {
            api::check_origin(&cli.api)?;
            let health = api::ApiClient::new(&cli.api)?.health()?;
            println!("{}: {}", cli.api, if health.ok { "ok" } else { "database unreachable" });
            Ok(())
        }
        Command::Login { email } => login(&cli.api, email),
        Command::Logout => {
            api::ApiClient::new(&cli.api)?.logout();
            println!("Signed out.");
            Ok(())
        }
        Command::Batches => {
            let mut client = api::ApiClient::new(&cli.api)?;
            let batches = client.batches()?;
            if batches.is_empty() {
                println!("No batch is back at HQ. Mark one \"back at HQ\" on the dashboard first.");
            }
            for b in batches {
                println!(
                    "{:<10} {:<12} {:>3}/{:<3} encoded{}   ({})",
                    b.label,
                    b.city.name,
                    b.encoded_count,
                    b.card_count,
                    if b.claimed_count > 0 { format!(", {} being encoded", b.claimed_count) } else { String::new() },
                    b.status
                );
            }
            Ok(())
        }
        Command::Encode { .. } => encode(&cli),
    }
}

fn parse_chip(s: &str) -> Result<ChipType> {
    ChipType::parse(s).ok_or_else(|| anyhow!("chip must be 213, 215 or 216"))
}

fn connect(cli: &Cli) -> Result<Acr122u> {
    let ctx = reader::context()?;
    let name = reader::pick_reader(&ctx, cli.reader.as_deref())?;
    let mut r = Acr122u::connect(&ctx, &name)?.context("no card on the reader")?;
    r.trace = cli.verbose;
    Ok(r)
}

fn readers() -> Result<()> {
    let ctx = reader::context()?;
    let names = reader::reader_names(&ctx)?;
    if names.is_empty() {
        println!("No readers found. Plug in the ACR122U and check README.md.");
        return Ok(());
    }
    for name in names {
        let state = match Acr122u::connect(&ctx, &name) {
            Ok(Some(_)) => "card present".to_string(),
            Ok(None) => "no card".to_string(),
            Err(e) => format!("error: {e}"),
        };
        println!("{}  ({state})", name.to_string_lossy());
    }
    Ok(())
}

fn status(cli: &Cli) -> Result<()> {
    let mut r = connect(cli)?;
    let t = ntag::inspect(&mut r).map_err(|e| anyhow!("{e}"))?;
    println!("Chip       {}  ({} bytes user memory)", t.chip.kind.name(), t.chip.user_bytes());
    println!("UID        {}", t.uid);
    println!("Lock bits  none set");
    println!("AUTH0      {:02X}  ({})", t.auth0, if t.protected { "write-protected with a password" } else { "not protected" });
    println!("ACCESS     {:02X}", t.access);
    println!("TLVs       {} before the NDEF ({})", t.ndef_offset, hex(&t.user[..t.ndef_offset.min(t.user.len())]));
    println!("NDEF URL   {}", t.url.as_deref().unwrap_or("(empty)"));
    Ok(())
}

fn dump(cli: &Cli) -> Result<()> {
    let mut r = connect(cli)?;
    let version = r.transceive(&ntag::cmd::get_version()).map_err(anyhow::Error::msg)?;
    let chip = ntag::chip_from_version(&version).ok_or_else(|| anyhow!("not an NTAG213/215/216 (GET_VERSION {})", hex(&version)))?;
    println!("{} (GET_VERSION {})", chip.kind.name(), hex(&version));
    let mut page = 0u8;
    while page <= chip.pack_page() {
        let chunk = r.transceive(&ntag::cmd::read(page)).map_err(anyhow::Error::msg)?;
        for i in 0..4u8 {
            let p = page + i;
            if p <= chip.pack_page() {
                let b = &chunk[i as usize * 4..i as usize * 4 + 4];
                let ascii: String = b.iter().map(|&c| if (0x20..0x7F).contains(&c) { c as char } else { '.' }).collect();
                println!("page {p:>3} ({p:02X}h): {}  {ascii}", hex(b));
            }
        }
        page = page.saturating_add(4);
        if page == 0 {
            break;
        }
    }
    Ok(())
}

fn plan(url: &str, chip: ChipType, uid: &str, pwd: &str, pack: &str) -> Result<()> {
    let uid: [u8; 7] = from_hex(uid).map_err(anyhow::Error::msg)?.try_into().map_err(|_| anyhow!("UID must be 7 bytes"))?;
    let pwd: [u8; 4] = from_hex(pwd).map_err(anyhow::Error::msg)?.try_into().map_err(|_| anyhow!("PWD must be 4 bytes"))?;
    let pack: [u8; 2] = from_hex(pack).map_err(anyhow::Error::msg)?.try_into().map_err(|_| anyhow!("PACK must be 2 bytes"))?;
    println!("Dry run on a simulated factory-blank {}. Nothing is sent to any card.", chip.name());
    let mut dry = DryRun { sim: SimTag::blank(chip, &uid), direct: false, printed: 0, mask_pwd: false };
    let t = ntag::inspect(&mut dry).map_err(|e| anyhow!("{e}"))?;
    let res = ntag::write(&mut dry, &t, url, pwd, pack).map_err(|e| anyhow!("{e}"))?;
    println!("{} APDUs, {} page writes; AUTH0 {:02X} on CFG0 page {:02X}h.", dry.printed, res.pages_written, ntag::AUTH0_PROTECTED, ntag::Chip::of(chip).cfg0_page());
    Ok(())
}

fn login(api_url: &str, email: &str) -> Result<()> {
    api::check_origin(api_url)?;
    let mut client = api::ApiClient::new(api_url)?;
    let demo = client.request_code(email)?;
    match demo {
        Some(code) => println!("Demo mode: your code is {code}"),
        None => println!("We emailed a 6-digit code to {email}."),
    }
    let code = prompt("Code: ")?;
    client.verify_code(email, code.trim())?;
    println!("Signed in as {email} on {api_url}.");
    Ok(())
}

fn prompt(label: &str) -> Result<String> {
    print!("{label}");
    io::stdout().flush()?;
    let mut line = String::new();
    io::stdin().lock().read_line(&mut line)?;
    Ok(line.trim().to_string())
}

fn default_station() -> String {
    let name = std::process::Command::new("scutil")
        .args(["--get", "ComputerName"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    match name {
        Some(n) => format!("Mac Card Station ({n})").chars().take(60).collect(),
        None => "Mac Card Station".into(),
    }
}

fn encode(cli: &Cli) -> Result<()> {
    let Command::Encode { batch, reencode, new_token, dry_run, camera, station, direct, yes, sim_chip, once } = &cli.command else { unreachable!() };
    api::check_origin(&cli.api)?;
    let mut client = api::ApiClient::new(&cli.api)?;
    let who = client.signed_in_as().map(str::to_string).ok_or_else(|| anyhow!("Not signed in. Run `card-station login --email <hq email>` first."))?;
    let station = station.clone().unwrap_or_else(default_station);

    // A batch by label (JKT-3) or id; the station only accepts its cards.
    let batch_id = match batch {
        None => None,
        Some(b) => {
            let list = client.batches()?;
            let found = list.iter().find(|x| x.id == *b || x.label.eq_ignore_ascii_case(b)).ok_or_else(|| anyhow!("Batch {b} isn't back at HQ (see `card-station batches`)."))?;
            println!("Batch {} · {} · {}/{} encoded", found.label, found.city.name, found.encoded_count, found.card_count);
            Some(found.id.clone())
        }
    };
    let ctx = if sim_chip.is_some() { None } else { Some(reader::context()?) };
    let reader_name = match &ctx {
        Some(c) => Some(reader::pick_reader(c, cli.reader.as_deref())?),
        None => None,
    };
    println!(
        "{} as {who} · station \"{station}\"{}",
        if *dry_run { "DRY RUN" } else { "Encoding" },
        if *reencode { " · re-encode mode" } else { "" }
    );
    if *dry_run {
        println!("Dry run: the card is only read; the APDUs are printed, not sent, and nothing is reported as encoded.");
    }

    loop {
        let lookup = match once {
            Some(x) => x.clone(),
            None if *camera => {
                println!("\nHold the printed QR in front of the camera (Ctrl-C to stop)…");
                match qr::scan_with_camera(60) {
                    Ok(text) => text,
                    Err(e) => {
                        println!("{e}");
                        prompt("Scan the QR or type the NIM (empty to stop): ")?
                    }
                }
            }
            None => prompt("\nScan the printed QR or type the NIM (empty to stop): ")?,
        };
        if lookup.is_empty() {
            return Ok(());
        }
        if let Err(e) = encode_one(&mut client, cli, &lookup, &station, batch_id.as_deref(), *reencode, *new_token, *dry_run, *direct, *yes, sim_chip.as_deref(), ctx.as_ref(), reader_name.as_ref()) {
            println!("✗ {e}");
        }
        if once.is_some() {
            return Ok(());
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn encode_one(
    client: &mut api::ApiClient,
    cli: &Cli,
    lookup: &str,
    station: &str,
    batch: Option<&str>,
    reencode: bool,
    new_token: bool,
    dry_run: bool,
    direct: bool,
    yes: bool,
    sim_chip: Option<&str>,
    ctx: Option<&pcsc::Context>,
    reader_name: Option<&std::ffi::CString>,
) -> Result<()> {
    let claim = client.prepare(lookup, station, reencode, batch, new_token)?;
    let m = &claim.member;
    println!("  {} · {} · {}   card {}{}", m.full_name, m.nim, m.city.name, claim.card.status, claim.card.batch.as_ref().map(|b| format!(" · batch {}", b.label)).unwrap_or_default());
    let Some(lease) = claim.lease.clone() else {
        println!(
            "  Already encoded{}{}. Nothing written. Use --reencode to write it again.",
            claim.card.encoded_station.as_ref().map(|s| format!(" by {s}")).unwrap_or_default(),
            claim.card.encoded_at.as_ref().map(|s| format!(" at {s}")).unwrap_or_default(),
        );
        return Ok(());
    };
    let card_id = claim.card.id.clone();
    let give_back = |client: &mut api::ApiClient, failure: Option<(&str, &str)>| {
        let _ = client.release(&card_id, &lease.id, failure);
    };

    if !yes {
        let answer = prompt("  Does the printed card show this name and NIM? [y/N] ")?;
        if !answer.eq_ignore_ascii_case("y") {
            give_back(client, None);
            println!("  Skipped. Set the card aside and check it with HQ.");
            return Ok(());
        }
    }

    // The tag to talk to: the real reader, or (dry run) a simulator mirroring it.
    let mut real: Option<Acr122u> = None;
    let mut dry: Option<DryRun> = None;
    if let (Some(ctx), Some(name)) = (ctx, reader_name) {
        println!("  Tap the card on the reader…");
        let mut r = Acr122u::wait(ctx, name, Duration::from_secs(30))?;
        r.trace = cli.verbose;
        r.direct = direct;
        if dry_run {
            let sim = reader::mirror(&mut r).map_err(|e| anyhow!("Couldn't read the card: {e}"))?;
            dry = Some(DryRun { sim, direct, printed: 0, mask_pwd: true });
        } else {
            real = Some(r);
        }
    } else {
        let chip = parse_chip(sim_chip.unwrap_or("213"))?;
        dry = Some(DryRun { sim: SimTag::blank(chip, &[0x04, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66]), direct, printed: 0, mask_pwd: true });
    }
    if dry.is_some() {
        println!("  APDUs (not sent):");
    }
    let tag: &mut dyn Tag = match (&mut real, &mut dry) {
        (Some(r), _) => r,
        (None, Some(d)) => d,
        _ => unreachable!(),
    };

    let inspection = match ntag::inspect(tag) {
        Ok(t) => t,
        Err(e) => {
            give_back(client, Some((e.code(), e.detail())));
            bail!("{} Set this card aside.", explain_tag(&e));
        }
    };
    println!(
        "  {} · UID {} · {}{}",
        inspection.chip.kind.name(),
        inspection.uid,
        if inspection.protected { "password-protected" } else { "not protected" },
        inspection.url.as_ref().map(|u| format!(" · holds {u}")).unwrap_or_default()
    );
    // A chip carrying another PATS card's URL is the wrong physical card.
    if let Some(existing) = inspection.url.as_deref().and_then(qr::token_from_card_url) {
        if !claim.url.ends_with(&existing) && !reencode {
            give_back(client, Some(("CHIP_HAS_OTHER_CARD", existing.as_str())));
            bail!("This chip already holds another PATS card. Wrong card on the reader? Nothing was written.");
        }
    }

    let key = match client.key(&card_id, &lease.id, &inspection.uid) {
        Ok(k) => k,
        Err(e) => {
            give_back(client, None);
            return Err(e);
        }
    };
    let pwd: [u8; 4] = from_hex(&key.pwd).map_err(anyhow::Error::msg)?.try_into().map_err(|_| anyhow!("bad PWD from server"))?;
    let pack: [u8; 2] = from_hex(&key.pack).map_err(anyhow::Error::msg)?.try_into().map_err(|_| anyhow!("bad PACK from server"))?;
    if let Some(d) = dry.as_mut() {
        // The mirror can't read PWD/PACK; a protected card is assumed to carry the server's.
        if inspection.protected {
            let (pw, pk) = (d.sim.chip.pwd_page() as usize * 4, d.sim.chip.pack_page() as usize * 4);
            d.sim.memory[pw..pw + 4].copy_from_slice(&pwd);
            d.sim.memory[pk..pk + 2].copy_from_slice(&pack);
        }
    }
    let tag: &mut dyn Tag = match (&mut real, &mut dry) {
        (Some(r), _) => r,
        (None, Some(d)) => d,
        _ => unreachable!(),
    };

    println!("  Writing {} and protecting it…", key.url);
    let result = match ntag::write(tag, &inspection, &key.url, pwd, pack) {
        Ok(r) => r,
        Err(e) => {
            give_back(client, Some((e.code(), e.detail())));
            bail!("{} Nothing was reported to the server; the card is still {}.", explain_tag(&e), claim.card.status);
        }
    };

    if dry_run {
        give_back(client, None);
        println!("  Dry run finished: {} page writes planned. Nothing written, nothing reported.", result.pages_written);
        return Ok(());
    }
    let done = client.encoded(&card_id, &lease.id, &inspection.uid, result.protected_now, inspection.chip.kind.name())?;
    match done.batch {
        Some(b) => println!("✓ Encoded {} ({}). Batch {}: {}/{} encoded.", m.full_name, m.nim, b.label, b.encoded_count, b.card_count),
        None => println!("✓ Encoded {} ({}).", m.full_name, m.nim),
    }
    if let (Some(ctx), Some(name)) = (ctx, reader_name) {
        println!("  Remove the card.");
        while Acr122u::connect(ctx, name)?.is_some() {
            std::thread::sleep(Duration::from_millis(250));
        }
    }
    Ok(())
}

fn explain_tag(e: &ntag::TagError) -> String {
    use ntag::TagError::*;
    match e {
        NotNtag(d) => format!("This isn't an NTAG213/215/216 ({d})."),
        NotNdefFormatted(_) => "The chip isn't NDEF-formatted; the capability container would need writing, which we never do.".into(),
        ReadOnly(_) => "The chip is permanently read-only.".into(),
        LockBitsSet(_) => "Lock bits are set on this chip; it can't be written.".into(),
        WrongPassword(_) => "The chip is protected with another password.".into(),
        WriteFailed(d) => format!("A write failed ({d}). Keep the card still on the reader and try again."),
        VerifyFailed(d) => format!("Reading back didn't match ({d}). Try again."),
        ProtectFailed(_) => "The password couldn't be confirmed, so protection was switched off again. Try again.".into(),
        TagLost(d) => format!("The card left the reader ({d}). Tap it again and retry."),
    }
}

#[cfg(test)]
mod fixture {
    //! The same encode, step for step, as the phones' encoder (packages/shared/src/ntag.ts):
    //! both replay tests/fixtures/encode.json.
    use crate::ntag::{self, from_hex, hex, ChipType, SimTag, Tag};
    use serde_json::Value;

    #[test]
    fn matches_the_shared_command_fixture() {
        let raw = include_str!("../tests/fixtures/encode.json");
        let cases: Value = serde_json::from_str(raw).unwrap();
        for case in cases.as_array().unwrap() {
            let chip = ChipType::parse(case["chip"].as_str().unwrap()).unwrap();
            let uid: [u8; 7] = from_hex(case["uid"].as_str().unwrap()).unwrap().try_into().unwrap();
            let pwd: [u8; 4] = from_hex(case["pwd"].as_str().unwrap()).unwrap().try_into().unwrap();
            let pack: [u8; 2] = from_hex(case["pack"].as_str().unwrap()).unwrap().try_into().unwrap();
            let url = case["url"].as_str().unwrap();
            let mut tag = SimTag::blank(chip, &uid);
            if case["protected"].as_bool().unwrap() {
                let t = ntag::inspect(&mut tag).unwrap();
                ntag::write(&mut tag, &t, url, pwd, pack).unwrap();
                tag.reset();
                tag.commands.clear();
            }
            let t = ntag::inspect(&mut tag).unwrap();
            ntag::write(&mut tag, &t, case["url2"].as_str().unwrap_or(url), pwd, pack).unwrap();
            let got: Vec<String> = tag.commands.iter().map(|c| hex(c)).collect();
            let want: Vec<String> = case["commands"].as_array().unwrap().iter().map(|v| v.as_str().unwrap().to_string()).collect();
            assert_eq!(got, want, "case {}", case["name"]);
            let _ = tag.transceive(&ntag::cmd::read(0));
        }
    }
}

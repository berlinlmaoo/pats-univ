# PATS University

Aplikasi keanggotaan PATS: KTM ber-NFC, check-in event oleh admin, XP & leaderboard, reward, laporan PR, social hub per kota, reservasi venue, roaming antar kota, dan dashboard HQ.

Repo privat. Status: showcase prototype, dalam perencanaan. Prioritas pertama: sistem absensi berbasis kartu (Phase 0–2).

## Dokumen

- [docs/PRODUCT.md](docs/PRODUCT.md) — product requirements, aturan, data, keputusan.
- [docs/PLAN.md](docs/PLAN.md) — stack, arsitektur, struktur repo, fase build, risiko, aturan repo.

## Platform

- App member + local admin: Android dan iOS (satu codebase).
- Super admin dashboard dan web registrasi: web.
- Card Station: tool Mac (Rust) dengan reader ACR122U untuk encode kartu NTAG213.

## Branch

- `master` — rilis.
- `dev` — integrasi.
- `feat/*` — branch fitur pendek, dihapus setelah merge.

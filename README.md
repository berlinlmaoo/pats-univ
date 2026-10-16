# PATS University

Aplikasi keanggotaan PATS: KTM ber-NFC, check-in event oleh admin, XP & leaderboard, reward, laporan PR, social hub per kota, reservasi venue, roaming antar kota, dan dashboard HQ.

Repo privat. Status: showcase prototype — **Phase 0 selesai** (lihat [docs/PHASE0-REPORT.md](docs/PHASE0-REPORT.md)). Prioritas: sistem absensi berbasis kartu (Phase 0–2).

## Dokumen

- [docs/PRODUCT.md](docs/PRODUCT.md) — product requirements, aturan, data, keputusan.
- [docs/PLAN.md](docs/PLAN.md) — stack, arsitektur, struktur repo, fase build, risiko, aturan repo.
- [docs/DESIGN.md](docs/DESIGN.md) — design token, tipografi, komponen, checklist craft.
- [docs/STATUS.md](docs/STATUS.md) — progres per fase.
- [docs/INFRA-NEEDS.md](docs/INFRA-NEEDS.md) — kebutuhan hosting/DNS/database untuk sesi server.

## Struktur

| Path | Isi |
|---|---|
| `apps/web` | Next.js 16 (App Router) + Prisma 7 + PostgreSQL: API, `/join`, dashboard HQ |
| `apps/mobile` | Expo SDK 58 (React Native): app member + admin kota |
| `apps/realtime` | Placeholder server Socket.IO (Phase 4) |
| `packages/shared` | Design token, i18n EN/ID, validator, format angka/tanggal, NIM, setting |
| `tools/card-station` | Rust + PC/SC: encode kartu NTAG213 dengan ACR122U |
| `infra` | Docker Compose (postgres, minio, web, realtime) |

## Menjalankan lokal

Butuh Node 22+, pnpm 10, PostgreSQL 16.

```sh
pnpm install
cp apps/web/.env.example apps/web/.env      # isi AUTH_SECRET; OTP_PROVIDER=demo menampilkan kode di layar
createdb pats_univ
pnpm db:migrate && pnpm db:seed
pnpm dev:web                                 # http://localhost:3000/join, dashboard di /login
pnpm dev:mobile                              # Expo; app memakai server di port 3000 mesin yang sama
```

Akun demo (seed): HQ `hq@patsuniv.test`, admin kota `admin.jkt@patsuniv.test` / `admin.bdg@patsuniv.test`, member `rara.anindya@patsuniv.test` dst. Dengan `OTP_PROVIDER=demo` kode OTP tampil di layar.

Cek sebelum push: `pnpm typecheck && pnpm lint && pnpm test`, plus `cargo test` di `tools/card-station`.

## Branch

- `master` — rilis.
- `dev` — integrasi.
- `feat/*` — branch fitur pendek, dihapus setelah merge.

# PATS University

Aplikasi keanggotaan PATS: KTM ber-NFC, check-in event oleh admin, XP & leaderboard, reward, laporan PR, social hub per kota, reservasi venue, roaming antar kota, dan dashboard HQ.

Repo privat. Status: showcase prototype — implementasi Phase 0–5 tersedia; status verifikasi dan dependensi tersisa ada di [docs/STATUS.md](docs/STATUS.md).

18 Oktober 2026: app iOS native SwiftUI tersedia di [`apps/ios`](apps/ios/README.md).
Expo dipertahankan sebagai referensi fitur; backend tetap. Status dan batas QA native:
[`docs/IOS-NATIVE.md`](docs/IOS-NATIVE.md). Build iOS saat ini hanya compile, tanpa simulator.

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
| `apps/mobile` | Expo SDK 58 (React Native): referensi fitur member + admin kota |
| `apps/ios` | App native SwiftUI member/admin/HQ, XcodeGen, Core NFC |
| `apps/realtime` | Server Socket.IO untuk chat dan invalidasi data live |
| `packages/shared` | Design token, i18n EN/ID, validator, format angka/tanggal, NIM, setting |
| `tools/card-station` | Rust + PC/SC: encode kartu NTAG213 dengan ACR122U |
| `infra` | Docker Compose (postgres, web, realtime, volume storage lokal) |

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

Cek sebelum push: `pnpm typecheck && pnpm lint && pnpm test`, plus `cargo test` di `tools/card-station`. Matriks interaksi check-in (butuh `pnpm dev:web` jalan): `pnpm --filter @pats/web e2e:checkin`.

## Branch

- `master` — rilis.
- `dev` — integrasi.
- `feat/*` — branch fitur pendek, dihapus setelah merge.

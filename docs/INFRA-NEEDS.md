# PATS University — kebutuhan infrastruktur

Untuk sesi server utama (NEXUS coordinator). Ditulis di akhir Phase 0, 16 Okt 2026. Belum ada yang dipasang di prod; semua menunggu "go" dari Berlin.

## 1. Domain & TLS

- **`patsuniv.znetworks.id`** → reverse proxy → container `web` (port host `127.0.0.1:3100`).
- Domain ini **permanen**: URL kartu `https://patsuniv.znetworks.id/c/<token>` ditulis ke chip NFC (PRODUCT.md §10.7). Jangan pernah dilepas; bila kelak pindah domain, tetap redirect.
- TLS wajib (HTTPS); HSTS boleh.
- Header yang harus diteruskan proxy: `X-Forwarded-For` (rate limit OTP per IP), `X-Forwarded-Proto`, `Host`.
- Path yang nanti dipakai (Phase 2): `/.well-known/apple-app-site-association`, `/.well-known/assetlinks.json` — disajikan oleh `web`, proxy tidak boleh mencegatnya.
- Realtime (Phase 4) di container `realtime` (`127.0.0.1:3101`); untuk sekarang cukup route `/socket.io/` disiapkan, belum dipakai.

## 2. Container

`infra/docker-compose.yml`: `postgres` (16), `minio`, `web` (build `apps/web/Dockerfile` dari root repo), `realtime` (placeholder). `web` menjalankan `prisma migrate deploy` saat start. Healthcheck: `GET /api/health` → `{"ok":true}`.

## 3. Env `web` (file `infra/.env`, lihat `infra/.env.example`)

| Key | Isi |
|---|---|
| `POSTGRES_PASSWORD` | acak |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | acak (dipakai mulai Phase 2–3) |
| `APP_URL` | `https://patsuniv.znetworks.id` |
| `AUTH_SECRET` | `openssl rand -base64 48` — jangan diganti setelah live (semua sesi & OTP aktif jadi invalid) |
| `OTP_PROVIDER` | `demo` untuk showcase; `email` setelah SMTP siap |
| `SMTP_HOST` `SMTP_PORT` `SMTP_SECURE` `SMTP_USER` `SMTP_PASS` `SMTP_FROM` | akun SMTP PATS / relay yang sudah ada. Pengirim `no-reply@patsuniv.znetworks.id` (atau domain lain milik PATS) |

## 4. Email

- SPF + DKIM (+ DMARC) untuk domain pengirim, supaya OTP tidak masuk spam (risiko di PLAN.md §5).
- Volume: OTP + email selamat datang, puluhan–ratusan per hari saat event.

## 5. Database & backup

- PostgreSQL 16, satu database `pats_univ`. Ukuran kecil di prototype.
- Backup harian + retensi seperti NEXUS. Data pribadi member (nama, tanggal lahir, email, WA) ada di sini.

## 6. Seed

Setelah migrasi pertama di server: `pnpm db:seed` membuat 3 kota contoh, akun HQ (`SEED_SUPER_ADMIN_EMAIL`), 2 admin kota, 20 member demo, 2 venue, 3 event. Untuk prod sungguhan, kota & akun HQ asli diisi lewat dashboard dan seed member demo **tidak** dijalankan.

## 7. Nanti (bukan sekarang)

- Phase 2: object storage (MinIO / S3) untuk file cetak kartu; Chromium headless untuk render PDF; universal link files.
- Phase 2: cron (systemd timer) memanggil `/api/cron/*` untuk reminder push.
- Phase 4: WebSocket (`/socket.io/`) lewat proxy.

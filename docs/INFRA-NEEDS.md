# PATS University — kebutuhan infrastruktur

Untuk sesi server utama (NEXUS coordinator). Ditulis di akhir Phase 0, diperbarui di akhir Phase 4 (16 Okt 2026). Belum ada yang dipasang di prod; semua menunggu "go" dari Berlin. **Hosting hanya internal (Tailscale)**: jangan pasang DNS publik atau tunnel publik tanpa keputusan baru dari Berlin.

## 1. Domain & TLS

- **`patsuniv.znetworks.id`** → reverse proxy → container `web` (port host `127.0.0.1:3100`).
- Domain ini **permanen**: URL kartu `https://patsuniv.znetworks.id/c/<token>` ditulis ke chip NFC (PRODUCT.md §10.7). Jangan pernah dilepas; bila kelak pindah domain, tetap redirect.
- TLS wajib (HTTPS); HSTS boleh.
- Header yang harus diteruskan proxy: `X-Forwarded-For` (rate limit OTP per IP), `X-Forwarded-Proto`, `Host`.
- `/.well-known/apple-app-site-association` dan `/.well-known/assetlinks.json` disajikan oleh `web` (404 selama `APPLE_TEAM_ID` / `ANDROID_CERT_SHA256` kosong); proxy tidak boleh mencegatnya. Catatan: Apple memverifikasi universal link lewat CDN publik, jadi selama hosting hanya Tailscale universal link hanya jalan di HP dengan Developer Mode (lihat NFC-DEV-BUILD.md §6).
- Realtime (Phase 4) di container `realtime` (`127.0.0.1:3101`); route `/socket.io/` sekarang dipakai dan harus meneruskan HTTP Upgrade/WebSocket serta polling Socket.IO.

## 2. Container

`infra/docker-compose.yml`: `postgres` (16), `web` (build `apps/web/Dockerfile` dari root repo), `realtime` (build `apps/realtime/Dockerfile`, Node + Socket.IO). `web` menjalankan `prisma migrate deploy` saat start. Healthcheck: `GET /api/health` → `{"ok":true}`.

- **MinIO dihapus** (image `minio/minio` sudah tidak bisa di-pull). File (PDF cetak kartu, flyer event) disimpan lewat antarmuka storage dengan driver **local disk** di volume Docker `storage` (`/data/storage` di container). Driver **S3-compatible** sudah ada di balik config (`STORAGE_DRIVER=s3` + `S3_*`) bila nanti dipindah ke bucket.
- Image `web` sekarang memasang **Chromium** (paket `chromium` Debian) untuk render PDF kartu; `CHROMIUM_PATH=/usr/bin/chromium`. Ukuran image naik ±300 MB.
- Volume `storage` **wajib di-backup** bersama database (file cetak bisa dibuat ulang dari data, flyer tidak).

## 3. Env `web` (file `infra/.env`, lihat `infra/.env.example`)

| Key | Isi |
|---|---|
| `POSTGRES_PASSWORD` | acak |
| `APP_URL` | `https://patsuniv.znetworks.id` |
| `AUTH_SECRET` | `openssl rand -base64 48` — jangan diganti setelah live (semua sesi & OTP aktif jadi invalid) |
| `OTP_PROVIDER` | `demo` untuk showcase; `email` setelah SMTP siap |
| `SMTP_HOST` `SMTP_PORT` `SMTP_SECURE` `SMTP_USER` `SMTP_PASS` `SMTP_FROM` | akun SMTP PATS / relay yang sudah ada. Pengirim `no-reply@patsuniv.znetworks.id` (atau domain lain milik PATS) |
| `CARD_KEY_SECRET` | `openssl rand -base64 48`. **Tidak boleh diganti selamanya** setelah kartu pertama di-encode: semua token kartu dan password NTAG diturunkan darinya. Simpan di password manager. Server produksi menolak start tanpa ini |
| `CRON_SECRET` | `openssl rand -hex 24`, dikirim systemd timer ke `/api/cron/notifications` (Phase 2) dan `/api/cron/loyalty` (Phase 3), serta `/api/cron/social` (Phase 4) |
| `STORAGE_DRIVER` | `local` (default). `s3` + `S3_ENDPOINT` `S3_REGION` `S3_BUCKET` `S3_ACCESS_KEY_ID` `S3_SECRET_ACCESS_KEY` bila pakai bucket |
| `PUSH_PROVIDER` | `expo` (default); `EXPO_ACCESS_TOKEN` opsional |
| `APPLE_TEAM_ID` / `ANDROID_CERT_SHA256` | untuk `/.well-known` (Team ID akun galangprata19; fingerprint sertifikat APK) |

## 4. Email

- SPF + DKIM (+ DMARC) untuk domain pengirim, supaya OTP tidak masuk spam (risiko di PLAN.md §5).
- Volume: OTP + email selamat datang, puluhan–ratusan per hari saat event.

## 5. Database & backup

- PostgreSQL 16, satu database `pats_univ`. Ukuran kecil di prototype.
- Backup harian + retensi seperti NEXUS. Data pribadi member (nama, tanggal lahir, email, WA) ada di sini.

## 6. Seed

Setelah migrasi pertama di server: `pnpm db:seed` membuat 3 kota contoh, akun HQ (`SEED_SUPER_ADMIN_EMAIL`), 2 admin kota, 20 member demo, 2 venue, 3 event. Untuk prod sungguhan, kota & akun HQ asli diisi lewat dashboard dan seed member demo **tidak** dijalankan.

## 7. Cron (Phase 2)

systemd timer tiap 5 menit (reminder H-3/H-1/H jam 10.00 dan follow-up H+1 jam 12.00, waktu kota; tiap pesan hanya terkirim sekali):

```ini
# /etc/systemd/system/pats-cron.service
[Service]
Type=oneshot
EnvironmentFile=/srv/pats-univ/infra/.env
ExecStart=/usr/bin/curl -fsS -X POST -H "Authorization: Bearer ${CRON_SECRET}" http://127.0.0.1:3100/api/cron/notifications

# /etc/systemd/system/pats-cron.timer
[Timer]
OnCalendar=*:0/5
Persistent=true
[Install]
WantedBy=timers.target
```

Push keluar ke `https://exp.host` (Expo Push) → butuh egress HTTPS dari container `web`.

**Phase 3:** timer kedua tiap menit untuk `/api/cron/loyalty` (refund kode kedaluwarsa + snapshot leaderboard per jam), secret yang sama. Contoh unit: `infra/systemd/pats-loyalty.*` + `infra/run-loyalty-cron.sh`; sesuaikan path/port saat deploy.

## 8. Realtime dan cron social (Phase 4)

- `REALTIME_PUBLIC_URL` di web/Compose adalah origin yang dapat dijangkau browser dan HP melalui Tailscale, misalnya `https://patsuniv.znetworks.id`; proxy `/socket.io/` ke `127.0.0.1:3101`. Nama env “PUBLIC” berarti alamat klien, bukan instruksi membuka hosting ke internet.
- `REALTIME_INTERNAL_URL=http://realtime:4000` untuk web dalam Compose. `API_URL=http://web:3000` untuk service realtime. Jangan teruskan endpoint internal `/publish` lewat proxy.
- `AUTH_SECRET` wajib sama di kedua service. `REALTIME_SECRET` acak minimal 32 karakter juga sama; dipakai untuk publish internal. `CORS_ORIGINS` cocok dengan origin dashboard. Health realtime: `/health`.
- Service realtime memverifikasi JWT, sesi, akses room, dan expiry melalui API web; tidak memerlukan akses langsung database atau storage.
- Pasang `infra/systemd/pats-social.*` dan `infra/run-social-cron.sh`, sesuaikan path: timer tiap menit memakai `CRON_SECRET` untuk expiry roaming dan purge chat melebihi retensi. Media menggunakan volume storage/bucket Phase 2 yang sama; backup tetap wajib.
- Docker image, proxy dan timer belum dijalankan pada pengujian lokal Phase 4. Tidak ada perubahan hosting atau DNS dari branch ini.

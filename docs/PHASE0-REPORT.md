# Phase 0 — Laporan

16 Okt 2026 · branch `feat/phase-0` → `dev`. Acuan: [PLAN.md §4 Phase 0](PLAN.md).

## 1. Ringkasan

Phase 0 sudah selesai sesuai plan. Yang sudah ada:

- **Monorepo** (pnpm workspaces):
  - `apps/web`: Next.js 16 + Prisma 7 + PostgreSQL
  - `apps/mobile`: Expo SDK 58
  - `apps/realtime`: placeholder
  - `packages/shared`
  - `tools/card-station`: Rust
- **Infra:** Docker Compose dan CI GitHub Actions.
- **Design token** didefinisikan sekali di `packages/shared`, lalu dipakai web, app, email, dan `app.config.ts`. Aturannya ditulis di [DESIGN.md](DESIGN.md).
- **Auth email + OTP 6 digit:**
  - Provider `email` (SMTP) dan `demo` (kode tampil di layar).
  - Provider HP baru berupa antarmuka.
  - App memakai JWT access + refresh token yang dirotasi; dashboard memakai cookie sesi.
  - Pembatasan akses per role dan kota sudah ada.
- **Web registrasi `/join`:**
  - Alur: form → OTP email → cek umur → NIM → halaman sukses berisi link grup WA kota + link app → email selamat datang.
- **Dashboard HQ:** login, Ringkasan, Member (list + detail + edit + nonaktifkan), Kota & venue, Admin kota, dan Pengaturan (semua key §9).
- **App:**
  - Login email + OTP dan routing berdasarkan role.
  - Bahasa ID/EN.
  - Tab member: Kartu (KTM digital), Event, Reward, Hub, Profil.
  - Menu admin kota (alat crew masih ditandai "Segera").

## 2. Demo Phase 0 (sesuai plan)

```sh
pnpm install
cp apps/web/.env.example apps/web/.env      # isi AUTH_SECRET dan DATABASE_URL; OTP_PROVIDER=demo
createdb pats_univ && pnpm db:migrate && pnpm db:seed
pnpm dev:web          # terminal 1
pnpm dev:mobile       # terminal 2, tekan i untuk simulator iOS
```

1. Buka `http://localhost:3000/join?src=jkt-venue` (QR venue). Kota Jakarta otomatis terpilih.
2. Isi form → klik **Lanjut** → kode OTP tampil di layar (mode demo) → masukkan kode.
3. Halaman sukses menampilkan NIM (mis. `JKT2600011`), tombol **Buka grup WhatsApp** kota, info app, dan info kartu fisik.
4. Di app, login dengan email yang sama → kode → tab **Kartu** menampilkan KTM digital (nama, NIM, kota, tanggal bergabung, status kartu fisik). Tab **Profil** menampilkan data lengkap.
5. Buka `http://localhost:3000/login` dan login sebagai `hq@patsuniv.test`. Member baru muncul di **Ringkasan** dan **Member**.
6. Di **Pengaturan**, ubah **Umur minimum** ke 21 → Simpan. Registrasi dengan umur 18–20 sekarang ditolak dan datanya tidak disimpan.

Akun seed:

| Peran | Email |
|---|---|
| HQ | `hq@patsuniv.test` |
| Admin kota Jakarta | `admin.jkt@patsuniv.test` |
| Admin kota Bandung | `admin.bdg@patsuniv.test` |
| Member | `rara.anindya@patsuniv.test` dan 19 member lain (`<nama.depan>.<belakang>@patsuniv.test`) |

## 3. Yang sudah dibangun

### 3.1 Data (`apps/web/prisma`)

- Schema mencakup **semua entitas PRODUCT §7**, termasuk yang baru dipakai di Phase 1–4. Semuanya ada di migrasi awal.
- Ada partial unique index yang tidak bisa ditulis di Prisma; ditambahkan manual di SQL migrasi:
  - satu kartu `DELIVERED` per member,
  - satu reservasi `CONFIRMED` per slot per event,
  - satu request roaming aktif per member/event/jenis.
- Tabel tambahan di luar daftar §7 (detail teknis):

  | Tabel | Fungsi |
  |---|---|
  | `Session` | Refresh token app dan sesi dashboard, disimpan sebagai hash; HQ bisa mencabutnya |
  | `NimSequence` | Counter NIM per kota per tahun, atomik |
  | `UsedNonce` | Nonce QR app (Phase 1) |
  | `ScreenshotEvent` | Pelanggaran screenshot di hub (Phase 4) |

- Field tambahan di luar daftar §7:
  - `User`: `name`, `locale`, `lastLoginAt`
  - `Member`: `signupSource` (isi `?src=`), `consentAt`
  - `Event`: `capacity` (kuota opsional §4.2)
- **Seed:** 3 kota (JKT, BDG, SBY — SBY sengaja tanpa link WA untuk demo kondisi kosong), 1 HQ, 2 admin kota, 20 member dengan NIM berurutan, 2 venue dengan denah contoh, 3 event mendatang, dan semua setting di nilai default.

### 3.2 Auth

- **OTP:**
  - Hanya hash kode (HMAC) yang disimpan. Kode berlaku 5 menit, maksimal 5 percobaan.
  - Kode lama otomatis mati saat kode baru diminta.
  - Kirim ulang baru bisa setelah 60 detik; maksimal 5 kode per email per jam dan 40 per IP per jam.
  - Kode yang gagal terkirim tidak dihitung ke cooldown.
- **Provider:**
  - `OTP_PROVIDER=email` memakai SMTP (nodemailer) dengan template EN/ID.
  - `demo` mengembalikan kode ke layar.
  - `whatsapp-bridge` dan `cloud-api` sudah punya antarmuka, tetapi melempar error "belum dibangun".
- **App:** access JWT 15 menit + refresh token 60 hari yang dirotasi. Pemakaian ulang refresh token lama ditolak. Logout mencabut sesi.
- **Dashboard:** cookie httpOnly 14 hari.
- **Pembatasan akses:**
  - Dashboard khusus `SUPER_ADMIN`.
  - App untuk `MEMBER` dan `LOCAL_ADMIN`; akun HQ ditolak dengan pesan yang jelas.
  - Helper `requireApiUser(req, roles)` dan `requireCityAccess` siap dipakai endpoint Phase 1.
- **Penonaktifan:** menonaktifkan member atau admin langsung mencabut semua sesinya.

### 3.3 Registrasi

- **Validasi** form dijalankan di klien dan server memakai validator yang sama (`packages/shared`). Nomor WA dinormalkan ke E.164 (`0812…` → `+62812…`).
- **Sebelum OTP dikirim**, server sudah mengecek kota, umur (`minAge`), dan email belum terpakai. Jadi tidak ada kode yang terkirim untuk pendaftaran yang pasti ditolak, dan **tidak ada data yang tersimpan** sebelum email terverifikasi.
- **Pembuatan akun:** NIM dialokasikan dalam satu transaksi bersama User + Member + Card (`NOT_PRINTED`) + AuditLog. Formatnya `<kota><yy><5 digit>`, sesuai usulan §6.8, dan hanya didefinisikan di satu helper.
- **Routing WA:** halaman sukses dan email selamat datang menampilkan `City.waGroupUrl`. Kalau kota belum punya link, muncul pesan "crew akan membagikan link".

### 3.4 Dashboard HQ

- **Halaman yang sudah ada:** Ringkasan, Member, Kota & venue, Admin kota, Pengaturan.
  - **Ringkasan:** angka per kota dan pendaftar terbaru.
  - **Member:** cari dan filter (tersimpan di URL), detail, edit data inti (NIM tidak berubah), nonaktifkan/aktifkan lagi.
  - **Kota & venue:** tambah/ubah kota. Kode kota terkunci begitu sudah ada member. Venue baru tampil daftarnya.
  - **Admin kota:** tambah dan nonaktifkan.
  - **Pengaturan:** semua key §9 plus link App Store / Google Play. Nilai divalidasi per key, yang masih TBD ditandai "Sementara", dan setiap perubahan tercatat di audit log.
- **Kartu dan Event** belum muncul di menu dan akan ditambahkan saat dibangun (aturan: tidak ada layar setengah jadi).

### 3.5 App (Expo)

- **Login:** email → OTP enam kotak (autofill one-time-code, auto-submit) → masuk sesuai role.
- **Sesi:** token disimpan di Keychain/Keystore (`expo-secure-store`). Data akun di-cache supaya app tetap terbuka saat offline, dengan banner offline.
- **Bahasa:** ID/EN mengikuti bahasa perangkat dan bisa diganti di Profil maupun di layar login.
- **Tab yang belum berisi** (Event, Reward, Hub) menampilkan empty state yang menjelaskan isinya nanti.
- **Admin kota:** tab Admin berisi daftar alat crew (Scan, Serah terima kartu, Event, Validasi reward) yang masih "Segera", plus tab Profil.

### 3.6 Card Station (Rust)

- **Perintah yang sudah jalan:**

  | Perintah | Fungsi |
  |---|---|
  | `readers` | Cek reader ACR122U |
  | `uid` | Baca UID kartu (read-only) |
  | `ndef-preview` | Tampilkan halaman yang akan ditulis tanpa menulis apa pun |
  | `lookup` | Parse URL cetakan atau NIM |
  | `ping` | Cek API |
  | `encode` | Belum ada; jelas ditandai Phase 2 |

- **Modul `ntag213`:** builder APDU (READ/WRITE/PWD_AUTH) dan encoder NDEF URI, lengkap dengan test. Test memastikan URL kartu final muat di 144 byte dan bahwa proteksi tidak pernah menyentuh halaman lock.
- **README** berisi setup macOS untuk ACR122U.

## 4. Verifikasi

| Cek | Hasil |
|---|---|
| Typecheck semua package | lolos |
| Lint (web + app) | lolos |
| Unit test | `packages/shared` 12, `apps/web` 3, Card Station 7 — semua lolos |
| `next build` (production) | lolos |
| `expo-doctor` | 20/20 lolos |
| `cargo clippy -D warnings` | lolos |
| API end-to-end (curl) | Registrasi: umur kurang, email terpakai, validasi, cooldown, kode salah, kode benar → NIM, kode dipakai ulang. Login app: refresh berotasi, refresh lama ditolak, logout mencabut sesi. HQ via app ditolak, email tak dikenal ditolak |
| OTP via SMTP | Diuji ke server SMTP lokal: email OTP (ID) diterima, login dengan kode dari email berhasil, email selamat datang (EN) terkirim tanpa link WA untuk SBY |
| HQ ubah `minAge` | Via dashboard: 12 ditolak ("antara 13 dan 99"), 21 tersimpan + audit log; registrasi umur 20 lalu ditolak dengan "21" dan data tidak disimpan |
| Visual web | Screenshot otomatis 390 px dan 1440 px, ID/EN, terang/gelap, untuk semua halaman, dialog, empty state, dan error form. Plus cek otomatis teks terpotong dan scroll horizontal → **0 temuan** setelah perbaikan |
| App di simulator iOS | iPhone 17 (iOS 27) lewat Expo Go: layar login dan OTP tampil benar di mode terang dan gelap, keyboard angka muncul otomatis |
| App setelah login | Seluruh alur (login member → 5 tab → ganti bahasa; login admin kota → menu Admin + Profil; akun HQ ditolak) dijalankan dengan kode app yang sama di renderer web melawan API asli |

Masalah yang ketemu saat QA dan sudah dibereskan:

- **Dashboard:**
  - Wordmark sidebar terpotong.
  - Tabel per-kota terlalu sempit.
  - Satuan "peringkat" menimpa angka di Pengaturan.
  - Tabel member dan kota bisa di-scroll horizontal di HP.
  - Hint kode kota terduplikasi.
  - Validasi browser menutupi pesan error di Pengaturan.
- **App:**
  - Label tab bar terpotong (renderer web).
  - Pesan penolakan HQ di app memakai teks untuk dashboard.
  - Toggle bahasa di layar login membingungkan.
- **Format:**
  - Nomor WA belum diformat (sekarang `+62 813-2222-3333`).
  - Default pengaturan tampil mentah (`MONTHLY` → `Bulanan`).
- **Lain-lain:**
  - Warna di `app.config.ts` tidak bisa membaca token TS. Palet sekarang di `colors.json` dan tetap jadi satu sumber.
  - `next dev` menulis file tambahan ke repo; sudah dimatikan.

## 5. Yang belum diverifikasi / catatan jujur

- **Layar app setelah login belum disentuh langsung di simulator.** Mac ini tidak punya alat tap/ketik untuk simulator (tidak ada Simulator GUI, idb, atau maestro). Layar login dan OTP sudah dicek native; layar sesudah login dicek lewat renderer web dengan kode yang sama. **Mohon dicoba sekali di HP lewat Expo Go** (`pnpm dev:mobile`, scan QR).
- **Android belum dijalankan** (aturan maksimal satu simulator). Kodenya sama dengan iOS lewat Expo Go.
- **Docker Compose dan Dockerfile belum dites** karena Docker tidak terpasang di Mac ini. Perlu dicoba di server.
- **CI belum jalan di GitHub** karena branch belum di-push.
- **SMTP asli belum ada kredensialnya.** Default lokal `OTP_PROVIDER=demo`, dan provider `email` sudah teruji dengan SMTP lokal.
- **ACR122U belum dicolok,** jadi `card-station readers` hanya melaporkan "No readers found".
- **Lingkungan Mac:**
  - Node di Mac versi 26; Prisma memberi peringatan karena resminya mendukung 20.19/22.12/24, tetapi semuanya jalan. `.nvmrc` = 22 dan Docker memakai Node 22.
  - Rust dipasang lewat Homebrew `rustup` (keg-only). PATH ada di README Card Station.
- **DB lokal** `pats_univ` masih berisi beberapa member hasil tes selain seed. Reset dengan `pnpm db:reset` kalau perlu (butuh konfirmasi kamu).

## 6. Keputusan kecil yang diambil (bisa diubah)

1. **Token desain** ada di `packages/shared` (`tokens.ts` + `colors.json`), bukan package `ui-tokens` terpisah (PLAN §6.11). Aksennya violet NEXUS `#7b68ee`.
2. **Setting per kota** disimpan di tabel `Setting` (scope `CITY`), bukan `City.settings` JSON, supaya cuma ada satu sumber.
3. **Form `/join`:** lagu dan genre favorit wajib, quote opsional. Ada centang persetujuan penyimpanan data; halaman kebijakan privasi menunggu T12.
4. **Akun:** dashboard hanya untuk HQ; app untuk member dan admin kota.
5. **Link app** (App Store / Google Play) dijadikan setting. Selama kosong, halaman sukses menulis "app masih uji coba terbatas".
6. **Logo** masih placeholder "PU" (wordmark + ikon app) sampai brand final (T13).
7. **Kota seed** (Jakarta, Bandung, Surabaya) adalah placeholder sampai D2/T7.

## 7. Butuh dari Berlin

| Kebutuhan | Detail |
|---|---|
| **"Go" untuk sesi server** | DNS + tunnel `patsuniv.znetworks.id`, database, hosting, backup. Detail di [INFRA-NEEDS.md](INFRA-NEEDS.md) |
| **Kredensial SMTP** | Plus domain pengirim dengan SPF/DKIM untuk `OTP_PROVIDER=email` |
| **D2** | Daftar kota awal + kode 3 huruf |
| **D3** | Akun Apple Developer dan Google Play, untuk build TestFlight/APK di Phase 2 (NFC butuh development build) |
| **T12** | Teks kebijakan privasi |
| **T13** | Logo/brand |
| **"Go" Phase 1** | Kartu digital (QR berputar), scan admin, check-in |

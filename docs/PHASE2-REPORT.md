# Phase 2 — Laporan

16 Okt 2026 · branch `feat/phase-2` → `dev`. Acuan: [PLAN.md §4 Phase 2](PLAN.md), plus tambahan owner 16 Okt (encode di HP, permintaan encode ulang, encode paralel, NTAG215/216).

## 1. Ringkasan

Phase 2 sudah selesai. Kartu fisik sekarang punya alur penuh dari antrean sampai pintu event:

- **Halaman Kartu di dashboard HQ:** antrean cetak per kota → batch (token kartu dibuat) → **file cetak** (PDF per member, PDF batch, CSV manifest vendor) → dikirim ke vendor → kembali di HQ → progres encode live per batch, dengan stasiun yang meng-encode tiap kartu → dikirim ke kota → daftar kartu yang belum diserahkan → permintaan encode ulang dari kota.
- **File cetak:** CR80 85,6 × 54 mm + bleed 3 mm (halaman PDF tepat 91,6 × 60 mm, TrimBox/BleedBox terpasang), 300 dpi, depan + belakang, hanya nama + NIM + QR. Artwork tim belum ada, jadi dipakai **placeholder** dari token brand + crest; template tinggal diganti foldernya (`CARD_TEMPLATE_DIR`).
- **Card Station (Rust, Mac + ACR122U):** login HQ, pilih batch, identifikasi kartu (QR cetakan lewat scanner USB/kamera Mac, atau NIM), cocokkan nama, tap → tulis NDEF + proteksi PWD/PACK + ikat UID → `ENCODED`. Mode re-encode, `--dry-run` yang mencetak APDU persis, perintah read-only `status` dan `read`.
- **NTAG213, 215, 216** didukung (vendor kehabisan 213): chip dideteksi, halaman config per chip, Lock Control TLV pabrik dipertahankan, jenis chip disimpan per kartu.
- **Encode di HP** untuk Super Admin (app → Admin → Encode kartu), dengan logika encode yang sama persis dengan Card Station (diuji terhadap satu fixture perintah yang sama).
- **Encode paralel** Mac + beberapa HP di satu batch: server memberi **lease** per kartu (3 menit); encode idempoten.
- **Permintaan encode ulang** oleh admin kota → antrean HQ → izin **sekali pakai 24 jam** di HP admin itu. Dibatasi capability, bukan role (S1 belum diputuskan). Chip mati → **Laporkan hilang/rusak** → `REVOKED` + kartu pengganti di antrean.
- **NFC di app admin** (development build): **check-in tap kartu** (NFC → QR app → manual, berurutan di UI), **serahkan kartu** (tap → `DELIVERED`).
- **`/c/<token>`**: halaman profil ringkas di web + layar deep link di app; AASA dan assetlinks disajikan dari `/.well-known`.
- **Push:** registrasi device, Expo Push, pusat notifikasi, pengaturan kategori, broadcast event dari dashboard (+ flyer), cron reminder H-3/H-1/H dan follow-up H+1 12.00 (terima kasih / FOMO), copy per kota (EN/ID) dari dashboard.
- **Audit metode check-in** di daftar event (porsi NFC / QR app / manual per event) dan di detail event.
- **Storage:** antarmuka storage dengan driver local disk (volume Docker) + driver S3-compatible di balik config. **MinIO dihapus** dari Docker Compose.

Tidak ada kartu fisik yang ditulis, dikunci, atau diberi password selama build. Semua penulisan diuji di simulator chip dan dry-run; uji kartu sungguhan menunggu owner (§3).

## 2. Demo Phase 2

```sh
pnpm install
pnpm db:migrate        # migrasi phase2_cards_push
pnpm dev:web           # OTP_PROVIDER=demo, PUSH_PROVIDER=log untuk lokal
```

Dashboard `http://localhost:3000/login` sebagai `hq@patsuniv.test`.

1. **Antrean → batch.** **Kartu → Antrean** → pilih kota (mis. Bandung) → semua member terpilih → **Buat batch** → konfirmasi. Halaman batch (`BDG-1`) terbuka dengan file cetak sudah jadi.
2. **File cetak.** **PDF batch** (2 halaman per member), **Manifest (CSV)**, PDF per member (ikon dokumen di tiap baris), **Pratinjau dengan garis bantu** (garis potong merah, area aman biru). Cek ukuran di Preview/Acrobat: 91,6 × 60 mm, TrimBox 85,6 × 54 mm.
3. **Vendor.** **Tandai dikirim ke vendor** → **Tandai kembali di HQ** (untuk demo: cetak QR dari PDF di stiker/label, tempel di NTAG kosong).
4. **Encode di Mac.**
   ```sh
   cd tools/card-station && cargo build --release
   ./target/release/card-station login --email hq@patsuniv.test --api http://localhost:3000
   ./target/release/card-station encode --batch BDG-1 --api http://localhost:3000
   ```
   Scan QR cetakan (atau ketik NIM) → nama & NIM tampil → **y** → tempel kartu → `✓ Encoded … 1/10`. Dashboard batch menampilkan progres dan "Di-encode oleh Mac Card Station (…)".
5. **Encode di HP bersamaan.** App (development build) login `hq@patsuniv.test` → **Admin → Encode kartu** → pilih batch → scan QR cetakan → **Tempel kartu untuk encode**. Kartu yang sedang dipegang stasiun lain ditolak dengan nama stasiunnya.
6. **Kartu salah.** Scan QR kartu A lalu tempelkan kartu B yang sudah ter-encode → ditolak ("chip already holds another PATS card" / `UID_IN_USE`). Scan kartu yang sudah ter-encode → "Already encoded … Nothing written".
7. **Proteksi.** App NFC umum (NFC Tools) gagal menulis kartu; `card-station encode --reencode` berhasil menulis ulang kartu yang sama.
8. **Kirim ke kota.** Setelah semua ter-encode: **Tandai dikirim ke kota** → member mendapat notifikasi "KTM kamu sudah sampai di Bandung".
9. **Serah terima.** App login `admin.bdg@patsuniv.test` → **Admin → Serahkan kartu** → tempel kartu → nama & NIM tampil → **Kartu sudah diserahkan** → status `Diserahkan`, member dapat notifikasi "KTM kamu sudah aktif".
10. **Check-in NFC.** Buka check-in event → **Scan check-in** → **Tempel kartu (NFC)** → konfirmasi → tercatat metode **Kartu NFC**; daftar event di dashboard menampilkan porsi NFC.
11. **Kartu hilang.** **Admin → Kartu hilang atau rusak** → cari member → **Laporkan hilang atau rusak** + alasan → kartu dicabut; tap kartu itu di scanner → ditolak; member masuk antrean lagi dengan label **Pengganti**.
12. **Encode ulang.** Kartu lain yang sudah diserahkan → **Minta encode ulang** + alasan → dashboard **Kartu → Permintaan encode ulang** (ada badge di menu) → **Setujui** → admin dapat notifikasi → **Encode sekarang** di HP admin → tempel → selesai; izin tidak bisa dipakai lagi.
13. **Tap kartu sendiri di iPhone.** Banner NDEF → membuka app (universal link, butuh domain terverifikasi, lihat NFC-DEV-BUILD §6) atau halaman `/c/<token>`.
14. **Push.** Event → **Broadcast** → pilih kota → kirim. Reminder/follow-up: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/notifications`. Dengan `PUSH_PROVIDER=log` notifikasi tetap masuk **Notifikasi** di app.

## 3. Uji hardware oleh owner

Langkah lengkap (build ke iPhone lewat Xcode, APK Android, App ID & capability di akun Apple galangprata19, skrip uji 20 langkah dengan NTAG kosong + ACR122U): **[NFC-DEV-BUILD.md](NFC-DEV-BUILD.md)**.

Ringkasnya, urutan yang paling penting dicoba dulu:

1. `card-station status` dengan kartu kosong dan kartu R&D (read-only).
2. `card-station encode --dry-run` lalu encode **satu** kartu sungguhan; `status` lagi → AUTH0 `04`, URL kartu, Lock Control TLV tetap.
3. Tempel ke iPhone (baca background), coba tulis dengan app NFC umum (harus gagal), re-encode dengan Card Station (harus berhasil).
4. Encode di HP HQ, serah terima, check-in NFC, laporkan hilang, encode ulang dengan izin.

Kalau re-encode gagal dengan NAK pada WRITE pertama, ulangi dengan `--direct` (lihat README Card Station).

## 4. Yang sudah dibangun

### 4.1 Data (migrasi `20261016120000_phase2_cards_push`)

- `Card`: `chipType`, lease (`leaseId`, `leaseStation`, `leaseUserId`, `leaseExpiresAt`, `leaseMode`, `leaseGrantId`), `encodedStation`, `replacesCardId`.
- `CardBatch`: `number` per kota (label `JKT-3`), `filesGeneratedAt`, `filesError`.
- Tabel baru `ReencodeRequest` dan `PushDispatch` (supaya reminder/follow-up hanya terkirim sekali).
- `User.notificationPrefs` (kategori push yang dimatikan).
- Indeks unik parsial: **satu kartu hidup (bukan `REVOKED`) per member** dan satu permintaan encode ulang terbuka per kartu.

### 4.2 Server

| Endpoint | Fungsi |
|---|---|
| `GET /api/hq/batches`, `POST /api/hq/batches`, `POST /api/hq/batches/:id/actions` | Daftar batch untuk stasiun, buat batch (+ file), langkah batch (sama dengan dashboard) |
| `POST /api/hq/cards/prepare` | Identifikasi kartu (URL cetakan / token / NIM) + lease stasiun |
| `POST /api/hq/cards/:id/key` | PWD/PACK untuk UID ini, setelah aturan UID lolos |
| `POST /api/hq/cards/:id/encoded` | Ikat UID + jenis chip, kartu → `ENCODED` |
| `POST /api/hq/cards/:id/release` | Lepas kartu; kegagalan tulis masuk audit |
| `GET /api/hq/batches/:id/files/…` | PDF batch, manifest, PDF per member, proof dengan garis bantu |
| `POST /api/hq/reencode-requests/:id/decision` | Setujui/tolak encode ulang |
| `POST /api/admin/cards/handover/preview`, `POST /api/admin/cards/handover` | Serah terima 2 langkah |
| `GET /api/admin/cards/members`, `GET /api/admin/cards/members/:id` | Cari member + kartu (crew) |
| `POST /api/admin/cards/:id/revoke`, `POST /api/admin/cards/:id/reencode-requests` | Hilang/rusak, minta encode ulang |
| `POST /api/admin/check-in/preview` + `POST /api/admin/check-in` | Kini juga metode `NFC` (token + UID → tiket konfirmasi) |
| `GET /api/c/:token`, halaman `/c/:token` | Profil kartu publik (tanpa tanggal lahir; kartu dicabut/tidak dikenal tidak menampilkan data pribadi) |
| `POST/DELETE /api/me/devices`, `GET /api/me/notifications`, `POST /api/me/notifications/read`, `GET/PATCH /api/me/notification-prefs` | Push dan pusat notifikasi |
| `POST /api/cron/notifications` | Reminder + follow-up (Bearer `CRON_SECRET`) |
| `PATCH /api/me` | Bahasa app → akun, supaya push memakai bahasa yang sama |
| `GET /.well-known/apple-app-site-association`, `/.well-known/assetlinks.json` | Universal / app link kartu |
| `GET /api/events/:id/flyer` | Flyer event |

- **Token kartu**: 16 karakter acak + 16 karakter HMAC (`CARD_KEY_SECRET`), unik di DB. Token palsu ditolak sebelum menyentuh database.
- **Password tag**: HMAC(`CARD_KEY_SECRET`, UID) → PWD 4 byte + PACK 2 byte, tidak disimpan; HQ selalu bisa menghitung ulang. HP/stasiun hanya menerima password untuk satu UID.
- **Aturan UID**: chip yang terikat ke kartu hidup lain ditolak; chip kartu yang dicabut boleh dipakai ulang hanya di mode re-encode; kartu yang sudah diserahkan tidak bisa dipindah ke chip lain.
- **Lease**: update bersyarat di baris kartu (dua stasiun tidak bisa memegang kartu yang sama); laporan `encoded` setelah lease habis diterima selama belum diambil stasiun lain (penulisan sudah terjadi).
- **Capability** (`packages/shared/src/card.ts`): `checkin.scan`, `card.handover`, `card.reportLost`, `card.requestReencode`, `card.encode`, `card.decideReencode`. Endpoint dan menu memeriksa capability, bukan nama role. `/api/me` mengirim daftar capability akun.

### 4.3 File cetak

- Template `apps/web/card-templates/placeholder/` (HTML + CSS, crest 720 px, font Inter + Plus Jakarta Sans ikut di folder). Slot `{{fullName}}`, `{{nim}}`, `{{qr}}`, `{{asset:…}}`; nama panjang otomatis mengecil sampai muat 2 baris.
- Render: Chromium headless (Playwright) → pdf-lib memotong halaman tepat 91,6 × 60 mm dari pojok kiri atas (Chromium membulatkan ukuran halaman ke poin bulat) dan memasang TrimBox/BleedBox/ArtBox.
- Manifest CSV: `batch, seq, nim, full_name, city, file, batch_pdf_pages, qr_url`, UTF-8 dengan BOM, rumus spreadsheet dinetralkan.
- Disimpan di storage (`cards/batches/<id>/…`); gagal render tersimpan di batch dengan tombol **Buat lagi**.

### 4.4 Dashboard HQ

- **Kartu** (menu baru, badge jumlah permintaan menunggu): statistik, tab Antrean (per kota, pilih member, label Pengganti), Batch (progres encode + jumlah yang sedang di-encode), Belum diserahkan, Permintaan encode ulang (setujui/tolak + catatan).
- **Halaman batch**: tahap batch dengan waktu, aksi berikutnya, batalkan batch (sebelum vendor), kartu dengan status / stasiun / jenis chip / UID (live tiap 10 detik selama encode), file cetak, catatan vendor, cabut kartu.
- **Member**: kartu **Kartu** berisi riwayat kartu (batch, UID, diserahkan oleh, alasan cabut) + cabut.
- **Event**: **Broadcast** (pilih kota, jumlah penerima, pratinjau teks) dan **Flyer** (unggah/ganti, tampil di app). Daftar event: kolom **Metode** (porsi NFC).
- **Kota & venue**: ikon pesan → teks push per kota, EN/ID, kosong = bawaan.
- **Ringkasan**: kolom kartu di perjalanan / kartu aktif per kota.

### 4.5 Card Station

`tools/card-station`: `readers`, `uid`, `status`, `read`, `plan`, `ndef-preview`, `lookup`, `ping`, `login`, `logout`, `batches`, `encode` (`--batch`, `--reencode`, `--new-token`, `--dry-run`, `--camera`, `--station`, `--direct`). Helper kamera `camera/qr-scan.swift` (AVFoundation + Vision). APDU ke ACR122U: `FF B0`/`FF D6` untuk READ/WRITE (terverifikasi di reader HQ), `FF 00 00 00 … D4 42` untuk GET_VERSION/PWD_AUTH. Password tidak pernah tercetak (dry-run maupun `--verbose`). Detail: [README](../tools/card-station/README.md).

### 4.6 App (Expo)

- `react-native-nfc-manager` + `expo-dev-client` + `expo-notifications` + `expo-device`. Entitlement iOS NFC (NDEF + TAG) + teks izin EN/ID, izin NFC Android, intent filter app link + `NDEF_DISCOVERED`.
- **Admin (menu berdasarkan capability):** Scan check-in (tombol **Tempel kartu (NFC)** di depan QR dan check-in lewat nama), **Serahkan kartu**, **Kartu hilang atau rusak** (cari member → laporkan / minta encode ulang / encode sekarang dengan izin), **Encode kartu** (HQ: pilih batch, scan QR cetakan atau NIM, tap).
- **HQ** kini bisa login di app (menu HQ).
- **Member:** baris **Notifikasi** di tab Kartu (jumlah belum dibaca), pusat notifikasi, pengaturan notifikasi di Profil, flyer di detail event, layar deep link `/c/<token>`.
- Di Expo Go / web, semua fitur NFC menjelaskan bahwa butuh development build; fallback QR dan manual tetap jalan.

### 4.7 Infra

- `infra/docker-compose.yml`: MinIO dihapus, volume `storage`, env kartu/storage/push/cron. Dockerfile memasang Chromium dan menyalin `card-templates`.
- [INFRA-NEEDS.md](INFRA-NEEDS.md): `CARD_KEY_SECRET` (tidak boleh diganti), `CRON_SECRET` + systemd timer, backup volume storage, Apple Team ID / fingerprint Android.

## 5. Verifikasi

| Cek | Hasil |
|---|---|
| Typecheck semua package | lolos |
| Lint (web + app) | lolos |
| `next build` (production, dari nol) | lolos |
| Unit test | `packages/shared` 35 (encoder NTAG di 213/215/216, sesi terputus di setiap perintah, fixture perintah bersama, URL/NIM/UID, transisi status, capability, copy push), `apps/web` 30 (token kartu, password tag, tiket NFC, jadwal push zona waktu, manifest CSV, storage lokal, kode error) — semua lolos |
| `cargo test` + `cargo clippy -D warnings` | 14 test lolos (deteksi chip, encode ketiga chip + Lock Control TLV tetap, proteksi, re-encode, sesi terputus di setiap perintah, chip terkunci/belum diformat, APDU ACR122U, penyamaran password, **fixture perintah yang sama dengan encoder HP**), 0 warning |
| Matriks interaksi kartu (`pnpm --filter @pats/web e2e:cards`, API asli + DB) | **53/53 lolos**, rincian di bawah |
| Matriks check-in Phase 1 (`e2e:checkin`) | **29/29 lolos** (tidak ada regresi) |
| File cetak | PDF batch BDG-1 (10 member) di-raster 300 dpi lewat PDFKit: 20 halaman, semuanya **91,60 × 60,00 mm**, TrimBox **85,60 × 54,00 mm** di 3 mm, bleed penuh sampai tepi (dicek per piksel), teks + elemen tetap di area aman 4 mm (pratinjau dengan garis bantu), font Inter + Plus Jakarta Sans tertanam, crest ±1.200 dpi. **Kesepuluh QR terbaca** (Vision) dan masing-masing menunjuk ke kartu member yang benar sesuai urutan manifest |
| Card Station dry-run lewat API lokal | `encode --batch BDG-1 --dry-run --sim-chip 215`: lease diambil dan dilepas, 34 APDU tercetak (halaman 4 / Lock Control TLV tidak pernah ditulis, AUTH0 akhir 04h di CFG0 83h, password disamarkan), tidak ada yang dilaporkan |
| Reader ACR122U | `card-station readers` (read-only): `ACS ACR122U PICC Interface (no card)`. Tidak ada kartu yang ditulis |
| Screenshot dashboard | Kartu (4 tab + dialog buat batch + dialog setujui), halaman batch (encode berjalan, dialog kirim ke kota, batch terkirim, dialog cabut), member + kartu, event + broadcast, daftar event (kolom metode), teks push per kota, Ringkasan, halaman `/c/<token>` (aktif, dicabut, tidak dikenal) di 390 dan 1440 px, ID/EN, terang/gelap: **152 screenshot**, cek otomatis **0** scroll horizontal, **0** teks terpotong (ellipsis yang tersisa hanya daftar pendaftar terbaru di Ringkasan, seperti Phase 1) |
| App di simulator iOS | iPhone 17 (iOS 27), Expo Go, satu simulator, dimatikan setelahnya. **30 screenshot** di `~/orca-tasks/pats-phase2-shots/` (bahasa Indonesia, 26 terang + 4 gelap): status kartu member, notifikasi + pengaturannya, tap kartu sendiri, menu admin/HQ, serah terima (mulai → pratinjau → selesai), scanner dengan **Tempel kartu (NFC)** dan hasilnya, kartu hilang (cari → detail → form laporkan), minta encode ulang (form → menunggu → disetujui → encode sekarang → selesai), notifikasi admin, encode HQ (batch → identifikasi → cek nama → selesai → sudah ter-encode) |
| App di renderer web (kode sama) | 13 layar × ID/EN × terang/gelap = **52 screenshot**, cek otomatis **0** temuan; juga dijalankan offline (semua layar baru menampilkan state offline + coba lagi) |

**Matriks interaksi kartu** (semua lewat API asli; tiap run membuat member uji sendiri):

| Skenario | Hasil |
|---|---|
| Batch 0 kartu | ditolak `422` (`validation.batchEmpty`) |
| **NIM ganda dalam satu batch** | ditolak `BATCH_DUPLICATE_MEMBER` dengan NIM-nya; kartu hidup kedua untuk member yang sama juga ditolak database (indeks unik) |
| Batch 1 kartu | token dibuat, file cetak jadi, PDF tersimpan di storage lokal |
| Kartu yang sudah di-batch dibatch lagi | `NOT_IN_QUEUE` |
| Batch campur kota | `BATCH_MIXED_CITIES` |
| Dua tab HQ membuat batch yang sama bersamaan | tepat satu menang, yang lain `NOT_IN_QUEUE` |
| **Batch banyak** (6) | semua `IN_BATCH`, token unik |
| **Transisi status**: encode sebelum kembali di HQ / kirim ke kota sebelum vendor / ke vendor dua kali / kirim ke kota dengan kartu belum ter-encode | `CARD_STATUS` / `BATCH_STATUS` / `BATCH_STATUS` / `BATCH_NOT_ENCODED` (dengan jumlahnya) |
| **Dua stasiun klaim kartu yang sama bersamaan** | satu memegang, yang lain `CARD_CLAIMED` + nama stasiun |
| Key | PWD/PACK per chip, sama setiap kali untuk UID yang sama |
| Encoded | UID terikat, jenis chip + stasiun tersimpan, batch → `ENCODING` |
| **Scan duplikat** | "sudah ter-encode", tanpa lease, tidak ada yang ditulis |
| **Lease habis di tengah penulisan** lalu diambil stasiun lain | key baru ditolak, laporan terlambat ditolak `LEASE_LOST` |
| Lease habis tapi tidak diambil siapa pun | laporan terlambat diterima (penulisan sudah terjadi) |
| **UID tidak cocok**: chip milik kartu lain | `UID_IN_USE` + NIM pemiliknya |
| Penulisan gagal | kartu dilepas, kegagalan tercatat di audit |
| **Re-encode** (HQ, chip sama) | password sama, kartu tetap `ENCODED`; mode encode biasa tidak pernah menulis ulang |
| Semua ter-encode → kirim ke kota | 6 member mendapat notifikasi |
| Serah terima: admin kota lain / token di chip lain / normal / dua kali | ditandai `OTHER_CITY` + `403` / `CARD_UID_MISMATCH` / `DELIVERED` + notifikasi member / `CARD_ALREADY_DELIVERED` |
| Check-in NFC: kartu belum diserahkan / **token disalin ke chip lain** / **token sah tanpa kartu** / token palsu / normal / tap kedua | `CARD_NOT_DELIVERED` / `CARD_UID_MISMATCH` / `CARD_NOT_FOUND` / `CARD_INVALID` / tercatat metode NFC + kartu + notifikasi / "sudah check-in" |
| Permintaan encode ulang | dibuat; kedua kali `REQUEST_PENDING`; admin tanpa izin `403`; HQ setujui sekali (`REQUEST_DECIDED` kedua kali) + notifikasi; izin hanya untuk admin yang meminta; hanya chip kartu itu; encode di HP admin → kartu tetap `DELIVERED`, izin `USED`; izin tidak bisa dipakai lagi |
| **Kartu dicabut lalu ditap** | ditolak di pintu dan di serah terima (`CARD_REVOKED`); halaman kartu tidak menampilkan data pribadi; pengganti `NOT_PRINTED` di antrean; cabut dua kali ditolak; chip kartu dicabut bisa dipakai ulang di mode re-encode |
| Halaman `/c/<token>` | profil tanpa tanggal lahir |
| Cron | tanpa secret `401`, dengan secret jalan |

Masalah yang ketemu saat QA dan sudah dibereskan:

- **Encoder: sesi terputus tepat setelah AUTH0 staging** membuat encode berikutnya tidak bisa menulis halaman PACK (ketahuan unit test yang memutus sesi di setiap perintah). Sekarang encode berikutnya mematikan AUTH0 staging dulu (CFG0 masih bisa ditulis), lalu mengulang; diperbaiki di encoder HP dan Card Station.
- **PDF**: Chromium membulatkan ukuran halaman ke poin bulat (91,69 × 59,94 mm), lalu menaruh halaman CSS di tengah kertas (garis putih 0,5 mm di bleed). Sekarang render di kertas sedikit lebih besar, isi dipaku ke pojok, lalu dipotong tepat 91,6 × 60 mm.
- Komentar di template ikut dibaca sebagai slot aset; fungsi penyesuai ukuran nama rusak oleh transpiler → dikirim sebagai string.
- **Info dari reader HQ** (sesi utama): kartu pabrik punya Lock Control TLV sebelum NDEF dan reader ini terbukti dengan `FF B0`/`FF D6` → encoder kini membaca dan mempertahankan TLV itu, Card Station memakai APDU tersebut, PLAN §2.2 dikoreksi.
- Password tag sempat tercetak di keterangan dry-run dan di `--verbose` → disamarkan.
- Dashboard: tabel kartu di halaman batch terlalu sempit (kolom aksi terpotong di 1440 px, nama terpotong, scroll horizontal di 390 px ID), tab Kartu terpotong di HP, "300 dpi" pecah baris, nama terpotong di tab Belum diserahkan → semua diperbaiki.
- App: status kartu fisik baru terlihat setelah scroll → dipindah tepat di bawah KTM; form laporkan/minta encode ulang tertutup keyboard → form di atas, tanpa autofocus; subjudul menu terpotong → maksimal 3 baris + copy dipendekkan; **bahasa app tidak dikirim ke server** sehingga push/notifikasi bisa beda bahasa dengan app → `PATCH /api/me {locale}` dan app menyinkronkannya.
- Hitungan antrean di Ringkasan menghitung member nonaktif → kini sama dengan halaman Kartu.

## 6. Yang belum diverifikasi / catatan jujur

- **Belum ada kartu fisik yang ditulis.** Sesuai aturan, semua penulisan diuji di simulator chip (TS dan Rust, satu fixture perintah) dan dry-run. Yang belum terbukti di hardware: urutan WRITE/PWD_AUTH di ACR122U (terutama apakah sesi PWD_AUTH bertahan antar pseudo-APDU `FF D6`; ada `--direct` sebagai cadangan), perilaku Core NFC / NfcA saat menulis, dan nilai Lock Control TLV pabrik di NTAG215/216 (dibaca dari chip, tidak dihardcode). Skrip uji owner: [NFC-DEV-BUILD.md §7](NFC-DEV-BUILD.md).
- **Development build belum dibuat** (butuh akun Apple + Xcode signing, dan memakai Xcode bentrok dengan tour NEXUS). Config, entitlement, izin, dan intent filter sudah siap; langkahnya di NFC-DEV-BUILD.md.
- **Screenshot app di simulator memakai Expo Go + simulator chip khusus dev** (`EXPO_PUBLIC_NFC_SIM`, hanya aktif di build dev) karena simulator iOS tidak punya NFC. Untuk berpindah akun dan memicu tap dari deep link dipakai rute/hook bantu sementara (sama seperti Phase 1); semuanya dihapus lagi dan **tidak di-commit**. Tombol biru bulat di pojok kanan atas screenshot adalah tombol menu developer Expo Go, bukan bagian app.
- **Push belum sampai ke HP sungguhan**: butuh project EAS, APNs key, dan FCM (NFC-DEV-BUILD.md §5). Lokal memakai `PUSH_PROVIDER=log`: notifikasi tersimpan dan tampil di pusat notifikasi; panggilan Expo Push sudah ditulis tapi belum dicoba ke Expo.
- **Universal link** belum bisa terverifikasi selama domain hanya lewat Tailscale (Apple memeriksa AASA dari internet publik). `/c/<token>` di web tetap jalan.
- **Driver S3** sudah ada di balik config tapi belum dicoba ke bucket sungguhan (MinIO tidak bisa di-pull).
- **Kamera Mac** untuk `--camera`: helper Swift sudah terbukti membaca QR dari gambar PDF, tapi akses kamera butuh izin di System Settings saat pertama dipakai; belum dicoba dengan kamera.
- **Android belum dijalankan** (aturan: tanpa emulator). Kode NFC Android memakai NfcA transceive, perintah yang sama dengan iOS.
- **Docker** (Chromium di image, volume storage) belum dibangun di Mac ini; perlu dicoba di server.
- **DB lokal** berisi data uji: batch JKT-1..JKT-n dan BDG-1 dari matriks/demo, member "Matrix …", event "Cards …" dan "PATS Friday Warm-up". `pnpm db:reset` membersihkannya (butuh konfirmasi kamu).
- **Mac bersama**: semua langkah berat lewat antrean kunci yang sama dengan tim NEXUS, dan berhenti selama tiga run tour NEXUS (simulator, xcodebuild, next build, pnpm install ditahan sampai log tour selesai).

## 7. Keputusan kecil yang diambil (bisa diubah)

Dicatat juga di [PRODUCT.md §13](PRODUCT.md#13-changelog-keputusan) poin 26–36.

1. **AUTH0 = 04h** (halaman NDEF pertama, sesuai arahan owner), bukan 03h seperti tertulis di plan awal.
2. **APDU ACR122U** dikoreksi di PLAN §2.2: `FF B0`/`FF D6` + `D4 42` untuk perintah lain (plan awal menulis pass-through tanpa `D4 42`).
3. **Lease 3 menit**; laporan terlambat diterima selama tidak ada stasiun lain yang mengambil kartu.
4. **Batch maksimal 200 kartu**, satu kota; bisa dibatalkan sebelum ke vendor; kirim ke kota hanya bila semua kartu ter-encode atau dicabut.
5. **Kartu dicabut otomatis membuat pengganti** di antrean (dari app maupun dashboard).
6. **Akun HQ boleh login di app** (untuk encode di HP).
7. **Copy push belum menyebut XP** sampai Phase 3.
8. **Kategori push**: Event dan Check-in & kartu; pesan akun/crew selalu terkirim.
9. **Kartu yang sudah diserahkan tidak bisa dipindah ke chip lain** lewat re-encode; chip rusak → cabut + kartu baru.
10. **REST HQ untuk batch dan keputusan** (selain dashboard), dipakai matriks uji dan nanti otomasi.

## 8. Butuh dari Berlin

| Kebutuhan | Detail |
|---|---|
| **Uji hardware** | Skrip di [NFC-DEV-BUILD.md §7](NFC-DEV-BUILD.md): Card Station + kartu kosong, iPhone/Android dengan development build |
| **Apple Developer** | App ID `id.znetworks.patsuniv` dengan NFC Tag Reading, Associated Domains, Push; Team ID; APNs key |
| **Expo / Firebase** | `eas init` (project id untuk push), FCM untuk push Android |
| **Artwork kartu (T8c)** | Dari tim; tinggal jadi folder template baru |
| **S1** | Definisi peran regional manager (capability sudah siap) |
| **"Go" Phase 3** | XP, leaderboard, reward, laporan PR, recap |

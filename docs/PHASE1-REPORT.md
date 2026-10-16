# Phase 1 — Laporan

16 Okt 2026 · branch `feat/phase-1` → `dev`. Acuan: [PLAN.md §4 Phase 1](PLAN.md).

## 1. Ringkasan

Phase 1 sudah selesai sesuai plan. Yang sudah ada:

- **Kartu digital dengan QR berputar** di tab Kartu app member:
  - Token ditandatangani server (HMAC), berlaku sesuai setting `appQrTtlSeconds` (default 45 detik), dan sekali pakai (nonce).
  - App mengambil kode baru sebelum kode lama habis, jadi kode di layar selalu masih punya sisa waktu saat dipindai.
  - Layar tetap menyala selama QR tampil.
  - Status kartu fisik tetap ada di bawahnya.
- **Event:**
  - Daftar dan detail event untuk member (kota asal).
  - Buat, ubah, publikasikan, buka check-in, dan tutup check-in, di dashboard HQ maupun di menu admin app.
  - Status `DRAFT` / `PUBLISHED` / `OPEN` / `CLOSED` plus jendela check-in.
- **Mode Scan admin:**
  - Kamera QR (`APP_QR`) dan check-in lewat nama (`MANUAL`, alasan wajib).
  - Layar hasil menampilkan foto (atau inisial), nama, NIM, dan kota, lalu konfirmasi 1 tap.
- **`POST /api/admin/check-in`** dengan semua validasi PRODUCT §6.1:
  - Token, kedaluwarsa, nonce.
  - Event `OPEN` + jendela.
  - Admin kota event.
  - Member aktif.
  - Roaming untuk member kota lain.
  - Unik per event.
  - Metode dicatat.
  - Entri `XpLedger` ditulis (belum ditampilkan sampai Phase 3).
- **Riwayat kehadiran** di app member, daftar hadir live di app admin (polling 5 detik), dan daftar hadir di dashboard (refresh 10 detik selama check-in dibuka).
- **`AuditLog`** untuk check-in manual, plus buat/ubah/buka/tutup event.

## 2. Demo Phase 1 (sesuai plan)

```sh
pnpm install
pnpm db:seed          # menambah event "PATS Warm-up Night" (Jakarta) yang sedang berlangsung, check-in sudah dibuka
pnpm dev:web          # terminal 1
pnpm dev:mobile       # terminal 2: i untuk simulator iOS, atau scan QR Expo Go di HP
```

Pakai dua HP (atau HP + simulator): satu sebagai member, satu sebagai admin kota.

1. **Admin membuka event.** Login app sebagai `admin.jkt@patsuniv.test` → **Admin → Event kota** → pilih event → **Buka check-in** → konfirmasi. Untuk event yang belum masuk jendelanya, app menjelaskan bahwa check-in langsung dimulai. Bisa juga dari dashboard: **Event → event → Buka check-in**.
2. **Member menunjukkan QR.** Login app sebagai `rara.anindya@patsuniv.test` → tab **Kartu**. QR check-in tampil di bawah KTM; bar tipis dan teks "Kode baru dalam N dtk" menunjukkan kapan kode berganti.
3. **Admin scan.** Di HP admin: **Admin → Scan check-in** (langsung ke kamera kalau hanya satu event yang dibuka) → arahkan ke QR → layar hasil menampilkan nama, NIM, kota → **Konfirmasi check-in** → "Check-in tercatat". Kamera kembali siap dalam 3 detik.
4. **Riwayat muncul di app member.** Tab **Kartu → Kehadiran**, atau tab **Event** → event itu bertanda **Hadir** dengan jam check-in.
5. **Daftar hadir muncul di dashboard.** `http://localhost:3000/events` → event → tabel **Kehadiran** (nama, NIM, jam, metode, dicatat oleh) dan ringkasan per metode. Halaman member juga menampilkan riwayat kehadirannya. **Ringkasan** kini menampilkan "Check-in hari ini".
6. **Scan kedua ditolak.** Scan QR member yang sama lagi (kode baru) → "Sudah check-in jam 09.01 oleh Andi Crew Jakarta", tanpa tombol konfirmasi.
7. **Screenshot QR lama ditolak.** Screenshot QR member, tunggu lebih dari 45 detik, lalu scan screenshot itu → "QR ini sudah kedaluwarsa". QR yang sudah dipakai untuk check-in juga ditolak walau masih dalam 45 detik ("QR ini sudah dipakai").
8. **Check-in manual wajib alasan.** Di layar kamera → **Check-in lewat nama** → cari nama/NIM → pilih → kolom **Alasan** wajib diisi (minimal 3 karakter) → konfirmasi. Alasan tampil di daftar hadir dashboard dan app admin, dan tercatat di `AuditLog` (`checkin.manual`) beserta nama admin.

Akun seed tetap sama dengan Phase 0 (HQ `hq@patsuniv.test`, admin kota `admin.jkt@` / `admin.bdg@patsuniv.test`, member `rara.anindya@patsuniv.test` dst.).

## 3. Yang sudah dibangun

### 3.1 Server (`apps/web`)

| Endpoint | Fungsi |
|---|---|
| `GET /api/me/card-token` | QR berputar: `P1.<memberId>.<nonce>.<exp>.<sig>` |
| `GET /api/me/check-ins` | Riwayat kehadiran member |
| `GET /api/events`, `GET /api/events/:id` | Event kota asal member (tanpa draf), dengan check-in member sendiri |
| `GET/POST /api/admin/events`, `GET/PATCH /api/admin/events/:id` | Event kota admin (termasuk draf) + jumlah check-in |
| `POST /api/admin/events/:id/actions` | `publish` / `open` / `close` |
| `GET /api/admin/events/:id/attendance` | Feed kehadiran live + hitungan per metode |
| `GET /api/admin/events/:id/members?q=` | Pencarian member untuk check-in manual |
| `GET /api/admin/event-form` | Venue + default jendela untuk form event di app |
| `POST /api/admin/check-in/preview` | Langkah 1 scan: identifikasi member, tidak mencatat apa pun |
| `POST /api/admin/check-in` | Langkah 2: catat check-in |

- **Scan dua langkah.** Preview tidak mencatat apa pun. Agar admin tidak berpacu dengan TTL QR, server memberi **tiket konfirmasi** (`T1…`):
  - Ditandatangani, berlaku 120 detik.
  - Terikat ke admin, event, dan nonce QR itu.
  - Hanya dibuat untuk QR yang valid saat dipindai.
- **Konfirmasi memeriksa ulang semua aturan.** Lalu nonce, baris `CheckIn`, entri `XpLedger`, dan `AuditLog` (manual) ditulis dalam satu transaksi. Dua HP crew yang mengonfirmasi member yang sama bersamaan: tepat satu yang tercatat (constraint unik), yang lain mendapat "sudah check-in".
- **Masalah pada member yang sudah teridentifikasi** dikembalikan sebagai `issue` agar crew tetap melihat siapa orangnya: sudah check-in (dengan jam + nama admin), keanggotaan nonaktif, atau kota lain tanpa roaming. Kegagalan keras (QR palsu/kedaluwarsa/terpakai, event belum dibuka, admin kota lain) dikembalikan sebagai error dengan kode stabil.
- **Waktu event** diisi sebagai jam dinding kota (`Asia/Jakarta` dll.) lalu disimpan UTC. Jam selesai sebelum jam mulai berarti hari berikutnya (acara malam). Jendela check-in = N menit sebelum mulai (setting `checkInOpensBeforeMinutes`) sampai event selesai.
- **Rate limit** scan per admin: 90 per menit.
- **Tidak ada migrasi baru**: schema Phase 0 sudah memuat `Event`, `CheckIn`, `UsedNonce`, `XpLedger`, `AuditLog`.

### 3.2 Dashboard HQ

- **Menu baru: Event.**
  - Daftar per Mendatang / Lewat / Semua dan per kota, dengan status, tanggal, dan jumlah check-in.
  - Dialog buat/ubah event.
- **Halaman detail event:**
  - Buka/tutup/publikasikan lewat dialog konfirmasi.
  - Tabel kehadiran yang refresh sendiri selama check-in dibuka.
  - Ringkasan per metode (NFC / QR app / Manual), sebagai dasar audit fallback di Phase 2.
- **Halaman member:** kartu **Kehadiran** (20 terakhir + total).
- **Ringkasan:** stat "Kota" diganti "Check-in hari ini" (jumlah kota tetap terlihat di tabel per kota).

### 3.3 App (Expo)

- **Member:**
  - Tab **Kartu**: KTM + QR check-in berputar + status kartu fisik + baris **Kehadiran**.
  - Tab **Event**: Mendatang / Sudah lewat, detail event (waktu, venue, jendela check-in, deskripsi, "Kamu check-in jam …", tombol "Tampilkan QR-ku" saat check-in dibuka).
- **Admin kota:**
  - **Scan check-in** dan **Event kota** aktif; Serah terima kartu (Phase 2) dan Validasi reward (Phase 3) masih "Segera".
  - **Event kota:** daftar, detail dengan kehadiran live, buat/ubah (date/time picker native; venue; kuota; publikasikan).
  - **Scanner:**
    - Kamera layar penuh, viewfinder, senter.
    - Hitungan check-in, getaran sukses/peringatan.
    - QR yang sama yang masih di depan kamera tidak diproses dua kali.
    - Izin kamera ditolak → penjelasan + tombol buka pengaturan + check-in lewat nama tetap bisa.
  - **Check-in lewat nama:** cari nama/NIM (member kota itu + roaming yang disetujui), alasan wajib.
- **Offline:**
  - Member yang offline tetap melihat QR terakhir sampai kedaluwarsa, lalu pesan offline + coba lagi.
  - Scan saat offline: "Server tidak terjangkau … Belum ada yang tercatat."
  - Konfirmasi ulang aman: kalau permintaan pertama ternyata sampai, hasilnya "sudah check-in", bukan dobel.
- **Rute admin** dipindah ke `/city-events/*` supaya tidak bentrok dengan tab Event member di URL yang sama.

## 4. Verifikasi

| Cek | Hasil |
|---|---|
| Typecheck semua package | lolos |
| Lint (web + app) | lolos |
| `next build` (production) | lolos |
| Unit test | `packages/shared` 20 (baru: fase event, jam kota ↔ UTC, acara lewat tengah malam, validator event/check-in), `apps/web` 7 (baru: token QR & tiket: kedaluwarsa, dimanipulasi, kunci lain, QR ≠ tiket; deteksi pelanggaran unik) — semua lolos |
| Matriks interaksi (`pnpm --filter @pats/web e2e:checkin`, API asli + database) | **29/29 lolos**, rincian di bawah |
| Screenshot web | Dashboard (Ringkasan, Event mendatang/lewat, detail event live + kosong, member, dialog event baru + error, dialog tutup check-in) di 390 px dan 1440 px, ID/EN, terang/gelap: 72 screenshot. Cek otomatis: **0** scroll horizontal, **0** teks terpotong; yang tersisa hanya elipsis yang disengaja di daftar pendaftar terbaru (nama sangat panjang) |
| Screenshot app (renderer web, kode yang sama) | Member (Kartu + QR, Event, detail event, riwayat) dan admin (Admin, Event kota, detail + live, form baru/ubah, scanner, check-in lewat nama, sudah check-in, alasan wajib, offline) di 390 px, ID/EN, terang/gelap: 68 screenshot. Cek otomatis: **0** temuan |
| App di simulator iOS | iPhone 17 (iOS 27) lewat Expo Go, satu simulator, dimatikan setelahnya. Layar setelah login kali ini **dicek native** (Phase 0 belum bisa): Kartu + QR, Event, detail event (terang/gelap), Kehadiran, menu Admin, detail event + kehadiran live, scanner, check-in lewat nama, form event (date/time picker native). Login di simulator memakai rute bantu sementara yang membaca refresh token dari deep link; rute itu dihapus lagi dan tidak di-commit |
| QR dari layar simulator | Screenshot layar Kartu di simulator di-decode (zxing) lalu dipindai lewat API sebagai admin Jakarta: **tercatat** (`201`); screenshot yang sama dipindai lagi → `QR_USED`; screenshot lain yang sudah lewat 45 detik → `QR_EXPIRED`. Riwayat dan tanda "Hadir" langsung muncul di app member |

**Matriks interaksi** (semua lewat API asli, event baru dibuat dan dibuka oleh admin Jakarta tiap kali dijalankan):

| Skenario | Hasil |
|---|---|
| Scan sebelum check-in dibuka | ditolak `EVENT_NOT_OPEN` |
| Preview QR | member teridentifikasi, **0** check-in tercatat |
| Konfirmasi | tercatat, XP +50 di ledger, muncul di riwayat member |
| **Replay QR lama** (sudah dipakai) | ditolak `QR_USED`; tiket konfirmasi yang sama juga ditolak |
| **QR kedaluwarsa** (ditunggu 46 detik sungguhan) | ditolak `QR_EXPIRED` |
| QR dimanipulasi (expiry diperpanjang) / QR bukan PATS | ditolak `QR_INVALID` |
| **Double check-in**: scan kedua (QR baru) | "sudah check-in jam … oleh Andi Crew Jakarta", tanpa tombol konfirmasi; check-in manual kedua ditolak |
| Double check-in **bersamaan** dari dua konfirmasi | tepat satu `201`, satu `409 ALREADY_CHECKED_IN` |
| **Admin kota lain** (Bandung di event Jakarta) | scan, daftar hadir, dan tiket milik admin lain semuanya `403` |
| Member kota lain tanpa roaming | ditolak `MEMBER_OTHER_CITY` |
| Member memakai endpoint crew | `403` |
| **Member dinonaktifkan** (QR diambil sebelum dinonaktifkan) | QR ditolak `MEMBER_INACTIVE`, check-in manual ditolak, app tidak dapat QR baru (`401`, sesi dicabut) |
| Manual tanpa alasan | `422`, field `reason` |
| Manual dengan alasan | tercatat + `AuditLog checkin.manual` |
| Feed kehadiran | hitungan per metode benar (QR app 2, manual 1) |
| Check-in ditutup | scan ditolak; dibuka lagi berjalan |
| **Scan offline** (app, koneksi diputus di browser) | preview dan konfirmasi: "Server tidak terjangkau. Cek koneksi lalu coba lagi. Belum ada yang tercatat." Setelah online lagi, preview member yang sama berjalan normal; tidak ada yang tercatat selama offline |
| Member offline | QR terakhir tetap tampil sampai habis, lalu pesan offline + tombol coba lagi |

Masalah yang ketemu saat QA dan sudah dibereskan:

- `parseZonedDateTime` menerima 30 Februari (ketahuan unit test).
- Saat matriks dijalankan ulang setelah `next build`, double check-in dan replay tiket memberi **500**, bukan "sudah check-in"/"QR sudah dipakai": pengecekan `instanceof PrismaClientKnownRequestError` gagal karena runtime Prisma termuat dua kali. Sekarang dicocokkan lewat kode error `P2002` di satu helper; tiga tempat lama dari Phase 0 (registrasi, kota, admin) yang punya pola rapuh yang sama ikut diperbaiki. Matriks kembali 29/29.
- Layar Kartu dan scanner crash saat izin wake lock ditolak (renderer web); keep-awake sekarang best-effort.
- Rute admin `/events` bentrok dengan tab Event member di URL yang sama → dipindah ke `/city-events`.
- QR terlalu kecil di dalam kotak putih → kotak kini mengikuti ukuran QR (224 pt, modul dibulatkan ke poin penuh supaya tidak ada garis tipis).
- Teks QR bilang "berganti tiap 45 detik" padahal kode berganti tiap 30 detik (berlaku 45) → diperbaiki.
- Tombol "Izinkan kamera" biru navy di atas overlay navy (kontras rendah) → memakai token gelap.
- Form event web: error judul tidak terlihat setelah submit → field pertama yang salah kini mendapat fokus; tombol "Event baru" → "Buat event"; hint kuota tidak lagi mengulang "Opsional".
- Judul + tanggal event terpotong di tabel 390 px → membungkus di HP; label stat "Baru 7 hari terakhir" tidak lagi terpotong.
- Rentang jam ("13.30 WIB") pecah di tengah → hanya pecah di antara dua ujung.
- Tombol Batal/Coba lagi 40 pt → 48 pt (target sentuh minimal 44).
- Scanner di iPhone: tombol tutup dan judul menimpa status bar (inset hilang di `fullScreenModal`) → scanner kini push biasa dan overlay memakai inset safe area.
- "Segera" tampil tiga kali di menu Admin → cukup judul seksi.


## 5. Yang belum diverifikasi / catatan jujur

- **Kamera belum diuji dengan QR sungguhan di depan kamera.** Simulator tidak punya kamera; layar scanner, izin kamera, dan alur hasilnya sudah dicek, dan QR yang tampil di simulator terbukti bisa dipindai (di-decode dari screenshot lalu dikirim ke API yang sama). **Mohon dicoba sekali dengan dua HP** lewat Expo Go.
- **Android belum dijalankan** (aturan: tanpa emulator Android). Kodenya sama; `expo-camera`, `expo-haptics`, `expo-keep-awake`, dan date picker ada di Expo Go Android.
- **Login di simulator** tetap tidak bisa diketik (Mac ini tidak punya Simulator.app GUI, idb, atau maestro), jadi sesi masuk lewat rute bantu sementara (lihat §4).
- **Feed live** masih polling (app 5 detik, dashboard 10 detik); realtime Socket.IO di Phase 4 sesuai plan.
- **Push "Check-in tercatat"** ke member belum ada; push masuk Phase 2.
- **Wordmark app** di layar login masih "PU" placeholder, belum crest (dari Phase 0/brand). Kotak chip kecil di KTM digital tidak terlihat di mode terang karena warnanya sama dengan kartu. Keduanya di luar Phase 1, dicatat untuk dirapikan.
- **DB lokal** berisi check-in demo di "PATS Warm-up Night" (6 member) dari uji ini. Event "Matrix …" dari uji otomatis sudah dibersihkan. Event uji baru akan muncul lagi setiap kali `e2e:checkin` dijalankan.
- **Mac bersama:** semua langkah berat (install, Metro, Playwright, build, simulator) lewat antrean kunci yang sama dengan tim NEXUS, satu per satu, dengan memori bebas ≥ 25%.

## 6. Keputusan kecil yang diambil (bisa diubah)

Dicatat juga di [PRODUCT.md §13](PRODUCT.md#13-changelog-keputusan) poin 21–25.

1. **Scan dua langkah** dengan tiket konfirmasi 120 detik.
2. **Kuota event hanya peringatan**, bukan blokir.
3. **Membuka check-in lebih awal** memulai jendela saat itu juga (diaudit). Membuka setelah jendela lewat ditolak.
4. **Event baru langsung dipublikasikan** kecuali "Publikasikan sekarang" dimatikan. Draf tidak terlihat member.
5. **Aturan roaming** (§6.1.5) sudah ditegakkan server sekarang; layar request roaming menyusul di Phase 4.
6. **QR selalu biru navy di atas putih**, juga di mode gelap, karena scanner butuh kontras.

## 7. Butuh dari Berlin

| Kebutuhan | Detail |
|---|---|
| **Coba di HP** | Scanner kamera hanya bisa diuji di HP sungguhan (simulator tidak punya kamera). `pnpm dev:mobile` → scan QR Expo Go dengan dua HP |
| **"Go" Phase 2** | Kartu NFC, Card Station encode, antrean & file cetak, push |
| **D3** | Akun Apple Developer + Google Play: NFC di Phase 2 butuh development build (Expo Go tidak mendukung NFC) |
| Hosting/domain | Belum diputuskan; semua masih lokal |

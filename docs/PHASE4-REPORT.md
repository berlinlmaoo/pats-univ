# Phase 4 — Laporan

16 Okt 2026 · branch `feat/phase-4`. Acuan: [PLAN.md §4 Phase 4](PLAN.md). Belum di-push atau digabung ke `dev`.

## 1. Ringkasan

Phase 4 mencakup social hub per kota, reservasi venue, dan roaming. Penyimpanan file, notifikasi, sesi, dan ledger XP memakai implementasi fase sebelumnya.

- **Socket.IO nyata:** JWT app, pemeriksaan sesi aktif, room per channel / percakapan / daftar hadir, reconnect, serta pemeriksaan ulang akses. Pesan disimpan sebelum acknowledgement; perubahan disiarkan sebagai invalidasi, lalu klien mengambil data melalui API berotorisasi.
- **Hub kota:** timeline foto/teks, chat teks/voice note/video, pengaturan channel, pin, hapus, mute dan buka mute. `@ADMIN` mengirim notifikasi ke admin kota lewat pipeline push Phase 2.
- **Region lock:** member hanya melihat kota asal dan kota dengan roaming hub yang masih berlaku. Server memeriksa akses saat membaca, menulis, bergabung ke room, dan membuka media.
- **Screenshot guard app:** `expo-screen-capture` mencegah capture di Android saat channel terbuka; iOS menampilkan peringatan dan mencatat `ScreenshotEvent`. Rekap tersedia untuk crew sesuai kota.
- **Reservasi:** editor denah grid 12 × 12 di dashboard, sofa/table dengan kapasitas dan catatan minimum spend, pemilihan slot di app, percakapan privat, konfirmasi/tolak/batal. Transaksi dan indeks unik yang sudah ada menjamin satu konfirmasi per slot per event.
- **Roaming:** `ATTENDANCE` diputuskan Local Admin kota tujuan dan berlaku sampai event selesai; `SOCIAL_HUB` diputuskan HQ, default sampai 48 jam setelah event. Permintaan/keputusan memakai push Phase 2. Cron menandai expiry; akses ditolak tepat saat kedaluwarsa walaupun cron belum berjalan.
- **Daftar hadir live:** layar event dashboard dan app admin kini berlangganan Socket.IO. Polling status batch kartu Phase 2 tetap tersedia.
- **ID/EN, terang/gelap:** copy dan setting memakai kamus bersama, komponen dan token desain yang ada.

## 2. Demo Phase 4

Gunakan database demo dan konfigurasi lokal sendiri; kredensial pengujian tidak disimpan di git. Jalankan install/build hanya setelah pemeriksaan resource pada instruksi tugas terpenuhi.

```sh
pnpm --filter @pats/web db:deploy
pnpm db:seed
pnpm --filter @pats/web db:seed:phase3
pnpm --filter @pats/web db:seed:phase4
pnpm dev:web
```

Di `apps/web/.env`, isi `REALTIME_INTERNAL_URL=http://localhost:4000`, `REALTIME_PUBLIC_URL=http://localhost:4000`, dan `REALTIME_SECRET` acak minimal 32 karakter. Di `apps/realtime/.env`, ikuti `.env.example`: `API_URL=http://localhost:3000`, `AUTH_SECRET` sama dengan web, `REALTIME_SECRET` sama, `CORS_ORIGINS=http://localhost:3000`, `PORT=4000`.

Di terminal kedua:

```sh
cd apps/realtime
node --env-file=.env src/server.mjs
```

Untuk HP fisik, alamat API dan realtime harus dapat dijangkau HP (bukan `localhost`). Buat development build yang memuat modul native baru; jangan mengandalkan development build lama. Verifikasi native diserahkan ke owner; tidak ada simulator/emulator atau Metro yang dijalankan pada pengerjaan ini.

1. **Channel dan timeline.** HQ `hq@patsuniv.test` → dashboard **Hub**. Seed menambahkan timeline dan chat per kota. Buka channel, kirim teks/foto, pin lalu hapus lewat konfirmasi. Pilihan kebijakan channel dapat mengikuti setting global/kota atau khusus admin.
2. **Chat.** Member `rara.anindya@patsuniv.test` → tab **Hub** → channel Jakarta. Kirim teks, rekam suara, atau video pendek. Dengan admin kota masuk di HP lain, ketik `@ADMIN`; notifikasi muncul di pusat notifikasi dan dikirim melalui provider push.
3. **Moderasi.** Admin kota membuka channel → mute penulis. Penulis menerima penolakan saat mengirim berikutnya. Daftar operasi komunitas menyediakan buka mute dan rekap screenshot.
4. **Roaming.** Member Bandung membuka **Roaming**, memilih event Jakarta dan kedua jenis permintaan. Admin Jakarta menyetujui absensi; HQ menyetujui hub. Member dapat check-in pada event tujuan dan memilih hub Jakarta. Untuk demo expiry, gunakan event yang sudah berakhir dan ubah **Pengaturan → Jendela roaming hub**; masa akses grant aktif ikut dihitung ulang. Jam event yang diubah juga memperbarui expiry kedua jenis grant.
5. **Reservasi.** HQ membuka tab denah, menyimpan sofa/table beserta kapasitas dan catatan minimum spend. Member memilih event → **Reservasi**, slot dan pax. Admin kota membuka operasi komunitas → percakapan privat → konfirmasi. Dua permintaan boleh menunggu slot yang sama, tetapi hanya satu dapat dikonfirmasi. Default satu reservasi aktif per member per event.
6. **Screenshot di HP.** Android: coba screenshot saat channel terbuka. iOS: ambil screenshot → peringatan dan rekap bertambah. Langkah ini belum dijalankan pada perangkat fisik.
7. **Kehadiran live.** Buka detail event di dashboard/admin app, lakukan check-in melalui alur Phase 1/2; daftar hadir diperbarui melalui room event.

Seed Phase 4 idempoten dan tidak menimpa denah yang sudah tersimpan. Pengujian memakai database terpisah `pats_univ_p4_p3`, web port 3014, realtime port 4014; fixture matriks dibersihkan setelah tes.

## 3. Yang sudah dibangun

### 3.1 Server dan penyimpanan

| Jalur | Fungsi |
|---|---|
| `/api/social/hub`, `/feed`, `/operations`, `/slots` | Daftar kota/channel, riwayat berpaginasi, antrean operasi, denah dan ketersediaan slot |
| `/api/social/channels`, `/posts`, `/messages`, `/moderate` | Pengelolaan channel, konten, pin/hapus/mute |
| `/api/social/token`, `/socket` | Token socket dan otorisasi room |
| `/api/social/upload`, `/media-file` | Tiket upload bertanda tangan, upload privat, URL baca sementara dengan pemeriksaan akses |
| `/api/social/roaming`, `/roaming-decision` | Permintaan dan keputusan roaming |
| `/api/social/reserve`, `/reservation-decision`, `/layout` | Permintaan, keputusan, dan denah reservasi |
| `/api/social/screenshot` | Catatan screenshot member pada channel yang boleh diakses |
| `/api/cron/social` | Expiry roaming dan penghapusan riwayat chat melewati retensi |

- **Tanpa migrasi schema.** Entitas Phase 0 digunakan langsung. Override posting channel dan daftar mute memakai tabel `Setting` yang sudah ada; tindakan crew masuk `AuditLog`.
- **Storage switch bukan stub baru:** driver local dan S3 Phase 2 digunakan melalui antarmuka yang sama. Upload melalui endpoint aplikasi bertanda tangan (5 menit), baca privat 2 menit, mendukung HTTP Range. Bucket tidak perlu dibuka publik. URL lama juga ditolak bila konten dihapus atau akses kota dicabut.
- **Media:** JPEG/PNG, M4A/MP4/MOV; pemeriksaan signature/container, kepemilikan, ukuran, dan durasi. Default 60 detik / 25 MB dapat diturunkan di dashboard. Tidak ada transcoding.
- **Retensi:** default 30 hari, dapat diturunkan; API menyaring langsung. Cron menghapus chat lama dalam batch 500 dan media terkait yang tidak dipakai konten lain. Timeline dibatasi jendela tampilan yang sama, tetapi row post tidak dipurge oleh cron ini.
- **Reservasi atomik:** batas aktif dan slot diperiksa dalam transaksi serializable dengan retry. Denah tidak boleh menghapus/mengubah slot yang sedang dipesan; event dengan reservasi tidak boleh dipindah venue. Kota event dengan check-in/reservasi/roaming terkunci.
- **Percakapan reservasi:** tetap privat untuk pemohon dan crew kota, termasuk setelah roaming hub habis; riwayat tetap mengikuti retensi chat.
- **Realtime service:** Node + Socket.IO, endpoint internal publish ber-secret, healthcheck, Dockerfile dan Compose. Cron tersedia sebagai script serta contoh unit systemd; belum dipasang di server.

### 3.2 Default yang dapat diubah

| Setting / field | Default |
|---|---|
| `hubTimelinePosting` | Admin + member; override per channel tersedia |
| `hubHistoryDays` | 30 hari |
| `hubMediaMaxSeconds` / `hubMediaMaxMb` | 60 detik / 25 MB |
| `reservationApprover` | Local Admin kota; dapat dialihkan ke HQ |
| `reservationMaxPerEvent` | 1 reservasi pending/dikonfirmasi per member |
| `roamingHubExpiryHours` | 48 jam setelah event |
| `roamingMaxPerMonth` | 0 = tanpa batas; bila dibatasi, dihitung per jenis per bulan kalender UTC, permintaan ditolak tidak dihitung |
| `minimumSpend` pada slot | Teks opsional; pembayaran/deposit tidak diproses di app |

## 4. Verifikasi

| Cek | Hasil |
|---|---|
| Typecheck semua package | Lolos |
| Lint web dan app | Lolos |
| Unit shared | 36 lolos: validasi, XP, tie-break, expiry, slot, mention, urutan feed |
| Unit web loyalty + social | 18 lolos: ledger, refund, spin, PR, media |
| Unit service realtime | 1 lolos: JWT, otorisasi room, persist pesan, secret publish |
| Konfigurasi Expo | `expo config --type public` lolos; tanpa bundler/native build |
| Matriks loyalty, API + PostgreSQL | **48/48 lolos** |
| Matriks social, API + PostgreSQL + Socket.IO | **56/56 lolos** pada dev dan server produksi lokal; health endpoint juga lolos |
| Interaksi dashboard | Posting teks panjang, pin, hapus terkonfirmasi, perubahan setting expiry terhadap grant aktif: lolos |
| QA visual dashboard | 61 screenshot untuk 5 tab × ID/EN × terang/gelap × 360/390/1440 px, plus pengaturan; 3 screenshot tambahan konten/dialog/setting. Tidak ditemukan overflow horizontal, key terjemahan mentah, error halaman atau API pada matriks visual |
| Build produksi Next.js | Lolos; satu kali `pnpm --filter @pats/web build` setelah gate resource terpenuhi |

Perintah verifikasi yang digunakan:

```sh
pnpm typecheck
pnpm lint
pnpm --filter @pats/shared exec vitest run test/shared.test.ts test/loyalty.test.ts test/social.test.ts
pnpm --filter @pats/web exec vitest run test/loyalty test/social
pnpm --filter @pats/realtime test
BASE_URL=http://localhost:3014 pnpm --filter @pats/web e2e:loyalty
BASE_URL=http://localhost:3014 pnpm --filter @pats/web e2e:social
# Dari apps/web, dengan server demo dan Chromium tersedia:
node test/e2e/social-visual.mjs
node test/e2e/social-interactions.mjs
```

Script matriks menolak database di luar penamaan database uji; `CHROMIUM_PATH` dapat diisi untuk lokasi Chromium setempat. Screenshot berada di `/tmp/pats-phase4-qa`, tidak dimasukkan ke repository. Tampilan app hanya diperiksa lewat typecheck dan pengujian logika shared; verifikasi visual/native menunggu owner.

**Matriks yang diwajibkan dari Phase 3:**

| Skenario | Hasil |
|---|---|
| Kode redeem dipakai dua kali | Pemakaian kedua ditolak; tidak ada debit/claim ganda |
| Kode kedaluwarsa | XP dikembalikan sesuai debit asli, stok pulih, refund idempoten |
| Spin ke-6 | Ditolak pada batas default 5 |
| Leaderboard seri | Tie-break sesuai XP, waktu pencapaian, dan urutan stabil |
| Admin kota lain memvalidasi | Ditolak |
| PR ditolak lalu dikirim ulang | Dapat direvisi/dikirim ulang; bonus tidak dikreditkan dua kali |
| Format export | CSV/XLSX memakai tampilan angka `3.800` dan `Rp 6.000.000` |

**Matriks social:** kota lain tidak boleh baca/tulis/moderasi; channel admin-only; mute; upload privat, signature palsu, overwrite, kepemilikan, URL setelah penghapusan; scope screenshot; pemisahan approver; check-in dengan roaming; perubahan jam event; socket join/send; expiry sebelum cron; kapasitas dan privasi reservasi; konfirmasi slot bersamaan; batas reservasi dan roaming dari setting; minimum spend; proteksi denah/venue; retensi 30 hari; cron tanpa secret; channel arsip; sesi dicabut.

## 5. Yang belum diverifikasi / catatan jujur

- **Perangkat fisik:** rekaman/playback voice dan video, izin kamera/mikrofon, Android screenshot prevention, serta callback screenshot iOS belum dijalankan. Modul native ditambahkan dan typecheck lolos; diperlukan development build baru dan uji owner.
- **Push hardware:** pengujian memakai `PUSH_PROVIDER=log` dan memeriksa notifikasi tersimpan. Pengiriman ke APNs/FCM melalui Expo memakai pipeline Phase 2, belum diuji ulang dengan perangkat.
- **S3, Docker, proxy, timer produksi:** konfigurasi tersedia, tetapi pengujian ini memakai local disk dan proses Node lokal. Tidak ada deployment atau perubahan hosting.
- **Pembersihan media:** chat lama dibersihkan cron; upload yang tidak pernah dilampirkan dan media dari konten yang dihapus manual belum memiliki garbage collector menyeluruh. URL kontennya tetap tidak dapat dibaca tanpa otorisasi/attachment aktif.
- **Media demo depth:** container dan batas durasi diverifikasi, tanpa transcoding, antivirus, waveform, atau thumbnail otomatis. File codec yang tidak didukung perangkat dapat gagal diputar.
- **Screenshot bukan proteksi mutlak:** iOS hanya memberi deteksi setelah screenshot, browser dashboard tidak dapat mencegah capture; kontrol native perlu diuji di HP.
- **Keputusan T10/S7/S8/S9** masih memakai default yang dapat disetel di dashboard. Pembayaran dan deposit berada di luar cakupan.

## 6. Untuk sesi utama

1. Review lalu gabungkan `feat/phase-4` sesuai alur repository; tidak ada push/merge dari pengerjaan ini.
2. Isi env realtime, teruskan `/socket.io/` melalui reverse proxy internal, dan pasang timer social; lihat [INFRA-NEEDS.md](INFRA-NEEDS.md).
3. Uji demo di HP fisik, terutama voice/video, screenshot guard, push, serta perpindahan jaringan/reconnect.

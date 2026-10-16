# Phase 5 — Laporan

16 Okt 2026 · branch `feat/phase-5`. Acuan: keputusan tim dan addendum **SUPERSEDES OPEN-3 — Claim XP**. Belum di-push atau digabung ke `dev`.

## 1. Ringkasan

Phase 5 menerapkan aturan tim pada server, dashboard, app, migrasi, seed dan pengaturan. Addendum terakhir menjadi acuan: **PR dan member mengajukan Claim XP sendiri setelah event; Regional Admin meninjau**, bukan mengetik recap PR atas nama member.

- **Claim XP:** Form Member (reservasi) dan Form PR (GL pax + reservasi), struk opsional, satu claim per member/event/form, hanya pending yang bisa diedit. GL member default mati dan dapat diaktifkan melalui setting. Antrean app/web dibatasi kota event, dengan adjust/approve/reject dan alasan penolakan. Audit menyimpan aktor, waktu, angka sebelum/sesudah. Approval memberi XP sekali lewat CAS dan award key; reject tanpa XP dengan notifikasi. Profil/wallet menerima invalidasi Socket.IO privat dan push keputusan.
- **XP:** welcome 100 sekali, check-in 50, tambahan 25 hanya untuk reservasi confirmed di event yang sama. PR 5 XP/GL + 25/reservasi; member 25/reservasi. Semua tarif adalah setting.
- **Live draw:** satu hadiah per event, lima slot nama, 250 XP/slot, satu slot/member/event, wajib check-in dan di peak hour. DB mengunci event/posisi; Regional Admin/HQ menjalankan sekali saat semua slot terisi. Pemenang dipilih server secara acak, diaudit bersama kelima peserta, lalu disiarkan melalui Socket.IO. **XP peserta yang kalah tidak dikembalikan.** Wheel berbobot pribadi dihentikan.
- **Leaderboard:** kuartal kalender WIB, kota/nasional; refund tidak menambah peringkat. #1 setiap kota mendapatkan satu slot gratis untuk event berikutnya atau pilihan HQ. Grant unik per kota/kuartal, sekali pakai, expiry default akhir kuartal berikutnya (tiga bulan).
- **Regional Admin:** satu kota, dashboard regional dan app, maksimum lima admin aktif per kota termasuk reaktivasi. Capability checks mengontrol izin; HQ tetap lintas kota. PR ditunjuk Regional Admin/HQ dan tetap mempunyai badge.
- **Operasional:** katalog reward per venue; timeline hanya HQ dengan reaksi member; recap menambah PIC malam itu dan penanggung jawab utama. Penggantian kartu Rp100.000, tanpa batas penggantian; pembayaran hanya dicatat. Perpindahan kota diminta member dan diputuskan HQ, NIM/kartu tetap. Minimum charge venue/slot disalin ke reservasi; satu reservasi unpaid lintas event memblokir pemesanan baru hingga DP dicatat.
- **Expiry dan keluar:** XP berlaku 18 bulan kalender, expiry ledger hanya menghapus sisa yang belum dibelanjakan. Refund mengembalikan lot dengan expiry asal, termasuk rekonstruksi debit sebelum migrasi. Keluar menghapus data profil/kontak, menonaktifkan akun dan mencabut sesi/device; kehadiran, ledger, kartu/NIM dan audit tetap tersimpan. Roaming tetap default 48 jam tanpa batas jumlah.

**Dependensi belum tersedia:** lima kalimat push ID verbatim T9 tidak ada di kedua file sumber, meskipun tabel menyebut “final copy given”. `{city}` sudah diisi otomatis, tetapi fallback lama belum diganti dan terjemahan EN final menunggu teks tersebut. Artwork depan/belakang dan teks legal juga belum diterima; placeholder dipertahankan sesuai instruksi. Umur minimum tetap 18.

## 2. Demo

Gunakan database demo terpisah, env lokal, dan gerbang resource sebelum install/build. Jangan seed demo pada database produksi.

```sh
pnpm --filter @pats/web db:deploy
pnpm --filter @pats/web db:seed
pnpm --filter @pats/web db:seed:phase3
pnpm --filter @pats/web db:seed:phase4
pnpm dev:web
```

Realtime mengikuti konfigurasi [PHASE4-REPORT.md](PHASE4-REPORT.md): `REALTIME_INTERNAL_URL`, `REALTIME_PUBLIC_URL`, `REALTIME_SECRET`, serta service `apps/realtime`. Untuk HP fisik gunakan alamat API/realtime yang dapat dijangkau perangkat. OTP demo hanya untuk pengujian; jangan digunakan pada deploy produksi.

1. **Regional dashboard:** masuk `admin.jkt@patsuniv.test` atau `admin.jog@patsuniv.test` lewat web. Regional diarahkan ke `/regional`; hanya event, reward, recap, hub dan operasi kotanya tersedia. HQ `hq@patsuniv.test` juga mendapat operasi global, request pindah kota dan pilihan event free credit.
2. **Claim XP:** gunakan event yang telah melewati `endsAt`. Member membuka Profil/Wallet → Claim XP → Form Member, isi reservasi dan opsional struk. Member ber-flag PR (demo Rara) juga bisa memilih Form PR. Edit sebelum keputusan. Di app admin buka Review Claim XP, atau web `/regional`/Recap; ubah angka lalu approve. Dua admin yang approve bersamaan menghasilkan satu award. Reject wajib alasan dan mengirim notifikasi tanpa XP. Laporan PR lama hanya arsip, endpoint write lama ditolak.
3. **Draw:** buat/buka event aktif, atur hadiah, peak hour WIB dan kapasitas di detail event dashboard. Check-in lima member dengan saldo cukup, lalu buka Wallet → event → ambil slot. Nama muncul live di dashboard/app. Entry keenam dan entry kedua orang yang sama ditolak. Admin menjalankan draw sekali; pemenang tersimpan dan dapat dilihat setelah reload.
4. **Free slot:** jalankan cron loyalty setelah kuartal selesai. HQ membuka Operasi regional → Slot gratis, pilih event kota pemenang jika perlu. Saat pemenang mengambil slot pada event tersebut, kredit digunakan tanpa debit XP. Kredit yang terpakai/kedaluwarsa tidak bisa dipakai lagi.
5. **Reservasi/DP:** Hub → Denah venue, isi minimum charge venue dan opsional override slot. Member reserve → admin konfirmasi. Reservasi baru masih ditolak sampai nominal DP dicatat lewat `/regional`. Nominal, admin dan waktu disimpan; tidak ada payment gateway.
6. **Kartu pengganti:** revoke kartu yang sudah dicetak/delivered melalui alur crew; replacement masuk antrean dengan fee Rp100.000 unpaid. Catat paid di `/regional`. Kartu pengganti yang telah dicetak dapat diganti lagi tanpa batas jumlah.
7. **XP:** daftar member baru untuk 100 XP; check-in confirmed reservation untuk total 75 XP. Wallet menampilkan ledger dan jadwal expiry. Redeem hanya untuk venue event; TTL refund mempertahankan tanggal kedaluwarsa XP asal.
8. **Region/keluar:** Profil → permintaan pindah kota, lalu HQ approve/reject dari `/regional`. NIM dan kartu tidak berubah. Aksi keluar memiliki konfirmasi, menganonimkan profil serta mencabut sesi, sementara riwayat operasional tetap ada.
9. **Timeline/recap:** HQ menerbitkan timeline; member hanya membaca/Like. Isi PIC dan accountable pada recap event. Export claim memuat form, GL/reservasi, status, XP dan bukti privat; export recap memuat kedua field baru.

## 3. Migrasi dan konfigurasi

Migrasi `20261016170000_team_decisions` berjalan setelah dua migrasi lama. Rename enum `LOCAL_ADMIN` → `REGIONAL_ADMIN` mempertahankan ID akun, email dan cityId. API `/me` tetap mengirim alias `LOCAL_ADMIN` untuk tester lama; capability list dan shared menerima kedua nama, sehingga tidak perlu menaikkan minimum versi hanya untuk rename. App baru perlu dipasang untuk memakai layar Claim XP/draw baru.

Entitas baru: `XpClaim`, `DrawEntry`, `FreeDrawCredit`, `RegionChangeRequest`, `PostReaction`. Ledger mendapat expiry, unique award key dan alokasi refund. Reservasi/kartu mendapat catatan pembayaran, event mendapat konfigurasi/hasil draw, recap mendapat PIC/accountable. Unique constraints, serializable transactions, row locks dan CAS menjaga batas/award sekali.

- Katalog spin lama dinonaktifkan; `Redemption`, `PromoterReport`, payout dan field bobot lama dipertahankan untuk riwayat, tanpa flow baru yang menulisnya. Reward lama tanpa venue dinonaktifkan; admin harus menentukan venue sebelum mengaktifkannya.
- Earnings historis mendapat expiry `createdAt + 18 months`. Welcome tidak diberikan retroaktif ke semua akun lama. Refund TTL merekonstruksi lot asli bila debit lama belum mempunyai allocations.
- Default/override yang bertentangan dengan keputusan baru direset oleh migrasi: batas spin, periode leaderboard, tipe/rate bonus PR, approver reservasi dan posting timeline. Pengaturan baru lain mempunyai fallback shared, lalu disimpan oleh seed.
- `SEED_MODE=production pnpm --filter @pats/web db:seed` hanya menyiapkan JKT/JOG dan settings, serta HQ jika `SEED_SUPER_ADMIN_EMAIL` diisi. BDG/SBY yang sudah ada dinonaktifkan, bukan dihapus. Demo seeds mencakup JKT/JOG dan data contoh kota lama.
- Cron `/api/cron/loyalty` memakai `CRON_SECRET`: grant kuartal, expiry XP/redeem dan snapshot. Pasang timer yang sudah didokumentasikan di [INFRA-NEEDS.md](INFRA-NEEDS.md); pengujian tidak memasang timer/deploy. Grant memproses kuartal yang baru selesai; pemulihan downtime lebih dari satu kuartal memerlukan backfill operasional.
- Template kartu tetap placeholder. HQ mengganti folder lewat `CARD_TEMPLATE_DIR`, lalu generate ulang batch; langkah lengkap di [card-templates/README.md](../apps/web/card-templates/README.md). Tidak memerlukan perubahan kode.

## 4. Verifikasi

| Cek | Hasil |
|---|---|
| Typecheck semua package | Lolos |
| Lint web + mobile | Lolos tanpa warning |
| Unit shared | **62 lolos**, termasuk XP expiry/tie-break, bobot legacy, batas, formula, capability alias, validasi claim dan empat tes logika layar mobile |
| Unit web | **35 lolos**, termasuk approval/adjust/reject, refund multi-lot dan debit sebelum migrasi |
| Unit realtime | **1 lolos** |
| Matriks API + PostgreSQL + Socket.IO | **74 pemeriksaan bisnis lolos** |
| Matriks dashboard | **16 pemeriksaan lolos**, claims + draw × ID/EN × terang/gelap × 360/1440 px; tanpa overflow horizontal/key mentah/error halaman pada run akhir |
| Upgrade database legacy | Lolos: akun LOCAL_ADMIN dan scope tetap, enum baru, XP historis dan expiry 18 bulan, default kuartalan |
| Fresh migration + production seed dua kali | Lolos: urutan tiga migrasi benar, JKT/JOG saja, tanpa akun/member demo |
| Build Next.js produksi | **Lolos**, satu kali build di akhir; compile, TypeScript, static generation dan route manifest selesai |

Matriks 74 mencakup concurrent signup, confirmed/pending reservation bonus, cross-city access API/web/queue, batas admin termasuk reaktivasi, fee kartu, DP concurrent, duplicate claim, edit pending, concurrent approval, adjusted award, reject-notification, room wallet privat, draw di luar peak, entry ganda/keenam/race slot terakhir, draw sekali + audit/realtime, quarterly credit race/free use, expiry XP sekali, venue reward, TTL refund, timeline/reaksi, region approve/reject dan anonimkan akun. Guard database menolak nama selain `*_p5_tests`; fixtures dibersihkan setelah tes.

```sh
pnpm typecheck
pnpm lint
pnpm --filter @pats/shared test
pnpm --filter @pats/web test
pnpm --filter @pats/realtime test
BASE_URL=http://localhost:3015 pnpm --filter @pats/web e2e:phase5
P5_VISUAL=1 BASE_URL=http://localhost:3015 pnpm --filter @pats/web e2e:phase5
pnpm --filter @pats/web build
```

Web pengujian port 3015, realtime 4015, PostgreSQL `pats_univ_p5_tests`. Screenshot dashboard tersedia lokal di `/tmp/pats-phase5-qa`, tidak masuk git. Dua screenshot representatif (draw mobile-width dan claims desktop-dark) diperiksa secara visual. Matriks Phase 3/4 lama memuat aturan yang telah diganti; hasilnya tidak diklaim sebagai regresi lolos Phase 5.

Gerbang sebelum langkah berat terpenuhi: memory free ≥25%, load1 <15, tidak ada xcodebuild atau install/build lain. Tidak ada simulator, emulator, Metro atau build native yang dijalankan. Tes mobile menguji logika presentasi yang digunakan layar, bukan rendering native; visual/hardware diserahkan ke owner.

## 5. Yang belum / batas verifikasi

- **T9 belum selesai:** sumber tidak menyertakan kelima kalimat final ID. Placeholder `{city}` dan editor copy per kota siap. Fallback lama tetap aktif; EN final belum dapat ditulis tanpa teks sumber. Permintaan teks telah disampaikan saat pengerjaan.
- **Artwork/legal:** tidak ada file artwork atau teks legal baru; placeholder tetap. Umur minimum 18 menunggu konfirmasi tim.
- **Storage switch:** memakai driver local/S3 dan antarmuka file privat Phase 2; bukan mock baru. Pengujian memakai local disk. Bucket S3/credentials produksi belum diuji. Struk claim opsional memakai upload privat yang sama; tidak ada OCR.
- **Push:** notifikasi tersimpan dan mode log diverifikasi. Pengiriman APNs/FCM fisik, background delivery dan deep link pada perangkat menunggu owner. Socket.IO live diverifikasi melalui koneksi nyata.
- **App:** Claim XP, review, draw, profile realtime, region change dan keluar telah ditulis/typecheck/lint; kamera receipt, animasi/native rendering, reconnect jaringan HP serta NFC lama perlu smoke test perangkat fisik.
- **Data keluar:** profil/kontak dan attachment reference pribadi dibersihkan, riwayat operasional tetap. File lama/audit historis tidak dihapus otomatis; garbage collection menyeluruh bukan bagian fase ini.
- **Deployment:** belum push/merge/deploy; konfigurasi timer, proxy realtime, backup sebelum migrasi dan rollout app dilakukan sesi utama. Ledger/queue masih memakai pola query prototype; belum load-test skala produksi.

## 6. Untuk sesi utama

1. Review branch `feat/phase-5`, migrasi dan addendum Claim XP sebelum menggabungkan ke `dev`.
2. Jalankan migrasi dan production seed pada target sesuai kebutuhan; isi venue reward, hadiah event dan peak hour.
3. Pasang/cek cron loyalty dan realtime; uji lima peserta pada HP fisik dan review Claim XP pada dua admin.
4. Masukkan lima copy push verbatim ID + EN setelah tersedia, lalu artwork dan legal HQ.

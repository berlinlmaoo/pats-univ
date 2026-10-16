# Phase 3 — Laporan

16 Okt 2026 · branch `feat/phase-3`. Acuan: [PLAN.md §4 Phase 3](PLAN.md). Dikerjakan paralel dengan Phase 2 atas persetujuan owner.

## 1. Ringkasan

Implementasi Phase 3 mencakup:

- Saldo XP dari jumlah ledger, riwayat, dan milestone reward di app.
- Leaderboard kota/nasional, periode bulanan WIB / per event / sepanjang masa sesuai setting, urutan XP → waktu mencapai total → NIM, serta posisi sendiri di luar daftar teratas. NIM dan timestamp tie-break tidak dikirim pada respons leaderboard publik.
- Katalog reward HQ: jenis, harga XP, stok, kota, status aktif, bobot spin. Contoh katalog tersedia lewat seed Phase 3 terpisah.
- Redeem langsung: kode 6 karakter + QR, countdown, validasi crew dua langkah, transaksi atomik, pengembalian XP dan stok saat kedaluwarsa.
- Spin wheel: hasil ditentukan server, bobot hadiah, batas per event, animasi yang mengikuti hasil server dan pengaturan reduced motion.
- PR: penunjukan dari dashboard/app admin, laporan tamu + struk privat, koreksi dan kirim ulang setelah ditolak, validasi/reject, bonus XP atau tabel payout uang. Pembatalan validasi XP menulis entri pembalik; payout sudah dibayar tidak bisa dibatalkan lewat alur ini.
- Rekap traffic: form crew, total dihitung server, kunci HQ, ringkasan kota.
- Export HQ untuk member, check-in, XP ledger, leaderboard, redemption, PR + payout, dan recap. CSV/XLSX nyata; PDF melalui tampilan cetak web. Unduhan tercatat di audit log.
- Cron refund setiap menit dan snapshot leaderboard per jam, termasuk arsip bulan sebelumnya; contoh unit systemd disertakan.

## 2. Demo Phase 3

Gunakan database/port sendiri bila Phase 2 sedang berjalan. Jangan menjalankan reset pada database bersama.

```sh
pnpm install
# Isi apps/web/.env, termasuk DATABASE_URL, APP_URL, AUTH_SECRET, OTP_PROVIDER=demo, CRON_SECRET.
pnpm --filter @pats/web db:deploy
pnpm db:seed
pnpm --filter @pats/web db:seed:phase3
pnpm dev:web
```

Seed Phase 3 menambahkan cocktail 100 XP, enam contoh hadiah spin dengan bobot sama, flag PR Rara, dan saldo showcase 3.800 XP. Seed aman diulang dan tidak menimpa katalog yang sudah diedit.

1. Admin Jakarta membuka event dan mencatat check-in Rara lewat alur Phase 1–2. Login Rara di app → **Reward & XP**: saldo, milestone, riwayat, dan katalog muncul.
2. Buka **Leaderboard**, pilih Jakarta/nasional dan periode; posisi sendiri tetap terlihat di bawah/di luar top N.
3. Pilih event tempat Rara sudah hadir → tukar cocktail → QR + kode + countdown muncul. Crew → **Validasi reward** → pilih event yang sama → masukkan/scan kode → periksa nama/reward → konfirmasi sudah diserahkan. Memakai kode itu lagi ditolak.
4. Buat kode lain dan biarkan TTL habis. Jalankan cron atau muat ulang wallet: saldo dan stok dikembalikan satu kali. Mengubah harga reward setelah kode terbit tidak mengubah jumlah refund.
5. Spin lima kali di event yang sama; spin keenam ditolak server. Kode spin yang kedaluwarsa tidak mereset jatah.
6. HQ/app admin → **Operasional kota** → tunjuk member sebagai PR. PR → **Reward & XP → Laporan PR** → pilih event yang sudah dimulai, 12 tamu, foto struk, nominal opsional → kirim. Crew kota event → lihat struk privat dan data tamu → tolak dengan alasan → PR perbaiki/kirim ulang → validasi. Default bonus = 240 XP, masuk sekali meskipun validasi ditekan dari dua perangkat.
7. Ubah `promoterBonusKind` ke CASH dan persentase komisi di **Pengaturan** untuk mencoba jalur uang. Hasil masuk sebagai `PromoterPayout PENDING`; pembayaran uang nyata tidak dilakukan.
8. Crew → **Operasional kota** → event → isi rekap: misalnya sofa/pax 3.800 dan pendapatan Rp 6.000.000 → simpan. HQ → **Rekap traffic** → filter kota/periode → periksa PR + struk → kunci rekap.
9. HQ → **Export data** → pilih dataset/kota/periode → CSV/XLSX. Angka ditampilkan `3.800` / `Rp 6.000.000`. Tombol cetak membuka tampilan untuk print/save PDF.
10. `POST /api/cron/loyalty` dengan `Authorization: Bearer <CRON_SECRET>` mengerjakan expiry dan snapshot. Contoh penjadwalan: `infra/systemd/pats-loyalty.*`, variabel dalam `/etc/pats-univ/cron.env`; sesuaikan lokasi `/opt/pats-univ` saat deploy. Timer belum dipasang di mesin ini.

## 3. Server & integrasi

- Tidak ada perubahan schema/migrasi.
- Modul server terpisah di `apps/web/src/lib/loyalty`. Transaksi serializable dengan retry melindungi saldo, stok, status kode, review PR, dan kunci rekap dari aksi bersamaan.
- API member `/api/loyalty/*`; API crew/HQ `/api/admin/loyalty/*`; export khusus HQ `/api/hq/export`.
- Expiry/refund otomatis melalui cron, dan juga diperiksa saat wallet dibuka atau kode divalidasi.
- Harga, biaya spin, limit, periode/top N, TTL, dan aturan bonus dibaca dari database/settings dashboard. Tidak mengubah modul yang sedang dibangun Phase 2.

## 4. Verifikasi

| Cek | Hasil |
|---|---|
| `pnpm typecheck` | Lolos untuk shared, web, dan mobile |
| `pnpm lint` | Lolos untuk web dan mobile |
| Unit test shared | **30/30 lolos**, termasuk ledger, periode WIB, tie-break, TTL, bobot/limit spin, bonus PR, dan validator |
| Unit test web | **22/22 lolos**, termasuk refund satu kali/debit asli, bonus XP/CASH, reversal, URL struk, CSV/XLSX, dan retry konflik transaksi |
| Matriks interaksi API + PostgreSQL | **48/48 lolos** pada database terpisah `pats_univ_p3`, baik server dev maupun bundle standalone production |
| Visual dashboard | **43 screenshot**: empat halaman di 390/1440 px, ID/EN, terang/gelap; tambahan laporan PR/recap berisi data, form reward + error, dan print view. Tidak ada scroll horizontal halaman, error API, atau key terjemahan yang bocor. Error nama reward fokus ke field pertama |
| Mobile | Typecheck dan validator/domain yang dipakai app lolos; simulator, emulator, Metro, dan kamera HP tidak dijalankan sesuai batas tugas |
| Production build | Lolos tanpa peringatan pada build akhir; manifest/standalone diperiksa, tidak menyertakan direktori struk privat |

**Matriks interaksi** (`pnpm --filter @pats/web e2e:loyalty`):

| Skenario | Hasil |
|---|---|
| Kode dipakai dua kali / dua crew konfirmasi bersamaan | Tepat satu sukses; sisanya `REDEEM_USED` |
| Kode kedaluwarsa, lalu expiry dijalankan berulang | Refund dan stok kembali sekali; harga diubah setelah penerbitan tetap refund debit asli 100 XP |
| Spin kelima / keenam | Lima hasil tersimpan; keenam `SPIN_LIMIT`. Expiry/refund spin tidak mereset jatah |
| Dua permintaan menghabiskan saldo terakhir | Satu sukses, satu `INSUFFICIENT_XP`; saldo tidak negatif |
| Dua permintaan mengklaim stok terakhir | Tepat satu sukses, stok tidak negatif |
| XP seri | Waktu mencapai total sama → NIM; posisi sendiri tetap ada di luar top tiga |
| Crew kota lain validasi kode / laporan / baca struk / isi recap | Semua ditolak `403` |
| PR ditolak → diperbaiki → dikirim ulang | ID laporan tetap sama, kembali `SUBMITTED`, lalu tervalidasi |
| Dua validasi PR bersamaan | Hanya satu bonus 240 XP |
| Pembatalan bonus XP | Entri pembalik −240; dapat dikirim ulang |
| Bonus uang | Komisi 5% dari Rp 6.000.000 → payout Rp 300.000 `PENDING`, tanpa kredit XP kedua. Payout `PAID` tidak dapat dibatalkan |
| Struk privat | Owner/HQ berhak; member lain/kota lain ditolak. URL dimanipulasi dan overwrite upload ditolak |
| Recap dikunci HQ | Crew tidak dapat mengunci; setelah HQ mengunci, perubahan ditolak `RECAP_LOCKED` |
| Export | Tujuh dataset berhasil; XLSX dibaca ulang dengan parser, `3.800` / `Rp 6.000.000` tetap tepat; crew ditolak dan audit tersimpan |
| Cron | Tanpa secret ditolak; pemanggilan berulang dalam jam yang sama tidak membuat snapshot duplikat |

Masalah QA yang sudah diperbaiki:

- Konflik serializable saat **commit** dari adapter PostgreSQL tidak selalu dibungkus sebagai `P2034`; bentuk `cause.originalCode=40001` / `TransactionWriteConflict` kini ikut di-retry. Regresi diuji unit dan dengan dua request bersamaan ke API asli.
- Form reward fokus ke field pertama yang salah dan menampilkan pesan terjemahan; opsi event app membungkus judul panjang.
- File unggahan runtime diberi pengecualian tracing agar struk privat tidak ikut bundle standalone.
- Print view semula melebar di viewport kecil; kini tabel menyesuaikan lebar dan layout cetak landscape.

QA hanya memakai database `pats_univ_p3`, port 3013, dan direktori screenshot `/tmp/pats-phase3-qa`. Data matriks dibersihkan setelah pengujian. Database terpisah masih berisi seed serta satu laporan PR dan recap showcase; database/folder Phase 2 tidak diubah.

## 5. Stub & batas verifikasi

- **Storage struk sementara:** `PrivateReceiptStorage` hanya memakai `putPrivate` dan `getSignedUrl`. Driver lokal menyimpan file di `.private-receipts` (atau `PR_RECEIPT_STORAGE_DIR`), di luar `public`, permission file 0600. URL upload berlaku maksimal lima menit; URL baca dua menit. Upload memeriksa jenis/signature gambar dan batas 5 MB. Saat merge, ganti instans adapter dengan storage Phase 2; endpoint penandatanganan/upload disesuaikan dengan driver bersama.
- Foto struk dibuat lewat kamera app. Galeri foto belum tersedia; kamera dan upload perlu dicoba pada HP oleh owner. Tidak ada simulator/emulator yang dijalankan.
- CSV/XLSX memakai angka tampilan sebagai teks agar separator tetap konsisten lintas locale; kolom tersebut tidak dimaksudkan sebagai sel hitung spreadsheet.
- Payout uang hanya tabel, tanpa transfer. Push untuk aksi reward/PR menunggu penyambungan ke pengirim Phase 2; status dan riwayat sudah dapat dibaca melalui API/app.
- Snapshot dan export memakai query agregat/database biasa, sesuai kedalaman showcase. Data media lama/orphan belum punya pekerjaan pembersihan.
- Belum merge ke `dev`, belum push, dan timer produksi belum diaktifkan.

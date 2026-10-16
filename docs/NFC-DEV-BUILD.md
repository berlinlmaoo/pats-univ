# NFC: development build & uji hardware

Untuk Berlin. Ditulis 16 Okt 2026 (Phase 2). Semua langkah di sini memakai HP sungguhan dan kartu sungguhan, jadi **dijalankan oleh owner**: selama build, tidak ada kartu fisik yang ditulis, dikunci, atau diberi password oleh sesi coding.

## 1. Kenapa perlu development build

Expo Go tidak membawa modul NFC (`react-native-nfc-manager`). Di Expo Go app tetap jalan, tapi semua fitur tap kartu menampilkan "NFC butuh development build PATS" dan crew memakai QR app / check-in lewat nama. Development build = app PATS sendiri (dengan NFC, push, universal link) yang tetap terhubung ke Metro di Mac, jadi perubahan kode langsung masuk tanpa build ulang.

Yang butuh development build:

| Fitur | Siapa |
|---|---|
| Check-in tap kartu (NFC) | Admin kota |
| Serahkan kartu (tap) | Admin kota |
| Encode kartu di HP | Super Admin, atau admin kota dengan izin encode ulang |
| Push notification | Semua |
| Tap kartu sendiri → profil terbuka di app | Member |

## 2. Apple Developer (akun galangprata19)

Di [developer.apple.com](https://developer.apple.com/account) → **Certificates, Identifiers & Profiles** → **Identifiers**:

1. Buat (atau buka) App ID **explicit** `id.znetworks.patsuniv`, nama "PATS University".
2. Centang capability:
   - **NFC Tag Reading** (wajib: membaca + menulis NTAG lewat Core NFC);
   - **Associated Domains** (universal link `patsuniv.znetworks.id/c/…`);
   - **Push Notifications**.
3. Catat **Team ID** (10 karakter, pojok kanan atas Membership). Isi ke server: `APPLE_TEAM_ID=XXXXXXXXXX` (dipakai `/.well-known/apple-app-site-association`).
4. Push: **Keys** → buat key dengan **Apple Push Notifications service (APNs)** → unduh file `.p8` sekali saja, simpan aman. Key ini diunggah ke EAS (`eas credentials`) supaya Expo Push bisa mengirim ke iPhone.

Entitlement dan teks izin sudah diatur di `apps/mobile/app.config.ts` (plugin `react-native-nfc-manager`): `com.apple.developer.nfc.readersession.formats = [NDEF, TAG]` dan `NFCReaderUsageDescription` (EN/ID). Tidak perlu diubah manual di Xcode.

## 3. iPhone: build ke HP lewat Xcode

Syarat: iPhone XS atau lebih baru (iOS 13+), kabel, Developer Mode menyala (**Settings → Privacy & Security → Developer Mode**). Jangan jalankan saat tour NEXUS sedang memakai Xcode/simulator.

```sh
cd ~/pats-univ/apps/mobile
EAS_PROJECT_ID=<id dari `eas init`, opsional untuk push> npx expo prebuild --platform ios --clean
open ios/PATSUniversity.xcworkspace
```

Di Xcode:

1. Pilih target **PATSUniversity** → **Signing & Capabilities** → **Team** = tim galangprata19, centang *Automatically manage signing*. Bundle identifier harus `id.znetworks.patsuniv`.
2. Pastikan muncul capability **Near Field Communication Tag Reading**, **Associated Domains**, dan **Push Notifications** (Xcode menambahkannya dari entitlements; kalau Push belum ada, klik **+ Capability → Push Notifications**).
3. Pilih iPhone yang dicolok di daftar device → **Run** (⌘R). Pertama kali: di iPhone buka **Settings → General → VPN & Device Management** → percayai developer.
4. Di Mac jalankan Metro untuk dev client:

   ```sh
   cd ~/pats-univ
   EXPO_PUBLIC_API_URL=http://<IP Mac di LAN/Tailscale>:3000 pnpm --filter @pats/mobile exec expo start --dev-client
   ```

   Buka app PATS di iPhone → pilih server Metro. Web/API dijalankan dengan `pnpm dev:web` (atau `next start`).

## 4. Android: APK

Tidak memakai emulator (aturan Mac bersama). Build di Mac, pasang ke HP Android lewat USB (USB debugging menyala):

```sh
cd ~/pats-univ/apps/mobile
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Atau tanpa build lokal: `eas build -p android --profile development` (butuh akun Expo + `eas init`), unduh APK dari link-nya.

Izin `android.permission.NFC` dan intent filter (app link `https://patsuniv.znetworks.id/c/…` dan `NDEF_DISCOVERED`) sudah ada di `app.config.ts`.

- **App Links**: isi `ANDROID_CERT_SHA256` di server dengan fingerprint SHA-256 sertifikat yang menandatangani APK. Untuk APK debug lokal:
  `keytool -list -v -keystore android/app/debug.keystore -alias androiddebugkey -storepass android | grep SHA256`
- **Push Android** butuh project Firebase (FCM). Buat project, tambahkan app Android `id.znetworks.patsuniv`, unduh `google-services.json`, isi `android.googleServicesFile` di `app.config.ts`, dan unggah kunci FCM V1 ke EAS (`eas credentials`).

## 5. Push (iOS + Android)

1. `npx eas init` di `apps/mobile` → dapat **project id** → set `EAS_PROJECT_ID` saat prebuild/build (app membaca `extra.eas.projectId`).
2. APNs key (§2.4) dan FCM (§4) diunggah lewat `eas credentials`.
3. Server: `PUSH_PROVIDER=expo` (default di produksi), opsional `EXPO_ACCESS_TOKEN` bila push security diaktifkan di akun Expo.
4. Cron reminder: systemd timer memanggil `POST /api/cron/notifications` tiap 5 menit dengan `Authorization: Bearer $CRON_SECRET` (lihat INFRA-NEEDS.md).

Tanpa langkah ini app tetap jalan: notifikasi tetap tersimpan dan tampil di **Notifikasi** di app, hanya tidak muncul sebagai push.

## 6. Universal link: catatan hosting internal

Apple mengambil `apple-app-site-association` lewat CDN-nya dari internet publik. Selama `patsuniv.znetworks.id` hanya bisa diakses lewat Tailscale, universal link **tidak akan terverifikasi** di iPhone biasa. Untuk uji: aktifkan Developer Mode, lalu sementara ganti `associatedDomains` ke `applinks:patsuniv.znetworks.id?mode=developer` (iPhone mengambil file langsung dari domain, lewat Tailscale). Tanpa itu, tap kartu sendiri membuka halaman `/c/<token>` di Safari, yang juga menampilkan profil ringkas. Check-in, serah terima, dan encode **tidak** bergantung pada universal link.

## 7. Skrip uji hardware (kartu NTAG kosong + ACR122U)

Siapkan: ACR122U di Mac, 3–5 kartu NTAG kosong (213 dan, kalau ada, 215), 1 kartu R&D (sekarang berisi `https://znetworks.id`, tanpa password), iPhone dan/atau Android dengan development build, akun `hq@patsuniv.test` dan `admin.jkt@patsuniv.test`.

Server lokal: `pnpm dev:web`, lalu di dashboard buat batch kecil (Kartu → Antrean → pilih 3 member → Buat batch), **Tandai dikirim ke vendor**, **Tandai kembali di HQ**. Untuk uji, cetak QR kartu dari PDF batch (atau tampilkan PDF di layar) sebagai pengganti cetakan vendor.

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| 1 | `card-station readers` | `ACS ACR122U PICC Interface (card present)` saat kartu ditempel |
| 2 | `card-station status` dengan kartu kosong | `NTAG213` (atau 215), UID, `Lock bits none set`, `AUTH0 FF (not protected)`, TLV `0103A00C34` (213), NDEF kosong |
| 3 | `card-station status` dengan kartu R&D | NDEF URL `https://znetworks.id`, tidak diproteksi |
| 4 | `card-station plan <url> --chip 215` | Daftar APDU; halaman 4 tidak pernah ditulis; AUTH0 akhir `04` di CFG0 83h |
| 5 | `card-station login --email hq@patsuniv.test --api http://localhost:3000` lalu `card-station batches` | Batch tampil `0/3 encoded` |
| 6 | `card-station encode --batch <label> --dry-run` → scan/ketik NIM → tempel kartu | APDU tercetak (PWD disamarkan), "Nothing written". `status` kartu masih sama seperti langkah 2 |
| 7 | `card-station encode --batch <label>` → kartu #1 | `✓ Encoded …`; dashboard batch: 1/3, kolom "Di-encode oleh" = Mac Card Station |
| 8 | `card-station status` kartu #1 | AUTH0 `04 (write-protected)`, ACCESS `00`, URL `https://patsuniv.znetworks.id/c/…`, TLV Lock Control tetap sama |
| 9 | Tempel kartu #1 ke iPhone (layar menyala, tanpa app terbuka) | Banner NDEF muncul dengan URL kartu |
| 10 | Coba tulis kartu #1 dengan app umum (mis. NFC Tools → Write) | Gagal (tag terproteksi) |
| 11 | `card-station encode --batch <label>` lalu scan kartu #1 lagi | "Already encoded … Nothing written" |
| 12 | `card-station encode --reencode` → kartu #1 | Berhasil; password sama (diturunkan dari UID) |
| 13 | Paralel: di iPhone login HQ → Admin → **Encode kartu** → pilih batch → kartu #2; bersamaan Mac meng-encode kartu #3 | Keduanya ✓; dashboard menampilkan stasiun masing-masing |
| 14 | Saat iPhone memegang kartu #2 (setelah scan, sebelum tap), scan kartu #2 di Mac | Mac: "iPhone · … is encoding this card" |
| 15 | Dashboard → batch → **Tandai dikirim ke kota** | Member mendapat notifikasi "KTM kamu sudah sampai" |
| 16 | Login `admin.jkt` di HP → **Serahkan kartu** → tempel kartu #1 → konfirmasi | Status `Diserahkan` di dashboard |
| 17 | Buka check-in sebuah event → **Scan check-in** → **Tempel kartu (NFC)** → kartu #1 → konfirmasi | Tercatat dengan metode **Kartu NFC** |
| 18 | Admin → **Kartu hilang atau rusak** → member kartu #2 → **Minta encode ulang** → HQ setujui di dashboard (Kartu → Permintaan) → admin **Encode sekarang** → tempel kartu #2 | Encode ulang berhasil di HP admin; permintaan jadi "Di-encode ulang"; kedua kali tidak bisa |
| 19 | **Laporkan hilang atau rusak** untuk kartu #3 → tempel kartu #3 di scanner | Ditolak "Kartu ini sudah dicabut"; member masuk antrean cetak lagi (Pengganti) |
| 20 | Kartu R&D: `card-station encode` (pakai sebagai kartu salah satu member) | Berhasil; URL znetworks.id tertimpa, Lock Control TLV tetap |

Kalau langkah 12 gagal dengan NAK pada WRITE pertama: ulangi dengan `--direct` (READ/WRITE lewat pass-through PN532) dan kabari hasilnya. Kalau ada langkah lain gagal, kirim output `card-station --verbose …` (APDU lengkap, password tidak ikut tercatat di dashboard).

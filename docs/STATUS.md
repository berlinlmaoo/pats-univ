# Status

Native Android (18 Oct 2026): foundation/member phases complete; admin/NFC implemented and parity checks
green on `feat/android-native` (18 JVM tests + APK). Final closure awaits the missing Phase 3 review notes.
Build, emulator evidence and iOS API map: [ANDROID-NATIVE.md](ANDROID-NATIVE.md).

| Fase | Status | Catatan |
|---|---|---|
| 0 — Skeleton, auth, registrasi web | **Selesai** (16 Okt 2026) | Rincian, cara demo, dan yang belum: [PHASE0-REPORT.md](PHASE0-REPORT.md) |
| 1 — Kartu digital, scan admin, check-in | **Selesai** (16 Okt 2026) | Rincian, cara demo, dan yang belum: [PHASE1-REPORT.md](PHASE1-REPORT.md) |
| 2 — Kartu NFC, file cetak, push | **Selesai** (16 Okt 2026) | Rincian, cara demo, uji hardware owner, dan yang belum: [PHASE2-REPORT.md](PHASE2-REPORT.md) · build & uji NFC: [NFC-DEV-BUILD.md](NFC-DEV-BUILD.md) |
| 3 — XP, leaderboard, reward, PR, recap | **Selesai** (16 Okt 2026) | Merge ke `dev`; struk PR kini lewat storage Phase 2. Rincian, demo, dan QA: [PHASE3-REPORT.md](PHASE3-REPORT.md) |
| 4 — Social hub, reservasi, roaming | **Selesai** (16 Okt 2026) | Sudah digabung ke `dev` sebagai dasar Phase 5. Realtime, media privat, moderasi, reservasi dan roaming. Uji native owner/deployment masih diperlukan: [PHASE4-REPORT.md](PHASE4-REPORT.md) |
| 5 — Keputusan tim + Claim XP | **Implementasi dan verifikasi selesai; bahan HQ tersisa** (16 Okt 2026) | Branch `feat/phase-5`, belum push/merge. Claim XP PR/member menggantikan OPEN-3 lama; regional dashboard, live draw, XP expiry dan aturan operasional. T9 verbatim, artwork/legal serta QA perangkat fisik masih menunggu: [PHASE5-REPORT.md](PHASE5-REPORT.md) |
| Native iOS — SwiftUI | **Implementasi selesai; QA perangkat menunggu** (18 Okt 2026) | `apps/ios`, branch `feat/ios-native`. Compile-only dan tes logika macOS; tidak menjalankan simulator/app. Inventaris API, paritas, push dan tugas owner: [IOS-NATIVE.md](IOS-NATIVE.md) |
| UX redesign 21 Okt — server/web | **Live di dev** (21 Okt 2026) | Home task flow, kartu digital vs fisik, event nasional, poster/deskripsi dengan approval HQ, workspace event admin (reservasi terjual meja/sofa; FDC menunggu definisi), DP, notifikasi per item, KTM baru (QOTD). Kontrak untuk app native: [contracts/ux-redesign-21oct.md](contracts/ux-redesign-21oct.md). Belum: arti "blast poster" dan sumber FDC (keputusan owner) |
| Update 22 Okt — blast poster + laporan event | **Live di dev** (22 Okt 2026) | Blast poster = langkah opsional dengan bukti screenshot, +2 XP setelah di-approve crew/HQ. Laporan event 7 angka (FDC = First Drink Charge / Free Drink Coupon) dengan audit; halaman /reports (total + tren per kota, CSV). Login tetap email + OTP. Kontrak: bagian "Update 22 Oct" di [contracts/ux-redesign-21oct.md](contracts/ux-redesign-21oct.md) |

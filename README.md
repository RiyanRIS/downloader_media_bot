# 🤖 STB Downloader & Community Bot

[![Node.js Version](https://img.shields.io/badge/node.js-%3E%3D22.0.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-%5E5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Framework](https://img.shields.io/badge/bot%20framework-grammY-4ea8de?logo=telegram)](https://grammy.dev/)
[![Database](https://img.shields.io/badge/database-better--sqlite3-003B57?logo=sqlite&logoColor=white)](https://github.com/WiseLibs/better-sqlite3)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Linux%20ARM64%20%7C%20x64%20%7C%20Windows-informational)]()

**STB Downloader Bot** adalah bot Telegram serbaguna berbasis komunitas yang menggabungkan fitur **pengunduh media multi-platform**, **pencatatan keuangan cerdas berbasis AI (Google Gemini)**, **arena permainan interaktif**, dan **sistem masukan/lapor kendala dua arah**, yang dioptimalkan secara khusus untuk berjalan stabil pada perangkat hemat daya (seperti TV Box / STB ex-IndiHome **HG680-P**, **B860H** berbasis Armbian/Debian Linux ARM64) maupun server VPS x86_64.

> 📖 **Mencari panduan lengkap penggunaan bagi pengguna akhir?**  
> Silakan baca **[Panduan Pengguna Bot (User Guide)](USER_GUIDE.md)** yang merinci panduan langkah demi langkah, tips mencatat kas keluarga, aturan bermain game di grup, hingga FAQ.

---

## 🌟 Fitur Unggulan

### 📥 1. Multi-Platform Media Downloader (100% Gratis Selamanya)
* **Platform yang Didukung:** YouTube, TikTok (tanpa watermark), Instagram (Reels, Video Feed, Foto & Album Carousel), X/Twitter (Video, MP3 & Foto Multi-Image), Threads, Facebook (Video/Reels), Reddit, Pinterest, dan Bilibili / Bstation.
* **Dukungan Foto & Album Carousel:** Otomatis mendeteksi galeri/album multi-foto (Instagram, Threads, X) dan mengirimkannya rapi menggunakan `replyWithPhoto` atau `replyWithMediaGroup`.
* **Pre-Check Batas 50MB:** Memeriksa metadata `yt-dlp` sebelum mengunduh. Jika video melebihi batas 50MB Telegram Bot API, bot otomatis menawarkan opsi **Unduh Audio MP3 Saja** untuk menghindari kegagalan unduhan.
* **Live Dynamic Progress:** Indikator progres interaktif tiga tahap:
  1. `[1/3] ⏳ Menunggu antrean...`
  2. `[2/3] ⬇️ Mengunduh media...`
  3. `[3/3] ⬆️ Mengunggah ke Telegram...`
* **Zero-Persistence & Ramah Storage:** Berkas sementara diunduh ke `TMP_DIR` dan langsung dihapus seketika (`fs.unlinkSync()`) sesaat setelah terkirim ke Telegram.

### 💰 2. Pencatatan Keuangan AI & Kas Grup / Keluarga
* **Ekstraksi Teks Bahasa Santai (`/catat`):** Didukung Google Gemini AI untuk mengenali kalimat belanja sehari-hari (contoh: <code>beli soto ayam 15k di warung pak kumis</code>) dan membedah nominal, kategori, merchant, serta rincian item secara otomatis.
* **Scan Nota & Struk Belanja (`/struk`):** Pengguna cukup mengirimkan foto struk belanjaan; AI Vision membaca total bayar, nama toko, dan rincian belanjaan secara instan dari memori buffer (tanpa menyimpan file foto di disk).
* **Multi-Key Failover:** Mendukung rotasi beberapa API Key Gemini (`GEMINI_API_KEY=key1,key2`) untuk menjamin kelancaran layanan jika kuota gratis Google per key habis.
* **Kas Grup & Sinkronisasi Pribadi:** Transaksi yang dicatat di grup otomatis terhitung ke Kas Grup/Keluarga dengan tombol **`[ 📌 Simpan juga di Pribadi ]`** untuk disalin ke dompet pribadi pencatat.

### 📬 3. Request Fitur & Lapor Kendala Dua Arah (`/saran`, `/lapor`)
* **Dua Kategori Masukan:**
  * 💡 **Request Fitur & Saran:** Usulan fitur baru, platform unduhan baru, atau masukan pengembangan.
  * 🚨 **Lapor Kendala / Bug:** Laporan tautan yang gagal diunduh, error sistem, atau kendala bot.
* **Panel Kontrol Admin Real-Time:** Setiap masukan diteruskan ke seluruh Admin dengan tombol aksi interaktif:
  * `[💬 Balas User]`: Admin dapat membalas langsung dari Telegram; pesan balasan akan diteruskan ke chat pribadi user dengan format kutipan resmi developer.
  * `[👀 Tandai Dibaca]`: Mengubah status menjadi `READ` dan memberi tahu pengguna bahwa masukannya telah ditinjau.
  * `[✅ Tandai Sudah Beres]`: Mengubah status menjadi `RESOLVED` dan mengabari pengguna bahwa kendala telah diperbaiki.
  * `[🗑️ Abaikan]`: Menghilangkan tombol tanpa mengganggu pengguna.
* **Prinsip Komunitas Sehat:** Murni aspirasi tanpa reward EXP (mencegah spam) dan tanpa kewajiban roadmap publik (hak prerogatif developer tetap terlindungi).

### 💖 4. Dukungan Sukarela Pengembang (QRIS) & Daftar Donatur
* **Model Komunitas Bebas Tarif:** Layanan bot 100% gratis selamanya tanpa pemotongan koin untuk unduhan maupun AI.
* **Donasi Sukarela QRIS (`/dukung`):** Pengguna dapat berpartisipasi sukarela mendonasikan dana operasional server (nominal bebas via QRIS Dinamis).
* **Apresiasi Sahabat Dermawan:** Donatur dianugerahi gelar `💖 Sahabat Dermawan` (Role VIP).
* **Daftar Donatur Bulanan (`/donatur`):** Menampilkan daftar sahabat dermawan bulan berjalan secara transparan dan berperingkat tanpa memperlihatkan nominal donasi demi menjaga privasi.

### 🎮 5. Arena Mini-Games & Sistem Keaktifan (EXP)
* **Indikator Keaktifan Berbasis EXP:** Kumpulkan poin pengalaman (EXP) dari unduhan media (+2 EXP), catat belanja (+3/+5 EXP), check-in harian (+20 EXP), dan aneka game untuk menaikkan level di `/leaderboard`.
* **Tic Tac Toe 3-Bidak Modern (`/ttt`):** Aturan inovatif 3-bidak FIFO (menaruh bidak ke-4 menghapus bidak pertama), memastikan permainan bebas dari hasil seri monoton baik dalam mode Solo AI maupun PvP duel di grup.
* **Family 100 (`/family100`):** Kuis survei populer berisi 1.700+ soal seru yang dapat dimainkan bersama di grup.
* **Tebak Gambar (`/tebakgambar`), Dadu (`/dice`), Slot (`/slot`), dan Kuis (`/tebak`).

### 🛡️ 6. Proteksi Khusus Hardware STB (eMMC & RAM)
* **Dukungan RAM Disk `tmpfs`:** Folder `/tmp` dapat di-mount sebagai `tmpfs` di Linux STB untuk melindungi chip flash eMMC internal (8GB) dari keausan siklus tulis unduhan harian.
* **Concurrency Limiter (`p-limit(2)`):** Mengatur antrean unduhan simultan maksimal 2 proses agar CPU dan RAM 1–2 GB STB tidak mengalami Out of Memory (OOM).
* **Orphan File Cleaner:** Pembersihan otomatis file sementara berumur $> 15\text{ menit}$ setiap 30 menit.
* **Thermal & RAM Alert:** Peringatan otomatis ke Admin jika suhu CPU $> 75^\circ\text{C}$ atau penggunaan RAM $> 90\%$.

---

## 📋 Daftar Perintah Bot

| Perintah | Hak Akses | Deskripsi |
|---|---|---|
| `/start` | Semua | Memulai bot, melihat status akun, level EXP, dan navigasi utama |
| `/menu` | Semua | Menampilkan keyboard tombol navigasi menu utama |
| `/help` | Semua | Panduan lengkap platform, downloader, keuangan, dan kontak admin |
| `/profile` | Semua | Melihat profil pengguna, level EXP keaktifan, dan statistik akun |
| `/saran` / `/request` | Semua | Mengirimkan ide atau usulan fitur baru langsung ke developer |
| `/lapor` / `/bug` | Semua | Melaporkan kendala, fitur error, atau tautan media yang gagal |
| `/feedback` | Semua | Membuka menu navigasi Request Fitur & Lapor Kendala |
| `/dukung` / `/donasi` | Semua | Salurkan dukungan sukarela operasional bot via QRIS Dinamis |
| `/donatur` | Semua | Menampilkan daftar donatur & sahabat dermawan bulan ini |
| `/catat <cerita>` | Semua | Mencatat pengeluaran keuangan otomatis lewat teks via AI Gemini |
| `/struk` | Semua | Memulai mode scan foto nota/struk belanja otomatis via AI Vision |
| `/keuangan` / `/laporan` | Semua | Membuka ringkasan keuangan pribadi (chat pribadi) atau kas grup (grup) |
| `/games` | Semua | Membuka arena dashboard permainan & mini-games interaktif |
| `/ttt` / `/tictactoe` | Semua | Bermain Tic Tac Toe 3-Bidak (Solo AI atau PvP tantang teman di grup) |
| `/family100` / `/f100` | Semua | Game kuis survei Family 100 (+2 EXP per tebakan benar) |
| `/tebakgambar` / `/tg` | Semua | Game teka-teki Tebak Gambar interaktif (+5 EXP) |
| `/dice` | Semua | Melempar dadu virtual Telegram melawan bot (+5 EXP) |
| `/slot` | Semua | Memutar mesin slot jackpot Telegram (+25 EXP jackpot) |
| `/tebak` | Semua | Kuis teka-teki pilihan ganda (+5 EXP) |
| `/claim` | Semua | Check-in harian bonus +20 EXP gratis setiap 24 jam |
| `/leaderboard` | Semua | Menampilkan papan peringkat pengguna teraktif berdasarkan total EXP |
| `/feedbacks` | Admin | Rekapitulasi statistik masukan dan daftar 10 masukan terbaru komunitas |
| `/health` | Admin | Memeriksa metrik suhu CPU, RAM, disk tmp, dan uptime STB/server |
| `/stats` | Admin | Statistik agregat pengguna, unduhan platform, donasi, dan masukan |
| `/backup` | Admin | Mengunduh salinan berkas database `bot.db` langsung ke Telegram |
| `/cleancache` | Admin | Mengosongkan cache kernel Linux (`sync && drop_caches`) |
| `/reboot` | Admin | Me-reboot server/STB dari jarak jauh dengan konfirmasi keamanan |
| `/speedtest` | Admin | Menjalankan tes kecepatan unduh jaringan server |
| `/updatedlp` | Admin | Memperbarui binary `yt-dlp` langsung ke versi rilis terbaru |
| `/broadcast <pesan>` | Admin | Mengirim pesan siaran massal ke seluruh pengguna bot |

---

## 🏗️ Struktur Arsitektur Sistem

```
├── src/
│   ├── config/config.ts           # Konfigurasi aplikasi & parsing .env
│   ├── database/
│   │   ├── db.ts                  # Koneksi better-sqlite3 (Mode WAL)
│   │   ├── migrations.ts          # Skema database deklaratif & atomic
│   │   └── repositories/          # Data Access Layer (Users, Downloads, Donations, Expenses, Feedbacks, Settings)
│   ├── services/
│   │   ├── downloaderService.ts   # Core engine yt-dlp & queue management
│   │   ├── aiExpenseService.ts    # Google Gemini AI text & vision multimodal
│   │   ├── qrisService.ts         # Dynamic QRIS payload generator & CRC16
│   │   ├── photoService.ts        # Album carousel chunking
│   │   ├── systemService.ts       # Monitoring metrik perangkat & Linux util
│   │   └── cronService.ts         # Penjadwal pembersihan file & thermal alert
│   ├── bot/
│   │   ├── bot.ts                 # Inisialisasi bot & composer mounting
│   │   ├── middlewares/           # Auth, RateLimiter, URL Detector
│   │   └── handlers/              # Start, Expense, Feedback, Topup, VIP, Games, TicTacToe, Download, Admin
│   └── index.ts                   # Bootstrapper utama & graceful shutdown
└── test/                          # Unit testing terintegrasi (120+ tests)
```

---

## 🚀 Panduan Instalasi & Menjalankan Bot

### 1. Prasyarat Sistem
* **Node.js:** Versi `>= 22.0.0` (Rekomendasi v22 atau v24 LTS).
* **Python & yt-dlp:** Terpasang di sistem (`yt-dlp` versi terbaru).
* **FFmpeg:** Terpasang di sistem (`ffmpeg`).

### 2. Kloning Repositori & Pasang Dependensi
```bash
git clone https://github.com/username/downloader_media_bot.git
cd downloader_media_bot
npm install
```

### 3. Konfigurasi Berkas `.env`
Salin berkas contoh konfigurasi:
```bash
cp .env.example .env
```
Sesuaikan variabel lingkungan:
```env
BOT_TOKEN=123456789:ABCDefGhIJKlmNoPQRstuVWxyz
ADMIN_IDS=123456789
DATABASE_PATH=./bot.db
TMP_DIR=/tmp
YT_DLP_PATH=/usr/local/bin/yt-dlp
FFMPEG_PATH=ffmpeg
GEMINI_API_KEY=key_anda_disini
```

### 4. Menjalankan Pengujian (Testing)
```bash
# Menjalankan seluruh pengujian unit logika bot (120+ tes)
npm test

# Menjalankan pengujian khusus alur pencatatan keuangan AI
npm run test:expense
```

### 5. Menjalankan Bot
```bash
# Mode Pengembangan (Live reload via tsx)
npm run dev

# Kompilasi & Jalankan di Produksi
npm run build
npm start
```

---

## 📄 Lisensi
Proyek ini didistribusikan di bawah lisensi **MIT License**.

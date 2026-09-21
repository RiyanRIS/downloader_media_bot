# 🤖 STB Downloader Bot

[![Node.js Version](https://img.shields.io/badge/node.js-%3E%3D22.0.0-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-%5E5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Framework](https://img.shields.io/badge/bot%20framework-grammY-4ea8de?logo=telegram)](https://grammy.dev/)
[![Database](https://img.shields.io/badge/database-better--sqlite3-003B57?logo=sqlite&logoColor=white)](https://github.com/WiseLibs/better-sqlite3)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Linux%20ARM64%20%7C%20x64%20%7C%20Windows-informational)]()

**STB Downloader Bot** adalah bot Telegram multi-platform downloader dan utilitas monitoring server yang dirancang khusus untuk berjalan secara stabil dan efisien pada perangkat berdaya rendah/hemat energi (seperti Android TV Box / STB ex-IndiHome **HG680-P**, **B860H** berbasis Linux Armbian/Debian ARM64) maupun server Linux x86_64 / VPS.

---

## 🌟 Fitur Unggulan

### 📥 1. Multi-Platform Media Downloader
* **Platform yang Didukung:** YouTube, TikTok (tanpa watermark), Instagram (Reels/Post), X (Twitter), dan Threads.
* **Pre-check Batas 50MB Telegram:** Deteksi ukuran file sebelum mengunduh via metadata `yt-dlp`. Jika estimasi video $> 48\text{ MB}$, bot otomatis menawarkan opsi **Unduh Audio MP3 Saja** untuk menghindari kegagalan kirim.
* **Pilihan Format & Resolusi Dinamis:** Dukungan pilihan resolusi YouTube (`720p`, `360p`, atau `MP3 Audio`) menggunakan Inline Keyboard.
* **Live Dynamic Progress:** Notifikasi status interaktif bertahap:
  1. `[1/3] ⏳ Menunggu antrean...`
  2. `[2/3] ⬇️ Mengunduh media...`
  3. `[3/3] ⬆️ Mengunggah ke Telegram...`

### 🛡️ 2. Proteksi Khusus Hardware STB (eMMC & RAM)
* **Zero-Persistence Policy:** File media sementara diunduh ke `TMP_DIR` dan langsung dihapus seketika (`fs.unlinkSync()`) setelah berhasil terunggah ke Telegram.
* **Dukungan RAM Disk `tmpfs`:** Mencegah degradasi chip memori flash internal eMMC (8GB) pada STB akibat siklus baca-tulis harian video.
* **Concurrency Limiter (`p-limit(2)`):** Membatasi proses unduhan simultan maksimal 2 antrean guna mencegah beban CPU 100% dan Out of Memory (OOM) pada RAM 1–2 GB.
* **Orphan File Cleaner:** Cron otomatis setiap 30 menit membersihkan file unduhan kedaluwarsa ($> 15\text{ menit}$) jika terjadi crash tak terduga.
* **Thermal & RAM Alert:** Peringatan otomatis ke Admin setiap 5 menit jika temperatur prosesor $> 75^\circ\text{C}$ atau penggunaan RAM $> 90\%$.

### 👥 3. Manajemen Pengguna, Kuota & VIP
* **Tier Pengguna Fleksibel:**
  * **Free:** Kuota 5 unduhan per hari (reset otomatis setiap 00:00 WIB).
  * **VIP:** Kuota 50 unduhan per hari dengan masa aktif bulanan (auto-demote saat kedaluwarsa).
  * **Admin:** Akses kuota tanpa batas dan kendali penuh bot.
* **Sistem Referral:** Pengguna mendapat tautan referral unik (`/ref`). Pengajak otomatis menerima bonus limit (+5 unduhan) untuk setiap pengguna baru yang bergabung.
* **Verifikasi VIP 1-Klik:** Pengguna dapat mengirim foto bukti transfer bank/e-wallet; bot meneruskannya ke semua Admin lengkap dengan tombol inline `[✅ Konfirmasi VIP 30 Hari]`.

### 🛠️ 4. Utilitas & Monitoring Server Jarak Jauh (Admin)
* `/health`: Diagnostik metrik real-time (Suhu CPU, Penggunaan RAM, Penyimpanan Tmp, dan Uptime).
* `/stats`: Laporan statistik total pengguna, pengguna VIP, dan ringkasan unduhan per platform.
* `/backup`: Ekspor dan kirim berkas basis data SQLite (`bot.db`) langsung ke Telegram Admin.
* `/cleancache`: Pembersihan cache memori Linux (`sync && echo 3 > /proc/sys/vm/drop_caches`).
* `/reboot`: Muat ulang STB jarak jauh dengan prompt konfirmasi keamanan.
* `/speedtest`: Tes kecepatan latensi & unduh jaringan server.
* `/updatedlp`: Pembaruan binary `yt-dlp` langsung ke versi rilis terbaru tanpa membuka terminal.
* `/broadcast`: Siaran pesan massal ke seluruh pengguna terdaftar dengan mekanisme anti-flood (maks 25 msg/detik).

---

## 📋 Daftar Perintah Bot

| Perintah | Hak Akses | Deskripsi |
|---|---|---|
| `/start` | Semua | Memulai bot, melihat informasi akun, dan aktivasi kode referral |
| `/help` | Semua | Panduan format link media yang didukung dan aturan batas file |
| `/profile` | Semua | Cek status keanggotaan (Free/VIP/Admin), sisa kuota hari ini, dan masa aktif |
| `/ref` | Semua | Menampilkan tautan undangan referral dan total teman yang bergabung |
| `/health` | Admin | Menampilkan suhu CPU, penggunaan RAM, ruang tmpfs, dan uptime perangkat |
| `/stats` | Admin | Statistik agregasi total pengguna, VIP aktif, dan unduhan per platform |
| `/backup` | Admin | Mengunduh salinan berkas database `bot.db` ke Telegram |
| `/cleancache` | Admin | Mengosongkan cache RAM kernel Linux (`drop_caches`) |
| `/reboot` | Admin | Me-reboot server/STB dengan konfirmasi tombol inline |
| `/speedtest` | Admin | Menjalankan uji kecepatan koneksi internet server |
| `/updatedlp` | Admin | Memperbarui binary `yt-dlp` ke rilis terbaru |
| `/addvip <id> <hari>` | Admin | Menambahkan status VIP ke pengguna tertentu |
| `/delvip <id>` | Admin | Mencabut status VIP pengguna |
| `/setlimit <id> <kuota>` | Admin | Mengatur custom batas unduhan harian untuk pengguna tertentu |
| `/ban <id>` / `/unban <id>` | Admin | Memblokir atau membuka blokir akses pengguna |
| `/broadcast <pesan>` | Admin | Mengirim pesan siaran ke seluruh pengguna aktif |

---

## 🏗️ Struktur Proyek

```
downloader_media_bot/
├── src/
│   ├── config/
│   │   └── config.ts                # Variabel environment, parser Admin ID, resolver path
│   ├── database/
│   │   ├── db.ts                    # Inisialisasi better-sqlite3 (Mode WAL, sync NORMAL)
│   │   ├── migrations.ts            # Skema tabel: users, downloads_log, system_settings
│   │   └── repositories/
│   │       ├── userRepository.ts    # Manajemen user, tier role, limit, referral, ban
│   │       ├── downloadRepository.ts# Pencatatan transaksi unduhan & agregasi statistik
│   │       └── settingsRepository.ts# Pengaturan sistem dinamis (key-value)
│   ├── services/
│   │   ├── downloaderService.ts     # Engine yt-dlp, antrean p-limit(2), ekstraksi metadata
│   │   ├── systemService.ts         # Metrik systeminformation, reboot, drop_caches, cleaner
│   │   └── cronService.ts           # Midnight reset (00:00), thermal alert, orphan cleaner
│   ├── bot/
│   │   ├── context.ts               # Custom context grammY (ctx.user)
│   │   ├── bot.ts                   # Inisialisasi bot, error handler, runner launcher
│   │   ├── middlewares/
│   │   │   ├── auth.ts              # Autentikasi user otomatis, validasi blacklist/ban
│   │   │   ├── rateLimit.ts         # Rate limiter anti-spam (maks 3 req / 2.5 detik)
│   │   │   └── urlDetector.ts       # RegEx filter URL YouTube, TikTok, IG, X, Threads
│   │   └── handlers/
│   │       ├── start.ts             # Handler /start, /help, /profile, /ref
│   │       ├── download.ts          # Handler unduh media, inline keyboard, upload file
│   │       ├── vip.ts               # Handler bukti pembayaran VIP & approval admin
│   │       └── admin.ts             # Handler perintah manajemen server & diagnostik
│   └── index.ts                     # Entry point, pengecekan binary, graceful shutdown
├── test/
│   └── index.test.ts                # Unit testing (Database, regex, logic, limit, health)
├── .env.example                     # Contoh template konfigurasi environment
├── package.json
└── tsconfig.json
```

---

## ⚙️ Prasyarat Sistem

1. **Node.js**: Versi `>= 20.x` atau `>= 22.x LTS`.
2. **ffmpeg**: Terpasang dan dapat diakses dari PATH sistem.
   ```bash
   # Debian / Ubuntu / Armbian
   sudo apt update && sudo apt install -y ffmpeg
   ```
3. **yt-dlp**: Binary mandiri versi terbaru.
   * **Linux x86_64:**
     ```bash
     sudo wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp
     sudo chmod a+rx /usr/local/bin/yt-dlp
     ```
   * **Linux ARM64 (STB HG680-P / B860H / Raspberry Pi):**
     ```bash
     sudo wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64 -O /usr/local/bin/yt-dlp
     sudo chmod a+rx /usr/local/bin/yt-dlp
     ```
   * **Windows:** Unduh `yt-dlp.exe` dari [yt-dlp GitHub Releases](https://github.com/yt-dlp/yt-dlp/releases) dan letakkan di PATH sistem atau direktori proyek.

---

## 🚀 Panduan Instalasi & Menjalankan

### 1. Klon Repositori & Pasang Dependensi
```bash
git clone https://github.com/username/downloader_media_bot.git
cd downloader_media_bot
npm install
```

### 2. Salin & Sesuaikan Konfigurasi `.env`
```bash
cp .env.example .env
```

Buka berkas `.env` menggunakan teks editor favorit Anda (`nano .env`) dan sesuaikan nilainya:
```env
BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRstuVWXyz   # Token dari @BotFather
ADMIN_IDS=123456789,987654321                    # Telegram ID Admin (cek via @userinfobot)
DATABASE_PATH=./bot.db
TMP_DIR=/tmp                                     # Di STB gunakan /tmp (tmpfs)
YT_DLP_PATH=/usr/local/bin/yt-dlp                # Path binary yt-dlp
FFMPEG_PATH=ffmpeg
MAX_CONCURRENT_DOWNLOADS=2
MAX_FILE_SIZE_MB=48
FREE_DAILY_LIMIT=5
VIP_DAILY_LIMIT=50
ENABLE_THERMAL_ALERT=true
THERMAL_ALERT_TEMP_C=75
RAM_ALERT_PERCENT=90
```

### 3. (Rekomendasi STB) Konfigurasi RAM Disk `tmpfs`
Untuk melindungi memori eMMC STB dari keausan akibat unduhan berulang:
```bash
# Tambahkan entri berikut ke /etc/fstab jika belum ada
tmpfs /tmp tmpfs defaults,noatime,nosuid,size=600M 0 0
```
Lalu muat ulang mount:
```bash
sudo mount -o remount /tmp
```

### 4. Uji Coba Unit Test
Jalankan pengujian terintegrasi untuk memverifikasi database migrasi, regex extractor, dan layanan sistem:
```bash
npm test
```

### 5. Jalankan Bot
* **Mode Pengembangan (Hot-reload):**
  ```bash
  npm run dev
  ```
* **Mode Produksi:**
  ```bash
  npm run build
  npm start
  ```

---

## 🔄 Menjalankan sebagai Background Service (Systemd)

Agar bot otomatis berjalan saat perangkat menyala (auto-start on boot) dan me-restart sendiri jika terjadi galat:

1. Buat berkas service systemd:
   ```bash
   sudo nano /etc/systemd/system/stb-bot.service
   ```
2. Tempel konfigurasi berikut (sesuaikan `User` dan `WorkingDirectory`):
   ```ini
   [Unit]
   Description=STB Media Downloader Telegram Bot
   After=network.target

   [Service]
   Type=simple
   User=root
   WorkingDirectory=/root/downloader_media_bot
   ExecStart=/usr/bin/node /root/downloader_media_bot/dist/index.js
   Restart=always
   RestartSec=10
   Environment=NODE_ENV=production

   [Install]
   WantedBy=multi-user.target
   ```
3. Aktifkan dan jalankan service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable stb-bot
   sudo systemctl start stb-bot
   ```
4. Cek status bot:
   ```bash
   sudo systemctl status stb-bot
   ```

---

## 🍪 Panduan Konfigurasi Cookies (Bypass 403 Forbidden & Login Wall)

Jika Anda sering mengunduh media dari **Instagram**, video YouTube berlabel batasan usia (**Age-Restricted**), atau mengalami kendala **`HTTP Error 403: Forbidden`**, Anda sangat disarankan untuk memasang file `cookies.txt`:

### 1. Ekspor Cookies dari Browser (Format Netscape)
* **Menggunakan Ekstensi Browser (Paling Praktis):**
  1. Pasang ekstensi open-source **[Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)** di Chrome/Edge/Brave atau **cookies.txt** di Firefox.
  2. Buka situs [YouTube](https://www.youtube.com) atau [Instagram](https://www.instagram.com), lalu pastikan akun Anda sudah dalam kondisi **Login** (disarankan menggunakan akun sekunder/cadangan).
  3. Buka ekstensi tersebut, lalu klik tombol **Export** untuk mengunduh berkas `cookies.txt`.
* **Menggunakan Terminal CLI (Jika satu komputer dengan browser):**
  ```bash
  yt-dlp --cookies-from-browser chrome --dump-cookies > cookies.txt
  ```

### 2. Pasang ke Direktori Bot
1. Letakkan berkas `cookies.txt` di folder root proyek bot:
   ```text
   downloader_media_bot/cookies.txt
   ```
2. Buka berkas `.env` dan tentukan lokasi path-nya:
   ```env
   COOKIES_PATH=./cookies.txt
   ```
3. Bot akan otomatis menyertakan argumen `--cookies` pada setiap proses pengunduhan media. Berkas `cookies.txt` telah didaftarkan ke `.gitignore` sehingga tidak akan sengaja terunggah ke Git.

---

## 🩺 Penanganan Masalah (Troubleshooting)

| Gejala Masalah | Penyebab Utama | Solusi |
|---|---|---|
| `HTTP Error 403: Forbidden` | YouTube JS challenge gagal dipecahkan, rate limit IP, atau login wall Instagram | Bot sudah menyertakan `--js-runtimes node` untuk memecahkan cipher YouTube otomatis. Jika masih terjadi pada Instagram/konten privat, pasang `cookies.txt` via `COOKIES_PATH` di `.env`. Bila terkena rate limit, beri jeda 5–10 menit. |
| `Requested format is not available` | Format selector lama mencari format tunggal (*progressive*), sementara YouTube Shorts/video modern hanya menyediakan stream DASH terpisah | Bot telah diperbarui menggunakan format selector sorting `-S res:720,ext:mp4:m4a -f bestvideo+bestaudio/best` yang secara otomatis menggabungkan video & audio terpisah via FFmpeg. |
| `can't parse entities: Can't find end of the entity` | Username bot/user memiliki garis bawah `_` atau judul video mengandung karakter khusus yang merusak parsing Markdown Telegram | Handler bot telah beralih menggunakan format `HTML` (`parse_mode: 'HTML'`) dengan sanitasi teks otomatis `escapeHtml()` dan fallback pengiriman pesan aman. |
| `Support for Python version 3.10 has been deprecated` | yt-dlp versi rilis terbaru mengingatkan rencana penghentian dukungan Python 3.10 | Peringatan ini bersifat non-blocking dan telah disaring dari respons bot. Untuk jangka panjang, disarankan memperbarui ke Python 3.11+ atau mengunduh binary mandiri `yt-dlp` dari GitHub Release. |
| `error: externally-managed-environment` (PEP 668) | Debian 12 / Armbian memblokir instalasi pip global | Unduh standalone binary `yt-dlp` langsung dari rilis GitHub ke `/usr/local/bin/yt-dlp` (jangan pakai `pip install` global tanpa virtualenv). |
| `cannot execute binary file: Exec format error` | Mengunduh binary arsitektur x86_64 di prosesor ARM64 | Hapus binary lama, lalu unduh `yt-dlp_linux_aarch64` khusus untuk CPU ARM64. |
| `better-sqlite3` build/compile error | Ketidakcocokan compiler C++ pada versi Node tertentu | Gunakan rilis `better-sqlite3@^11.8.1` yang sudah menyediakan prebuilt binary stabil untuk Node.js v22/v24. |

---

## 📄 Lisensi

Proyek ini dilisensikan di bawah lisensi **[MIT](LICENSE)**. Anda bebas memodifikasi, mendistribusikan, dan menggunakannya untuk kebutuhan pribadi maupun komersial.

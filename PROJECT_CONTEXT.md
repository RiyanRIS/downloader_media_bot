# 🧠 PROJECT CONTEXT & ARCHITECTURE SUMMARY
> **Catatan untuk AI / Pengembang di Sesi Mendatang:**
> Baca dokumen ini untuk memahami seluruh arsitektur, dependensi, alur kerja, dan skema database tanpa perlu membaca ulang seluruh baris kode di repositori.

---

## 1. Ringkasan Proyek & Target Lingkungan
* **Nama Proyek:** `stb-downloader-bot` (Multi-Platform Downloader & STB Utility Telegram Bot).
* **Fungsi Utama:**
  1. Pengunduh media otomatis (YouTube, TikTok, Instagram, X/Twitter, Threads) dengan pre-check batas 50MB Telegram Bot API, pilihan resolusi/MP3, dan antrean `p-limit(2)`.
  2. Manajemen & monitoring server lokal / STB ARM64 (HG680-P / FJ) & Linux x64: `/health`, `/reboot`, `/cleancache`, `/speedtest`, `/updatedlp`.
  3. Sistem tier pengguna: Free (5 limit/hari), VIP (50 limit/hari), Admin (unlimited), referral bonus (+5 limit), dan verifikasi transfer manual 1-klik.
* **Tech Stack:**
  * Node.js (v22/v24 LTS, ESM `"type": "module"`)
  * TypeScript (`tsx` untuk dev, `tsc` untuk build `dist/`)
  * Framework Bot: `grammY` + `@grammyjs/runner` + `@grammyjs/ratelimiter`
  * Database: `better-sqlite3` (Mode WAL, synchronous NORMAL, cache 2MB)
  * Downloader Engine: `yt-dlp` binary + `ffmpeg`
  * Monitoring: `systeminformation`
  * Concurrency: `p-limit`

---

## 2. Peta Struktur File (`src/`)

```
src/
├── config/
│   └── config.ts                # Load .env, parse ADMIN_IDS, resolve cross-platform tmpDir, typed getters
├── database/
│   ├── db.ts                    # Inisialisasi better-sqlite3 + PRAGMA WAL, foreign_keys ON
│   ├── migrations.ts            # DDL tabel: users, downloads_log, system_settings & seed default
│   └── repositories/
│       ├── userRepository.ts    # CRUD user, tier (user/vip/admin), auto demote expired VIP, referral, ban
│       ├── downloadRepository.ts# Pencatatan log unduhan & agregasi statistik per platform
│       └── settingsRepository.ts# Key-value dynamic system config
├── services/
│   ├── downloaderService.ts     # p-limit(2), yt-dlp --dump-json (pre-check <48MB), downloadMedia(), updateYtDlp()
│   ├── systemService.ts         # systeminformation (CPU temp, RAM, Disk tmp, Uptime), reboot, drop_caches, speedtest
│   └── cronService.ts           # Midnight reset kuota (00:00), orphan file cleaner (30m), thermal alert (>75°C)
├── bot/
│   ├── context.ts               # Custom MyContext (menempelkan ctx.user dari authMiddleware)
│   ├── bot.ts                   # Inisialisasi Bot, error handler, runner launcher
│   ├── middlewares/
│   │   ├── auth.ts              # getOrCreateUser, cek is_banned, pasang ctx.user
│   │   ├── rateLimit.ts         # @grammyjs/ratelimiter (maks 3 req / 2.5 detik)
│   │   └── urlDetector.ts       # RegEx extractor YouTube, TikTok, IG, X, Threads
│   └── handlers/
│       ├── start.ts             # /start (payload referral ?ref=<id>), /help, /profile, /ref
│       ├── download.ts          # Tangkap link, status progress dinamis, inline button format, upload & unlink
│       ├── vip.ts               # Forward foto bukti transfer ke Admin + callback konfirmasi/tolak
│       └── admin.ts             # /health, /stats, /backup, /reboot, /cleancache, /speedtest, /updatedlp, /broadcast
└── index.ts                     # Bootstrap migrasi, verifikasi binary yt-dlp, startup cleaner, graceful shutdown
```

---

## 3. Skema Database (SQLite)

### Tabel `users`
* `telegram_id` (INTEGER PK): ID Telegram unik pengguna.
* `username` (TEXT, Nullable): Username Telegram.
* `role` (TEXT): `'user'` | `'vip'` | `'admin'`.
* `daily_usage` (INTEGER): Jumlah download hari ini (direset pukul 00:00).
* `custom_limit` (INTEGER, Nullable): Override batas harian per user.
* `vip_expires_at` (TEXT/ISO string, Nullable): Masa kedaluwarsa VIP (otomatis turun ke `'user'` jika lewat).
* `referrer_id` (INTEGER, Nullable): Telegram ID yang mengajak.
* `is_banned` (INTEGER): 0 (Aktif) atau 1 (Diblokir).
* `created_at` (TEXT): Timestamp pendaftaran.

### Tabel `downloads_log`
* `id` (INTEGER PK AUTOINCREMENT)
* `telegram_id` (INTEGER FK ke `users.telegram_id`)
* `platform` (TEXT): `'youtube'`, `'tiktok'`, `'instagram'`, `'twitter'`, `'threads'`, `'facebook'`, `'reddit'`, `'pinterest'`, `'bilibili'`, `'generic'`
* `url` (TEXT): URL media yang diunduh
* `file_type` (TEXT): `'video'` | `'audio'` | `'photo'` | `'album'`
* `file_size_bytes` (INTEGER, Nullable): Ukuran file dalam bytes
* `downloaded_at` (TEXT): Timestamp transaksi

### Tabel `system_settings`
* `key` (TEXT PK), `value` (TEXT): Konfigurasi dinamis (`free_daily_limit`, `vip_daily_limit`, dll.).

---

## 4. Alur Kerja Utama & Aturan Kritis (*Core Rules*)

### A. Alur Download Media
1. Pesan teks masuk $\to$ `rateLimiterMiddleware` $\to$ `authMiddleware` (cek ban & lampirkan `ctx.user`).
2. `urlDetector.ts` mengekstrak URL dengan RegEx.
3. Cek kuota: `daily_usage >= effectiveLimit`. Jika habis, tolak.
4. Bot kirim pesan status awal: `🔍 Memeriksa tautan media...`
5. `downloaderService.getMediaInfo(url)` mengeksekusi `yt-dlp --dump-json` (timeout 35s):
   * **Batas Telegram 50MB:** Jika estimasi $> 48\text{ MB}$, tampilkan tombol **`🎧 Unduh Audio MP3 Saja`**.
   * Jika aman, tampilkan Inline Keyboard: YouTube (`720p` / `360p` / `MP3`), Platform lain (`Video` / `MP3`).
6. User memilih tombol format $\to$ Request masuk ke `downloadQueue` (`p-limit(2)`).
7. Live status bertahap diedit:
   * `[1/3] ⏳ Menunggu antrean...`
   * `[2/3] ⬇️ Mengunduh media...`
   * `[3/3] ⬆️ Mengunggah ke Telegram...`
8. Kirim via `replyWithVideo` atau `replyWithAudio`.
9. **Zero-Persistence:** File di `TMP_DIR` **wajib langsung dihapus** via `fs.unlinkSync()`. Pesan status dihapus.
10. Catat kuota (`incrementDailyUsage`) & insert log ke `downloads_log`.

### B. Proteksi Hardware STB (eMMC & RAM)
* **RAM Disk `tmpfs`:** Di server Linux STB, folder `/tmp` di-mount sebagai `tmpfs` sebesar 600MB di `/etc/fstab` agar eMMC 8GB tidak rusak oleh siklus tulis harian video.
* **Orphan Cleaner:** Setiap 30 menit, file `dl_*` di folder tmp yang berumur $> 15\text{ menit}$ otomatis dibersihkan.
* **Thermal Alert:** Setiap 5 menit, jika CPU $> 75^\circ\text{C}$ atau RAM $> 90\%$, bot mengirim peringatan ke semua `ADMIN_IDS` (cooldown 30 menit).

### C. Alur VIP & Referral
* Referral via `/start?ref=<id>`: Memberikan bonus limit (+5 unduhan) ke pengajak.
* Pembayaran: User mengirim foto bukti transfer $\to$ Bot meneruskan ke Admin dengan tombol `[✅ Konfirmasi VIP 30 Hari]` $\to$ 1-klik aktivasi instan tanpa manual query.

---

## 5. Daftar Perintah Bot

| Perintah | Akses | Fungsi |
|---|---|---|
| `/start` | Semua | Pesan pembuka, info akun, aktivasi referral |
| `/help` | Semua | Panduan lengkap platform & aturan ukuran file |
| `/profile` | Semua | Cek status role, sisa kuota hari ini, masa aktif VIP |
| `/ref` | Semua | Tautan referral & statistik teman yang diundang |
| `/health` | Admin | Diagnostik real-time CPU temp, RAM, Disk, Uptime |
| `/stats` | Admin | Total user, VIP, total download per platform |
| `/backup` | Admin | Kirim berkas `bot.db` langsung ke Telegram |
| `/cleancache` | Admin | Bersihkan cache RAM Linux (`drop_caches`) |
| `/reboot` | Admin | Reboot STB jarak jauh dengan dialog konfirmasi |
| `/speedtest` | Admin | Tes kecepatan jaringan STB (payload 10MB) |
| `/updatedlp` | Admin | Perbarui binary `yt-dlp` on-demand (`yt-dlp -U`) |
| `/addvip <id> <hari>` | Admin | Beri status VIP manual |
| `/delvip <id>` | Admin | Cabut status VIP |
| `/setlimit <id> <kuota>` | Admin | Atur custom limit harian pengguna |
| `/ban <id>` / `/unban <id>` | Admin | Blokir / buka blokir pengguna |
| `/broadcast <pesan>` | Admin | Siaran massal dengan jeda aman anti-flood (maks 25 msg/s) |

---

## 6. Konfigurasi Environment (`.env`)
```env
BOT_TOKEN=token_telegram_dari_botfather
ADMIN_IDS=123456789,987654321
DATABASE_PATH=./bot.db
TMP_DIR=/tmp                 # Gunakan /tmp di Linux, atau folder lokal di Dev
YT_DLP_PATH=/usr/local/bin/yt-dlp # Symlink / binary path yt-dlp
FFMPEG_PATH=ffmpeg
COOKIES_PATH=                # Path file cookies.txt opsional (bypass IG/X)
MAX_CONCURRENT_DOWNLOADS=2   # p-limit concurrency
MAX_FILE_SIZE_MB=48          # Telegram hard limit 50MB
DOWNLOAD_TIMEOUT_MS=180000   # 3 menit timeout
FREE_DAILY_LIMIT=5
VIP_DAILY_LIMIT=50
REFERRAL_BONUS_LIMIT=5
ENABLE_THERMAL_ALERT=true
THERMAL_ALERT_TEMP_C=75
RAM_ALERT_PERCENT=90
```

---

## 7. Catatan Masalah Umum & Solusi Cepat (Troubleshooting)

1. **Error `externally-managed-environment` (PEP 668 di Debian 12 / Armbian):**
   * Gunakan `pip install yt-dlp --break-system-packages` ATAU unduh binary mandiri:
     * Linux x86_64: `sudo wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp`
     * Linux ARM64 (STB): `sudo wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64 -O /usr/local/bin/yt-dlp`
2. **Error `cannot execute binary file: Exec format error`:**
   * Terjadi karena binary arsitektur salah (misal binary ARM64 dijalankan di CPU x86_64). Hapus dan pasang binary yang sesuai atau buat symlink dari pip: `sudo ln -s ~/.local/bin/yt-dlp /usr/local/bin/yt-dlp`.
3. **Pencegahan Error `403 Forbidden` & YouTube Cipher:**
   * yt-dlp dijalankan dengan opsi `--js-runtimes node` agar Node.js mengeksekusi tantangan JavaScript YouTube secara otomatis.
   * Untuk login wall Instagram / YouTube batasan usia, letakkan file `cookies.txt` di root folder dan set `COOKIES_PATH=./cookies.txt` di `.env` (file ini otomatis diabaikan oleh `.gitignore`).
4. **Format Selector YouTube Shorts & Lanskap:**
   * Menggunakan format sorting `-S res:720,ext:mp4:m4a -f bestvideo+bestaudio/best --merge-output-format mp4`. Ini menghindari bug `Requested format is not available` pada video Shorts (720x1280) dan menggabungkan stream terpisah via FFmpeg.
5. **Keamanan Parsing Pesan Telegram:**
   * Seluruh handler bot menggunakan mode `HTML` (`parse_mode: 'HTML'`) dan fungsi `escapeHtml()` agar karakter `_` pada username (cth: `@ivy_your_assistant_bot`) tidak merusak entitas Markdown. Dilengkapi fallback pengiriman plain text.
6. **Versi `better-sqlite3` & Testing:**
   * Di Windows / Node 22-24, gunakan versi `^11.8.1` yang memiliki prebuilt binary stabil.
   * `npm test` menjalankan 24 unit test terintegrasi (database, regex, limit, health, orphan cleaner).

# 🧠 PROJECT CONTEXT & ARCHITECTURE SUMMARY
> **Catatan untuk AI / Pengembang di Sesi Mendatang:**
> Baca dokumen ini untuk memahami seluruh arsitektur, dependensi, alur kerja, dan skema database tanpa perlu membaca ulang seluruh baris kode di repositori.

---

## 1. Ringkasan Proyek & Target Lingkungan
* **Nama Proyek:** `stb-downloader-bot` (Multi-Platform Downloader & STB Utility Telegram Bot).
* **Fungsi Utama:**
  1. Pengunduh media otomatis (YouTube, TikTok, Instagram, X/Twitter, Threads) dengan pre-check batas 50MB Telegram Bot API, pilihan resolusi/MP3, dan antrean `p-limit(2)`.
  2. Manajemen & monitoring server lokal / STB ARM64 (HG680-P / FJ) & Linux x64: `/health`, `/reboot`, `/cleancache`, `/speedtest`, `/updatedlp`.
  3. Sistem tier pengguna: Free User (ekonomi koin, 5 koin/unduh, modal 500 koin), VIP (unduh & catat AI gratis tanpa koin sepuasnya), Admin (unlimited).
  4. Pencatatan Keuangan & Dompet Cerdas (AI Gemini): Ekstraksi bahasa santai/gaul (`/catat`), OCR foto struk belanja (`/struk`), rekapitulasi dompet harian & bulanan (`/keuangan`, `/laporan`), serta edit kategori & penambahan catatan interaktif.
* **Tech Stack:**
  * Node.js (v22/v24 LTS, ESM `"type": "module"`)
  * TypeScript (`tsx` untuk dev, `tsc` untuk build `dist/`)
  * Framework Bot: `grammY` + `@grammyjs/runner` + `@grammyjs/ratelimiter`
  * Database: `better-sqlite3` (Mode WAL, synchronous NORMAL, cache 2MB)
  * Downloader Engine: `yt-dlp` binary + `ffmpeg`
  * AI Engine: Google Gemini API (`@google/genai`, model default `gemini-flash-latest` & fallback `gemini-flash-lite-latest`)
  * Monitoring: `systeminformation`
  * Concurrency: `p-limit`

---

## 2. Peta Struktur File (`src/`)

```
src/
├── config/
│   └── config.ts                # Load .env, parse ADMIN_IDS, resolve cross-platform tmpDir, typed getters (termasuk geminiApiKey & geminiModel)
├── database/
│   ├── db.ts                    # Inisialisasi better-sqlite3 + PRAGMA WAL, foreign_keys ON
│   ├── migrations.ts            # DDL tabel: users, downloads_log, transactions_log, expenses, system_settings & seed default
│   └── repositories/
│       ├── userRepository.ts    # CRUD user, tier (user/vip/admin), auto demote expired VIP, referral, ban
│       ├── downloadRepository.ts# Pencatatan log unduhan & agregasi statistik per platform
│       ├── expenseRepository.ts # CRUD pengeluaran, rekapitulasi harian/bulanan, breakdown kategori, update notes
│       └── settingsRepository.ts# Key-value dynamic system config
├── services/
│   ├── downloaderService.ts     # p-limit(2), yt-dlp --dump-json (pre-check <48MB), downloadMedia(), updateYtDlp()
│   ├── aiExpenseService.ts      # Ekstraksi keuangan teks santai & OCR struk belanja (Gemini Flash, auto-retry 503, fallback)
│   ├── systemService.ts         # systeminformation (CPU temp, RAM, Disk tmp, Uptime), reboot, drop_caches, speedtest
│   └── cronService.ts           # Midnight reset kuota (00:00), orphan file cleaner (30m), thermal alert (>75°C)
├── games/
│   ├── quizData.ts              # Bank soal tebak-tebakan, logika, dan asah otak interaktif
│   ├── tebakGambarData.ts       # Dataset Tebak Gambar BochilTeam + online fetcher & clue generator
│   └── family100Data.ts         # Dataset Family 100 plesdisgila (1700+ soal survei) + fallback offline
├── bot/
│   ├── context.ts               # Custom MyContext (menempelkan ctx.user dari authMiddleware)
│   ├── bot.ts                   # Inisialisasi Bot, error handler, runner launcher, pasang semua composers
│   ├── middlewares/
│   │   ├── auth.ts              # getOrCreateUser, cek is_banned, pasang ctx.user
│   │   ├── rateLimit.ts         # @grammyjs/ratelimiter (maks 3 req / 2.5 detik)
│   │   └── urlDetector.ts       # RegEx extractor YouTube, TikTok, IG, X, FB, Reddit, Pin, Bilibili
│   └── handlers/
│       ├── start.ts             # /start (payload referral ?ref=<id>), /help, /profile, /ref
│       ├── expense.ts           # /catat <cerita>, /struk (foto struk OCR), /keuangan, /laporan, inline edit category/notes/delete
│       ├── game.ts              # /games, /family100, /tebakgambar, /dice, /slot, /tebak, /claim, /koin, /tukar, /leaderboard
│       ├── download.ts          # Tangkap link, status progress dinamis, inline button format, upload & unlink
│       ├── topup.ts             # QRIS Dinamis & Katalog Paket Koin (+ CS / Info Kontak Admin & button invoice)
│       ├── vip.ts               # Verifikasi manual bukti pembayaran QRIS/VIP ke Admin (+ button kontak saat tolak)
│       └── admin.ts             # /health, /stats, /backup, /reboot, /cleancache, /speedtest, /updatedlp, /broadcast
├── utils/
│   ├── format.ts                # escapeHtml, formatRupiah
│   └── contact.ts               # getAdminContactInfo (resolve .env username/custom URL & database fallback)
├── website/                     # Website dokumentasi, SEO landing page & Terms of Service (CoderDocs style)
│   ├── index.html               # Halaman panduan utama & cheatsheet
│   ├── terms.html               # Ketentuan Layanan (ToS), DMCA & Disclaimer Hak Cipta
│   ├── privacy.html             # Kebijakan Privasi & Zero-Persistence data
│   ├── sitemap.xml & robots.txt # File optimasi SEO Google Search Console
│   └── assets/                  # CSS CoderDocs modern & JavaScript interaktif
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
* `coins` (INTEGER, Default 500): Saldo koin virtual pemain.
* `exp` (INTEGER, Default 0): Poin pengalaman level game.
* `games_played` (INTEGER, Default 0): Total permainan yang dimainkan.
* `games_won` (INTEGER, Default 0): Total kemenangan permainan.
* `last_daily_claim` (TEXT, Nullable): Tanggal klaim koin harian (YYYY-MM-DD).
* `created_at` (TEXT): Timestamp pendaftaran.

### Tabel `downloads_log`
* `id` (INTEGER PK AUTOINCREMENT)
* `telegram_id` (INTEGER FK ke `users.telegram_id`)
* `platform` (TEXT): `'youtube'`, `'tiktok'`, `'instagram'`, `'twitter'`, `'threads'`, `'facebook'`, `'reddit'`, `'pinterest'`, `'bilibili'`, `'generic'`
* `url` (TEXT): URL media yang diunduh
* `file_type` (TEXT): `'video'` | `'audio'` | `'photo'` | `'album'`
* `file_size_bytes` (INTEGER, Nullable): Ukuran file dalam bytes
* `downloaded_at` (TEXT): Timestamp transaksi

### Tabel `expenses`
* `id` (INTEGER PK AUTOINCREMENT)
* `telegram_id` (INTEGER FK ke `users.telegram_id`): ID user pencatat.
* `chat_id` (INTEGER, Nullable): ID grup Telegram jika dicatat di grup (Kas Grup/Keluarga), atau NULL/ID user jika private.
* `user_name` (TEXT, Nullable): Nama display pengguna pencatat transaksi.
* `amount` (INTEGER): Nominal pengeluaran dalam Rupiah.
* `category` (TEXT): Kategori belanja (`Makanan & Minuman`, `Belanja Harian`, `Transportasi`, `Tagihan & Pulsa`, `Hiburan`, `Kesehatan`, `Lainnya`).
* `merchant` (TEXT, Nullable): Nama toko / tempat belanja.
* `items_detail` (TEXT, Nullable): Ringkasan item belanja.
* `notes` (TEXT, Nullable): Catatan kustom pengguna (dibuat/diedit interaktif lewat tombol bot).
* `raw_input` (TEXT, Nullable): Teks mentah masukan pengguna atau `[Foto Struk Belanja]`.
* `source_type` (TEXT): `'text'` atau `'receipt'`.
* `is_personal` (INTEGER, Default 1): 1 jika dihitung di dompet pribadi, 0 jika hanya di kas grup (di-toggle via tombol `📌 Simpan juga di Pribadi`).
* `created_at` (TEXT): Timestamp pencatatan (lokal).

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

### D. Alur Pencatatan Keuangan & Kas Grup Cerdas (AI Gemini)
1. **Input Teks Cerita (`/catat <cerita belanja>`)**:
   * Pengguna menceritakan pengeluaran dengan bahasa bebas / gaul (misal: *"beli beras 5kg 75rb"*, *"bayar listrik 250k"*).
   * `aiExpenseService.parseExpenseFromText()` memanggil Gemini API dengan prompt terstruktur JSON untuk mengekstrak nominal, toko, item, dan kategori.
2. **Input Foto Struk Belanja (`/struk` atau foto ber-caption `/struk` / `/catat`)**:
   * Foto struk diunduh langsung ke memory buffer (`Buffer`), **zero-persistence** tanpa membebani disk/eMMC server.
   * `aiExpenseService.parseExpenseFromReceipt()` melakukan OCR visi multimodal untuk membaca total bayar, nama merchant, dan item.
3. **Mekanisme Ketahanan & Failover Multi-Key AI**:
   * **Multi-Key Failover Pool:** Mendukung lebih dari satu API key (cth: `GEMINI_API_KEY=key1,key2`). Jika Key #1 mencapai batas kuota gratis (`429 RESOURCE_EXHAUSTED`), sistem otomatis beralih (*failover*) ke Key cadangan (#2, #3, dst).
   * **Model Hierarchy:** Menggunakan alias resmi Google `gemini-flash-latest` (default) dengan fallback berurutan ke `gemini-flash-lite-latest`, `gemini-3.8-flash`, dan `gemini-3.5-flash`.
   * **Auto-retry 1.5 detik:** Jika Google mengembalikan error lonjakan antrean sesaat (`503 UNAVAILABLE / high demand`).
4. **Mode Kas Grup / Keluarga & Tombol Sinkronisasi Pribadi**:
   * Jika dicatat di dalam grup (chat type `group`/`supergroup`), otomatis disimpan ke Kas Grup (`chat_id = ctx.chat.id`, `is_personal = 0`).
   * Tombol `[ 📌 Simpan juga di Pribadi ]` memungkinkan user pencatat menyinkronkan transaksi ke catatan dompet pribadinya (`is_personal = 1`).
   * Biaya koin AI (teks = 5 koin, struk = 10 koin; gratis VIP/Admin) selalu dipotong dari saldo koin pribadi pencatat.
5. **Dashboard Dompet & Kas Grup (`/keuangan` / `/laporan`)**:
   * **Di Private Chat:** Menampilkan ringkasan pribadi (hari ini, bulan ini, rincian kategori, dan 5 transaksi terakhir).
   * **Di Grup:** Menampilkan ringkasan Kas Grup / Keluarga dengan rincian **Kontribusi Anggota** (misal Ayah vs Ibu), total kas keluar, dan riwayat transaksi bersama.

### E. Mode Games & Multiplayer di Grup Telegram
* **Family 100 (`/family100`) & Tebak Gambar (`/tebakgambar`):** Sesi disimpan per `chatId`. Semua anggota grup bisa ikut mengetik jawaban; penebak benar langsung menerima reward koin & EXP.
* **Tic Tac Toe PvP (`/ttt`):** Duel 1v1 antar anggota grup dengan taruhan koin atau santai. Pemain 2 menerima via tombol `[⚔️ Terima Tantangan!]`.
* **Group Privacy Mode:** Di BotFather wajib `Disable` (`/setprivacy -> Disable`) atau jadikan bot Admin Grup agar bot dapat membaca tebakan teks kata biasa dari anggota grup.

---

## 5. Daftar Perintah Bot

| Perintah | Akses | Fungsi |
|---|---|---|
| `/start` | Semua | Pesan pembuka, status akun, saldo koin, dan menu fitur |
| `/help` | Semua | Panduan lengkap platform, downloader, koin, QRIS & pencatat keuangan |
| `/catat <cerita>` | Semua | Catat pengeluaran instan lewat kalimat cerita belanja (AI) |
| `/struk` | Semua | Masuk ke mode deteksi & membaca foto struk belanja otomatis (OCR AI) |
| `/keuangan` / `/laporan` | Semua | Dashboard ringkasan dompet hari ini, bulan ini & rincian kategori |
| `/profile` | Semua | Cek status role, saldo koin, level EXP, statistik akun |
| `/ref` | Semua | Tautan referral (+500 koin per teman baru) |
| `/dukung` / `/topup` | Semua | Dukung pengembangan tools dengan beli paket berbayar via QRIS Dinamis |
| `/games` | Semua | Dashboard arena mini-games & katalog game |
| `/family100` / `/f100` | Semua | Game kuis survei Family 100 (60s, +2 koin/+1 exp, -10 koin jika 0) |
| `/nyerah_f100` | Semua | Menyerah dari ronde Family 100 yang sedang aktif |
| `/tebakgambar` / `/tg` | Semua | Tebak gambar (+4 koin / +2 koin jika clue, 30s, gagal -5 koin) |
| `/nyerah` | Semua | Menyerah tebak gambar (-5 koin) |
| `/dice <taruhan>` | Semua | Lempar dadu lawan bot |
| `/slot <taruhan>` | Semua | Mesin slot jackpot |
| `/tebak` | Semua | Kuis pilihan ganda (+2 koin, salah/menyerah -5 koin) |
| `/claim` | Semua | Klaim harian +50 koin gratis |
| `/koin` / `/saldo` | Semua | Cek saldo koin, level EXP, dan menu top-up |
| `/tukar` | Semua | Tukar koin game ke Status VIP 30 Hari (1.500 koin) |
| `/leaderboard` / `/topkoin` | Semua | Papan peringkat 10 pemain terkaya (koin) |
| `/topexp` / `/toplevel` | Semua | Papan peringkat 10 pemain level tertinggi (EXP) |
| `/health` | Admin | Diagnostik real-time CPU temp, RAM, Disk, Uptime |
| `/stats` | Admin | Total user, omset penjualan QRIS, total download |
| `/backup` | Admin | Kirim berkas `bot.db` langsung ke Telegram |
| `/cleancache` | Admin | Bersihkan cache RAM Linux (`drop_caches`) |
| `/reboot` | Admin | Reboot STB jarak jauh dengan dialog konfirmasi |
| `/speedtest` | Admin | Tes kecepatan jaringan STB (payload 10MB) |
| `/updatedlp` | Admin | Perbarui binary `yt-dlp` on-demand (`yt-dlp -U`) |
| `/addkoin <id> <jml>` | Admin | Tambah saldo koin pengguna manual |
| `/delkoin <id> <jml>` | Admin | Kurangi saldo koin pengguna manual |
| `/setkoin <id> <jml>` | Admin | Atur saldo koin pengguna manual |
| `/addvip <id> <hari>` | Admin | Beri status VIP manual |
| `/delvip <id>` | Admin | Cabut status VIP |
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
GEMINI_API_KEY=              # Dapatkan di https://aistudio.google.com/app/apikey (Bisa banyak key dipisah koma untuk failover: key1,key2)
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
   * `npm test` menjalankan unit test terintegrasi (database, regex, limit, health, orphan cleaner).
   * `npm run test:expense` menguji seluruh alur pencatatan pengeluaran, agregasi, update kategori, dan catatan personal.
7. **Ketahanan Google Gemini API, Failover Multi-Key & Error 503:**
   * **Multi-Key Failover:** Anda dapat memasukkan lebih dari satu API Key di `GEMINI_API_KEY=key1,key2` (dipisah koma). Jika key pertama habis kuota gratis harian (`429`), bot otomatis beralih menggunakan key cadangan berikutnya tanpa error.
   * **Lonjakan Beban Server (503):** Sistem secara otomatis menangani lonjakan beban trafik (503 High Demand) dengan jeda 1,5 detik dan retry otomatis tanpa membuat antarmuka bot crash.

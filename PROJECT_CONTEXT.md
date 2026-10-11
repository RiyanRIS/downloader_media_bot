# 🧠 PROJECT CONTEXT & ARCHITECTURE SUMMARY
> **Catatan untuk AI / Pengembang di Sesi Mendatang:**
> Baca dokumen ini untuk memahami seluruh arsitektur, dependensi, alur kerja, dan skema database tanpa perlu membaca ulang seluruh baris kode di repositori.

---

## 1. Ringkasan Proyek & Target Lingkungan
* **Nama Proyek:** `stb-downloader-bot` (Multi-Platform Downloader, Financial AI & Community STB Utility Telegram Bot).
* **Filosofi & Model Layanan:**
  * **100% Gratis Selamanya Berbasis Komunitas:** Seluruh fitur unduhan media dan pencatatan keuangan AI bebas digunakan tanpa batasan tarif, tanpa potongan koin, dan tanpa paksaan membeli kuota.
  * **Indikator Keaktifan Berbasis EXP:** Pengguna mengumpulkan poin pengalaman (EXP) dari aktivitas nyata (unduh media, catat pengeluaran, check-in harian, dan bermain game) untuk menaikkan level dan bersaing di `/leaderboard`.
  * **Dukungan Sukarela (Donasi QRIS):** Pengguna dapat berpartisipasi sukarela mendonasikan dana operasional server melalui `/dukung`. Donatur diapresiasi dengan gelar `💖 Sahabat Dermawan` (role `vip`) dan dicatat di daftar donatur bulanan (`/donatur`) tanpa menampilkan nominal donasi demi privasi.
  * **Komunitas Kuat & Dua Arah:** Pengguna dapat mengirim saran/ide fitur (`/saran`) dan melaporkan kendala/bug (`/lapor`) langsung ke pengembang, dilengkapi panel balasan interaktif 2-arah admin.
* **Fungsi Utama:**
  1. **Multi-Platform Media Downloader:** YouTube, TikTok (No WM), Instagram (Reels/Foto/Album), X/Twitter, Threads, Facebook, Reddit, Pinterest, Bilibili dengan pre-check batas 50MB Telegram Bot API dan antrean `p-limit(2)`.
  2. **Pencatatan Keuangan & Kas Grup AI (Gemini Flash):** Ekstraksi bahasa gaul/santai (`/catat`), OCR foto struk belanja otomatis (`/struk`), pembukuan kas grup/keluarga, serta rekapitulasi dompet harian & bulanan (`/keuangan`, `/laporan`).
  3. **Request Fitur & Lapor Kendala (`/saran`, `/lapor`):** Sistem feedback komunitas dengan notifikasi real-time ke admin, tombol tindakan cepat (`Tandai Dibaca`, `Tandai Selesai`, `Balas User`, `Abaikan`), dan balasan langsung ke chat user.
  4. **Arena Mini-Games & Multiplayer:** Family 100, Tebak Gambar, Dadu, Slot, Kuis Pilihan Ganda, dan Tic Tac Toe 3-Bidak (Aturan modern anti-draw).
  5. **Manajemen & Monitoring Server STB/Linux:** `/health`, `/stats`, `/backup`, `/reboot`, `/cleancache`, `/speedtest`, `/updatedlp`, `/broadcast`.
* **Tech Stack:**
  * Node.js (v22/v24 LTS, ESM `"type": "module"`)
  * TypeScript (`tsx` untuk dev & test, `tsc` untuk build)
  * Framework Bot: `grammY` + `@grammyjs/runner` + `@grammyjs/ratelimiter`
  * Database: `better-sqlite3` (Mode WAL, synchronous NORMAL, foreign keys ON)
  * Downloader Engine: `yt-dlp` binary + `ffmpeg`
  * AI Engine: Google Gemini API (`@google/genai`, model `gemini-flash-latest` & fallback `gemini-flash-lite-latest`)
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
│   ├── migrations.ts            # DDL deklaratif atomic: users, downloads_log, donations, expenses, feedbacks, system_settings
│   └── repositories/
│       ├── userRepository.ts    # CRUD user, tier (user/vip/admin), level EXP, games stats, referral, ban
│       ├── downloadRepository.ts# Log unduhan & agregasi statistik platform
│       ├── donationRepository.ts# CRUD donasi sukarela QRIS & daftar donatur bulanan (/donatur)
│       ├── transactionRepository.ts # Alias kompatibilitas re-export donationRepository
│       ├── expenseRepository.ts # CRUD pengeluaran, rekapitulasi kas harian/bulanan, breakdown kategori, toggle personal
│       ├── feedbackRepository.ts# CRUD masukan (saran fitur & laporan kendala/bug), status READ/RESOLVED, admin replies
│       └── settingsRepository.ts# Key-value dynamic system config
├── services/
│   ├── downloaderService.ts     # p-limit(2), yt-dlp --dump-json (pre-check <48MB), downloadMedia(), updateYtDlp()
│   ├── aiExpenseService.ts      # Ekstraksi keuangan teks santai & OCR visi struk (Gemini Flash, auto-retry 503, fallback)
│   ├── qrisService.ts           # Generator QRIS dinamis & parser EMVCo payload
│   ├── photoService.ts          # Pemecah & pengelompok album foto batch
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
│       ├── start.ts             # /start, /menu, /help, /profile, navigasi tombol menu utama
│       ├── expense.ts           # /catat, /struk, /keuangan, /laporan, inline edit category/notes/delete
│       ├── feedback.ts          # /saran, /lapor, /feedback, /feedbacks, prompt input & kontrol 2-arah admin
│       ├── topup.ts             # /dukung, /donasi, /donatur, QRIS sukarela & daftar donatur bulan ini
│       ├── vip.ts               # Verifikasi bukti transfer donasi oleh Admin (Apresiasi Sahabat Dermawan)
│       ├── game.ts              # /games, /family100, /tebakgambar, /dice, /slot, /tebak, /claim, /leaderboard
│       ├── tictactoe.ts         # /ttt (Solo vs AI & PvP 1v1 dengan aturan 3-bidak modern anti-draw)
│       ├── download.ts          # Tangkap link, status progress dinamis, inline button format, upload & unlink
│       └── admin.ts             # /health, /stats, /backup, /reboot, /cleancache, /speedtest, /updatedlp, /broadcast
├── utils/
│   ├── format.ts                # escapeHtml, formatRupiah
│   └── contact.ts               # getAdminContactInfo
└── index.ts                     # Bootstrap migrasi, verifikasi yt-dlp, background crons, setMyCommands, graceful shutdown
```

---

## 3. Skema Database (SQLite)

### Tabel `users`
* `telegram_id` (INTEGER PK): ID Telegram unik pengguna.
* `username` (TEXT, Nullable): Username Telegram.
* `role` (TEXT): `'user'` | `'vip'` (Sahabat Dermawan) | `'admin'`.
* `daily_usage` (INTEGER): Jumlah download hari ini (direset pukul 00:00).
* `custom_limit` (INTEGER, Nullable): Override batas harian per user (opsional).
* `vip_expires_at` (TEXT, Nullable): Masa berlaku gelar Sahabat Dermawan.
* `referrer_id` (INTEGER, Nullable): Telegram ID yang mengajak.
* `is_banned` (INTEGER): 0 (Aktif) atau 1 (Diblokir).
* `coins` (INTEGER, Default 0): Saldo koin hiburan game.
* `exp` (INTEGER, Default 0): Poin pengalaman level keaktifan.
* `games_played` (INTEGER, Default 0): Total permainan yang dimainkan.
* `games_won` (INTEGER, Default 0): Total kemenangan permainan.
* `last_daily_claim` (TEXT, Nullable): Tanggal klaim harian (YYYY-MM-DD).
* `created_at` (TEXT): Timestamp pendaftaran.

### Tabel `downloads_log`
* `id` (INTEGER PK AUTOINCREMENT)
* `telegram_id` (INTEGER FK ke `users.telegram_id`)
* `platform` (TEXT): `'youtube'`, `'tiktok'`, `'instagram'`, `'twitter'`, `'threads'`, `'facebook'`, `'reddit'`, `'pinterest'`, `'bilibili'`, dll.
* `url` (TEXT): URL media yang diunduh.
* `file_type` (TEXT): `'video'` | `'audio'` | `'photo'` | `'album'`.
* `file_size_bytes` (INTEGER, Nullable): Ukuran file dalam bytes.
* `downloaded_at` (TEXT): Timestamp unduhan (lokal).

### Tabel `donations` (Menggantikan legacy `transactions_log`)
* `id` (INTEGER PK AUTOINCREMENT)
* `telegram_id` (INTEGER FK ke `users.telegram_id`)
* `order_id` (TEXT UNIQUE): Format `DON-YYYYMMDD-XXXX`.
* `amount` (INTEGER): Nominal donasi sukarela.
* `proof_file_id` (TEXT, Nullable): File ID foto bukti transfer.
* `status` (TEXT): `'PENDING'` | `'SUCCESS'` | `'REJECTED'`.
* `admin_id` (INTEGER, Nullable): ID Admin yang mengonfirmasi/menolak.
* `created_at` (TEXT): Timestamp pembuatan pesanan.
* `confirmed_at` (TEXT, Nullable): Timestamp konfirmasi.

### Tabel `expenses`
* `id` (INTEGER PK AUTOINCREMENT)
* `telegram_id` (INTEGER FK ke `users.telegram_id`)
* `chat_id` (INTEGER, Nullable): ID grup Telegram jika dicatat di grup, atau NULL jika personal.
* `user_name` (TEXT, Nullable): Nama display pencatat transaksi.
* `amount` (INTEGER): Nominal pengeluaran dalam Rupiah.
* `category` (TEXT): Kategori belanja (`Makanan & Minuman`, `Belanja Harian`, `Transportasi`, `Tagihan & Pulsa`, `Hiburan`, `Kesehatan`, `Lainnya`).
* `merchant` (TEXT, Nullable): Nama toko / tempat belanja.
* `items_detail` (TEXT, Nullable): Ringkasan barang.
* `notes` (TEXT, Nullable): Catatan kustom pengguna.
* `raw_input` (TEXT, Nullable): Teks mentah masukan pengguna atau `[Foto Struk Belanja]`.
* `source_type` (TEXT): `'text'` atau `'receipt'`.
* `is_personal` (INTEGER, Default 1): 1 jika dihitung di dompet pribadi, 0 jika hanya di kas grup.
* `created_at` (TEXT): Timestamp pencatatan (lokal).

### Tabel `feedbacks` (Baru)
* `id` (INTEGER PK AUTOINCREMENT)
* `telegram_id` (INTEGER FK ke `users.telegram_id`)
* `user_name` (TEXT, Nullable): Nama display atau username pengirim.
* `type` (TEXT): `'suggestion'` (Ide/Request Fitur) | `'bug'` (Laporan Kendala/Kerusakan).
* `content` (TEXT): Isi teks masukan/kendala.
* `status` (TEXT): `'PENDING'` | `'READ'` | `'RESOLVED'`.
* `admin_reply` (TEXT, Nullable): Teks balasan langsung dari developer.
* `replied_by` (INTEGER, Nullable): ID Admin yang merespons.
* `created_at` (TEXT): Timestamp pengiriman masukan.
* `resolved_at` (TEXT, Nullable): Timestamp penyelesaian masalah.

### Tabel `system_settings`
* `key` (TEXT PK), `value` (TEXT): Konfigurasi dinamis (`free_daily_limit`, `vip_daily_limit`, `daily_claim_exp`, dll.).

---

## 4. Alur Kerja Utama & Aturan Kritis (*Core Rules*)

### A. Alur Download Media
1. Pesan teks masuk $\to$ `rateLimiterMiddleware` $\to$ `authMiddleware` (cek ban & lampirkan `ctx.user`).
2. `urlDetector.ts` mengekstrak URL dengan RegEx.
3. Bot kirim pesan status awal: `🔍 Memeriksa tautan media...`
4. `downloaderService.getMediaInfo(url)` mengeksekusi `yt-dlp --dump-json` (timeout 35s):
   * **Batas Telegram 50MB:** Jika estimasi $> 48\text{ MB}$, tampilkan tombol **`🎧 Unduh Audio MP3 Saja`**.
   * Jika aman, tampilkan Inline Keyboard pilihan format/resolusi.
5. User memilih format $\to$ Request masuk ke `downloadQueue` (`p-limit(2)`).
6. Live status bertahap diedit:
   * `[1/3] ⏳ Menunggu antrean...`
   * `[2/3] ⬇️ Mengunduh media...`
   * `[3/3] ⬆️ Mengunggah ke Telegram...`
7. Kirim via `replyWithVideo`, `replyWithAudio`, atau `replyWithMediaGroup`.
8. **Zero-Persistence:** File di `TMP_DIR` **wajib langsung dihapus** via `fs.unlinkSync()`.
9. Reward EXP keaktifan (+2 EXP) diberikan dan log dicatat di `downloads_log`.

### B. Alur Pencatatan Keuangan AI
1. **Input Teks (`/catat <cerita>`)**: Pengguna bercerita dengan bahasa santai. Gemini API mengekstrak nominal, kategori, toko, dan item secara otomatis.
2. **Input Struk (`/struk`)**: Foto diunduh langsung ke memory buffer (`Buffer`), zero-persistence tanpa membebani disk server. Gemini Vision mengekstrak nota belanja.
3. **Reward Keaktifan:** +3 EXP untuk catat teks, +5 EXP untuk scan struk. Tidak ada potongan biaya koin.
4. **Kas Grup / Keluarga:** Jika dicatat di grup, tersimpan sebagai kas grup bersama dengan nama pencatat. Anggota dapat menekan tombol `[📌 Simpan juga di Pribadi]` untuk menyalin ke dompet pribadinya.

### C. Alur Request Fitur & Lapor Kendala (`feedback.ts`)
1. Pengguna mengetik `/saran` (ide fitur baru) atau `/lapor` (kendala/link error), atau menekan tombol `[📬 Request & Lapor Kendala]`.
2. Bot membuka prompt interaktif dengan tombol `[❌ Batalkan]`. Sesi berlaku selama 5 menit.
3. Validasi masukan: minimal 5 karakter, maksimal 1.500 karakter, dan cooldown anti-spam 30 detik antar pengiriman.
4. Masukan disimpan ke database `feedbacks` (`PENDING`).
5. Bot membalas user dengan pesan apresiasi dan langsung meneruskan alert visual ke seluruh Admin (`config.adminIds`).
6. **Aksi Kontrol Admin:**
   * `[💬 Balas User]`: Admin mengetik tanggapan balasan di obrolan Telegram. Pesan otomatis dikirimkan ke chat pengguna dalam format *blockquote* resmi pengembang.
   * `[👀 Tandai Dibaca]`: Mengubah status menjadi `READ` dan mengirim notifikasi apresiasi santun ke pengguna.
   * `[✅ Tandai Sudah Beres]`: Mengubah status menjadi `RESOLVED` dan mengabari pengguna bahwa kendala telah diperbaiki.
   * `[🗑️ Abaikan]`: Menghilangkan tombol tanpa mengirim notifikasi ke user.
7. **Prinsip Kunci:** **Tanpa reward EXP** (menghindari spamming) dan **tanpa Hall of Fame publik** (waktu dan keputusan pembuatan fitur sepenuhnya hak prerogatif developer).

### D. Alur Donasi Sukarela & Daftar Donatur (`topup.ts` & `vip.ts`)
1. Pengguna memicu `/dukung`, `/donasi`, atau tombol menu `💖 Dukung Pengembang`.
2. Bot menampilkan QRIS Dinamis sukarela (nominal bebas atau katalog acuan).
3. Pengguna mentransfer dan mengirimkan foto bukti transfer.
4. Admin menerima notifikasi verifikasi:
   * Jika disetujui: Pengguna diberi gelar `💖 Sahabat Dermawan` (role `vip`), EXP apresiasi, dan tercatat di riwayat donasi sukses.
   * Jika ditolak: Pengguna menerima pesan penolakan santun dilengkapi tombol kontak admin.
5. Perintah `/donatur` menampilkan daftar sahabat dermawan bulan berjalan secara transparan dan berperingkat tanpa memperlihatkan nominal donasi.

### E. Aturan Tic Tac Toe 3-Bidak (`tictactoe.ts`)
* Papan 3x3 klasik. Setiap pemain maksimal hanya dapat memiliki **3 bidak** di atas papan.
* Pada langkah ke-4 dan seterusnya, menaruh bidak baru akan **menghapus bidak tertua pemain tersebut (FIFO)**.
* Menghilangkan hasil seri (remis) yang membosankan dan membuat taktik permainan selalu dinamis hingga ada yang berhasil menyusun 3 baris segaris.

---

## 5. Daftar Perintah Bot Lengkap

| Perintah | Akses | Fungsi |
|---|---|---|
| `/start` | Semua | Pesan pembuka, status akun, peringkat level EXP, dan menu navigasi utama |
| `/menu` | Semua | Menampilkan keyboard tombol navigasi utama |
| `/help` | Semua | Panduan lengkap platform, downloader, keuangan, kuis, dan kontak admin |
| `/profile` | Semua | Profil pengguna, level EXP keaktifan, dan statistik permainan/unduhan |
| `/saran` / `/request` | Semua | Kirimkan usulan atau request fitur baru langsung ke pengembang |
| `/lapor` / `/bug` | Semua | Laporkan kendala, bug, atau link media yang gagal diunduh |
| `/feedback` | Semua | Menu navigasi pilihan Request Fitur & Lapor Kendala |
| `/dukung` / `/donasi` | Semua | Dukungan sukarela pengembang via QRIS (nominal bebas) |
| `/donatur` | Semua | Daftar donatur & sahabat dermawan bulan ini (tanpa nominal) |
| `/catat <cerita>` | Semua | Catat pengeluaran instan lewat cerita belanja santai (AI Gemini) |
| `/struk` | Semua | Scan & deteksi nota/struk belanja otomatis via AI Vision |
| `/keuangan` / `/laporan` | Semua | Dashboard ringkasan pengeluaran harian, bulanan & rincian kategori |
| `/games` | Semua | Arena mini-games interaktif |
| `/ttt` / `/tictactoe` | Semua | Game Tic Tac Toe 3-bidak dinamis (Solo AI / PvP Grup) |
| `/family100` / `/f100` | Semua | Game kuis survei Family 100 (+2 EXP per tebakan benar) |
| `/tebakgambar` / `/tg` | Semua | Game Tebak Gambar interaktif (+5 EXP) |
| `/dice` | Semua | Lempar dadu seru lawan bot (+5 EXP) |
| `/slot` | Semua | Mesin slot jackpot mini (+25 EXP jackpot) |
| `/tebak` | Semua | Kuis teka-teki logika pilihan ganda (+5 EXP) |
| `/claim` | Semua | Check-in harian bonus +20 EXP gratis setiap hari |
| `/leaderboard` | Semua | Papan peringkat pengguna paling aktif berdasarkan total EXP |
| `/feedbacks` | Admin | Rekap statistik masukan dan 10 masukan terbaru komunitas |
| `/health` | Admin | Diagnostik real-time CPU temp, RAM, Disk, Uptime server |
| `/stats` | Admin | Statistik pengguna, unduhan platform, omset donasi, dan masukan komunitas |
| `/backup` | Admin | Ekspor dan kirim berkas `bot.db` langsung ke Telegram |
| `/cleancache` | Admin | Bersihkan cache RAM kernel Linux (`drop_caches`) |
| `/reboot` | Admin | Reboot STB/server jarak jauh dengan dialog konfirmasi |
| `/speedtest` | Admin | Tes kecepatan jaringan server (payload 10MB) |
| `/updatedlp` | Admin | Perbarui binary `yt-dlp` langsung ke versi rilis terbaru |
| `/broadcast <pesan>` | Admin | Siaran pesan massal dengan jeda aman anti-flood |

---

## 6. Konfigurasi Environment (`.env`)
```env
BOT_TOKEN=token_telegram_dari_botfather
ADMIN_IDS=123456789,987654321
DATABASE_PATH=./bot.db
TMP_DIR=/tmp                 # Folder sementara Linux / tmpfs
YT_DLP_PATH=/usr/local/bin/yt-dlp # Binary yt-dlp
FFMPEG_PATH=ffmpeg
COOKIES_PATH=                # Path file cookies.txt opsional (bypass IG/X login)
MAX_CONCURRENT_DOWNLOADS=2   # p-limit concurrency
MAX_FILE_SIZE_MB=48          # Telegram hard limit 50MB
DOWNLOAD_TIMEOUT_MS=180000   # 3 menit timeout
ENABLE_THERMAL_ALERT=true
THERMAL_ALERT_TEMP_C=75
RAM_ALERT_PERCENT=90
GEMINI_API_KEY=key1,key2     # Multi-key failover didukung (dipisah koma)
```

---

## 7. Catatan Masalah Umum & Solusi Cepat (Troubleshooting)

1. **Error `403 Forbidden` YouTube:**
   * Pastikan Node.js terdeteksi dan yt-dlp berjalan dengan runtime Node: `--js-runtimes node`.
   * Jika ada login wall (Instagram/YouTube), pasang `cookies.txt` di root dan tentukan path-nya di `.env`.
2. **Format Selector Shorts & Lanskap:**
   * Menggunakan format sorting `-S res:720,ext:mp4:m4a -f bestvideo+bestaudio/best --merge-output-format mp4` untuk menjamin kesesuaian resolusi portrait dan audio yang tergabung rapi.
3. **Keamanan Parsing Pesan Telegram:**
   * Semua teks dinamis di-render dengan mode `HTML` (`parse_mode: 'HTML'`) dan diproteksi dengan fungsi `escapeHtml()` agar karakter username underscore (`@test_user`) tidak menyebabkan error Telegram Markdown.
4. **Testing Terpadu:**
   * `npm test`: Menjalankan 120+ unit test komprehensif (migrasi, repo, feedback, donatur, tictactoe, downloader, QRIS).
   * `npm run test:expense`: Menguji alur pencatatan pengeluaran AI, agregasi kas grup, dan personal toggle.
   * `npx tsc --noEmit`: Memastikan nol error kompilasi TypeScript.

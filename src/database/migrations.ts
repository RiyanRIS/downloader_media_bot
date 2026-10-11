import { db } from './db.js';

/**
 * Eksekusi skema database SQLite dari awal.
 * Seluruh tabel, relasi foreign key, indeks performa, dan konfigurasi default
 * dibuat secara deklaratif dan atomic di dalam transaksi.
 */
export function runMigrations(): void {
  const migrate = db.transaction(() => {
    // 1. Tabel users (Akun Pengguna, Keaktifan EXP, Peran & Statistik Game)
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        telegram_id INTEGER PRIMARY KEY,
        username TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        daily_usage INTEGER NOT NULL DEFAULT 0,
        custom_limit INTEGER,
        vip_expires_at TEXT,
        referrer_id INTEGER,
        is_banned INTEGER NOT NULL DEFAULT 0,
        coins INTEGER NOT NULL DEFAULT 0,
        exp INTEGER NOT NULL DEFAULT 0,
        games_played INTEGER NOT NULL DEFAULT 0,
        games_won INTEGER NOT NULL DEFAULT 0,
        last_daily_claim TEXT,
        created_at TEXT NOT NULL DEFAULT (DATETIME('now', 'localtime')),
        FOREIGN KEY (referrer_id) REFERENCES users(telegram_id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_users_referrer ON users(referrer_id);
      CREATE INDEX IF NOT EXISTS idx_users_is_banned ON users(is_banned);
      CREATE INDEX IF NOT EXISTS idx_users_exp ON users(exp DESC);
      CREATE INDEX IF NOT EXISTS idx_users_coins ON users(coins DESC);
      CREATE INDEX IF NOT EXISTS idx_users_leaderboard ON users(is_banned, exp DESC);
    `);

    // 2. Tabel downloads_log (Log Aktivitas Pengunduhan Media)
    db.exec(`
      CREATE TABLE IF NOT EXISTS downloads_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER NOT NULL,
        platform TEXT NOT NULL,
        url TEXT NOT NULL,
        file_type TEXT NOT NULL,
        file_size_bytes INTEGER,
        downloaded_at TEXT NOT NULL DEFAULT (DATETIME('now', 'localtime')),
        FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_downloads_tg_id ON downloads_log(telegram_id);
      CREATE INDEX IF NOT EXISTS idx_downloads_platform ON downloads_log(platform);
      CREATE INDEX IF NOT EXISTS idx_downloads_date ON downloads_log(downloaded_at);
    `);

    // 3. Tabel donations (Riwayat Dukungan Sukarela Komunitas via QRIS)
    db.exec(`
      CREATE TABLE IF NOT EXISTS donations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER NOT NULL,
        order_id TEXT NOT NULL UNIQUE,
        amount INTEGER NOT NULL DEFAULT 0,
        proof_file_id TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING',
        admin_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (DATETIME('now', 'localtime')),
        confirmed_at TEXT,
        FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_donations_order_id ON donations(order_id);
      CREATE INDEX IF NOT EXISTS idx_donations_tg_id ON donations(telegram_id);
      CREATE INDEX IF NOT EXISTS idx_donations_status ON donations(status);
      CREATE INDEX IF NOT EXISTS idx_donations_created_at ON donations(created_at);
      CREATE INDEX IF NOT EXISTS idx_donations_tg_status ON donations(telegram_id, status);

      -- Bersihkan tabel legacy transaksi lama jika ada
      DROP TABLE IF EXISTS transactions_log;
    `);

    // 4. Tabel system_settings (Konfigurasi Global & Batas Sistem)
    db.exec(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // 5. Tabel expenses (Pencatatan Keuangan Pribadi & Kas Grup AI)
    db.exec(`
      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER NOT NULL,
        chat_id INTEGER,
        user_name TEXT,
        amount INTEGER NOT NULL,
        category TEXT NOT NULL,
        merchant TEXT,
        items_detail TEXT,
        notes TEXT,
        raw_input TEXT,
        source_type TEXT NOT NULL DEFAULT 'text',
        is_personal INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (DATETIME('now', 'localtime')),
        FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_expenses_tg_id ON expenses(telegram_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_chat_id ON expenses(chat_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at);
      CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
      CREATE INDEX IF NOT EXISTS idx_expenses_is_personal ON expenses(is_personal);
      CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(telegram_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_expenses_chat_date ON expenses(chat_id, created_at);
    `);

    // 6. Tabel feedbacks (Saran Fitur & Laporan Kendala Komunitas)
    db.exec(`
      CREATE TABLE IF NOT EXISTS feedbacks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER NOT NULL,
        user_name TEXT,
        type TEXT NOT NULL DEFAULT 'suggestion',
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        admin_reply TEXT,
        replied_by INTEGER,
        created_at TEXT NOT NULL DEFAULT (DATETIME('now', 'localtime')),
        resolved_at TEXT,
        FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_feedbacks_type ON feedbacks(type);
      CREATE INDEX IF NOT EXISTS idx_feedbacks_status ON feedbacks(status);
      CREATE INDEX IF NOT EXISTS idx_feedbacks_tg_id ON feedbacks(telegram_id);
      CREATE INDEX IF NOT EXISTS idx_feedbacks_created_at ON feedbacks(created_at);
    `);

    // 7. Inisialisasi default settings sistem (Model Komunitas Gratis & Berbasis EXP)
    const insertSetting = db.prepare(`
      INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)
    `);

    insertSetting.run('free_daily_limit', '5');
    insertSetting.run('vip_daily_limit', '50');
    insertSetting.run('referral_bonus_limit', '5');
    insertSetting.run('coin_cost_download', '0');
    insertSetting.run('referral_bonus_coins', '0');
    insertSetting.run('daily_claim_coins', '0');
    insertSetting.run('daily_claim_exp', '20');
    insertSetting.run('maintenance_mode', '0');
  });

  migrate();
  console.log('✅ Migrasi database SQLite berhasil dijalankan.');
}

import { db } from './db.js';

export function runMigrations(): void {
  // 1. Tabel users
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
      created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_users_referrer ON users(referrer_id);
  `);

  // 2. Tabel downloads_log
  db.exec(`
    CREATE TABLE IF NOT EXISTS downloads_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      url TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size_bytes INTEGER,
      downloaded_at TEXT NOT NULL DEFAULT (DATETIME('now')),
      FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_downloads_tg_id ON downloads_log(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_downloads_platform ON downloads_log(platform);
  `);

  // 3. Tabel system_settings
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Inisialisasi default settings jika belum ada
  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)
  `);

  insertSetting.run('free_daily_limit', '5');
  insertSetting.run('vip_daily_limit', '50');
  insertSetting.run('referral_bonus_limit', '5');
  insertSetting.run('maintenance_mode', '0');

  console.log('✅ Migrasi database SQLite berhasil dijalankan.');
}

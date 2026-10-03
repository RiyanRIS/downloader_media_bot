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
      coins INTEGER NOT NULL DEFAULT 500,
      exp INTEGER NOT NULL DEFAULT 0,
      games_played INTEGER NOT NULL DEFAULT 0,
      games_won INTEGER NOT NULL DEFAULT 0,
      last_daily_claim TEXT,
      created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_users_referrer ON users(referrer_id);
    CREATE INDEX IF NOT EXISTS idx_users_coins ON users(coins);
    CREATE INDEX IF NOT EXISTS idx_users_exp ON users(exp);
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

  // 3. Tabel transactions_log (Top-Up QRIS Dinamis & Manual)
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL,
      merchant_order_id TEXT NOT NULL UNIQUE,
      reference TEXT,
      package_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      coins INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
      paid_at TEXT,
      FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_tx_order_id ON transactions_log(merchant_order_id);
    CREATE INDEX IF NOT EXISTS idx_tx_tg_id ON transactions_log(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions_log(status);
  `);

  // 4. Tabel system_settings
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // 5. Tabel expenses (Pencatatan Keuangan & Pengeluaran)
  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      category TEXT NOT NULL,
      merchant TEXT,
      items_detail TEXT,
      notes TEXT,
      raw_input TEXT,
      source_type TEXT NOT NULL DEFAULT 'text',
      created_at TEXT NOT NULL DEFAULT (DATETIME('now', 'localtime')),
      FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_expenses_tg_id ON expenses(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at);
    CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
  `);

  // Pastikan kolom notes dan kolom grup ada pada database yang sudah berjalan sebelumnya
  try {
    db.exec(`ALTER TABLE expenses ADD COLUMN notes TEXT;`);
  } catch {
    // Abaikan jika kolom sudah ada
  }
  try {
    db.exec(`ALTER TABLE expenses ADD COLUMN chat_id INTEGER;`);
  } catch {
    // Abaikan jika kolom sudah ada
  }
  try {
    db.exec(`ALTER TABLE expenses ADD COLUMN is_personal INTEGER NOT NULL DEFAULT 1;`);
  } catch {
    // Abaikan jika kolom sudah ada
  }
  try {
    db.exec(`ALTER TABLE expenses ADD COLUMN user_name TEXT;`);
  } catch {
    // Abaikan jika kolom sudah ada
  }
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_expenses_chat_id ON expenses(chat_id);`);
  } catch {
    // Abaikan jika index sudah ada
  }

  // Inisialisasi default settings jika belum ada
  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)
  `);

  insertSetting.run('free_daily_limit', '5');
  insertSetting.run('vip_daily_limit', '50');
  insertSetting.run('referral_bonus_limit', '5');
  insertSetting.run('coin_cost_download', '5');
  insertSetting.run('referral_bonus_coins', '500');
  insertSetting.run('daily_claim_coins', '50');
  insertSetting.run('daily_claim_exp', '15');
  insertSetting.run('maintenance_mode', '0');

  console.log('✅ Migrasi database SQLite berhasil dijalankan.');
}

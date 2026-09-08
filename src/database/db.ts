import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config/config.js';

const dbPath = path.resolve(config.databasePath);
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);

// Optimasi SQLite untuk Flash Storage eMMC & RAM hemat
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('temp_store = MEMORY');
db.pragma('cache_size = -2000'); // Batasi cache SQLite ~2MB agar hemat RAM
db.pragma('foreign_keys = ON');

export function closeDatabase(): void {
  try {
    db.close();
  } catch (err) {
    console.error('Error saat menutup database:', err);
  }
}

import { db } from '../db.js';

export const settingsRepository = {
  getSetting(key: string, defaultValue = ''): string {
    const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? row.value : defaultValue;
  },

  setSetting(key: string, value: string): void {
    db.prepare(`
      INSERT INTO system_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  },

  getAllSettings(): Record<string, string> {
    const rows = db.prepare('SELECT key, value FROM system_settings').all() as { key: string; value: string }[];
    const result: Record<string, string> = {};
    for (const r of rows) {
      result[r.key] = r.value;
    }
    return result;
  }
};

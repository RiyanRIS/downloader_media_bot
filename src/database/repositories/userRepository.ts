import { db } from '../db.js';
import { config } from '../../config/config.js';

export interface User {
  telegram_id: number;
  username: string | null;
  role: 'admin' | 'vip' | 'user';
  daily_usage: number;
  custom_limit: number | null;
  vip_expires_at: string | null;
  referrer_id: number | null;
  is_banned: number;
  created_at: string;
}

export const userRepository = {
  getUser(telegramId: number): User | null {
    const row = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as User | undefined;
    if (!row) return null;
    return this.checkAndUpdateVipStatus(row);
  },

  getOrCreateUser(telegramId: number, username?: string, referrerId?: number): { user: User; isNew: boolean } {
    let user = this.getUser(telegramId);
    if (user) {
      if (username && user.username !== username) {
        db.prepare('UPDATE users SET username = ? WHERE telegram_id = ?').run(username, telegramId);
        user.username = username;
      }
      return { user, isNew: false };
    }

    // Role default: periksa apakah termasuk daftar ADMIN_IDS
    const initialRole = config.isAdmin(telegramId) ? 'admin' : 'user';
    const validReferrer = referrerId && referrerId !== telegramId ? referrerId : null;

    db.prepare(`
      INSERT INTO users (telegram_id, username, role, daily_usage, referrer_id)
      VALUES (?, ?, ?, 0, ?)
    `).run(telegramId, username || null, initialRole, validReferrer);

    user = this.getUser(telegramId)!;
    return { user, isNew: true };
  },

  checkAndUpdateVipStatus(user: User): User {
    if (user.role === 'vip' && user.vip_expires_at) {
      const expiry = new Date(user.vip_expires_at).getTime();
      if (Date.now() > expiry) {
        // Status VIP telah kedaluwarsa, kembalikan ke role 'user'
        db.prepare(`
          UPDATE users 
          SET role = 'user', vip_expires_at = NULL 
          WHERE telegram_id = ?
        `).run(user.telegram_id);
        user.role = 'user';
        user.vip_expires_at = null;
      }
    }
    return user;
  },

  getEffectiveLimit(user: User): number {
    if (user.custom_limit !== null && user.custom_limit !== undefined) {
      return user.custom_limit;
    }
    if (user.role === 'admin') {
      return 999999;
    }
    if (user.role === 'vip') {
      return config.vipDailyLimit;
    }
    return config.freeDailyLimit;
  },

  incrementDailyUsage(telegramId: number): void {
    db.prepare('UPDATE users SET daily_usage = daily_usage + 1 WHERE telegram_id = ?').run(telegramId);
  },

  resetAllDailyUsage(): number {
    const info = db.prepare('UPDATE users SET daily_usage = 0').run();
    return info.changes;
  },

  setRole(telegramId: number, role: 'admin' | 'vip' | 'user', vipDays?: number): boolean {
    let vipExpiresAt: string | null = null;
    if (role === 'vip' && vipDays && vipDays > 0) {
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + vipDays);
      vipExpiresAt = expDate.toISOString();
    }

    const info = db.prepare(`
      UPDATE users 
      SET role = ?, vip_expires_at = ? 
      WHERE telegram_id = ?
    `).run(role, vipExpiresAt, telegramId);

    return info.changes > 0;
  },

  setCustomLimit(telegramId: number, limit: number | null): boolean {
    const info = db.prepare('UPDATE users SET custom_limit = ? WHERE telegram_id = ?').run(limit, telegramId);
    return info.changes > 0;
  },

  setBanned(telegramId: number, isBanned: boolean): boolean {
    const info = db.prepare('UPDATE users SET is_banned = ? WHERE telegram_id = ?').run(isBanned ? 1 : 0, telegramId);
    return info.changes > 0;
  },

  countReferrals(telegramId: number): number {
    const row = db.prepare('SELECT COUNT(*) as count FROM users WHERE referrer_id = ?').get(telegramId) as { count: number };
    return row?.count || 0;
  },

  getUserStats(): { total: number; vip: number; banned: number; admins: number } {
    const totalRow = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
    const vipRow = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'vip'").get() as { count: number };
    const bannedRow = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_banned = 1').get() as { count: number };
    const adminRow = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number };

    return {
      total: totalRow.count,
      vip: vipRow.count,
      banned: bannedRow.count,
      admins: adminRow.count
    };
  },

  getAllUserIds(): number[] {
    const rows = db.prepare('SELECT telegram_id FROM users WHERE is_banned = 0').all() as { telegram_id: number }[];
    return rows.map(r => r.telegram_id);
  }
};

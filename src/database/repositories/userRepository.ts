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
  coins: number;
  exp: number;
  games_played: number;
  games_won: number;
  last_daily_claim: string | null;
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
  },

  // === MODUL GAMES & SISTEM KOIN ===

  addCoins(telegramId: number, amount: number, expAmount = 0): void {
    db.prepare(`
      UPDATE users 
      SET coins = coins + ?, exp = exp + ? 
      WHERE telegram_id = ?
    `).run(amount, expAmount, telegramId);
  },

  deductCoins(telegramId: number, amount: number): boolean {
    const info = db.prepare(`
      UPDATE users 
      SET coins = coins - ? 
      WHERE telegram_id = ? AND coins >= ?
    `).run(amount, telegramId, amount);
    return info.changes > 0;
  },

  recordGameResult(telegramId: number, isWin: boolean, coinDelta: number, expDelta: number): void {
    db.prepare(`
      UPDATE users 
      SET games_played = games_played + 1,
          games_won = games_won + (CASE WHEN ? = 1 THEN 1 ELSE 0 END),
          coins = MAX(0, coins + ?),
          exp = exp + ?
      WHERE telegram_id = ?
    `).run(isWin ? 1 : 0, coinDelta, expDelta, telegramId);
  },

  claimDailyBonus(telegramId: number, bonusCoins = 50): { success: boolean; currentCoins: number; message: string } {
    const user = this.getUser(telegramId);
    if (!user) {
      return { success: false, currentCoins: 0, message: 'User tidak ditemukan.' };
    }

    const todayStr = new Date().toISOString().slice(0, 10); // Format YYYY-MM-DD
    if (user.last_daily_claim === todayStr) {
      return {
        success: false,
        currentCoins: user.coins,
        message: 'Anda sudah mengklaim bonus harian hari ini. Silakan kembali besok!'
      };
    }

    db.prepare(`
      UPDATE users 
      SET coins = coins + ?, exp = exp + 10, last_daily_claim = ? 
      WHERE telegram_id = ?
    `).run(bonusCoins, todayStr, telegramId);

    return {
      success: true,
      currentCoins: user.coins + bonusCoins,
      message: `🎉 Berhasil mengklaim bonus harian sebesar **+${bonusCoins} koin** dan **+10 EXP**!`
    };
  },

  setCoins(telegramId: number, amount: number): boolean {
    const info = db.prepare('UPDATE users SET coins = ? WHERE telegram_id = ?').run(Math.max(0, amount), telegramId);
    return info.changes > 0;
  },

  getCoinsLeaderboard(limit = 10): { telegram_id: number; username: string | null; coins: number; exp: number; games_won: number }[] {
    return db.prepare(`
      SELECT telegram_id, username, coins, exp, games_won 
      FROM users 
      WHERE is_banned = 0 
      ORDER BY coins DESC, exp DESC 
      LIMIT ?
    `).all(limit) as { telegram_id: number; username: string | null; coins: number; exp: number; games_won: number }[];
  },

  getExpLeaderboard(limit = 10): { telegram_id: number; username: string | null; coins: number; exp: number; games_won: number }[] {
    return db.prepare(`
      SELECT telegram_id, username, coins, exp, games_won 
      FROM users 
      WHERE is_banned = 0 
      ORDER BY exp DESC, coins DESC 
      LIMIT ?
    `).all(limit) as { telegram_id: number; username: string | null; coins: number; exp: number; games_won: number }[];
  },

  getGameLeaderboard(limit = 10): { telegram_id: number; username: string | null; coins: number; exp: number; games_won: number }[] {
    return this.getCoinsLeaderboard(limit);
  },

  exchangeCoinsForVip(telegramId: number, costCoins = 1500, days = 30): { success: boolean; remainingCoins: number; message: string } {
    const user = this.getUser(telegramId);
    if (!user) {
      return { success: false, remainingCoins: 0, message: 'Pengguna tidak ditemukan.' };
    }

    if (user.coins < costCoins) {
      return {
        success: false,
        remainingCoins: user.coins,
        message: `Koin Anda tidak cukup! Membutuhkan ${costCoins} koin, saldo Anda saat ini: ${user.coins} koin.`
      };
    }

    const deducted = this.deductCoins(telegramId, costCoins);
    if (!deducted) {
      return {
        success: false,
        remainingCoins: user.coins,
        message: 'Gagal memotong saldo koin. Silakan coba beberapa saat lagi.'
      };
    }

    this.setRole(telegramId, 'vip', days);
    const updated = this.getUser(telegramId)!;

    return {
      success: true,
      remainingCoins: updated.coins,
      message: `🎉 **Selamat!** Anda berhasil menukar **${costCoins} Koin** menjadi **Status VIP ${days} Hari**!\nKini Anda dapat menikmati seluruh unduhan media tanpa batas dan bebas potong koin!`
    };
  },

  exchangeCoinsForQuota(telegramId: number, costCoins = 100, quotaBonus = 5): { success: boolean; newLimit: number; remainingCoins: number; message: string } {
    const user = this.getUser(telegramId);
    if (!user) {
      return { success: false, newLimit: 0, remainingCoins: 0, message: 'Pengguna tidak ditemukan.' };
    }

    if (user.coins < costCoins) {
      return {
        success: false,
        newLimit: this.getEffectiveLimit(user),
        remainingCoins: user.coins,
        message: `Koin Anda tidak cukup! Membutuhkan ${costCoins} koin, saldo Anda saat ini: ${user.coins} koin.`
      };
    }

    const currentEffectiveLimit = this.getEffectiveLimit(user);
    const newLimit = currentEffectiveLimit + quotaBonus;

    const info = db.prepare(`
      UPDATE users 
      SET coins = coins - ?, custom_limit = ? 
      WHERE telegram_id = ? AND coins >= ?
    `).run(costCoins, newLimit, telegramId, costCoins);

    if (info.changes > 0) {
      return {
        success: true,
        newLimit,
        remainingCoins: user.coins - costCoins,
        message: `🎉 Penukaran berhasil! **${costCoins} koin** ditukar dengan **+${quotaBonus} kuota unduhan**.\nBatas kuota harian Anda sekarang menjadi **${newLimit} unduhan**.`
      };
    } else {
      return {
        success: false,
        newLimit: currentEffectiveLimit,
        remainingCoins: user.coins,
        message: 'Gagal melakukan penukaran koin. Coba lagi nanti.'
      };
    }
  }
};

import { db } from '../db.js';

export interface Transaction {
  id: number;
  telegram_id: number;
  merchant_order_id: string;
  reference: string | null;
  package_id: string;
  amount: number;
  coins: number;
  status: 'PENDING' | 'SUCCESS' | 'EXPIRED' | 'REJECTED' | 'FAILED';
  created_at: string;
  paid_at: string | null;
}

export function parseDbDate(rawDate: string): Date {
  if (!rawDate) return new Date();
  return new Date(rawDate.includes('T') ? rawDate : rawDate.replace(' ', 'T') + 'Z');
}

export const transactionRepository = {
  createTransaction(data: {
    telegramId: number;
    merchantOrderId: string;
    reference?: string | null;
    packageId: string;
    amount: number;
    coins: number;
  }): Transaction {
    db.prepare(`
      INSERT INTO transactions_log (telegram_id, merchant_order_id, reference, package_id, amount, coins, status)
      VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
    `).run(
      data.telegramId,
      data.merchantOrderId,
      data.reference || null,
      data.packageId,
      data.amount,
      data.coins
    );

    return this.getTransaction(data.merchantOrderId)!;
  },

  getTransaction(merchantOrderId: string): Transaction | null {
    const row = db.prepare('SELECT * FROM transactions_log WHERE merchant_order_id = ?').get(merchantOrderId);
    return (row as Transaction) || null;
  },

  getLatestPendingTransaction(telegramId: number): Transaction | null {
    const row = db.prepare(`
      SELECT * FROM transactions_log 
      WHERE telegram_id = ? AND status = 'PENDING'
      ORDER BY id DESC 
      LIMIT 1
    `).get(telegramId) as Transaction | undefined;

    if (!row) return null;

    // Batas waktu pesanan adalah 30 menit
    const createdAt = parseDbDate(row.created_at);
    const diffMinutes = (Date.now() - createdAt.getTime()) / (1000 * 60);

    if (diffMinutes > 30) {
      this.updateStatus(row.merchant_order_id, 'EXPIRED');
      return null;
    }

    return row;
  },

  getLatestUserTransaction(telegramId: number): Transaction | null {
    const row = db.prepare(`
      SELECT * FROM transactions_log 
      WHERE telegram_id = ? 
      ORDER BY id DESC 
      LIMIT 1
    `).get(telegramId) as Transaction | undefined;

    return row || null;
  },

  updateStatus(merchantOrderId: string, status: 'SUCCESS' | 'EXPIRED' | 'REJECTED' | 'FAILED', reference?: string): boolean {
    const paidAt = status === 'SUCCESS' ? new Date().toISOString() : null;
    const info = db.prepare(`
      UPDATE transactions_log 
      SET status = ?, reference = COALESCE(?, reference), paid_at = COALESCE(?, paid_at)
      WHERE merchant_order_id = ?
    `).run(status, reference || null, paidAt, merchantOrderId);

    return info.changes > 0;
  },

  getUserTransactions(telegramId: number, limit = 5): Transaction[] {
    return db.prepare(`
      SELECT * FROM transactions_log 
      WHERE telegram_id = ? 
      ORDER BY id DESC 
      LIMIT ?
    `).all(telegramId, limit) as Transaction[];
  },

  getStats(): { totalRevenue: number; totalSuccess: number; totalPending: number } {
    const revenueRow = db.prepare("SELECT SUM(amount) as total FROM transactions_log WHERE status = 'SUCCESS'").get() as { total: number | null };
    const successRow = db.prepare("SELECT COUNT(*) as count FROM transactions_log WHERE status = 'SUCCESS'").get() as { count: number };
    const pendingRow = db.prepare("SELECT COUNT(*) as count FROM transactions_log WHERE status = 'PENDING'").get() as { count: number };

    return {
      totalRevenue: revenueRow?.total || 0,
      totalSuccess: successRow?.count || 0,
      pendingRow: pendingRow?.count || 0
    } as any;
  }
};

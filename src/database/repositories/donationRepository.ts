import { db } from '../db.js';

export interface Donation {
  id: number;
  telegram_id: number;
  order_id: string;
  amount: number;
  proof_file_id: string | null;
  status: 'PENDING' | 'SUCCESS' | 'REJECTED';
  admin_id: number | null;
  created_at: string;
  confirmed_at: string | null;
}

export interface MonthlyDonor {
  telegram_id: number;
  username: string | null;
  role: string;
  exp: number;
  support_count: number;
  last_donated_at: string;
}

export function parseDbDate(rawDate: string): Date {
  if (!rawDate) return new Date();
  if (rawDate.endsWith('Z')) return new Date(rawDate);
  return new Date(rawDate.replace(' ', 'T'));
}

export const donationRepository = {
  /**
   * Membuat entri donasi baru dengan status PENDING
   */
  createDonation(data: {
    telegramId: number;
    orderId: string;
    amount?: number;
    proofFileId?: string | null;
  }): Donation {
    db.prepare(`
      INSERT INTO donations (telegram_id, order_id, amount, proof_file_id, status)
      VALUES (?, ?, ?, ?, 'PENDING')
    `).run(
      data.telegramId,
      data.orderId,
      data.amount ?? 0,
      data.proofFileId || null
    );

    return this.getDonation(data.orderId)!;
  },

  /**
   * Mengambil data donasi berdasarkan order_id
   */
  getDonation(orderId: string): Donation | null {
    const row = db.prepare('SELECT * FROM donations WHERE order_id = ?').get(orderId);
    return (row as Donation) || null;
  },

  /**
   * Mengambil sesi donasi PENDING terakhir milik pengguna (batas 30 menit)
   */
  getLatestPendingDonation(telegramId: number): Donation | null {
    const row = db.prepare(`
      SELECT * FROM donations 
      WHERE telegram_id = ? AND status = 'PENDING'
      ORDER BY id DESC 
      LIMIT 1
    `).get(telegramId) as Donation | undefined;

    if (!row) return null;

    const createdAt = parseDbDate(row.created_at);
    const diffMinutes = (Date.now() - createdAt.getTime()) / (1000 * 60);

    if (diffMinutes > 30) {
      this.updateStatus(row.order_id, 'REJECTED');
      return null;
    }

    return row;
  },

  /**
   * Menyimpan telegram file_id bukti transfer yang dikirim pengguna
   */
  attachProof(orderId: string, proofFileId: string): boolean {
    const info = db.prepare(`
      UPDATE donations 
      SET proof_file_id = ? 
      WHERE order_id = ?
    `).run(proofFileId, orderId);

    return info.changes > 0;
  },

  /**
   * Memperbarui status donasi (SUCCESS / REJECTED)
   */
  updateStatus(
    orderId: string,
    status: 'SUCCESS' | 'REJECTED',
    adminId?: number,
    amount?: number
  ): boolean {
    const confirmedAt = status === 'SUCCESS' ? new Date().toISOString() : null;
    const info = db.prepare(`
      UPDATE donations 
      SET status = ?, 
          admin_id = COALESCE(?, admin_id), 
          confirmed_at = COALESCE(?, confirmed_at),
          amount = CASE WHEN ? IS NOT NULL THEN ? ELSE amount END
      WHERE order_id = ?
    `).run(status, adminId || null, confirmedAt, amount !== undefined ? amount : null, amount ?? 0, orderId);

    return info.changes > 0;
  },

  /**
   * Mengambil daftar donatur sukses di bulan ini (tanpa nominal)
   */
  getMonthlyDonors(limit = 50): MonthlyDonor[] {
    return db.prepare(`
      SELECT 
        u.telegram_id,
        u.username,
        u.role,
        u.exp,
        COUNT(d.id) as support_count,
        MAX(COALESCE(d.confirmed_at, d.created_at)) as last_donated_at
      FROM donations d
      JOIN users u ON d.telegram_id = u.telegram_id
      WHERE d.status = 'SUCCESS'
        AND SUBSTR(COALESCE(d.confirmed_at, d.created_at), 1, 7) = strftime('%Y-%m', 'now', 'localtime')
      GROUP BY u.telegram_id
      ORDER BY last_donated_at DESC
      LIMIT ?
    `).all(limit) as MonthlyDonor[];
  },

  /**
   * Statistik donasi komunitas untuk dashboard admin
   */
  getStats(): { totalRevenue: number; totalSuccess: number; totalPending: number } {
    const revenueRow = db.prepare("SELECT SUM(amount) as total FROM donations WHERE status = 'SUCCESS'").get() as { total: number | null };
    const successRow = db.prepare("SELECT COUNT(*) as count FROM donations WHERE status = 'SUCCESS'").get() as { count: number };
    const pendingRow = db.prepare("SELECT COUNT(*) as count FROM donations WHERE status = 'PENDING'").get() as { count: number };

    return {
      totalRevenue: revenueRow?.total || 0,
      totalSuccess: successRow?.count || 0,
      totalPending: pendingRow?.count || 0
    };
  },

  // Backward-compatibility helpers for legacy calls
  createTransaction(data: { telegramId: number; merchantOrderId: string; amount?: number }): Donation {
    return this.createDonation({
      telegramId: data.telegramId,
      orderId: data.merchantOrderId,
      amount: data.amount
    });
  },

  getTransaction(orderId: string): Donation | null {
    return this.getDonation(orderId);
  },

  getLatestPendingTransaction(telegramId: number): Donation | null {
    return this.getLatestPendingDonation(telegramId);
  }
};

// Aliases for compatibility
export const transactionRepository = donationRepository;
export type Transaction = Donation;

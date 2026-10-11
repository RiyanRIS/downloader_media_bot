import { db } from '../db.js';

export type FeedbackType = 'suggestion' | 'bug';
export type FeedbackStatus = 'PENDING' | 'READ' | 'RESOLVED';

export interface Feedback {
  id: number;
  telegram_id: number;
  user_name: string | null;
  type: FeedbackType;
  content: string;
  status: FeedbackStatus;
  admin_reply: string | null;
  replied_by: number | null;
  created_at: string;
  resolved_at: string | null;
}

export const feedbackRepository = {
  /**
   * Membuat masukan baru (Saran Fitur atau Laporan Kendala)
   */
  createFeedback(data: {
    telegramId: number;
    userName?: string | null;
    type: FeedbackType;
    content: string;
  }): Feedback {
    const info = db.prepare(`
      INSERT INTO feedbacks (telegram_id, user_name, type, content, status)
      VALUES (?, ?, ?, ?, 'PENDING')
    `).run(
      data.telegramId,
      data.userName || null,
      data.type,
      data.content.trim()
    );

    return this.getFeedbackById(Number(info.lastInsertRowid))!;
  },

  /**
   * Mengambil detail masukan berdasarkan ID
   */
  getFeedbackById(id: number): Feedback | null {
    const row = db.prepare('SELECT * FROM feedbacks WHERE id = ?').get(id);
    return (row as Feedback) || null;
  },

  /**
   * Mengubah status masukan (READ atau RESOLVED)
   */
  updateStatus(id: number, status: FeedbackStatus): boolean {
    if (status === 'RESOLVED') {
      const info = db.prepare(`
        UPDATE feedbacks
        SET status = ?, resolved_at = DATETIME('now', 'localtime')
        WHERE id = ?
      `).run(status, id);
      return info.changes > 0;
    } else {
      const info = db.prepare(`
        UPDATE feedbacks
        SET status = ?
        WHERE id = ?
      `).run(status, id);
      return info.changes > 0;
    }
  },

  /**
   * Menyimpan balasan admin untuk pengguna
   */
  saveAdminReply(id: number, reply: string, adminId: number): boolean {
    const info = db.prepare(`
      UPDATE feedbacks
      SET admin_reply = ?, replied_by = ?, status = 'RESOLVED', resolved_at = DATETIME('now', 'localtime')
      WHERE id = ?
    `).run(reply.trim(), adminId, id);
    return info.changes > 0;
  },

  /**
   * Menghapus masukan berdasarkan ID
   */
  deleteFeedback(id: number): boolean {
    const info = db.prepare('DELETE FROM feedbacks WHERE id = ?').run(id);
    return info.changes > 0;
  },

  /**
   * Mengambil daftar masukan terbaru
   */
  getRecentFeedbacks(limit: number = 20, type?: FeedbackType, status?: FeedbackStatus): Feedback[] {
    let query = 'SELECT * FROM feedbacks';
    const conditions: string[] = [];
    const params: any[] = [];

    if (type) {
      conditions.push('type = ?');
      params.push(type);
    }
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY id DESC LIMIT ?';
    params.push(limit);

    return db.prepare(query).all(...params) as Feedback[];
  },

  /**
   * Statistik ringkas masukan
   */
  getStats(): {
    total: number;
    suggestions: number;
    bugs: number;
    pending: number;
    read: number;
    resolved: number;
  } {
    const row = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN type = 'suggestion' THEN 1 ELSE 0 END) as suggestions,
        SUM(CASE WHEN type = 'bug' THEN 1 ELSE 0 END) as bugs,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'READ' THEN 1 ELSE 0 END) as read,
        SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) as resolved
      FROM feedbacks
    `).get() as any;

    return {
      total: row?.total || 0,
      suggestions: row?.suggestions || 0,
      bugs: row?.bugs || 0,
      pending: row?.pending || 0,
      read: row?.read || 0,
      resolved: row?.resolved || 0
    };
  }
};

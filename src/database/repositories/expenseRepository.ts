import { db } from '../db.js';

export interface Expense {
  id: number;
  telegram_id: number;
  chat_id: number | null;
  user_name: string | null;
  amount: number;
  category: string;
  merchant: string | null;
  items_detail: string | null;
  notes: string | null;
  raw_input: string | null;
  source_type: 'text' | 'receipt';
  is_personal: number; // 1 = ya (termasuk personal), 0 = kas grup saja
  created_at: string;
}

export interface CategorySummary {
  category: string;
  total: number;
  count: number;
}

export interface MemberSummary {
  telegram_id: number;
  user_name: string;
  total: number;
  count: number;
}

export const expenseRepository = {
  addExpense(data: {
    telegramId: number;
    chatId?: number | null;
    userName?: string | null;
    amount: number;
    category: string;
    merchant?: string | null;
    itemsDetail?: string | null;
    notes?: string | null;
    rawInput?: string | null;
    sourceType: 'text' | 'receipt';
    isPersonal?: number;
  }): number {
    // Jika tidak dispesifikasikan: di grup default is_personal = 0 (kas grup), di private chat default is_personal = 1
    const isPersonal = data.isPersonal !== undefined
      ? data.isPersonal
      : (data.chatId && data.chatId < 0 ? 0 : 1);

    const stmt = db.prepare(`
      INSERT INTO expenses (
        telegram_id, chat_id, user_name, amount, category, 
        merchant, items_detail, notes, raw_input, source_type, is_personal
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.telegramId,
      data.chatId ?? null,
      data.userName ?? null,
      data.amount,
      data.category,
      data.merchant || null,
      data.itemsDetail || null,
      data.notes || null,
      data.rawInput || null,
      data.sourceType,
      isPersonal
    );

    return Number(result.lastInsertRowid);
  },

  getExpenseById(id: number, telegramId?: number): Expense | null {
    let query = 'SELECT * FROM expenses WHERE id = ?';
    const params: any[] = [id];

    if (telegramId) {
      query += ' AND telegram_id = ?';
      params.push(telegramId);
    }

    const row = db.prepare(query).get(...params) as Expense | undefined;
    return row || null;
  },

  togglePersonalStatus(id: number, telegramId: number): { success: boolean; isPersonal: boolean } {
    const expense = this.getExpenseById(id, telegramId);
    if (!expense) return { success: false, isPersonal: false };

    const newStatus = expense.is_personal === 1 ? 0 : 1;
    const result = db.prepare('UPDATE expenses SET is_personal = ? WHERE id = ? AND telegram_id = ?').run(newStatus, id, telegramId);
    return { success: result.changes > 0, isPersonal: newStatus === 1 };
  },

  deleteExpense(id: number, telegramId: number, isAdmin = false): boolean {
    if (isAdmin) {
      const result = db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
      return result.changes > 0;
    }
    const result = db.prepare('DELETE FROM expenses WHERE id = ? AND telegram_id = ?').run(id, telegramId);
    return result.changes > 0;
  },

  updateExpenseCategory(id: number, telegramId: number, newCategory: string): boolean {
    const result = db.prepare('UPDATE expenses SET category = ? WHERE id = ? AND telegram_id = ?').run(newCategory, id, telegramId);
    return result.changes > 0;
  },

  updateExpenseNotes(id: number, telegramId: number, notes: string): boolean {
    const result = db.prepare('UPDATE expenses SET notes = ? WHERE id = ? AND telegram_id = ?').run(notes, id, telegramId);
    return result.changes > 0;
  },

  // ===== LAPORAN PENGELUARAN PRIBADI =====
  getRecentExpenses(telegramId: number, limit = 5): Expense[] {
    return db.prepare(`
      SELECT * FROM expenses 
      WHERE telegram_id = ? AND (chat_id IS NULL OR chat_id > 0 OR is_personal = 1)
      ORDER BY id DESC 
      LIMIT ?
    `).all(telegramId, limit) as Expense[];
  },

  getTodaySummary(telegramId: number): { totalAmount: number; count: number } {
    const row = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as totalAmount, COUNT(id) as count
      FROM expenses
      WHERE telegram_id = ? AND (chat_id IS NULL OR chat_id > 0 OR is_personal = 1) 
        AND DATE(created_at) = DATE('now', 'localtime')
    `).get(telegramId) as { totalAmount: number; count: number };

    return row || { totalAmount: 0, count: 0 };
  },

  getThisMonthSummary(telegramId: number): {
    totalAmount: number;
    count: number;
    categoryBreakdown: CategorySummary[];
  } {
    const totalRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as totalAmount, COUNT(id) as count
      FROM expenses
      WHERE telegram_id = ? AND (chat_id IS NULL OR chat_id > 0 OR is_personal = 1)
        AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')
    `).get(telegramId) as { totalAmount: number; count: number };

    const categoryBreakdown = db.prepare(`
      SELECT category, SUM(amount) as total, COUNT(id) as count
      FROM expenses
      WHERE telegram_id = ? AND (chat_id IS NULL OR chat_id > 0 OR is_personal = 1)
        AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')
      GROUP BY category
      ORDER BY total DESC
    `).all(telegramId) as CategorySummary[];

    return {
      totalAmount: totalRow ? totalRow.totalAmount : 0,
      count: totalRow ? totalRow.count : 0,
      categoryBreakdown
    };
  },

  // ===== LAPORAN KAS GRUP / KELUARGA =====
  getGroupRecentExpenses(chatId: number, limit = 5): Expense[] {
    return db.prepare(`
      SELECT * FROM expenses 
      WHERE chat_id = ? 
      ORDER BY id DESC 
      LIMIT ?
    `).all(chatId, limit) as Expense[];
  },

  getGroupTodaySummary(chatId: number): { totalAmount: number; count: number } {
    const row = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as totalAmount, COUNT(id) as count
      FROM expenses
      WHERE chat_id = ? AND DATE(created_at) = DATE('now', 'localtime')
    `).get(chatId) as { totalAmount: number; count: number };

    return row || { totalAmount: 0, count: 0 };
  },

  getGroupThisMonthSummary(chatId: number): {
    totalAmount: number;
    count: number;
    categoryBreakdown: CategorySummary[];
    memberBreakdown: MemberSummary[];
  } {
    const totalRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as totalAmount, COUNT(id) as count
      FROM expenses
      WHERE chat_id = ? AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')
    `).get(chatId) as { totalAmount: number; count: number };

    const categoryBreakdown = db.prepare(`
      SELECT category, SUM(amount) as total, COUNT(id) as count
      FROM expenses
      WHERE chat_id = ? AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')
      GROUP BY category
      ORDER BY total DESC
    `).all(chatId) as CategorySummary[];

    const memberBreakdown = db.prepare(`
      SELECT telegram_id, COALESCE(user_name, 'Anggota') as user_name, SUM(amount) as total, COUNT(id) as count
      FROM expenses
      WHERE chat_id = ? AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')
      GROUP BY telegram_id
      ORDER BY total DESC
    `).all(chatId) as MemberSummary[];

    return {
      totalAmount: totalRow ? totalRow.totalAmount : 0,
      count: totalRow ? totalRow.count : 0,
      categoryBreakdown,
      memberBreakdown
    };
  }
};

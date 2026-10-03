import { db } from '../db.js';

export interface Expense {
  id: number;
  telegram_id: number;
  amount: number;
  category: string;
  merchant: string | null;
  items_detail: string | null;
  notes: string | null;
  raw_input: string | null;
  source_type: 'text' | 'receipt';
  created_at: string;
}

export interface CategorySummary {
  category: string;
  total: number;
  count: number;
}

export const expenseRepository = {
  addExpense(data: {
    telegramId: number;
    amount: number;
    category: string;
    merchant?: string | null;
    itemsDetail?: string | null;
    notes?: string | null;
    rawInput?: string | null;
    sourceType: 'text' | 'receipt';
  }): number {
    const stmt = db.prepare(`
      INSERT INTO expenses (telegram_id, amount, category, merchant, items_detail, notes, raw_input, source_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.telegramId,
      data.amount,
      data.category,
      data.merchant || null,
      data.itemsDetail || null,
      data.notes || null,
      data.rawInput || null,
      data.sourceType
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

  deleteExpense(id: number, telegramId: number): boolean {
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

  getRecentExpenses(telegramId: number, limit = 5): Expense[] {
    return db.prepare(`
      SELECT * FROM expenses 
      WHERE telegram_id = ? 
      ORDER BY id DESC 
      LIMIT ?
    `).all(telegramId, limit) as Expense[];
  },

  getTodaySummary(telegramId: number): { totalAmount: number; count: number } {
    const row = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as totalAmount, COUNT(id) as count
      FROM expenses
      WHERE telegram_id = ? AND DATE(created_at) = DATE('now', 'localtime')
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
      WHERE telegram_id = ? AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')
    `).get(telegramId) as { totalAmount: number; count: number };

    const categoryBreakdown = db.prepare(`
      SELECT category, SUM(amount) as total, COUNT(id) as count
      FROM expenses
      WHERE telegram_id = ? AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now', 'localtime')
      GROUP BY category
      ORDER BY total DESC
    `).all(telegramId) as CategorySummary[];

    return {
      totalAmount: totalRow ? totalRow.totalAmount : 0,
      count: totalRow ? totalRow.count : 0,
      categoryBreakdown
    };
  }
};

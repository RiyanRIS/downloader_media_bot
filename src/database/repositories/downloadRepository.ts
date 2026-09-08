import { db } from '../db.js';

export interface DownloadLog {
  id: number;
  telegram_id: number;
  platform: string;
  url: string;
  file_type: string;
  file_size_bytes: number | null;
  downloaded_at: string;
}

export const downloadRepository = {
  logDownload(
    telegramId: number,
    platform: string,
    url: string,
    fileType: string,
    fileSizeBytes?: number
  ): void {
    db.prepare(`
      INSERT INTO downloads_log (telegram_id, platform, url, file_type, file_size_bytes)
      VALUES (?, ?, ?, ?, ?)
    `).run(telegramId, platform, url, fileType, fileSizeBytes || null);
  },

  getStats(): { totalDownloads: number; byPlatform: Record<string, number> } {
    const totalRow = db.prepare('SELECT COUNT(*) as count FROM downloads_log').get() as { count: number };
    const platformRows = db.prepare(`
      SELECT platform, COUNT(*) as count 
      FROM downloads_log 
      GROUP BY platform
    `).all() as { platform: string; count: number }[];

    const byPlatform: Record<string, number> = {};
    for (const r of platformRows) {
      byPlatform[r.platform] = r.count;
    }

    return {
      totalDownloads: totalRow.count,
      byPlatform
    };
  },

  getTodayCount(): number {
    const row = db.prepare(`
      SELECT COUNT(*) as count 
      FROM downloads_log 
      WHERE DATE(downloaded_at) = DATE('now')
    `).get() as { count: number };
    return row?.count || 0;
  }
};

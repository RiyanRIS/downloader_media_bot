/**
 * Escape HTML special characters for safe usage in Telegram Bot API (parse_mode: 'HTML')
 */
export function escapeHtml(text?: string | number | null): string {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Format angka menjadi format mata uang Rupiah Indonesia (contoh: Rp 25.000)
 */
export function formatRupiah(amount: number): string {
  return 'Rp ' + Math.round(amount).toLocaleString('id-ID');
}

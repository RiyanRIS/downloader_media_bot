import { Composer, InlineKeyboard } from 'grammy';
import { MyContext } from '../context.js';
import { aiExpenseService } from '../../services/aiExpenseService.js';
import { expenseRepository, Expense } from '../../database/repositories/expenseRepository.js';
import { config } from '../../config/config.js';
import { escapeHtml, formatRupiah } from '../../utils/format.js';

export const expenseComposer = new Composer<MyContext>();

// Daftar kategori dan ikon
const CATEGORY_MAP: Record<string, string> = {
  'Makanan & Minuman': '🍜',
  'Belanja Harian': '🛒',
  'Transportasi': '⛽',
  'Tagihan & Pulsa': '📱',
  'Hiburan': '🎮',
  'Kesehatan': '💊',
  'Lainnya': '📦'
};

const CATEGORY_LIST = Object.keys(CATEGORY_MAP);

// State sementara user yang baru saja mengetik /struk dan sedang ditunggu kiriman fotonya (expired 3 menit)
const awaitingReceiptPhotos = new Map<number, number>();

// State sementara user yang sedang mengetik catatan/notes untuk pengeluaran tertentu (expired 5 menit)
interface PendingNote {
  expenseId: number;
  cardMessageId?: number;
  chatId: number;
  timestamp: number;
}
const awaitingNotes = new Map<number, PendingNote>();

function isAwaitingReceipt(userId: number): boolean {
  const timestamp = awaitingReceiptPhotos.get(userId);
  if (!timestamp) return false;
  if (Date.now() - timestamp > 3 * 60 * 1000) {
    awaitingReceiptPhotos.delete(userId);
    return false;
  }
  return true;
}

function renderExpenseCard(expense: Expense): { text: string; keyboard: InlineKeyboard } {
  const icon = CATEGORY_MAP[expense.category] || '💰';
  const sourceBadge = expense.source_type === 'receipt' ? '🧾 <i>(Dari Foto Struk)</i>' : '💬 <i>(Dari Catatan Teks)</i>';

  let text = `✅ <b>Pengeluaran Berhasil Dicatat!</b>\n\n`;
  text += `💰 <b>Nominal:</b> <b>${formatRupiah(expense.amount)}</b>\n`;
  text += `🏷️ <b>Kategori:</b> ${icon} ${escapeHtml(expense.category)}\n`;

  if (expense.merchant) {
    text += `🏢 <b>Tempat/Toko:</b> ${escapeHtml(expense.merchant)}\n`;
  }

  if (expense.items_detail) {
    text += `📦 <b>Item:</b> ${escapeHtml(expense.items_detail)}\n`;
  }

  if (expense.notes) {
    text += `📝 <b>Catatan:</b> ${escapeHtml(expense.notes)}\n`;
  }

  text += `📅 <b>Waktu:</b> ${escapeHtml(expense.created_at)}\n`;
  text += `📌 ${sourceBadge}\n`;

  const noteBtnText = expense.notes ? '📝 Edit Catatan' : '📝 Tambahkan Catatan';

  const keyboard = new InlineKeyboard()
    .text('🏷️ Ganti Kategori', `exp_cat:${expense.id}`)
    .text(noteBtnText, `exp_note:${expense.id}`)
    .row()
    .text('🗑️ Hapus', `exp_del:${expense.id}`);

  return { text, keyboard };
}

function renderFinancialReport(userId: number): { text: string; keyboard: InlineKeyboard } {
  const today = expenseRepository.getTodaySummary(userId);
  const thisMonth = expenseRepository.getThisMonthSummary(userId);
  const recent = expenseRepository.getRecentExpenses(userId, 5);

  const now = new Date();
  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const currentMonthName = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

  let text = `📊 <b>Ringkasan Keuangan & Dompet</b>\n\n`;

  // Hari Ini
  text += `📅 <b>Hari Ini:</b>\n`;
  text += `• Total: <b>${formatRupiah(today.totalAmount)}</b> (${today.count} transaksi)\n\n`;

  // Bulan Ini
  text += `🗓️ <b>Bulan Ini (${currentMonthName}):</b>\n`;
  text += `• Total Pengeluaran: <b>${formatRupiah(thisMonth.totalAmount)}</b> (${thisMonth.count} transaksi)\n\n`;

  // Rincian Kategori
  if (thisMonth.categoryBreakdown.length > 0) {
    text += `🏷️ <b>Rincian per Kategori (Bulan Ini):</b>\n`;
    for (const item of thisMonth.categoryBreakdown) {
      const icon = CATEGORY_MAP[item.category] || '🔹';
      const percentage = thisMonth.totalAmount > 0 
        ? Math.round((item.total / thisMonth.totalAmount) * 100) 
        : 0;
      text += `• ${icon} <b>${escapeHtml(item.category)}:</b> ${formatRupiah(item.total)} (${percentage}% - ${item.count}x)\n`;
    }
    text += `\n`;
  } else {
    text += `<i>Belum ada pengeluaran yang tercatat di bulan ini.</i>\n\n`;
  }

  // 5 Transaksi Terakhir
  if (recent.length > 0) {
    text += `📝 <b>5 Catatan Pengeluaran Terakhir:</b>\n`;
    recent.forEach((exp, idx) => {
      const icon = CATEGORY_MAP[exp.category] || '•';
      const info = exp.merchant ? `${exp.merchant} - ` : '';
      const noteBadge = exp.notes ? ` <i>[📝 ${escapeHtml(exp.notes)}]</i>` : '';
      text += `${idx + 1}. ${icon} <b>${formatRupiah(exp.amount)}</b> [${escapeHtml(exp.category)}]\n`;
      text += `   ↳ ${info}${escapeHtml(exp.items_detail || 'Pengeluaran')}${noteBadge} <i>(${exp.created_at})</i>\n`;
    });
    text += `\n`;
  }

  text += `💡 <b>Petunjuk:</b>\n`;
  text += `• Ketik <code>/catat &lt;cerita belanja&gt;</code> untuk catat cepat.\n`;
  text += `• Ketik <code>/struk</code> atau kirim foto struk untuk membaca otomatis.`;

  const keyboard = new InlineKeyboard()
    .text('🔄 Perbarui Data', 'exp_refresh');

  return { text, keyboard };
}

// 0. Listener Pesan Teks untuk Menangkap Input Notes/Catatan
expenseComposer.on('message:text', async (ctx, next) => {
  const from = ctx.from;
  if (!from) return next();

  const pending = awaitingNotes.get(from.id);
  if (!pending) return next();

  // Batalkan jika sudah lewat 5 menit
  if (Date.now() - pending.timestamp > 5 * 60 * 1000) {
    awaitingNotes.delete(from.id);
    return next();
  }

  const text = ctx.message.text.trim();

  // Jika input diawali tanda slash '/', pengguna mungkin mengeksekusi perintah bot lain
  if (text.startsWith('/')) {
    awaitingNotes.delete(from.id);
    return next();
  }

  awaitingNotes.delete(from.id);

  expenseRepository.updateExpenseNotes(pending.expenseId, from.id, text);
  const updatedExpense = expenseRepository.getExpenseById(pending.expenseId, from.id);

  if (updatedExpense) {
    const { text: cardText, keyboard } = renderExpenseCard(updatedExpense);

    // Coba perbarui pesan kartu pengeluaran sebelumnya jika masih tersedia
    if (pending.cardMessageId) {
      await ctx.api.editMessageText(pending.chatId, pending.cardMessageId, cardText, {
        parse_mode: 'HTML',
        reply_markup: keyboard
      }).catch(() => {});
    }

    await ctx.reply(`✅ <b>Catatan berhasil disimpan!</b>\n\n${cardText}`, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
  } else {
    await ctx.reply('❌ Catatan pengeluaran tidak ditemukan atau telah dihapus.');
  }
});

// 1. Command /catat <teks>
expenseComposer.command('catat', async ctx => {
  const from = ctx.from;
  if (!from) return;

  const rawText = ctx.match?.trim();

  // Jika tanpa parameter, tampilkan panduan cara pakai
  if (!rawText) {
    const guideText =
      `💡 <b>Cara Mencatat Pengeluaran Cerdas</b>\n\n` +
      `Anda dapat mencatat pengeluaran dengan dua cara simpel:\n\n` +
      `1️⃣ <b>Ketik Cerita / Catatan Belanja:</b>\n` +
      `   • <code>/catat beli soto ayam 15k di warung pak kumis</code>\n` +
      `   • <code>/catat isi bensin pertalite 50rb</code>\n` +
      `   • <code>/catat ngopi di janji jiwa habis 28000</code>\n` +
      `   • <code>/catat belanja bulanan di alfamart habis 145k</code>\n\n` +
      `2️⃣ <b>Kirim Foto Struk Belanja:</b>\n` +
      `   Ketik <code>/struk</code> lalu kirimkan foto struk, atau langsung kirim foto struk belanja dengan caption <code>/catat</code> atau <code>/struk</code>!\n\n` +
      `📊 <b>Lihat Laporan & Ringkasan:</b>\n` +
      `   Ketik /keuangan atau /laporan untuk melihat rekap hari ini & bulan ini.`;

    await ctx.reply(guideText, { parse_mode: 'HTML' });
    return;
  }

  // Cek apakah GEMINI_API_KEY sudah disetel
  if (!config.geminiApiKey) {
    await ctx.reply(
      `⚠️ <b>Fitur AI Belum Aktif</b>\n` +
      `Variabel <code>GEMINI_API_KEY</code> belum diisi di file <code>.env</code> server.\n` +
      `Dapatkan API Key gratis di <a href="https://aistudio.google.com/app/apikey">Google AI Studio</a> lalu masukkan ke .env.`,
      { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
    );
    return;
  }

  const waitMsg = await ctx.reply('⏳ <i>Sedang menganalisis pengeluaran Anda...</i>', { parse_mode: 'HTML' });

  try {
    const extracted = await aiExpenseService.parseExpenseFromText(rawText);

    const expenseId = expenseRepository.addExpense({
      telegramId: from.id,
      amount: extracted.amount,
      category: extracted.category,
      merchant: extracted.merchant,
      itemsDetail: extracted.items.length > 0 ? extracted.items.join(', ') : null,
      notes: null,
      rawInput: rawText,
      sourceType: 'text'
    });

    const savedExpense = expenseRepository.getExpenseById(expenseId)!;
    const { text, keyboard } = renderExpenseCard(savedExpense);

    await ctx.api.editMessageText(ctx.chat.id, waitMsg.message_id, text, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
  } catch (err: any) {
    await ctx.api.editMessageText(
      ctx.chat.id,
      waitMsg.message_id,
      `❌ <b>Gagal Mencatat Pengeluaran</b>\n${escapeHtml(err.message || 'Terjadi kesalahan sistem saat menganalisis teks.')}`,
      { parse_mode: 'HTML' }
    );
  }
});

// 2. Command /struk
expenseComposer.command('struk', async ctx => {
  const from = ctx.from;
  if (!from) return;

  awaitingReceiptPhotos.set(from.id, Date.now());

  await ctx.reply(
    `📸 <b>Kirim Foto Struk Belanja</b>\n\n` +
    `Silakan kirimkan foto struk/nota belanja Anda sekarang.\n` +
    `AI akan otomatis membaca total belanja, toko/merchant, dan item barang.\n\n` +
    `<i>Tip: Pastikan tulisan dan angka total pada struk terlihat jelas dan tidak buram.</i>`,
    { parse_mode: 'HTML' }
  );
});

// 3. Listener Foto (Membaca struk jika user dalam mode tunggu /struk atau foto dengan caption /catat atau /struk)
expenseComposer.on('message:photo', async (ctx, next) => {
  const from = ctx.from;
  if (!from) return next();

  const caption = ctx.message.caption?.trim().toLowerCase() || '';
  const isWaiting = isAwaitingReceipt(from.id);
  const hasExpenseCaption = caption.startsWith('/catat') || caption.startsWith('/struk');

  if (!isWaiting && !hasExpenseCaption) {
    return next();
  }

  // Hapus tanda tunggu
  awaitingReceiptPhotos.delete(from.id);

  if (!config.geminiApiKey) {
    await ctx.reply(
      `⚠️ <b>Fitur AI Belum Aktif</b>\n` +
      `Variabel <code>GEMINI_API_KEY</code> belum diisi di file <code>.env</code> server.\n` +
      `Dapatkan API Key gratis di <a href="https://aistudio.google.com/app/apikey">Google AI Studio</a> lalu masukkan ke .env.`,
      { parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
    );
    return;
  }

  const waitMsg = await ctx.reply('🧾 <i>Sedang membaca dan menganalisis struk menggunakan AI...</i>', { parse_mode: 'HTML' });

  try {
    // Ambil file foto ukuran terbesar
    const file = await ctx.getFile();
    if (!file.file_path) {
      throw new Error('Tidak dapat mengunduh foto dari server Telegram.');
    }

    const downloadUrl = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
    const res = await fetch(downloadUrl);
    if (!res.ok) {
      throw new Error(`Gagal mengunduh foto struk (HTTP ${res.status}).`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);

    const extracted = await aiExpenseService.parseExpenseFromReceipt(imageBuffer, 'image/jpeg');

    const expenseId = expenseRepository.addExpense({
      telegramId: from.id,
      amount: extracted.amount,
      category: extracted.category,
      merchant: extracted.merchant,
      itemsDetail: extracted.items.length > 0 ? extracted.items.join(', ') : null,
      notes: null,
      rawInput: '[Foto Struk Belanja]',
      sourceType: 'receipt'
    });

    const savedExpense = expenseRepository.getExpenseById(expenseId)!;
    const { text, keyboard } = renderExpenseCard(savedExpense);

    await ctx.api.editMessageText(ctx.chat.id, waitMsg.message_id, text, {
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
  } catch (err: any) {
    await ctx.api.editMessageText(
      ctx.chat.id,
      waitMsg.message_id,
      `❌ <b>Gagal Membaca Struk</b>\n${escapeHtml(err.message || 'Struk tidak terbaca atau terjadi gangguan saat analisis.')}`,
      { parse_mode: 'HTML' }
    );
  }
});

// 4. Command /keuangan & /laporan
expenseComposer.command(['keuangan', 'laporan'], async ctx => {
  const from = ctx.from;
  if (!from) return;

  const { text, keyboard } = renderFinancialReport(from.id);
  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
});

// 5. Callback Query Actions
// A. Refresh Dashboard Keuangan
expenseComposer.callbackQuery('exp_refresh', async ctx => {
  const from = ctx.from;
  if (!from) return;

  const { text, keyboard } = renderFinancialReport(from.id);
  try {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
    await ctx.answerCallbackQuery({ text: 'Data keuangan diperbarui!' });
  } catch {
    await ctx.answerCallbackQuery({ text: 'Data sudah yang terbaru.' });
  }
});

// B. Tambah / Edit Catatan: exp_note:<id>
expenseComposer.callbackQuery(/^exp_note:(\d+)$/, async ctx => {
  const from = ctx.from;
  if (!from) return;

  const expenseId = parseInt(ctx.match[1], 10);
  const expense = expenseRepository.getExpenseById(expenseId, from.id);

  if (!expense) {
    await ctx.answerCallbackQuery({ text: 'Catatan pengeluaran tidak ditemukan atau sudah dihapus.', show_alert: true });
    return;
  }

  awaitingNotes.set(from.id, {
    expenseId,
    cardMessageId: ctx.callbackQuery.message?.message_id,
    chatId: ctx.chat?.id || from.id,
    timestamp: Date.now()
  });

  await ctx.answerCallbackQuery();

  const cancelKeyboard = new InlineKeyboard().text('❌ Batalkan', `exp_cancelnote:${expenseId}`);

  await ctx.reply(
    `📝 <b>Ketik Catatan / Notes</b>\n\n` +
    `Silakan ketik catatan tambahan untuk pengeluaran ini:\n` +
    `<i>(Contoh: "Reimburse kantor", "Patungan sama Rian", atau "Titipan belanja tetangga")</i>`,
    {
      parse_mode: 'HTML',
      reply_markup: cancelKeyboard
    }
  );
});

// C. Batalkan Pembuatan Catatan: exp_cancelnote:<id>
expenseComposer.callbackQuery(/^exp_cancelnote:(\d+)$/, async ctx => {
  const from = ctx.from;
  if (!from) return;

  awaitingNotes.delete(from.id);
  await ctx.answerCallbackQuery({ text: 'Pengisian catatan dibatalkan.' });
  await ctx.editMessageText('❌ <i>Pengisian catatan dibatalkan.</i>', { parse_mode: 'HTML' });
});

// D. Hapus Pengeluaran: exp_del:<id>
expenseComposer.callbackQuery(/^exp_del:(\d+)$/, async ctx => {
  const from = ctx.from;
  if (!from) return;

  const expenseId = parseInt(ctx.match[1], 10);
  const expense = expenseRepository.getExpenseById(expenseId, from.id);

  if (!expense) {
    await ctx.answerCallbackQuery({ text: 'Catatan pengeluaran tidak ditemukan atau sudah dihapus.', show_alert: true });
    return;
  }

  const deleted = expenseRepository.deleteExpense(expenseId, from.id);
  if (deleted) {
    await ctx.answerCallbackQuery({ text: 'Pengeluaran berhasil dihapus!' });
    await ctx.editMessageText(
      `🗑️ <b>Pengeluaran Dihapus</b>\nCatatan sebesar <b>${formatRupiah(expense.amount)}</b> (${escapeHtml(expense.category)}) telah dibatalkan/dihapus dari catatan keuangan Anda.`,
      { parse_mode: 'HTML' }
    );
  } else {
    await ctx.answerCallbackQuery({ text: 'Gagal menghapus pengeluaran.', show_alert: true });
  }
});

// E. Tampilkan Menu Ganti Kategori: exp_cat:<id>
expenseComposer.callbackQuery(/^exp_cat:(\d+)$/, async ctx => {
  const from = ctx.from;
  if (!from) return;

  const expenseId = parseInt(ctx.match[1], 10);
  const expense = expenseRepository.getExpenseById(expenseId, from.id);

  if (!expense) {
    await ctx.answerCallbackQuery({ text: 'Catatan pengeluaran tidak ditemukan.', show_alert: true });
    return;
  }

  const keyboard = new InlineKeyboard();
  for (let i = 0; i < CATEGORY_LIST.length; i++) {
    const cat = CATEGORY_LIST[i];
    const icon = CATEGORY_MAP[cat] || '🔹';
    keyboard.text(`${icon} ${cat}`, `exp_setcat:${expenseId}:${i}`);
    if (i % 2 === 1) keyboard.row();
  }
  keyboard.row().text('🔙 Kembali', `exp_back:${expenseId}`);

  await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
  await ctx.answerCallbackQuery();
});

// F. Terapkan Kategori Baru: exp_setcat:<id>:<catIndex>
expenseComposer.callbackQuery(/^exp_setcat:(\d+):(\d+)$/, async ctx => {
  const from = ctx.from;
  if (!from) return;

  const expenseId = parseInt(ctx.match[1], 10);
  const catIndex = parseInt(ctx.match[2], 10);
  const newCategory = CATEGORY_LIST[catIndex];

  if (!newCategory) {
    await ctx.answerCallbackQuery({ text: 'Kategori tidak valid.', show_alert: true });
    return;
  }

  const success = expenseRepository.updateExpenseCategory(expenseId, from.id, newCategory);
  if (!success) {
    await ctx.answerCallbackQuery({ text: 'Gagal memperbarui kategori.', show_alert: true });
    return;
  }

  const updatedExpense = expenseRepository.getExpenseById(expenseId, from.id);
  if (updatedExpense) {
    const { text, keyboard } = renderExpenseCard(updatedExpense);
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }

  await ctx.answerCallbackQuery({ text: `Kategori diubah ke ${newCategory}!` });
});

// G. Tombol Kembali: exp_back:<id>
expenseComposer.callbackQuery(/^exp_back:(\d+)$/, async ctx => {
  const from = ctx.from;
  if (!from) return;

  const expenseId = parseInt(ctx.match[1], 10);
  const expense = expenseRepository.getExpenseById(expenseId, from.id);

  if (expense) {
    const { text, keyboard } = renderExpenseCard(expense);
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }

  await ctx.answerCallbackQuery();
});

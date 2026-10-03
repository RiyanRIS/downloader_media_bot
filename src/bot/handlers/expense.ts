import { Composer, InlineKeyboard } from 'grammy';
import { MyContext } from '../context.js';
import { aiExpenseService } from '../../services/aiExpenseService.js';
import { expenseRepository, Expense } from '../../database/repositories/expenseRepository.js';
import { userRepository } from '../../database/repositories/userRepository.js';
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

// State sementara user yang sedang diminta mengetik teks /catat via tombol
const awaitingCatatText = new Map<number, number>(); // userId -> timestamp

function isAwaitingReceipt(userId: number): boolean {
  const timestamp = awaitingReceiptPhotos.get(userId);
  if (!timestamp) return false;
  if (Date.now() - timestamp > 3 * 60 * 1000) {
    awaitingReceiptPhotos.delete(userId);
    return false;
  }
  return true;
}

/** Cek apakah user (VIP/Admin) bebas biaya koin untuk fitur AI keuangan */
function isExpenseFree(userId: number): boolean {
  const user = userRepository.getUser(userId);
  return user?.role === 'vip' || user?.role === 'admin';
}

/** Buat pesan "koin tidak cukup" dengan tombol cara mendapatkan koin */
function buildInsufficientCoinMsg(cost: number, currentCoins: number, featureName: string): { text: string; keyboard: InlineKeyboard } {
  const text =
    `⚠️ <b>Koin Tidak Cukup!</b>\n\n` +
    `Fitur <b>${featureName}</b> membutuhkan <b>${cost} Koin</b>.\n` +
    `Saldo koin Anda saat ini: 💰 <b>${currentCoins} Koin</b>.\n\n` +
    `<b>Cara mendapatkan koin:</b>\n` +
    `• 🎁 Klaim bonus harian gratis\n` +
    `• 🎮 Mainkan mini-games di Arena Games\n` +
    `• 💳 Beli koin via QRIS Otomatis`;
  const keyboard = new InlineKeyboard()
    .text('🎁 Klaim Harian', 'game:action:claim')
    .text('🎮 Main Game', 'game:nav:menu')
    .row()
    .text('💳 Beli Koin (QRIS)', 'topup:menu')
    .text('📊 Keuangan', 'keuangan:menu');
  return { text, keyboard };
}

export function renderExpenseCard(expense: Expense): { text: string; keyboard: InlineKeyboard } {
  const icon = CATEGORY_MAP[expense.category] || '💰';
  const sourceBadge = expense.source_type === 'receipt' ? '🧾 <i>(Dari Foto Struk)</i>' : '💬 <i>(Dari Catatan Teks)</i>';
  const isGroup = Boolean(expense.chat_id && expense.chat_id < 0);

  let text = isGroup
    ? `👨‍👩‍👧‍👦 <b>Kas Grup / Keluarga Berhasil Dicatat!</b>\n\n`
    : `✅ <b>Pengeluaran Berhasil Dicatat!</b>\n\n`;

  if (isGroup) {
    text += `👤 <b>Dicatat oleh:</b> ${escapeHtml(expense.user_name || 'Anggota')}\n`;
  }

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

  if (isGroup && expense.is_personal === 1) {
    text += `✨ <i>Tersimpan juga di catatan dompet pribadi pencatat</i>\n`;
  }

  // Tampilkan info koin yang dipotong dan EXP yang didapat
  const expenseUser = userRepository.getUser(expense.telegram_id);
  const expGained = expense.source_type === 'receipt' ? 5 : 3;
  if (expenseUser && expenseUser.role !== 'vip' && expenseUser.role !== 'admin') {
    const coinCut = expense.source_type === 'receipt' ? config.coinCostExpenseReceipt : config.coinCostExpenseText;
    const byWhom = isGroup ? `saldo pribadi ${escapeHtml(expense.user_name || 'pencatat')}` : 'saldo Anda';
    text += `🪙 <i>-${coinCut} Koin dari ${byWhom} · ⭐ +${expGained} EXP · Sisa: ${expenseUser.coins} Koin</i>\n`;
  } else {
    text += `⭐ <i>+${expGained} EXP diperoleh (VIP/Admin: 0 Koin)</i>\n`;
  }

  const noteBtnText = expense.notes ? '📝 Edit Catatan' : '📝 Tambahkan Catatan';

  const keyboard = new InlineKeyboard()
    .text('🏷️ Ganti Kategori', `exp_cat:${expense.id}`)
    .text(noteBtnText, `exp_note:${expense.id}`)
    .row();

  // Tombol sinkronisasi kas grup ke keuangan pribadi pencatat
  if (isGroup) {
    if (expense.is_personal === 1) {
      keyboard.text('✅ Tersimpan di Pribadi', `exp_toggle_personal:${expense.id}`).row();
    } else {
      keyboard.text('📌 Simpan juga di Pribadi', `exp_toggle_personal:${expense.id}`).row();
    }
  }

  keyboard.text('🗑️ Hapus', `exp_del:${expense.id}`);
  if (isGroup) {
    keyboard.text('📊 Kas Grup', 'keuangan:menu');
  } else {
    keyboard.text('📊 Lihat Keuangan', 'keuangan:menu');
  }

  return { text, keyboard };
}

export function renderFinancialReport(userId: number): { text: string; keyboard: InlineKeyboard } {
  const today = expenseRepository.getTodaySummary(userId);
  const thisMonth = expenseRepository.getThisMonthSummary(userId);
  const recent = expenseRepository.getRecentExpenses(userId, 5);

  const now = new Date();
  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const currentMonthName = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

  let text = `📊 <b>Ringkasan Keuangan & Dompet Pribadi</b>\n\n`;

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
      const groupBadge = (exp.chat_id && exp.chat_id < 0) ? ' <i>(Kas Grup)</i>' : '';
      text += `${idx + 1}. ${icon} <b>${formatRupiah(exp.amount)}</b> [${escapeHtml(exp.category)}]${groupBadge}\n`;
      text += `   ↳ ${info}${escapeHtml(exp.items_detail || 'Pengeluaran')}${noteBadge} <i>(${exp.created_at})</i>\n`;
    });
    text += `\n`;
  }

  text += `💡 <b>Petunjuk:</b>\n`;
  text += `• Tekan tombol <b>📝 Catat Pengeluaran</b> untuk mencatat belanja dengan teks.\n`;
  text += `• Tekan tombol <b>🧾 Scan Struk</b> untuk membaca foto struk otomatis via AI.\n`;
  text += `• 🌟 VIP &amp; Admin: <b>Gratis biaya</b> untuk semua fitur keuangan.`;

  const keyboard = new InlineKeyboard()
    .text('🔄 Perbarui Data', 'exp_refresh')
    .row()
    .text('📝 Catat Pengeluaran', 'keuangan:nav:catat')
    .text('🧾 Scan Struk', 'keuangan:nav:struk')
    .row()
    .text('📋 Menu Utama', 'start:mainmenu');

  return { text, keyboard };
}

export function renderGroupFinancialReport(chatId: number, groupTitle: string): { text: string; keyboard: InlineKeyboard } {
  const today = expenseRepository.getGroupTodaySummary(chatId);
  const thisMonth = expenseRepository.getGroupThisMonthSummary(chatId);
  const recent = expenseRepository.getGroupRecentExpenses(chatId, 5);

  const now = new Date();
  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const currentMonthName = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

  let text = `👨‍👩‍👧‍👦 <b>Kas Grup / Pengeluaran Keluarga</b>\n`;
  text += `📍 <b>${escapeHtml(groupTitle)}</b>\n\n`;

  // Hari Ini
  text += `📅 <b>Hari Ini:</b>\n`;
  text += `• Total Kas Keluar: <b>${formatRupiah(today.totalAmount)}</b> (${today.count} transaksi)\n\n`;

  // Bulan Ini
  text += `🗓️ <b>Bulan Ini (${currentMonthName}):</b>\n`;
  text += `• Total Pengeluaran Bersama: <b>${formatRupiah(thisMonth.totalAmount)}</b> (${thisMonth.count} transaksi)\n\n`;

  // Kontribusi Anggota
  if (thisMonth.memberBreakdown.length > 0) {
    text += `👥 <b>Kontribusi Anggota (Bulan Ini):</b>\n`;
    for (const mem of thisMonth.memberBreakdown) {
      const percentage = thisMonth.totalAmount > 0 
        ? Math.round((mem.total / thisMonth.totalAmount) * 100) 
        : 0;
      text += `• 👤 <b>${escapeHtml(mem.user_name)}:</b> ${formatRupiah(mem.total)} (${percentage}% - ${mem.count}x)\n`;
    }
    text += `\n`;
  }

  // Rincian Kategori
  if (thisMonth.categoryBreakdown.length > 0) {
    text += `🏷️ <b>Rincian Kategori (Bulan Ini):</b>\n`;
    for (const item of thisMonth.categoryBreakdown) {
      const icon = CATEGORY_MAP[item.category] || '🔹';
      const percentage = thisMonth.totalAmount > 0 
        ? Math.round((item.total / thisMonth.totalAmount) * 100) 
        : 0;
      text += `• ${icon} <b>${escapeHtml(item.category)}:</b> ${formatRupiah(item.total)} (${percentage}%)\n`;
    }
    text += `\n`;
  } else {
    text += `<i>Belum ada pengeluaran kas grup yang tercatat di bulan ini.</i>\n\n`;
  }

  // 5 Transaksi Terakhir di Grup
  if (recent.length > 0) {
    text += `📝 <b>5 Catatan Kas Terakhir di Grup:</b>\n`;
    recent.forEach((exp, idx) => {
      const icon = CATEGORY_MAP[exp.category] || '•';
      const info = exp.merchant ? `${exp.merchant} - ` : '';
      const byUser = exp.user_name ? ` · <i>by ${escapeHtml(exp.user_name)}</i>` : '';
      const noteBadge = exp.notes ? ` <i>[📝 ${escapeHtml(exp.notes)}]</i>` : '';
      text += `${idx + 1}. ${icon} <b>${formatRupiah(exp.amount)}</b> [${escapeHtml(exp.category)}]\n`;
      text += `   ↳ ${info}${escapeHtml(exp.items_detail || 'Pengeluaran')}${noteBadge}${byUser}\n`;
    });
    text += `\n`;
  }

  text += `💡 <b>Info Penggunaan:</b>\n`;
  text += `• Koin dipotong dari saldo pribadi anggota yang mencatat.\n`;
  text += `• Tekan tombol <b>📌 Simpan juga di Pribadi</b> pada kartu transaksi jika ingin memasukkannya juga ke dompet pribadi Anda.`;

  const keyboard = new InlineKeyboard()
    .text('🔄 Perbarui Data', 'exp_refresh')
    .row()
    .text('📝 Catat Kas Grup', 'keuangan:nav:catat')
    .text('🧾 Scan Struk', 'keuangan:nav:struk');

  return { text, keyboard };
}

// ----- Callback: Menu Utama Keuangan -----
expenseComposer.callbackQuery('keuangan:menu', async ctx => {
  await ctx.answerCallbackQuery();
  const from = ctx.from;
  if (!from) return;

  const chat = ctx.chat;
  const isGroup = Boolean(chat && (chat.type === 'group' || chat.type === 'supergroup'));
  const { text, keyboard } = (isGroup && chat)
    ? renderGroupFinancialReport(chat.id, (chat as any).title || 'Kas Grup / Keluarga')
    : renderFinancialReport(from.id);

  if (ctx.callbackQuery.message) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(async () => {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
    });
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }
});

// ----- Callback: Navigasi Catat via Tombol -----
expenseComposer.callbackQuery('keuangan:nav:catat', async ctx => {
  const from = ctx.from;
  if (!from) return;

  if (!config.geminiApiKey) {
    await ctx.answerCallbackQuery({ text: 'GEMINI_API_KEY belum diisi di .env!', show_alert: true });
    return;
  }

  // Cek koin (VIP/Admin gratis)
  if (!isExpenseFree(from.id)) {
    const user = userRepository.getUser(from.id);
    const cost = config.coinCostExpenseText;
    if (!user || user.coins < cost) {
      await ctx.answerCallbackQuery({ text: `Koin tidak cukup! Butuh ${cost} koin.`, show_alert: true });
      const { text, keyboard } = buildInsufficientCoinMsg(cost, user?.coins ?? 0, 'Catat Pengeluaran (Teks)');
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
      return;
    }
  }

  awaitingCatatText.set(from.id, Date.now());
  await ctx.answerCallbackQuery();

  const isGroup = ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup');
  const cost = isExpenseFree(from.id) ? 0 : config.coinCostExpenseText;
  const costNote = cost > 0 
    ? `\n\n<i>Biaya: <b>${cost} Koin</b> (dipotong dari saldo pribadi ${escapeHtml(from.first_name)}).</i>` 
    : `\n\n<i>Gratis untuk VIP/Admin.</i>`;

  const cancelKeyboard = new InlineKeyboard()
    .text('❌ Batalkan', 'keuangan:cancalcatat')
    .text(isGroup ? '📊 Kas Grup' : '📋 Keuangan', 'keuangan:menu');

  const titleHeader = isGroup
    ? `📝 <b>Catat Kas Grup / Pengeluaran Keluarga</b> (@${escapeHtml(from.first_name)})`
    : `📝 <b>Catat Pengeluaran Baru</b>`;

  await ctx.reply(
    `${titleHeader}\n\n` +
    `Ketikkan cerita belanja Anda di chat ini. Contoh:\n` +
    `• <code>beli beras 5kg 75rb di pasar</code>\n` +
    `• <code>bayar listrik rumah 250k</code>\n` +
    `• <code>beli susu anak 120rb di indomaret</code>${costNote}`,
    { parse_mode: 'HTML', reply_markup: cancelKeyboard }
  );
});

// ----- Callback: Batalkan input catat via tombol -----
expenseComposer.callbackQuery('keuangan:cancalcatat', async ctx => {
  const from = ctx.from;
  if (!from) return;
  awaitingCatatText.delete(from.id);
  await ctx.answerCallbackQuery({ text: 'Input catatan dibatalkan.' });
  await ctx.editMessageText('❌ <i>Pengisian catatan dibatalkan.</i>', { parse_mode: 'HTML' });
});

// ----- Callback: Navigasi Struk via Tombol -----
expenseComposer.callbackQuery('keuangan:nav:struk', async ctx => {
  const from = ctx.from;
  if (!from) return;

  if (!config.geminiApiKey) {
    await ctx.answerCallbackQuery({ text: 'GEMINI_API_KEY belum diisi di .env!', show_alert: true });
    return;
  }

  // Cek koin (VIP/Admin gratis)
  if (!isExpenseFree(from.id)) {
    const user = userRepository.getUser(from.id);
    const cost = config.coinCostExpenseReceipt;
    if (!user || user.coins < cost) {
      await ctx.answerCallbackQuery({ text: `Koin tidak cukup! Butuh ${cost} koin.`, show_alert: true });
      const { text, keyboard } = buildInsufficientCoinMsg(cost, user?.coins ?? 0, 'Scan Struk AI');
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
      return;
    }
  }

  awaitingReceiptPhotos.set(from.id, Date.now());
  await ctx.answerCallbackQuery();

  const isGroup = ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup');
  const cost = isExpenseFree(from.id) ? 0 : config.coinCostExpenseReceipt;
  const costNote = cost > 0 
    ? `\n\n<i>Biaya: <b>${cost} Koin</b> (dipotong dari saldo pribadi ${escapeHtml(from.first_name)}).</i>` 
    : `\n\n<i>Gratis untuk VIP/Admin.</i>`;

  const cancelKeyboard = new InlineKeyboard()
    .text(isGroup ? '📊 Kas Grup' : '📋 Kembali ke Keuangan', 'keuangan:menu');

  const titleHeader = isGroup
    ? `📸 <b>Scan Struk Kas Grup / Keluarga</b> (@${escapeHtml(from.first_name)})`
    : `📸 <b>Kirim Foto Struk Belanja</b>`;

  await ctx.reply(
    `${titleHeader}\n\n` +
    `Silakan kirimkan foto struk/nota belanja Anda sekarang.\n` +
    `AI akan otomatis membaca total belanja, toko/merchant, dan item barang.${costNote}\n\n` +
    `<i>Tip: Pastikan tulisan dan angka total pada struk terlihat jelas dan tidak buram.</i>`,
    { parse_mode: 'HTML', reply_markup: cancelKeyboard }
  );
});

// 0a. Listener Pesan Teks untuk Menangkap Input Catat (dari tombol 📝 Catat Pengeluaran)
expenseComposer.on('message:text', async (ctx, next) => {
  const from = ctx.from;
  if (!from) return next();

  const catatTimestamp = awaitingCatatText.get(from.id);
  if (catatTimestamp) {
    // Batalkan jika sudah lewat 5 menit
    if (Date.now() - catatTimestamp > 5 * 60 * 1000) {
      awaitingCatatText.delete(from.id);
      return next();
    }

    const rawText = ctx.message.text.trim();

    // Jika input diawali '/', anggap sebagai command lain
    if (rawText.startsWith('/')) {
      awaitingCatatText.delete(from.id);
      return next();
    }

    awaitingCatatText.delete(from.id);

    if (!config.geminiApiKey) {
      await ctx.reply(
        `⚠️ <b>Fitur AI Belum Aktif</b>\n` +
        `Variabel <code>GEMINI_API_KEY</code> belum diisi di file <code>.env</code> server.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Cek & potong koin (VIP/Admin gratis)
    const cost = config.coinCostExpenseText;
    if (!isExpenseFree(from.id)) {
      const user = userRepository.getUser(from.id);
      if (!user || user.coins < cost) {
        const { text: errText, keyboard: errKb } = buildInsufficientCoinMsg(cost, user?.coins ?? 0, 'Catat Pengeluaran (Teks)');
        await ctx.reply(errText, { parse_mode: 'HTML', reply_markup: errKb });
        return;
      }
      userRepository.deductCoins(from.id, cost);
    }

    const waitMsg = await ctx.reply('⏳ <i>Sedang menganalisis pengeluaran Anda...</i>', { parse_mode: 'HTML' });

    try {
      const extracted = await aiExpenseService.parseExpenseFromText(rawText);
      const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';

      const expenseId = expenseRepository.addExpense({
        telegramId: from.id,
        chatId: isGroup ? ctx.chat.id : null,
        userName: from.first_name || from.username || 'Anggota',
        amount: extracted.amount,
        category: extracted.category,
        merchant: extracted.merchant,
        itemsDetail: extracted.items.length > 0 ? extracted.items.join(', ') : null,
        notes: null,
        rawInput: rawText,
        sourceType: 'text',
        isPersonal: isGroup ? 0 : 1
      });

      // Beri reward EXP sebagai indikator keaktifan penggunaan bot (+3 EXP)
      userRepository.addCoins(from.id, 0, 3);

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
        `❌ <b>Gagal Mencatat Pengeluaran</b>\n${escapeHtml(err.message || 'Terjadi kesalahan sistem.')}`,
        { parse_mode: 'HTML' }
      );
    }
    return;
  }

  // 0b. Listener untuk menangkap Input Notes/Catatan
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
  const updatedExpense = expenseRepository.getExpenseById(pending.expenseId);

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

  // Jika tanpa parameter, langsung arahkan ke menu Keuangan (alur tombol)
  if (!rawText) {
    const isGroup = ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup');
    const { text, keyboard } = isGroup
      ? renderGroupFinancialReport(ctx.chat.id, (ctx.chat as any).title || 'Kas Grup / Keluarga')
      : renderFinancialReport(from.id);
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
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

  // Cek & potong koin (VIP/Admin gratis)
  const coinCostText = config.coinCostExpenseText;
  if (!isExpenseFree(from.id)) {
    const user = userRepository.getUser(from.id);
    if (!user || user.coins < coinCostText) {
      const { text: errText, keyboard: errKb } = buildInsufficientCoinMsg(coinCostText, user?.coins ?? 0, 'Catat Pengeluaran (Teks)');
      await ctx.reply(errText, { parse_mode: 'HTML', reply_markup: errKb });
      return;
    }
    userRepository.deductCoins(from.id, coinCostText);
  }

  const waitMsg = await ctx.reply('⏳ <i>Sedang menganalisis pengeluaran...</i>', { parse_mode: 'HTML' });

  try {
    const extracted = await aiExpenseService.parseExpenseFromText(rawText);
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';

    const expenseId = expenseRepository.addExpense({
      telegramId: from.id,
      chatId: isGroup ? ctx.chat.id : null,
      userName: from.first_name || from.username || 'Anggota',
      amount: extracted.amount,
      category: extracted.category,
      merchant: extracted.merchant,
      itemsDetail: extracted.items.length > 0 ? extracted.items.join(', ') : null,
      notes: null,
      rawInput: rawText,
      sourceType: 'text',
      isPersonal: isGroup ? 0 : 1
    });

    // Beri reward EXP sebagai indikator keaktifan penggunaan bot (+3 EXP)
    userRepository.addCoins(from.id, 0, 3);

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

// 2. Command /struk — redirect ke alur tombol (cek koin, lalu prompt foto)
expenseComposer.command('struk', async ctx => {
  const from = ctx.from;
  if (!from) return;

  if (!config.geminiApiKey) {
    await ctx.reply(
      `⚠️ <b>Fitur AI Belum Aktif</b>\n` +
      `Variabel <code>GEMINI_API_KEY</code> belum diisi di file <code>.env</code> server.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  // Cek koin (VIP/Admin gratis)
  if (!isExpenseFree(from.id)) {
    const user = userRepository.getUser(from.id);
    const cost = config.coinCostExpenseReceipt;
    if (!user || user.coins < cost) {
      const { text, keyboard } = buildInsufficientCoinMsg(cost, user?.coins ?? 0, 'Scan Struk AI');
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
      return;
    }
  }

  awaitingReceiptPhotos.set(from.id, Date.now());

  const isGroup = ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup');
  const cost = isExpenseFree(from.id) ? 0 : config.coinCostExpenseReceipt;
  const costNote = cost > 0
    ? `\n\n<i>Biaya: <b>${cost} Koin</b> (dipotong dari saldo pribadi ${escapeHtml(from.first_name)}).</i>`
    : `\n\n<i>Gratis untuk VIP/Admin.</i>`;

  const cancelKeyboard = new InlineKeyboard()
    .text(isGroup ? '📊 Kas Grup' : '📋 Kembali ke Keuangan', 'keuangan:menu');

  const titleHeader = isGroup
    ? `📸 <b>Scan Struk Kas Grup / Keluarga</b> (@${escapeHtml(from.first_name)})`
    : `📸 <b>Kirim Foto Struk Belanja</b>`;

  await ctx.reply(
    `${titleHeader}\n\n` +
    `Silakan kirimkan foto struk/nota belanja Anda sekarang.\n` +
    `AI akan otomatis membaca total belanja, toko/merchant, dan item barang.${costNote}\n\n` +
    `<i>Tip: Pastikan tulisan dan angka total pada struk terlihat jelas dan tidak buram.</i>`,
    { parse_mode: 'HTML', reply_markup: cancelKeyboard }
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

  // Cek & potong koin (VIP/Admin gratis)
  const coinCostReceipt = config.coinCostExpenseReceipt;
  if (!isExpenseFree(from.id)) {
    const user = userRepository.getUser(from.id);
    if (!user || user.coins < coinCostReceipt) {
      const { text: errText, keyboard: errKb } = buildInsufficientCoinMsg(coinCostReceipt, user?.coins ?? 0, 'Scan Struk AI');
      await ctx.reply(errText, { parse_mode: 'HTML', reply_markup: errKb });
      return;
    }
    userRepository.deductCoins(from.id, coinCostReceipt);
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
    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';

    const expenseId = expenseRepository.addExpense({
      telegramId: from.id,
      chatId: isGroup ? ctx.chat.id : null,
      userName: from.first_name || from.username || 'Anggota',
      amount: extracted.amount,
      category: extracted.category,
      merchant: extracted.merchant,
      itemsDetail: extracted.items.length > 0 ? extracted.items.join(', ') : null,
      notes: null,
      rawInput: '[Foto Struk Belanja]',
      sourceType: 'receipt',
      isPersonal: isGroup ? 0 : 1
    });

    // Beri reward EXP sebagai indikator keaktifan penggunaan bot (+5 EXP)
    userRepository.addCoins(from.id, 0, 5);

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

  const isGroup = ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup');
  const { text, keyboard } = isGroup
    ? renderGroupFinancialReport(ctx.chat.id, (ctx.chat as any).title || 'Kas Grup / Keluarga')
    : renderFinancialReport(from.id);

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
});

// 5. Callback Query Actions

// A. Refresh Dashboard Keuangan (Otomatis mendeteksi Grup atau Pribadi)
expenseComposer.callbackQuery('exp_refresh', async ctx => {
  const from = ctx.from;
  if (!from) return;

  const chat = ctx.chat;
  const isGroup = Boolean(chat && (chat.type === 'group' || chat.type === 'supergroup'));
  const { text, keyboard } = (isGroup && chat)
    ? renderGroupFinancialReport(chat.id, (chat as any).title || 'Kas Grup / Keluarga')
    : renderFinancialReport(from.id);

  try {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
    await ctx.answerCallbackQuery({ text: isGroup ? 'Kas grup diperbarui!' : 'Data keuangan pribadi diperbarui!' });
  } catch {
    await ctx.answerCallbackQuery({ text: 'Data sudah yang terbaru.' });
  }
});

// B. Toggle Simpan juga di Pengeluaran Pribadi: exp_toggle_personal:<id>
expenseComposer.callbackQuery(/^exp_toggle_personal:(\d+)$/, async ctx => {
  const from = ctx.from;
  if (!from) return;

  const expenseId = parseInt(ctx.match[1], 10);
  const expense = expenseRepository.getExpenseById(expenseId);

  if (!expense) {
    await ctx.answerCallbackQuery({ text: 'Catatan pengeluaran tidak ditemukan atau sudah dihapus.', show_alert: true });
    return;
  }

  // Hanya anggota yang mencatat yang berhak memasukkan ke dompet pribadinya
  if (expense.telegram_id !== from.id) {
    await ctx.answerCallbackQuery({
      text: '⚠️ Hanya anggota yang mencatat pengeluaran ini yang dapat menyimpannya ke catatan pribadi!',
      show_alert: true
    });
    return;
  }

  const { success, isPersonal } = expenseRepository.togglePersonalStatus(expenseId, from.id);
  if (!success) {
    await ctx.answerCallbackQuery({ text: 'Gagal memperbarui status pengeluaran pribadi.', show_alert: true });
    return;
  }

  const updated = expenseRepository.getExpenseById(expenseId)!;
  const { text, keyboard } = renderExpenseCard(updated);

  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(async () => {
    await ctx.editMessageReplyMarkup({ reply_markup: keyboard }).catch(() => {});
  });

  if (isPersonal) {
    await ctx.answerCallbackQuery({
      text: '✅ Berhasil disimpan ke Pengeluaran Pribadi Anda!',
      show_alert: false
    });
  } else {
    await ctx.answerCallbackQuery({
      text: 'ℹ️ Dihapus dari Pengeluaran Pribadi (hanya tercatat di Kas Grup).',
      show_alert: false
    });
  }
});

// C. Tambah / Edit Catatan: exp_note:<id>
expenseComposer.callbackQuery(/^exp_note:(\d+)$/, async ctx => {
  const from = ctx.from;
  if (!from) return;

  const expenseId = parseInt(ctx.match[1], 10);
  const expense = expenseRepository.getExpenseById(expenseId);

  if (!expense) {
    await ctx.answerCallbackQuery({ text: 'Catatan pengeluaran tidak ditemukan atau sudah dihapus.', show_alert: true });
    return;
  }

  if (expense.telegram_id !== from.id) {
    await ctx.answerCallbackQuery({ text: '⚠️ Hanya pencatat transaksi ini yang dapat menambahkan catatan!', show_alert: true });
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

// D. Batalkan Pembuatan Catatan: exp_cancelnote:<id>
expenseComposer.callbackQuery(/^exp_cancelnote:(\d+)$/, async ctx => {
  const from = ctx.from;
  if (!from) return;

  awaitingNotes.delete(from.id);
  await ctx.answerCallbackQuery({ text: 'Pengisian catatan dibatalkan.' });
  await ctx.editMessageText('❌ <i>Pengisian catatan dibatalkan.</i>', { parse_mode: 'HTML' });
});

// E. Hapus Pengeluaran: exp_del:<id>
expenseComposer.callbackQuery(/^exp_del:(\d+)$/, async ctx => {
  const from = ctx.from;
  if (!from) return;

  const expenseId = parseInt(ctx.match[1], 10);
  const expense = expenseRepository.getExpenseById(expenseId);

  if (!expense) {
    await ctx.answerCallbackQuery({ text: 'Catatan pengeluaran tidak ditemukan atau sudah dihapus.', show_alert: true });
    return;
  }

  // Izinkan pencatat atau admin grup untuk menghapus
  let canDelete = expense.telegram_id === from.id;
  if (!canDelete && ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
    try {
      const member = await ctx.getChatMember(from.id);
      if (member.status === 'creator' || member.status === 'administrator') {
        canDelete = true;
      }
    } catch {}
  }

  if (!canDelete) {
    await ctx.answerCallbackQuery({ text: '⚠️ Hanya pencatat atau Admin grup yang dapat menghapus catatan ini!', show_alert: true });
    return;
  }

  const deleted = expenseRepository.deleteExpense(expenseId, expense.telegram_id, true);
  if (deleted) {
    await ctx.answerCallbackQuery({ text: 'Pengeluaran berhasil dihapus!' });
    await ctx.editMessageText(
      `🗑️ <b>Pengeluaran Dihapus</b>\nCatatan sebesar <b>${formatRupiah(expense.amount)}</b> (${escapeHtml(expense.category)}) telah dibatalkan/dihapus.`,
      { parse_mode: 'HTML' }
    );
  } else {
    await ctx.answerCallbackQuery({ text: 'Gagal menghapus pengeluaran.', show_alert: true });
  }
});

// F. Tampilkan Menu Ganti Kategori: exp_cat:<id>
expenseComposer.callbackQuery(/^exp_cat:(\d+)$/, async ctx => {
  const from = ctx.from;
  if (!from) return;

  const expenseId = parseInt(ctx.match[1], 10);
  const expense = expenseRepository.getExpenseById(expenseId);

  if (!expense) {
    await ctx.answerCallbackQuery({ text: 'Catatan pengeluaran tidak ditemukan.', show_alert: true });
    return;
  }

  if (expense.telegram_id !== from.id) {
    await ctx.answerCallbackQuery({ text: '⚠️ Hanya pencatat transaksi ini yang dapat mengganti kategori!', show_alert: true });
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

// G. Terapkan Kategori Baru: exp_setcat:<id>:<catIndex>
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

  const updatedExpense = expenseRepository.getExpenseById(expenseId);
  if (updatedExpense) {
    const { text, keyboard } = renderExpenseCard(updatedExpense);
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }

  await ctx.answerCallbackQuery({ text: `Kategori diubah ke ${newCategory}!` });
});

// H. Tombol Kembali: exp_back:<id>
expenseComposer.callbackQuery(/^exp_back:(\d+)$/, async ctx => {
  const from = ctx.from;
  if (!from) return;

  const expenseId = parseInt(ctx.match[1], 10);
  const expense = expenseRepository.getExpenseById(expenseId);

  if (expense) {
    const { text, keyboard } = renderExpenseCard(expense);
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }

  await ctx.answerCallbackQuery();
});

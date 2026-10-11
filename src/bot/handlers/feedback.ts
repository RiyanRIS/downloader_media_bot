import { Composer, InlineKeyboard } from 'grammy';
import { MyContext } from '../context.js';
import { feedbackRepository, FeedbackType, Feedback } from '../../database/repositories/feedbackRepository.js';
import { config } from '../../config/config.js';
import { escapeHtml } from '../../utils/format.js';

export const feedbackComposer = new Composer<MyContext>();

// State sesi tunggu input masukan pengguna (expired 5 menit)
interface PendingFeedback {
  type: FeedbackType;
  chatId: number;
  timestamp: number;
}
const awaitingFeedback = new Map<number, PendingFeedback>();

// State sesi tunggu balasan admin kepada pengguna (expired 5 menit)
interface PendingAdminReply {
  feedbackId: number;
  targetUserId: number;
  chatId: number;
  timestamp: number;
}
const awaitingAdminReply = new Map<number, PendingAdminReply>();

// Cooldown anti-spam (30 detik per user)
const userLastFeedbackTime = new Map<number, number>();

/**
 * Tampilkan menu utama pemilihan masukan (Saran Fitur vs Lapor Kendala)
 */
export function renderFeedbackMenu(): { text: string; keyboard: InlineKeyboard } {
  const text =
    `📬 <b>Request Fitur & Lapor Kendala</b>\n\n` +
    `Bot ini dikembangkan dari pengguna dan untuk seluruh komunitas. Suara, ide, dan pengalaman Anda sangat berharga bagi peningkatan layanan kami.\n\n` +
    `Silakan pilih kategori masukan yang ingin Anda sampaikan:\n\n` +
    `💡 <b>1. Request Fitur & Saran:</b>\n` +
    `Punya ide fitur baru, format unduhan tambahan, atau usulan perbaikan?\n\n` +
    `🚨 <b>2. Lapor Kendala & Bug:</b>\n` +
    `Menemukan fitur error, link video gagal diunduh, atau perilaku bot yang tidak semestinya?`;

  const keyboard = new InlineKeyboard()
    .text('💡 Request Fitur / Saran', 'feedback:prompt:suggestion')
    .row()
    .text('🚨 Lapor Kendala / Bug', 'feedback:prompt:bug')
    .row()
    .text('📋 Menu Utama', 'start:mainmenu');

  return { text, keyboard };
}

/**
 * Tampilkan pesan prompt input saran
 */
export function renderPromptSuggestion(): { text: string; keyboard: InlineKeyboard } {
  const text =
    `💡 <b>Kirimkan Request Fitur & Ide Saran</b>\n\n` +
    `Silakan tuliskan masukan atau ide fitur baru yang Anda inginkan langsung di obrolan ini.\n\n` +
    `<i>Tips: Jelaskan secara singkat ide Anda dan bagaimana fitur tersebut dapat bermanfaat bagi pengguna bot.</i>`;

  const keyboard = new InlineKeyboard()
    .text('❌ Batalkan', 'feedback:cancel');

  return { text, keyboard };
}

/**
 * Tampilkan pesan prompt input laporan bug
 */
export function renderPromptBug(): { text: string; keyboard: InlineKeyboard } {
  const text =
    `🚨 <b>Laporkan Kendala atau Fitur Rusak</b>\n\n` +
    `Silakan jelaskan kendala atau kerusakan yang Anda alami langsung di obrolan ini.\n\n` +
    `<i>Tips: Jika ada tautan/link media yang gagal diunduh, sertakan link tersebut beserta keterangan masalahnya agar segera dapat ditelusuri pengembang.</i>`;

  const keyboard = new InlineKeyboard()
    .text('❌ Batalkan', 'feedback:cancel');

  return { text, keyboard };
}

// 1. Command /saran, /request, /ide — Langsung buka prompt ide/saran
feedbackComposer.command(['saran', 'request', 'ide'], async ctx => {
  const from = ctx.from;
  if (!from) return;

  awaitingFeedback.set(from.id, {
    type: 'suggestion',
    chatId: ctx.chat.id,
    timestamp: Date.now()
  });

  const { text, keyboard } = renderPromptSuggestion();
  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
});

// 2. Command /lapor, /bug, /kendala, /rusak — Langsung buka prompt laporan bug
feedbackComposer.command(['lapor', 'bug', 'kendala', 'rusak'], async ctx => {
  const from = ctx.from;
  if (!from) return;

  awaitingFeedback.set(from.id, {
    type: 'bug',
    chatId: ctx.chat.id,
    timestamp: Date.now()
  });

  const { text, keyboard } = renderPromptBug();
  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
});

// 3. Command /feedback, /masukan, /komplain — Buka menu navigasi masukan
feedbackComposer.command(['feedback', 'masukan', 'komplain'], async ctx => {
  const { text, keyboard } = renderFeedbackMenu();
  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
});

// Callback Menu: Buka navigasi masukan
feedbackComposer.callbackQuery('feedback:menu', async ctx => {
  await ctx.answerCallbackQuery().catch(() => {});
  const { text, keyboard } = renderFeedbackMenu();
  if (ctx.callbackQuery.message) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(async () => {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
    });
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }
});

// Callback Prompt: Saran
feedbackComposer.callbackQuery('feedback:prompt:suggestion', async ctx => {
  await ctx.answerCallbackQuery().catch(() => {});
  const from = ctx.from;
  if (!from) return;

  awaitingFeedback.set(from.id, {
    type: 'suggestion',
    chatId: ctx.chat?.id || from.id,
    timestamp: Date.now()
  });

  const { text, keyboard } = renderPromptSuggestion();
  if (ctx.callbackQuery.message) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(async () => {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
    });
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }
});

// Callback Prompt: Bug
feedbackComposer.callbackQuery('feedback:prompt:bug', async ctx => {
  await ctx.answerCallbackQuery().catch(() => {});
  const from = ctx.from;
  if (!from) return;

  awaitingFeedback.set(from.id, {
    type: 'bug',
    chatId: ctx.chat?.id || from.id,
    timestamp: Date.now()
  });

  const { text, keyboard } = renderPromptBug();
  if (ctx.callbackQuery.message) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(async () => {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
    });
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }
});

// Callback Cancel: Batalkan sesi pengetikan
feedbackComposer.callbackQuery('feedback:cancel', async ctx => {
  await ctx.answerCallbackQuery({ text: 'Pengiriman masukan dibatalkan.' }).catch(() => {});
  if (ctx.from) {
    awaitingFeedback.delete(ctx.from.id);
  }
  const { text, keyboard } = renderFeedbackMenu();
  if (ctx.callbackQuery.message) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(async () => {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
    });
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }
});

// Callback Cancel Admin Reply
feedbackComposer.callbackQuery('admin:fb:cancelreply', async ctx => {
  if (!ctx.from || !config.isAdmin(ctx.from.id)) return;
  awaitingAdminReply.delete(ctx.from.id);
  await ctx.answerCallbackQuery({ text: 'Balasan dibatalkan.' }).catch(() => {});
  if (ctx.callbackQuery.message) {
    await ctx.editMessageText('❌ Sesi balasan pesan telah dibatalkan.', { parse_mode: 'HTML' }).catch(() => {});
  }
});

// 4. Admin Action: Tandai Dibaca (READ)
feedbackComposer.callbackQuery(/^admin:fb:read:(\d+)$/, async ctx => {
  const from = ctx.from;
  if (!from || !config.isAdmin(from.id)) {
    await ctx.answerCallbackQuery({ text: '⛔ Khusus Admin.', show_alert: true });
    return;
  }

  const feedbackId = parseInt(ctx.match[1], 10);
  const fb = feedbackRepository.getFeedbackById(feedbackId);
  if (!fb) {
    await ctx.answerCallbackQuery({ text: 'Data masukan tidak ditemukan.', show_alert: true });
    return;
  }

  feedbackRepository.updateStatus(feedbackId, 'READ');
  await ctx.answerCallbackQuery({ text: 'Tandai Dibaca berhasil & user dinotifikasi!' });

  // Update pesan admin
  const adminName = from.username ? `@${from.username}` : from.first_name;
  if (ctx.callbackQuery.message && 'text' in ctx.callbackQuery.message) {
    const updatedText = ctx.callbackQuery.message.text + `\n\n👀 <i>Telah dibaca oleh Admin ${escapeHtml(adminName)}</i>`;
    const newKeyboard = new InlineKeyboard()
      .text('💬 Balas User', `admin:fb:reply:${feedbackId}`)
      .text('✅ Selesai / Beres', `admin:fb:resolve:${feedbackId}`)
      .row()
      .text('🗑️ Abaikan', `admin:fb:ignore:${feedbackId}`);

    await ctx.editMessageText(updatedText, { parse_mode: 'HTML', reply_markup: newKeyboard }).catch(() => {});
  }

  // Notifikasi santun ke user
  await ctx.api.sendMessage(
    fb.telegram_id,
    `👀 <b>Masukan Anda Telah Dibaca!</b>\n\n` +
    `Pengembang telah meninjau masukan/laporan Anda (ID #<code>${fb.id}</code>).\n` +
    `Terima kasih telah berpartisipasi aktif dalam mendukung bot ini! 🙏✨`,
    { parse_mode: 'HTML' }
  ).catch(() => {});
});

// 5. Admin Action: Tandai Selesai / Diperbaiki (RESOLVED)
feedbackComposer.callbackQuery(/^admin:fb:resolve:(\d+)$/, async ctx => {
  const from = ctx.from;
  if (!from || !config.isAdmin(from.id)) {
    await ctx.answerCallbackQuery({ text: '⛔ Khusus Admin.', show_alert: true });
    return;
  }

  const feedbackId = parseInt(ctx.match[1], 10);
  const fb = feedbackRepository.getFeedbackById(feedbackId);
  if (!fb) {
    await ctx.answerCallbackQuery({ text: 'Data masukan tidak ditemukan.', show_alert: true });
    return;
  }

  feedbackRepository.updateStatus(feedbackId, 'RESOLVED');
  await ctx.answerCallbackQuery({ text: 'Tandai Selesai berhasil & user dinotifikasi!' });

  const adminName = from.username ? `@${from.username}` : from.first_name;
  if (ctx.callbackQuery.message && 'text' in ctx.callbackQuery.message) {
    const updatedText = ctx.callbackQuery.message.text + `\n\n✅ <i>Diselesaikan oleh Admin ${escapeHtml(adminName)}</i>`;
    await ctx.editMessageText(updatedText, { parse_mode: 'HTML' }).catch(() => {});
  }

  // Kirim notifikasi ke user
  const isBug = fb.type === 'bug';
  const userMsg = isBug
    ? `✅ <b>Kendala Berhasil Diperbaiki!</b>\n\n` +
      `Laporan kendala yang Anda kirimkan (ID #<code>${fb.id}</code>) telah diperiksa dan diperbaiki oleh pengembang.\n\n` +
      `Terima kasih banyak atas partisipasinya membantu kenyamanan bot ini! 🙌🔧`
    : `✅ <b>Saran Anda Telah Ditindaklanjuti!</b>\n\n` +
      `Ide/saran yang Anda sampaikan (ID #<code>${fb.id}</code>) telah ditinjau dan ditindaklanjuti oleh pengembang.\n\n` +
      `Terima kasih sudah menjadi bagian dari perkembangan bot ini! 🙌✨`;

  await ctx.api.sendMessage(fb.telegram_id, userMsg, { parse_mode: 'HTML' }).catch(() => {});
});

// 6. Admin Action: Abaikan
feedbackComposer.callbackQuery(/^admin:fb:ignore:(\d+)$/, async ctx => {
  const from = ctx.from;
  if (!from || !config.isAdmin(from.id)) {
    await ctx.answerCallbackQuery({ text: '⛔ Khusus Admin.', show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery({ text: 'Laporan diabaikan.' });
  if (ctx.callbackQuery.message && 'text' in ctx.callbackQuery.message) {
    const updatedText = ctx.callbackQuery.message.text + `\n\n🗑️ <i>Diabaikan oleh Admin</i>`;
    await ctx.editMessageText(updatedText, { parse_mode: 'HTML' }).catch(() => {});
  }
});

// 7. Admin Action: Mulai Balas User
feedbackComposer.callbackQuery(/^admin:fb:reply:(\d+)$/, async ctx => {
  const from = ctx.from;
  if (!from || !config.isAdmin(from.id)) {
    await ctx.answerCallbackQuery({ text: '⛔ Khusus Admin.', show_alert: true });
    return;
  }

  const feedbackId = parseInt(ctx.match[1], 10);
  const fb = feedbackRepository.getFeedbackById(feedbackId);
  if (!fb) {
    await ctx.answerCallbackQuery({ text: 'Data masukan tidak ditemukan.', show_alert: true });
    return;
  }

  awaitingAdminReply.set(from.id, {
    feedbackId,
    targetUserId: fb.telegram_id,
    chatId: ctx.chat?.id || from.id,
    timestamp: Date.now()
  });

  await ctx.answerCallbackQuery();

  const cancelKeyboard = new InlineKeyboard().text('❌ Batalkan Balasan', 'admin:fb:cancelreply');
  await ctx.reply(
    `💬 <b>Balas Pesan Pengguna (ID #${fb.id})</b>\n\n` +
    `👤 <b>Penerima:</b> ${escapeHtml(fb.user_name || 'Pengguna')} (<code>${fb.telegram_id}</code>)\n` +
    `📝 <b>Isi Masukan:</b> <i>"${escapeHtml(fb.content.slice(0, 100))}${fb.content.length > 100 ? '...' : ''}"</i>\n\n` +
    `Silakan ketik pesan balasan Anda langsung di obrolan ini.`,
    { parse_mode: 'HTML', reply_markup: cancelKeyboard }
  );
});

// 8. Admin Command /feedbacks — Rekap & Daftar Masukan Terbaru
feedbackComposer.command(['feedbacks', 'listfeedback'], async ctx => {
  const from = ctx.from;
  if (!from || !config.isAdmin(from.id)) return;

  const stats = feedbackRepository.getStats();
  const recent = feedbackRepository.getRecentFeedbacks(10);

  let text = `📬 <b>REKAP MASUKAN & KENDALA</b>\n\n`;
  text += `📊 <b>Statistik Keseluruhan:</b>\n`;
  text += `• Total Masukan: <b>${stats.total}</b>\n`;
  text += `• 💡 Saran Fitur: <b>${stats.suggestions}</b>\n`;
  text += `• 🚨 Kendala/Bug: <b>${stats.bugs}</b>\n`;
  text += `• ⏳ Menunggu (Pending): <b>${stats.pending}</b>\n`;
  text += `• 👀 Dibaca: <b>${stats.read}</b> | ✅ Selesai: <b>${stats.resolved}</b>\n\n`;

  text += `📋 <b>10 Masukan Terkini:</b>\n`;
  if (recent.length === 0) {
    text += `<i>Belum ada masukan yang tercatat di database.</i>`;
  } else {
    recent.forEach(fb => {
      const typeBadge = fb.type === 'bug' ? '🚨 BUG' : '💡 SARAN';
      const statusBadge = fb.status === 'RESOLVED' ? '✅' : fb.status === 'READ' ? '👀' : '⏳';
      const preview = fb.content.length > 35 ? fb.content.slice(0, 35) + '...' : fb.content;
      text += `• <b>#${fb.id}</b> [${typeBadge}] ${statusBadge} ${escapeHtml(fb.user_name || String(fb.telegram_id))}: "${escapeHtml(preview)}"\n`;
    });
  }

  await ctx.reply(text, { parse_mode: 'HTML' });
});

// 9. Interceptor Teks Masukan Pengguna & Balasan Admin
feedbackComposer.on('message:text', async (ctx, next) => {
  const from = ctx.from;
  if (!from) return next();

  // A. Periksa apakah Admin sedang membalas feedback
  const pendingAdmin = awaitingAdminReply.get(from.id);
  if (pendingAdmin) {
    // Expire 5 menit
    if (Date.now() - pendingAdmin.timestamp > 5 * 60 * 1000) {
      awaitingAdminReply.delete(from.id);
      return next();
    }

    const replyText = ctx.message.text.trim();
    if (replyText.startsWith('/')) {
      awaitingAdminReply.delete(from.id);
      return next();
    }

    awaitingAdminReply.delete(from.id);

    // Simpan balasan ke database
    feedbackRepository.saveAdminReply(pendingAdmin.feedbackId, replyText, from.id);

    // Kirim pesan balasan ke pengguna
    try {
      await ctx.api.sendMessage(
        pendingAdmin.targetUserId,
        `💬 <b>Tanggapan dari Pengembang (ID #<code>${pendingAdmin.feedbackId}</code>):</b>\n\n` +
        `<blockquote>${escapeHtml(replyText)}</blockquote>\n\n` +
        `<i>Pesan ini dikirimkan langsung oleh pengembang bot atas saran/kendala yang Anda kirimkan. Terima kasih! 🙏</i>`,
        { parse_mode: 'HTML' }
      );
      await ctx.reply(`✅ Balasan untuk masukan <b>#${pendingAdmin.feedbackId}</b> berhasil dikirimkan ke pengguna!`, { parse_mode: 'HTML' });
    } catch (err: any) {
      await ctx.reply(`⚠️ Balasan tersimpan di database, namun gagal diteruskan ke chat pengguna: ${escapeHtml(err.message || 'Pengguna mungkin memblokir bot.')}`, { parse_mode: 'HTML' });
    }
    return;
  }

  // B. Periksa apakah Pengguna sedang mengirim feedback (Saran atau Bug)
  const pendingFeedback = awaitingFeedback.get(from.id);
  if (!pendingFeedback) return next();

  // Expire 5 menit
  if (Date.now() - pendingFeedback.timestamp > 5 * 60 * 1000) {
    awaitingFeedback.delete(from.id);
    return next();
  }

  const rawText = ctx.message.text.trim();
  // Jika diawali '/', anggap eksekusi perintah bot lain
  if (rawText.startsWith('/')) {
    awaitingFeedback.delete(from.id);
    return next();
  }

  // Validasi panjang karakter
  if (rawText.length < 5) {
    await ctx.reply('⚠️ Pesan terlalu pendek. Mohon berikan keterangan minimal 5 karakter agar dapat dipahami dengan baik.', { parse_mode: 'HTML' });
    return;
  }

  if (rawText.length > 1500) {
    await ctx.reply('⚠️ Pesan terlalu panjang (maksimal 1500 karakter). Mohon ringkas pesan Anda.', { parse_mode: 'HTML' });
    return;
  }

  // Cooldown anti-spam 30 detik
  const lastTime = userLastFeedbackTime.get(from.id);
  if (lastTime && Date.now() - lastTime < 30 * 1000) {
    const waitSec = Math.ceil((30 * 1000 - (Date.now() - lastTime)) / 1000);
    await ctx.reply(`⏳ Mohon tunggu ${waitSec} detik lagi sebelum mengirimkan masukan berikutnya.`, { parse_mode: 'HTML' });
    return;
  }

  awaitingFeedback.delete(from.id);
  userLastFeedbackTime.set(from.id, Date.now());

  const userName = from.username ? `@${from.username}` : (from.first_name || `User #${String(from.id).slice(-4)}`);

  // Simpan ke database
  const created = feedbackRepository.createFeedback({
    telegramId: from.id,
    userName,
    type: pendingFeedback.type,
    content: rawText
  });

  // Kirim balasan apresiasi ke pengguna
  const mainKeyboard = new InlineKeyboard().text('📋 Menu Utama', 'start:mainmenu');

  if (pendingFeedback.type === 'suggestion') {
    await ctx.reply(
      `💡 <b>Terima kasih atas Masukan & Ide Anda!</b>\n\n` +
      `Saran Anda (ID #<code>${created.id}</code>) telah berhasil dicatat dan diteruskan langsung ke pengembang bot.\n\n` +
      `Masukan ini akan dipertimbangkan dalam pengembangan bot ke depannya. Terima kasih atas partisipasi aktif Anda! 🙌✨`,
      { parse_mode: 'HTML', reply_markup: mainKeyboard }
    );
  } else {
    await ctx.reply(
      `🚨 <b>Laporan Kendala Berhasil Dikirim!</b>\n\n` +
      `Laporan Anda (ID #<code>${created.id}</code>) telah diteruskan langsung ke pengembang bot untuk ditinjau dan diperbaiki.\n\n` +
      `Terima kasih telah membantu menjaga keandalan dan kualitas bot ini! 🙏🔧`,
      { parse_mode: 'HTML', reply_markup: mainKeyboard }
    );
  }

  // Notifikasi ke seluruh Admin
  const isBug = pendingFeedback.type === 'bug';
  const adminHeader = isBug
    ? `🚨 <b>[LAPORAN KENDALA / BUG] #${created.id}</b>`
    : `💡 <b>[SARAN / REQUEST FITUR] #${created.id}</b>`;

  const adminBody =
    `${adminHeader}\n\n` +
    `👤 <b>Pengirim:</b> ${escapeHtml(userName)} (<code>${from.id}</code>)\n` +
    `🕒 <b>Waktu:</b> ${created.created_at}\n\n` +
    `📝 <b>Isi Pesan:</b>\n` +
    `<blockquote>${escapeHtml(rawText)}</blockquote>`;

  const adminKeyboard = new InlineKeyboard()
    .text('💬 Balas User', `admin:fb:reply:${created.id}`)
    .text(isBug ? '✅ Tandai Sudah Beres' : '👀 Tandai Dibaca', isBug ? `admin:fb:resolve:${created.id}` : `admin:fb:read:${created.id}`)
    .row()
    .text(isBug ? '👀 Tandai Dibaca' : '✅ Selesai', isBug ? `admin:fb:read:${created.id}` : `admin:fb:resolve:${created.id}`)
    .text('🗑️ Abaikan', `admin:fb:ignore:${created.id}`);

  // Kirim pesan ke admin
  for (const adminId of config.adminIds) {
    ctx.api.sendMessage(adminId, adminBody, {
      parse_mode: 'HTML',
      reply_markup: adminKeyboard
    }).catch(() => {});
  }
});

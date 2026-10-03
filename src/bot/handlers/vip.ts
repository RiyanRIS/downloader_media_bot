import { Composer, InlineKeyboard } from 'grammy';
import { MyContext } from '../context.js';
import { userRepository } from '../../database/repositories/userRepository.js';
import { config } from '../../config/config.js';
import { escapeHtml } from '../../utils/format.js';

export const vipComposer = new Composer<MyContext>();

// Handler ketika pengguna mengirimkan foto bukti transfer pembayaran VIP
vipComposer.on('message:photo', async ctx => {
  const from = ctx.from;
  if (!from) return;

  // Cek apakah pesan berasal dari admin (admin tidak perlu diverifikasi)
  if (config.isAdmin(from.id)) {
    return;
  }

  const photos = ctx.message.photo;
  const highestPhoto = photos[photos.length - 1]; // Resolusi tertinggi

  const keyboard = new InlineKeyboard()
    .text('✅ Konfirmasi VIP 30 Hari', `confirm_vip:${from.id}:30`)
    .row()
    .text('✅ +500 Koin', `confirm_coins:${from.id}:500`)
    .text('✅ +1.200 Koin', `confirm_coins:${from.id}:1200`)
    .row()
    .text('❌ Tolak', `reject_vip:${from.id}`);

  const adminCaption =
    `💳 <b>BUKTI PEMBAYARAN VIP MASUK</b>\n\n` +
    `• <b>User ID:</b> <code>${from.id}</code>\n` +
    `• <b>Nama:</b> ${escapeHtml(from.first_name)} ${escapeHtml(from.last_name || '')}\n` +
    `• <b>Username:</b> @${escapeHtml(from.username || '-')}\n` +
    `• <b>Waktu:</b> ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n\n` +
    `Klik tombol di bawah untuk verifikasi instan:`;

  let forwarded = false;
  for (const adminId of config.adminIds) {
    try {
      await ctx.api.sendPhoto(adminId, highestPhoto.file_id, {
        caption: adminCaption,
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
      forwarded = true;
    } catch (err) {
      console.error(`Gagal meneruskan bukti transfer ke admin ${adminId}:`, err);
    }
  }

  if (forwarded) {
    await ctx.reply(
      '📩 <b>Bukti transfer Anda telah diterima.</b>\nAdmin akan segera memverifikasi pembayaran Anda. Setelah dikonfirmasi, status VIP akan otomatis aktif.',
      { parse_mode: 'HTML' }
    );
  } else {
    await ctx.reply('⚠️ Belum ada Admin yang dikonfigurasi pada bot. Silakan hubungi pengelola bot secara langsung.');
  }
});

// Callback Query: Admin mengonfirmasi aktivasi VIP
vipComposer.callbackQuery(/^confirm_vip:(\d+):(\d+)$/, async ctx => {
  const adminId = ctx.from.id;
  if (!config.isAdmin(adminId)) {
    await ctx.answerCallbackQuery({ text: '⛔ Anda bukan Admin!', show_alert: true });
    return;
  }

  const match = ctx.match;
  const targetUserId = parseInt(match[1], 10);
  const days = parseInt(match[2], 10);

  const success = userRepository.setRole(targetUserId, 'vip', days);

  if (success) {
    await ctx.answerCallbackQuery({ text: `Berhasil mengaktifkan VIP ${days} hari!` });
    
    // Perbarui pesan di obrolan admin
    const adminUser = escapeHtml(ctx.from.username ? `@${ctx.from.username}` : adminId);
    await ctx.editMessageCaption({
      caption: `${ctx.callbackQuery.message?.caption}\n\n✅ <b>DIKONFIRMASI OLEH ADMIN:</b> ${adminUser} (VIP +${days} Hari)`,
      parse_mode: 'HTML',
      reply_markup: undefined
    }).catch(() => {});

    // Kirim notifikasi ucapan selamat ke pengguna
    await ctx.api.sendMessage(
      targetUserId,
      `🎉 <b>Selamat! Akun Anda Telah Aktif Sebagai VIP!</b>\n\n` +
      `Masa aktif VIP: <b>${days} Hari</b>\n` +
      `Nikmati unduhan media sepuasnya tanpa batas harian dan bebas potong koin (GRATIS 0 Koin)!\n\n` +
      `Terima kasih telah mendukung server kami!`,
      { parse_mode: 'HTML' }
    ).catch(() => {});
  } else {
    await ctx.answerCallbackQuery({ text: 'Gagal memperbarui status user di database.', show_alert: true });
  }
});

// Callback Query: Admin menolak bukti pembayaran
vipComposer.callbackQuery(/^reject_vip:(\d+)$/, async ctx => {
  const adminId = ctx.from.id;
  if (!config.isAdmin(adminId)) {
    await ctx.answerCallbackQuery({ text: '⛔ Anda bukan Admin!', show_alert: true });
    return;
  }

  const targetUserId = parseInt(ctx.match[1], 10);
  await ctx.answerCallbackQuery({ text: 'Bukti transfer ditolak.' });

  const adminUser = escapeHtml(ctx.from.username ? `@${ctx.from.username}` : adminId);
  await ctx.editMessageCaption({
    caption: `${ctx.callbackQuery.message?.caption}\n\n❌ <b>DITOLAK OLEH ADMIN:</b> ${adminUser}`,
    parse_mode: 'HTML',
    reply_markup: undefined
  }).catch(() => {});

  await ctx.api.sendMessage(
    targetUserId,
    '❌ <b>Bukti Pembayaran Ditolak.</b>\nAdmin tidak dapat memvalidasi struk transfer Anda. Silakan hubungi Admin jika terdapat kekeliruan.',
    { parse_mode: 'HTML' }
  ).catch(() => {});
});

// Callback Query: Admin mengonfirmasi penambahan koin manual
vipComposer.callbackQuery(/^confirm_coins:(\d+):(\d+)$/, async ctx => {
  const adminId = ctx.from.id;
  if (!config.isAdmin(adminId)) {
    await ctx.answerCallbackQuery({ text: '⛔ Anda bukan Admin!', show_alert: true });
    return;
  }

  const targetUserId = parseInt(ctx.match[1], 10);
  const amount = parseInt(ctx.match[2], 10);

  userRepository.addCoins(targetUserId, amount, Math.floor(amount / 10));
  const updatedUser = userRepository.getUser(targetUserId);

  await ctx.answerCallbackQuery({ text: `Berhasil menambahkan +${amount} Koin!` });
  const adminUser = escapeHtml(ctx.from.username ? `@${ctx.from.username}` : adminId);

  await ctx.editMessageCaption({
    caption: `${ctx.callbackQuery.message?.caption}\n\n✅ <b>DIKONFIRMASI OLEH ADMIN:</b> ${adminUser} (+${amount} Koin)`,
    parse_mode: 'HTML',
    reply_markup: undefined
  }).catch(() => {});

  await ctx.api.sendMessage(
    targetUserId,
    `🎉 <b>Pembayaran Anda Telah Diverifikasi!</b>\n\nAdmin telah menambahkan <b>+${amount} Koin</b> ke akun Anda.\nSaldo koin Anda sekarang: 💰 <b>${updatedUser?.coins ?? 0} Koin</b>.`,
    { parse_mode: 'HTML' }
  ).catch(() => {});
});


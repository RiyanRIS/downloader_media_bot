import { Composer, InlineKeyboard } from 'grammy';
import { MyContext } from '../context.js';
import { userRepository } from '../../database/repositories/userRepository.js';
import { config } from '../../config/config.js';

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
    .text('❌ Tolak', `reject_vip:${from.id}`);

  const adminCaption =
    `💳 **BUKTI PEMBAYARAN VIP MASUK**\n\n` +
    `• **User ID:** \`${from.id}\`\n` +
    `• **Nama:** ${from.first_name} ${from.last_name || ''}\n` +
    `• **Username:** @${from.username || '-'}\n` +
    `• **Waktu:** ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n\n` +
    `Klik tombol di bawah untuk verifikasi instan:`;

  let forwarded = false;
  for (const adminId of config.adminIds) {
    try {
      await ctx.api.sendPhoto(adminId, highestPhoto.file_id, {
        caption: adminCaption,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      forwarded = true;
    } catch (err) {
      console.error(`Gagal meneruskan bukti transfer ke admin ${adminId}:`, err);
    }
  }

  if (forwarded) {
    await ctx.reply(
      '📩 **Bukti transfer Anda telah diterima.**\nAdmin akan segera memverifikasi pembayaran Anda. Setelah dikonfirmasi, status VIP akan otomatis aktif.',
      { parse_mode: 'Markdown' }
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
    await ctx.editMessageCaption({
      caption: `${ctx.callbackQuery.message?.caption}\n\n✅ **DIKONFIRMASI OLEH ADMIN:** @${ctx.from.username || adminId} (VIP +${days} Hari)`,
      reply_markup: undefined
    }).catch(() => {});

    // Kirim notifikasi ucapan selamat ke pengguna
    await ctx.api.sendMessage(
      targetUserId,
      `🎉 **Selamat! Akun Anda Telah Aktif Sebagai VIP!**\n\n` +
      `Masa aktif VIP: **${days} Hari**\n` +
      `Batas kuota harian: **${config.vipDailyLimit} unduhan/hari**.\n\n` +
      `Terima kasih telah mendukung server kami!`,
      { parse_mode: 'Markdown' }
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

  await ctx.editMessageCaption({
    caption: `${ctx.callbackQuery.message?.caption}\n\n❌ **DITOLAK OLEH ADMIN:** @${ctx.from.username || adminId}`,
    reply_markup: undefined
  }).catch(() => {});

  await ctx.api.sendMessage(
    targetUserId,
    '❌ **Bukti Pembayaran Ditolak.**\nAdmin tidak dapat memvalidasi struk transfer Anda. Silakan hubungi Admin jika terdapat kekeliruan.',
    { parse_mode: 'Markdown' }
  ).catch(() => {});
});

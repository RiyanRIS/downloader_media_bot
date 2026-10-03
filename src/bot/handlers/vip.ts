import { Composer, InlineKeyboard } from 'grammy';
import { MyContext } from '../context.js';
import { userRepository } from '../../database/repositories/userRepository.js';
import { transactionRepository, parseDbDate } from '../../database/repositories/transactionRepository.js';
import { qrisService, TOPUP_PACKAGES } from '../../services/qrisService.js';
import { config } from '../../config/config.js';
import { escapeHtml } from '../../utils/format.js';

export const vipComposer = new Composer<MyContext>();

// Map untuk mencatat pesan yang dikirim ke setiap admin agar tombol & status ter-sinkronisasi realtime saat salah satu admin klik
const adminOrderMessages = new Map<string, Array<{ adminId: number; messageId: number; caption: string }>>();

// Map untuk menyimpan foto bukti sementara menunggu konfirmasi dari pengguna sebelum dikirim ke admin
interface PendingUpload {
  fileId: string;
  orderId: string;
  fromUser: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
  };
}
const pendingUserUploads = new Map<number, PendingUpload>();

// Handler ketika pengguna mengirimkan foto
vipComposer.on('message:photo', async (ctx, next) => {
  const from = ctx.from;
  if (!from) return next();

  // Admin tidak perlu diverifikasi pembayarannya
  if (config.isAdmin(from.id)) {
    return next();
  }

  // Cek apakah user memiliki pesanan QRIS Dinamis yang masih PENDING dan dibawah 30 menit
  const pendingTx = transactionRepository.getLatestPendingTransaction(from.id);

  // Jika tidak memiliki pesanan aktif, abaikan secara hening (tidak perlu direspon)
  if (!pendingTx) {
    return next();
  }

  const photos = ctx.message.photo;
  const highestPhoto = photos[photos.length - 1]; // Resolusi tertinggi foto

  const pkg = TOPUP_PACKAGES[pendingTx.package_id];
  const formattedPrice = new Intl.NumberFormat('id-ID').format(pendingTx.amount);

  // Simpan data upload sementara
  pendingUserUploads.set(from.id, {
    fileId: highestPhoto.file_id,
    orderId: pendingTx.merchant_order_id,
    fromUser: {
      id: from.id,
      first_name: from.first_name,
      last_name: from.last_name,
      username: from.username
    }
  });

  const confirmKeyboard = new InlineKeyboard()
    .text('✅ Ya, Kirim ke Admin', `send_proof:${pendingTx.merchant_order_id}`)
    .row()
    .text('❌ Bukan / Batalkan', 'cancel_proof');

  await ctx.reply(
    `🧾 <b>KONFIRMASI BUKTI PEMBAYARAN</b>\n\n` +
    `Anda memiliki pesanan pembayaran aktif:\n` +
    `• <b>Order ID:</b> <code>${pendingTx.merchant_order_id}</code>\n` +
    `• <b>Paket:</b> ${escapeHtml(pkg ? pkg.name : pendingTx.package_id)}\n` +
    `• <b>Total Tagihan:</b> <b>Rp ${formattedPrice}</b>\n\n` +
    `Apakah foto ini merupakan bukti transfer pembayaran Anda untuk dikirimkan ke Admin?`,
    {
      parse_mode: 'HTML',
      reply_markup: confirmKeyboard,
      reply_parameters: { message_id: ctx.message.message_id }
    }
  );
});

// Callback Query: Pengguna mengonfirmasi bahwa foto ini adalah bukti transfer untuk dikirim ke Admin
vipComposer.callbackQuery(/^send_proof:([A-Za-z0-9_]+)$/, async ctx => {
  const from = ctx.from;
  const orderId = ctx.match[1];

  const upload = pendingUserUploads.get(from.id);
  if (!upload || upload.orderId !== orderId) {
    await ctx.answerCallbackQuery({
      text: 'Foto bukti tidak ditemukan atau sudah kedaluwarsa. Silakan kirim ulang foto bukti transfer.',
      show_alert: true
    });
    await ctx.deleteMessage().catch(() => {});
    return;
  }

  // Validasi kembali batas waktu pesanan 30 menit
  const pendingTx = transactionRepository.getLatestPendingTransaction(from.id);
  if (!pendingTx || pendingTx.merchant_order_id !== orderId) {
    await ctx.answerCallbackQuery({
      text: '⚠️ Batas waktu pembayaran (30 menit) telah habis atau pesanan sudah tidak aktif.',
      show_alert: true
    });
    pendingUserUploads.delete(from.id);
    await ctx.editMessageText(
      `⚠️ <b>Batas Waktu Pembayaran Habis</b>\n\nPesanan Order ID <code>${orderId}</code> telah kedaluwarsa karena melebihi batas waktu 30 menit.\nSilakan buat pesanan baru via /dukung atau /topup.`,
      { parse_mode: 'HTML', reply_markup: undefined }
    ).catch(() => {});
    return;
  }

  await ctx.answerCallbackQuery({ text: 'Mengirimkan bukti transfer ke Admin...' });

  const pkg = TOPUP_PACKAGES[pendingTx.package_id];
  const formattedPrice = new Intl.NumberFormat('id-ID').format(pendingTx.amount);

  const adminKeyboard = new InlineKeyboard()
    .text('✅ Konfirmasi Pembayaran', `confirm_tx:${pendingTx.merchant_order_id}`)
    .row()
    .text('❌ Tolak Pembayaran', `reject_tx:${pendingTx.merchant_order_id}`);

  const adminCaption =
    `💖 <b>BUKTI DUKUNGAN PENGEMBANGAN (QRIS)</b>\n\n` +
    `• <b>Order ID:</b> <code>${pendingTx.merchant_order_id}</code>\n` +
    `• <b>User ID:</b> <code>${from.id}</code>\n` +
    `• <b>Nama:</b> ${escapeHtml(from.first_name)} ${escapeHtml(from.last_name || '')}\n` +
    `• <b>Username:</b> @${escapeHtml(from.username || '-')}\n` +
    `• <b>Paket:</b> ${escapeHtml(pkg ? pkg.name : pendingTx.package_id)} (+${pendingTx.coins} Koin${pkg?.isVipBonus ? ' + VIP 30 Hari' : ''})\n` +
    `• <b>Tagihan:</b> <b>Rp ${formattedPrice}</b>\n` +
    `• <b>Waktu:</b> ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n\n` +
    `Silakan periksa mutasi rekening/e-wallet Anda, lalu pilih tindakan:`;

  const sentAdminList: Array<{ adminId: number; messageId: number; caption: string }> = [];

  for (const adminId of config.adminIds) {
    try {
      const sentMsg = await ctx.api.sendPhoto(adminId, upload.fileId, {
        caption: adminCaption,
        parse_mode: 'HTML',
        reply_markup: adminKeyboard
      });
      sentAdminList.push({ adminId, messageId: sentMsg.message_id, caption: adminCaption });
    } catch (err) {
      console.error(`Gagal meneruskan bukti transfer ke admin ${adminId}:`, err);
    }
  }

  if (sentAdminList.length > 0) {
    adminOrderMessages.set(orderId, sentAdminList);
  }

  pendingUserUploads.delete(from.id);

  // Perbarui pesan di ruang obrolan pengguna
  await ctx.editMessageText(
    `📩 <b>Bukti transfer untuk Order <code>${orderId}</code> telah berhasil dikirimkan ke Admin!</b>\n\n` +
    `Admin kami sedang memverifikasi mutasi rekening Anda.\n` +
    `Benefit paket <b>+${pendingTx.coins} Koin</b> ${pkg?.isVipBonus ? 'dan status VIP ' : ''}akan otomatis aktif segera setelah dikonfirmasi.`,
    { parse_mode: 'HTML', reply_markup: undefined }
  ).catch(() => {});
});

// Callback Query: Pengguna membatalkan pengiriman bukti foto
vipComposer.callbackQuery('cancel_proof', async ctx => {
  const from = ctx.from;
  pendingUserUploads.delete(from.id);
  await ctx.answerCallbackQuery({ text: 'Dibatalkan.' });
  await ctx.deleteMessage().catch(() => {});
});

// 1. Callback Query: Admin mengonfirmasi pesanan QRIS Dinamis
vipComposer.callbackQuery(/^confirm_tx:([A-Za-z0-9_]+)$/, async ctx => {
  const adminId = ctx.from.id;
  if (!config.isAdmin(adminId)) {
    await ctx.answerCallbackQuery({ text: '⛔ Anda bukan Admin!', show_alert: true });
    return;
  }

  const orderId = ctx.match[1];
  const result = qrisService.confirmPayment(orderId, adminId);

  if (!result.success) {
    await ctx.answerCallbackQuery({ text: `❌ ${result.errorMessage || 'Gagal memproses transaksi.'}`, show_alert: true });
    return;
  }

  const pkg = result.packageInfo!;
  const tx = result.transaction!;
  const updatedUser = result.updatedUser;

  await ctx.answerCallbackQuery({ text: `Berhasil mengonfirmasi pembayaran untuk ${pkg.name}!` });

  // Perbarui pesan di obrolan SEMUA admin agar tombol tidak dapat ditekan lagi
  const adminUser = escapeHtml(ctx.from.username ? `@${ctx.from.username}` : adminId);
  const sentList = adminOrderMessages.get(orderId);

  if (sentList && sentList.length > 0) {
    for (const item of sentList) {
      await ctx.api.editMessageCaption(item.adminId, item.messageId, {
        caption: `${item.caption}\n\n✅ <b>DIKONFIRMASI OLEH ADMIN:</b> ${adminUser} (${escapeHtml(pkg.name)})`,
        parse_mode: 'HTML',
        reply_markup: undefined
      }).catch(() => {});
    }
    adminOrderMessages.delete(orderId);
  } else {
    await ctx.editMessageCaption({
      caption: `${ctx.callbackQuery.message?.caption}\n\n✅ <b>DIKONFIRMASI OLEH ADMIN:</b> ${adminUser} (${escapeHtml(pkg.name)})`,
      parse_mode: 'HTML',
      reply_markup: undefined
    }).catch(() => {});
  }

  // Kirim notifikasi ucapan selamat & penambahan saldo ke pengguna
  const userText =
    `🎉 <b>DUKUNGAN ANDA TELAH DITERIMA & DIVERIFIKASI!</b> 🎉\n\n` +
    `Terima kasih banyak atas dukungan Anda dalam pengembangan & pemeliharaan tools ini! 🙏\n\n` +
    `• <b>Order ID:</b> <code>${orderId}</code>\n` +
    `• <b>Paket Dukungan:</b> ${escapeHtml(pkg.name)}\n` +
    `• <b>Benefit Koin:</b> <b>+${pkg.coins} Koin</b>\n` +
    (pkg.isVipBonus && pkg.vipDays ? `• <b>Status VIP:</b> <b>Aktif ${pkg.vipDays} Hari Bebas Unduh!</b>\n` : '') +
    `• <b>Saldo Koin Sekarang:</b> 💰 <b>${updatedUser?.coins ?? 0} Koin</b>\n\n` +
    `Benefit paket telah aktif di akun Anda. Selamat menikmati seluruh fitur bot!`;

  await ctx.api.sendMessage(tx.telegram_id, userText, { parse_mode: 'HTML' }).catch(err => {
    console.error(`Gagal mengirim notifikasi sukses ke user ${tx.telegram_id}:`, err);
  });
});

// 2. Callback Query: Admin menolak pesanan QRIS Dinamis
vipComposer.callbackQuery(/^reject_tx:([A-Za-z0-9_]+)$/, async ctx => {
  const adminId = ctx.from.id;
  if (!config.isAdmin(adminId)) {
    await ctx.answerCallbackQuery({ text: '⛔ Anda bukan Admin!', show_alert: true });
    return;
  }

  const orderId = ctx.match[1];
  const tx = transactionRepository.getTransaction(orderId);

  if (!tx) {
    await ctx.answerCallbackQuery({ text: 'Transaksi tidak ditemukan.', show_alert: true });
    return;
  }

  const rejectRes = qrisService.rejectPayment(orderId, adminId);
  if (!rejectRes.success) {
    await ctx.answerCallbackQuery({ text: rejectRes.errorMessage || 'Gagal menolak pesanan.', show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery({ text: 'Pesanan telah ditolak.' });

  const adminUser = escapeHtml(ctx.from.username ? `@${ctx.from.username}` : adminId);
  const sentList = adminOrderMessages.get(orderId);

  if (sentList && sentList.length > 0) {
    for (const item of sentList) {
      await ctx.api.editMessageCaption(item.adminId, item.messageId, {
        caption: `${item.caption}\n\n❌ <b>DITOLAK OLEH ADMIN:</b> ${adminUser}`,
        parse_mode: 'HTML',
        reply_markup: undefined
      }).catch(() => {});
    }
    adminOrderMessages.delete(orderId);
  } else {
    await ctx.editMessageCaption({
      caption: `${ctx.callbackQuery.message?.caption}\n\n❌ <b>DITOLAK OLEH ADMIN:</b> ${adminUser}`,
      parse_mode: 'HTML',
      reply_markup: undefined
    }).catch(() => {});
  }

  await ctx.api.sendMessage(
    tx.telegram_id,
    `❌ <b>Pembayaran Ditolak.</b>\n` +
    `Bukti transfer untuk Order ID <code>${orderId}</code> tidak dapat divalidasi oleh Admin.\n` +
    `Silakan hubungi Admin jika terdapat kekeliruan mutasi atau buat pesanan ulang via /dukung atau /topup.`,
    { parse_mode: 'HTML' }
  ).catch(() => {});
});

// 3. Callback Query: Admin mengonfirmasi aktivasi VIP manual
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

    const adminUser = escapeHtml(ctx.from.username ? `@${ctx.from.username}` : adminId);
    await ctx.editMessageCaption({
      caption: `${ctx.callbackQuery.message?.caption}\n\n✅ <b>DIKONFIRMASI OLEH ADMIN:</b> ${adminUser} (VIP +${days} Hari)`,
      parse_mode: 'HTML',
      reply_markup: undefined
    }).catch(() => {});

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

// 4. Callback Query: Admin menolak bukti pembayaran manual
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

// 5. Callback Query: Admin mengonfirmasi penambahan koin manual
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

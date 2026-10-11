import { Composer, InlineKeyboard } from 'grammy';
import { MyContext } from '../context.js';
import { userRepository } from '../../database/repositories/userRepository.js';
import { donationRepository, parseDbDate } from '../../database/repositories/donationRepository.js';
import { qrisService } from '../../services/qrisService.js';
import { config } from '../../config/config.js';
import { escapeHtml } from '../../utils/format.js';
import { getAdminContactInfo } from '../../utils/contact.js';

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

// Handler ketika pengguna mengirimkan foto bukti transfer
vipComposer.on('message:photo', async (ctx, next) => {
  const from = ctx.from;
  if (!from) return next();

  // Admin tidak perlu diverifikasi pembayarannya
  if (config.isAdmin(from.id)) {
    return next();
  }

  // Cek apakah user memiliki pesanan QRIS Dinamis yang masih PENDING dan dibawah 30 menit
  const pendingTx = donationRepository.getLatestPendingDonation(from.id);

  // Jika tidak memiliki pesanan aktif, teruskan ke handler lain (misal OCR struk pengeluaran)
  if (!pendingTx) {
    return next();
  }

  const photos = ctx.message.photo;
  const highestPhoto = photos[photos.length - 1]; // Resolusi tertinggi foto

  const formattedPrice = pendingTx.amount > 0
    ? `Rp ${new Intl.NumberFormat('id-ID').format(pendingTx.amount)}`
    : 'Sukarela (Bebas)';
  const title = `Dukungan Sukarela Pengembang`;

  // Simpan data upload sementara
  pendingUserUploads.set(from.id, {
    fileId: highestPhoto.file_id,
    orderId: pendingTx.order_id,
    fromUser: {
      id: from.id,
      first_name: from.first_name,
      last_name: from.last_name,
      username: from.username
    }
  });

  const confirmKeyboard = new InlineKeyboard()
    .text('✅ Ya, Kirim ke Admin', `send_proof:${pendingTx.order_id}`)
    .row()
    .text('❌ Bukan / Batalkan', 'cancel_proof');

  await ctx.reply(
    `🧾 <b>KONFIRMASI BUKTI DUKUNGAN SUKARELA</b>\n\n` +
    `Anda memiliki sesi donasi aktif:\n` +
    `• <b>Order ID:</b> <code>${pendingTx.order_id}</code>\n` +
    `• <b>Keterangan:</b> ${escapeHtml(title)}\n` +
    `• <b>Nominal:</b> <b>${formattedPrice}</b>\n\n` +
    `Apakah foto ini merupakan bukti transfer dukungan sukarela Anda untuk dikirimkan ke Admin?`,
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
  const pendingTx = donationRepository.getLatestPendingDonation(from.id);
  if (!pendingTx || pendingTx.order_id !== orderId) {
    await ctx.answerCallbackQuery({
      text: '⚠️ Batas waktu pembayaran (30 menit) telah habis atau pesanan sudah tidak aktif.',
      show_alert: true
    });
    pendingUserUploads.delete(from.id);
    await ctx
      .editMessageText(
        `⚠️ <b>Batas Waktu Pembayaran Habis</b>\n\nPesanan Order ID <code>${orderId}</code> telah kedaluwarsa karena melebihi batas waktu 30 menit.\nSilakan buat pesanan baru via /dukung.`,
        { parse_mode: 'HTML', reply_markup: undefined }
      )
      .catch(() => {});
    return;
  }

  // Simpan proof_file_id langsung ke database donasi
  donationRepository.attachProof(orderId, upload.fileId);

  await ctx.answerCallbackQuery({ text: 'Mengirimkan bukti donasi ke Admin...' });

  const formattedPrice = pendingTx.amount > 0
    ? `Rp ${new Intl.NumberFormat('id-ID').format(pendingTx.amount)}`
    : 'Sukarela (Bebas)';
  const title = `Dukungan Sukarela Pengembang`;

  const adminKeyboard = new InlineKeyboard()
    .text('✅ Konfirmasi Donasi', `confirm_tx:${pendingTx.order_id}`)
    .row()
    .text('❌ Tolak Donasi', `reject_tx:${pendingTx.order_id}`);

  const adminCaption =
    `💖 <b>BUKTI DUKUNGAN SUKARELA (QRIS)</b>\n\n` +
    `• <b>Order ID:</b> <code>${pendingTx.order_id}</code>\n` +
    `• <b>User ID:</b> <code>${from.id}</code>\n` +
    `• <b>Nama:</b> ${escapeHtml(from.first_name)} ${escapeHtml(from.last_name || '')}\n` +
    `• <b>Username:</b> @${escapeHtml(from.username || '-')}\n` +
    `• <b>Keterangan:</b> ${escapeHtml(title)}\n` +
    `• <b>Nominal:</b> <b>${formattedPrice}</b>\n` +
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
      console.error(`Gagal meneruskan bukti donasi ke admin ${adminId}:`, err);
    }
  }

  if (sentAdminList.length > 0) {
    adminOrderMessages.set(orderId, sentAdminList);
  }

  pendingUserUploads.delete(from.id);

  // Perbarui pesan di ruang obrolan pengguna
  await ctx
    .editMessageText(
      `📩 <b>Bukti transfer untuk Order <code>${orderId}</code> telah berhasil dikirimkan ke Admin!</b>\n\n` +
      `Admin kami sedang memverifikasi mutasi rekening Anda.\n` +
      `Gelar apresiasi <b>💖 Sahabat Dermawan</b> dan bonus EXP keaktifan akan otomatis disematkan setelah dikonfirmasi.`,
      { parse_mode: 'HTML', reply_markup: undefined }
    )
    .catch(() => {});
});

// Callback Query: Pengguna membatalkan pengiriman bukti foto
vipComposer.callbackQuery('cancel_proof', async ctx => {
  const from = ctx.from;
  pendingUserUploads.delete(from.id);
  await ctx.answerCallbackQuery({ text: 'Dibatalkan.' });
  await ctx.deleteMessage().catch(() => {});
});

// 1. Callback Query: Admin mengonfirmasi donasi QRIS
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
  const formattedPrice = tx.amount > 0 ? `Rp ${new Intl.NumberFormat('id-ID').format(tx.amount)}` : 'Sukarela';
  const expGained = tx.amount > 0 ? Math.max(50, Math.floor(tx.amount / 100)) : 100;
  const amountNote = tx.amount > 0 ? ` sebesar <b>${formattedPrice}</b>` : '';

  await ctx.answerCallbackQuery({ text: `Berhasil mengonfirmasi donasi ${formattedPrice}!` });

  // Perbarui pesan di obrolan SEMUA admin agar tombol tidak dapat ditekan lagi
  const adminUser = escapeHtml(ctx.from.username ? `@${ctx.from.username}` : adminId);
  const sentList = adminOrderMessages.get(orderId);

  if (sentList && sentList.length > 0) {
    for (const item of sentList) {
      await ctx.api
        .editMessageCaption(item.adminId, item.messageId, {
          caption: `${item.caption}\n\n✅ <b>DIKONFIRMASI OLEH ADMIN:</b> ${adminUser} (Donasi ${formattedPrice})`,
          parse_mode: 'HTML',
          reply_markup: undefined
        })
        .catch(() => {});
    }
    adminOrderMessages.delete(orderId);
  } else {
    await ctx
      .editMessageCaption({
        caption: `${ctx.callbackQuery.message?.caption}\n\n✅ <b>DIKONFIRMASI OLEH ADMIN:</b> ${adminUser} (Donasi ${formattedPrice})`,
        parse_mode: 'HTML',
        reply_markup: undefined
      })
      .catch(() => {});
  }

  // Kirim notifikasi ucapan terima kasih tulus ke pengguna
  const userText =
    `🎉 <b>TERIMA KASIH BANYAK ATAS DUKUNGAN ANDA!</b> 🙏\n\n` +
    `Dukungan sukarela Anda${amountNote} telah berhasil diverifikasi oleh Admin.\n\n` +
    `Setiap rezeki yang Anda bagikan sangat berarti untuk membantu kelangsungan operasional & pemeliharaan server bot ini. Semoga berkah dan dilipatgandakan selalu! ✨\n\n` +
    `• <b>Order ID:</b> <code>${orderId}</code>\n` +
    `• <b>Bonus Keaktifan:</b> ⭐ <b>+${expGained} EXP</b> (Total: ${updatedUser?.exp ?? 0} EXP)\n` +
    `• <b>Gelar Kehormatan:</b> 💖 <b>Sahabat Dermawan</b> Aktif!\n\n` +
    `Terima kasih telah menjadi bagian dari pendukung kami!`;

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
  const tx = donationRepository.getDonation(orderId);

  if (!tx) {
    await ctx.answerCallbackQuery({ text: 'Donasi tidak ditemukan.', show_alert: true });
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
      await ctx.api
        .editMessageCaption(item.adminId, item.messageId, {
          caption: `${item.caption}\n\n❌ <b>DITOLAK OLEH ADMIN:</b> ${adminUser}`,
          parse_mode: 'HTML',
          reply_markup: undefined
        })
        .catch(() => {});
    }
    adminOrderMessages.delete(orderId);
  } else {
    await ctx
      .editMessageCaption({
        caption: `${ctx.callbackQuery.message?.caption}\n\n❌ <b>DITOLAK OLEH ADMIN:</b> ${adminUser}`,
        parse_mode: 'HTML',
        reply_markup: undefined
      })
      .catch(() => {});
  }

  const contact = getAdminContactInfo();
  const userKeyboard = new InlineKeyboard();
  if (contact.isAvailable) {
    userKeyboard.url('💬 Hubungi Admin', contact.getContactUrl(`Halo Admin, konfirmasi penolakan Order ID: ${orderId}`));
  }
  userKeyboard.row().text('🔄 Berdonasi Ulang', 'topup:menu');

  await ctx.api
    .sendMessage(
      tx.telegram_id,
      `❌ <b>Konfirmasi Pembayaran Ditolak.</b>\n` +
      `Bukti transfer untuk Order ID <code>${orderId}</code> tidak dapat divalidasi oleh Admin.\n` +
      `Silakan hubungi Admin (<b>${escapeHtml(contact.display)}</b>) jika terdapat kekeliruan mutasi rekening.`,
      { parse_mode: 'HTML', reply_markup: userKeyboard }
    )
    .catch(() => {});
});

// 3. Callback Query: Admin mengonfirmasi aktivasi Sahabat Dermawan (VIP) manual
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
    await ctx.answerCallbackQuery({ text: `Berhasil mengaktifkan Sahabat Dermawan ${days} hari!` });

    const adminUser = escapeHtml(ctx.from.username ? `@${ctx.from.username}` : adminId);
    await ctx
      .editMessageCaption({
        caption: `${ctx.callbackQuery.message?.caption}\n\n✅ <b>DIKONFIRMASI OLEH ADMIN:</b> ${adminUser} (Sahabat Dermawan +${days} Hari)`,
        parse_mode: 'HTML',
        reply_markup: undefined
      })
      .catch(() => {});

    await ctx.api
      .sendMessage(
        targetUserId,
        `🎉 <b>Selamat! Akun Anda Telah Aktif Sebagai 💖 Sahabat Dermawan!</b>\n\n` +
        `Masa aktif apresiasi: <b>${days} Hari</b>\n` +
        `Terima kasih banyak atas ketulusan Anda dalam mendukung pengembangan server bot ini! 🙏`,
        { parse_mode: 'HTML' }
      )
      .catch(() => {});
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
  await ctx
    .editMessageCaption({
      caption: `${ctx.callbackQuery.message?.caption}\n\n❌ <b>DITOLAK OLEH ADMIN:</b> ${adminUser}`,
      parse_mode: 'HTML',
      reply_markup: undefined
    })
    .catch(() => {});

  const contact = getAdminContactInfo();
  const rejectKeyboard = new InlineKeyboard();
  if (contact.isAvailable) {
    rejectKeyboard.url('💬 Hubungi Admin', contact.getContactUrl('Halo Admin, konfirmasi penolakan bukti transfer saya'));
  }
  rejectKeyboard.row().text('🔄 Berdonasi Ulang', 'topup:menu');

  await ctx.api
    .sendMessage(
      targetUserId,
      `❌ <b>Bukti Pembayaran Ditolak.</b>\nAdmin tidak dapat memvalidasi struk transfer Anda. Silakan hubungi Admin (<b>${escapeHtml(contact.display)}</b>) jika terdapat kekeliruan mutasi.`,
      { parse_mode: 'HTML', reply_markup: rejectKeyboard }
    )
    .catch(() => {});
});

// 5. Callback Query: Admin mengonfirmasi penambahan EXP manual
vipComposer.callbackQuery(/^confirm_coins:(\d+):(\d+)$/, async ctx => {
  const adminId = ctx.from.id;
  if (!config.isAdmin(adminId)) {
    await ctx.answerCallbackQuery({ text: '⛔ Anda bukan Admin!', show_alert: true });
    return;
  }

  const targetUserId = parseInt(ctx.match[1], 10);
  const amount = parseInt(ctx.match[2], 10);

  userRepository.addExp(targetUserId, amount);
  const updatedUser = userRepository.getUser(targetUserId);

  await ctx.answerCallbackQuery({ text: `Berhasil menambahkan +${amount} EXP!` });
  const adminUser = escapeHtml(ctx.from.username ? `@${ctx.from.username}` : adminId);

  await ctx
    .editMessageCaption({
      caption: `${ctx.callbackQuery.message?.caption}\n\n✅ <b>DIKONFIRMASI OLEH ADMIN:</b> ${adminUser} (+${amount} EXP)`,
      parse_mode: 'HTML',
      reply_markup: undefined
    })
    .catch(() => {});

  await ctx.api
    .sendMessage(
      targetUserId,
      `🎉 <b>EXP Keaktifan Ditambahkan!</b>\n\nAdmin telah menambahkan <b>+${amount} EXP</b> ke akun Anda.\nTotal EXP Anda sekarang: ⭐ <b>${updatedUser?.exp ?? 0} EXP</b>.`,
      { parse_mode: 'HTML' }
    )
    .catch(() => {});
});

import { Composer, InlineKeyboard, InputFile } from 'grammy';
import { MyContext } from '../context.js';
import { userRepository } from '../../database/repositories/userRepository.js';
import { transactionRepository } from '../../database/repositories/transactionRepository.js';
import { duitkuService, TOPUP_PACKAGES, TopupPackage } from '../../services/duitkuService.js';
import { config } from '../../config/config.js';
import { escapeHtml } from '../../utils/format.js';

export const topupComposer = new Composer<MyContext>();

// 1. Menu Utama Katalog Top-Up Koin (/topup, /belikoin, /buykoin, /qris)
topupComposer.command(['topup', 'belikoin', 'buykoin', 'qris'], async ctx => {
  await sendTopupMenu(ctx);
});

// Callback navigasi ke menu top-up
topupComposer.callbackQuery('topup:menu', async ctx => {
  await ctx.answerCallbackQuery();
  await sendTopupMenu(ctx);
});

async function sendTopupMenu(ctx: MyContext) {
  const from = ctx.from;
  if (!from) return;

  const user = userRepository.getUser(from.id);
  const currentCoins = user ? user.coins : 0;

  const text =
    `💳 <b>PENGISIAN KOIN (TOP-UP QRIS INSTAN)</b>\n\n` +
    `Hai <b>${escapeHtml(from.first_name)}</b>! Butuh koin untuk mengunduh media atau bermain game?\n` +
    `Beli koin resmi sekarang dengan metode pembayaran <b>QRIS Otomatis</b> (BCA, GoPay, OVO, Dana, ShopeePay, dll).\n\n` +
    `💰 <b>Saldo Koin Anda:</b> <code>${currentCoins}</code> Koin\n\n` +
    `<b>Pilih Paket Koin yang Anda Inginkan:</b>\n` +
    `• 🥉 <b>Paket Starter:</b> 200 Koin — <b>Rp 5.000</b>\n` +
    `• 🥈 <b>Paket Pro:</b> 500 Koin — <b>Rp 10.000</b> <i>(Paling Populer ⭐)</i>\n` +
    `• 🥇 <b>Paket Sultan:</b> 1.200 Koin — <b>Rp 20.000</b> <i>(Bonus +200 Koin)</i>\n` +
    `• 👑 <b>Paket VIP Sultan:</b> 2.000 Koin + VIP 30 Hari — <b>Rp 35.000</b>\n\n` +
    `⚡ <i>Koin langsung masuk otomatis ke akun Anda segera setelah pembayaran berhasil!</i>`;

  const keyboard = new InlineKeyboard()
    .text('🥉 Starter (200 Koin - Rp 5rb)', 'topup:select:starter')
    .row()
    .text('🥈 Pro (500 Koin - Rp 10rb) ⭐', 'topup:select:pro')
    .row()
    .text('🥇 Sultan (1.200 Koin - Rp 20rb)', 'topup:select:sultan')
    .row()
    .text('👑 VIP + 2.000 Koin (Rp 35rb)', 'topup:select:vip')
    .row()
    .text('🎮 Arena Games', 'game:nav:menu')
    .text('👛 Cek Saldo', 'game:action:koin');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(async () => {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
    });
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }
}

// 2. Pemilihan Paket Top-Up & Generate QRIS
topupComposer.callbackQuery(/^topup:select:([a-z0-9_]+)$/, async ctx => {
  const packageId = ctx.match[1];
  const pkg = TOPUP_PACKAGES[packageId];

  if (!pkg) {
    await ctx.answerCallbackQuery({ text: 'Paket tidak valid!', show_alert: true }).catch(() => {});
    return;
  }

  await ctx.answerCallbackQuery({ text: `Menyiapkan QRIS untuk ${pkg.name}...` }).catch(() => {});

  let loadingMsg: any;
  try {
    loadingMsg = await ctx.reply('⏳ <b>Membuat QRIS resmi dari Duitku...</b>\n<i>Harap tunggu beberapa detik...</i>', {
      parse_mode: 'HTML'
    });
  } catch (err) {
    console.error('Gagal mengirim pesan loading:', err);
  }

  try {
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name;

    const result = await duitkuService.createQrisTransaction(userId, packageId, username);

    if (!result.success || !result.qrBuffer || result.qrBuffer.length === 0) {
      const errorText = `❌ <b>Gagal membuat pesanan QRIS:</b>\n${escapeHtml(result.errorMessage || 'Terjadi gangguan koneksi ke gateway Duitku.')}\n\nSilakan coba lagi beberapa saat lagi.`;
      if (loadingMsg && ctx.chat) {
        await ctx.api.editMessageText(ctx.chat.id, loadingMsg.message_id, errorText, { parse_mode: 'HTML' }).catch(async () => {
          await ctx.reply(errorText, { parse_mode: 'HTML' });
        });
      } else {
        await ctx.reply(errorText, { parse_mode: 'HTML' });
      }
      return;
    }

    const formattedPrice = new Intl.NumberFormat('id-ID').format(pkg.price);
    const caption =
      `💳 <b>PEMBAYARAN QRIS — ${pkg.name.toUpperCase()}</b>\n\n` +
      `• <b>Order ID:</b> <code>${result.orderId}</code>\n` +
      `• <b>Koin Didapatkan:</b> <b>+${pkg.coins} Koin</b>\n` +
      (pkg.isVipBonus ? `• <b>Bonus Spesial:</b> Status VIP 30 Hari Bebas Unduh!\n` : '') +
      `• <b>Total Bayar:</b> <b>Rp ${formattedPrice}</b> (Nominal Pas)\n` +
      `• <b>Batas Waktu:</b> 15 Menit\n\n` +
      `<b>Cara Pembayaran:</b>\n` +
      `1. Buka aplikasi E-Wallet (GoPay, OVO, Dana, ShopeePay, LinkAja) atau Mobile Banking apa saja (BCA, Mandiri, BRI, BNI, Jago, SeaBank, dll).\n` +
      `2. Pilih menu <b>Scan / Bayar QRIS</b> dan arahkan kamera ke kode QR di atas.\n` +
      `3. Selesaikan pembayaran sebesar <b>Rp ${formattedPrice}</b>.\n\n` +
      `⏳ <i>Sistem akan otomatis mendeteksi pelunasan dan menambahkan koin Anda tanpa perlu kirim struk transfer.</i>`;

    const keyboard = new InlineKeyboard()
      .text('🔄 Cek Status Pembayaran', `topup:check:${result.orderId}`)
      .text('❌ Batalkan', `topup:cancel:${result.orderId}`);

    // Jika mode simulasi atau sandbox aktif, tampilkan tombol uji coba instan
    if (result.isSimulated || config.duitkuSandbox) {
      keyboard.row().text('🧪 [Uji Coba] Simulasi Bayar Berhasil', `topup:simulate:${result.orderId}`);
    }

    // Hapus pesan loading jika ada
    if (loadingMsg && ctx.chat) {
      await ctx.api.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
    }

    const inputFile = new InputFile(result.qrBuffer, `qris_${result.orderId}.png`);
    const qrMsg = await ctx.replyWithPhoto(inputFile, {
      caption,
      parse_mode: 'HTML',
      reply_markup: keyboard
    });

    // Mulai Background Poller untuk mendeteksi pembayaran otomatis secara instan
    duitkuService.startPolling(
      ctx.api,
      result.orderId,
      userId,
      ctx.chat!.id,
      qrMsg.message_id,
      pkg
    );
  } catch (err: any) {
    console.error('Error saat proses generate QRIS:', err);
    const failText = `❌ <b>Terjadi kesalahan sistem saat membuat QRIS:</b>\n<code>${escapeHtml(err.message || 'Unknown error')}</code>\n\nSilakan coba lagi beberapa saat lagi.`;
    if (loadingMsg && ctx.chat) {
      await ctx.api.editMessageText(ctx.chat.id, loadingMsg.message_id, failText, { parse_mode: 'HTML' }).catch(async () => {
        await ctx.reply(failText, { parse_mode: 'HTML' }).catch(() => {});
      });
    } else {
      await ctx.reply(failText, { parse_mode: 'HTML' }).catch(() => {});
    }
  }
});

// 3. Tombol Cek Status Pembayaran Manual
topupComposer.callbackQuery(/^topup:check:([A-Za-z0-9_]+)$/, async ctx => {
  try {
    const orderId = ctx.match[1];
    const tx = transactionRepository.getTransaction(orderId);

    if (!tx) {
      await ctx.answerCallbackQuery({ text: 'Data transaksi tidak ditemukan.', show_alert: true });
      return;
    }

    if (tx.status === 'SUCCESS') {
      await ctx.answerCallbackQuery({ text: '✅ Transaksi ini sudah berhasil dibayar!', show_alert: true });
      return;
    }

    await ctx.answerCallbackQuery({ text: 'Memeriksa status pembayaran ke Duitku...' });

    const status = await duitkuService.checkTransactionStatus(orderId);

    if (status && status.statusCode === '00') {
      const pkg = TOPUP_PACKAGES[tx.package_id];
      duitkuService.stopPolling(orderId);

      const messageId = ctx.callbackQuery.message?.message_id;
      if (messageId && ctx.chat) {
        await duitkuService.handlePaymentSuccess(
          ctx.api,
          orderId,
          tx.telegram_id,
          ctx.chat.id,
          messageId,
          pkg,
          status.reference
        );
      }
    } else {
      await ctx.answerCallbackQuery({
        text: '⏳ Pembayaran belum terdeteksi. Silakan selesaikan pembayaran di aplikasi m-banking/e-wallet Anda.',
        show_alert: true
      });
    }
  } catch (err: any) {
    console.error('Error saat cek status pembayaran:', err);
    await ctx.answerCallbackQuery({ text: 'Gagal mengecek status pembayaran.', show_alert: true }).catch(() => {});
  }
});

// 4. Tombol Batalkan Pembayaran
topupComposer.callbackQuery(/^topup:cancel:([A-Za-z0-9_]+)$/, async ctx => {
  try {
    const orderId = ctx.match[1];
    duitkuService.stopPolling(orderId);
    transactionRepository.updateStatus(orderId, 'EXPIRED');

    await ctx.answerCallbackQuery({ text: 'Pesanan telah dibatalkan.' });

    const messageId = ctx.callbackQuery.message?.message_id;
    if (messageId && ctx.chat) {
      await ctx.api.editMessageCaption(ctx.chat.id, messageId, {
        caption: `❌ <b>Pesanan Dibatalkan.</b>\nOrder ID <code>${orderId}</code> telah dibatalkan oleh pengguna.\nKetik /topup jika ingin membuat pesanan baru.`,
        parse_mode: 'HTML',
        reply_markup: undefined
      }).catch(() => {});
    }
  } catch (err: any) {
    console.error('Error saat membatalkan pesanan:', err);
    await ctx.answerCallbackQuery({ text: 'Gagal membatalkan pesanan.', show_alert: true }).catch(() => {});
  }
});

// 5. Tombol Simulasi Pembayaran Sukses (Untuk Pengujian & Sandbox)
topupComposer.callbackQuery(/^topup:simulate:([A-Za-z0-9_]+)$/, async ctx => {
  try {
    const orderId = ctx.match[1];
    const tx = transactionRepository.getTransaction(orderId);

    if (!tx || tx.status === 'SUCCESS') {
      await ctx.answerCallbackQuery({ text: 'Transaksi sudah lunas atau tidak ditemukan.', show_alert: true });
      return;
    }

    await ctx.answerCallbackQuery({ text: '🧪 Menjalankan simulasi pembayaran lunas...' });

    duitkuService.stopPolling(orderId);
    const pkg = TOPUP_PACKAGES[tx.package_id];
    const messageId = ctx.callbackQuery.message?.message_id;

    if (messageId && ctx.chat) {
      await duitkuService.handlePaymentSuccess(
        ctx.api,
        orderId,
        tx.telegram_id,
        ctx.chat.id,
        messageId,
        pkg,
        `SIM_PAID_${Date.now()}`
      );
    }
  } catch (err: any) {
    console.error('Error saat simulasi pembayaran:', err);
    await ctx.answerCallbackQuery({ text: 'Gagal menjalankan simulasi.', show_alert: true }).catch(() => {});
  }
});

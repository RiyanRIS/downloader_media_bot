import { Composer, InlineKeyboard, InputFile } from 'grammy';
import { MyContext } from '../context.js';
import { userRepository } from '../../database/repositories/userRepository.js';
import { transactionRepository } from '../../database/repositories/transactionRepository.js';
import { qrisService, TOPUP_PACKAGES, TopupPackage } from '../../services/qrisService.js';
import { escapeHtml } from '../../utils/format.js';

export const topupComposer = new Composer<MyContext>();

// 1. Menu Utama Katalog Dukungan & Paket Berbayar (/dukung, /support, /paket, /topup, /belikoin, /buykoin, /qris)
topupComposer.command(['dukung', 'support', 'paket', 'topup', 'belikoin', 'buykoin', 'qris'], async ctx => {
  await sendTopupMenu(ctx);
});

// Callback navigasi ke menu top-up / paket dukungan
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
    `💖 <b>DUKUNG PENGEMBANGAN TOOLS &amp; BOT</b>\n\n` +
    `Halo <b>${escapeHtml(from.first_name)}</b>! Bantu kami menjaga bot &amp; server ini tetap aktif, cepat, dan terus berkembang dengan membeli <b>Paket Berbayar</b>.\n\n` +
    `Setiap kontribusi Anda sangat berarti untuk biaya operasional server dan pemeliharaan tools ini ke depannya! ✨\n\n` +
    `💰 <b>Saldo Koin Anda:</b> <code>${currentCoins}</code> Koin\n\n` +
    `<b>Pilihan Paket Dukungan:</b>\n` +
    `• 🥉 <b>Paket Starter:</b> +200 Koin — <b>Rp 5.000</b>\n` +
    `• 🥈 <b>Paket Pro:</b> +500 Koin — <b>Rp 10.000</b> <i>(Paling Populer ⭐)</i>\n` +
    `• 🥇 <b>Paket Sultan:</b> +1.200 Koin — <b>Rp 20.000</b> <i>(Bonus ekstra +200 Koin)</i>\n` +
    `• 👑 <b>Paket VIP Sultan:</b> +2.000 Koin + VIP 30 Hari — <b>Rp 35.000</b>\n\n` +
    `💳 <b>Metode Pembayaran:</b> QRIS Dinamis Otomatis (BCA, BRI, Mandiri, BNI, GoPay, OVO, Dana, ShopeePay, dll).\n` +
    `⏱️ <i>Batas waktu pembayaran adalah <b>30 menit</b> per pesanan. Setelah transfer, kirimkan foto bukti pembayaran ke bot ini untuk diverifikasi Admin.</i>`;

  const keyboard = new InlineKeyboard()
    .text('🥉 Paket Starter (200 Koin - Rp 5rb)', 'topup:select:starter')
    .row()
    .text('🥈 Paket Pro (500 Koin - Rp 10rb) ⭐', 'topup:select:pro')
    .row()
    .text('🥇 Paket Sultan (1.200 Koin - Rp 20rb)', 'topup:select:sultan')
    .row()
    .text('👑 Paket VIP + 2.000 Koin (Rp 35rb)', 'topup:select:vip')
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
    loadingMsg = await ctx.reply('⏳ <b>Membuat QRIS...</b>\n<i>Harap tunggu beberapa detik...</i>', {
      parse_mode: 'HTML'
    });
  } catch (err) {
    console.error('Gagal mengirim pesan loading:', err);
  }

  try {
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name;

    const result = await qrisService.createDynamicQrisTransaction(userId, packageId, username);

    if (!result.success || !result.qrBuffer || result.qrBuffer.length === 0) {
      const errorText = `❌ <b>Gagal membuat pesanan QRIS:</b>\n${escapeHtml(result.errorMessage || 'Terjadi kesalahan sistem saat membuat kode QR.')}\n\nSilakan coba lagi beberapa saat lagi.`;
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
      `💖 <b>DUKUNG PENGEMBANGAN — ${pkg.name.toUpperCase()}</b>\n\n` +
      `Terima kasih telah berniat mendukung kelangsungan &amp; operasional tools ini! 🙏\n\n` +
      `• <b>Order ID:</b> <code>${result.orderId}</code>\n` +
      `• <b>Benefit Paket:</b> <b>+${pkg.coins} Koin</b>\n` +
      (pkg.isVipBonus ? `• <b>Bonus Spesial:</b> Status VIP 30 Hari Bebas Unduh!\n` : '') +
      `• <b>Total Dukungan:</b> <b>Rp ${formattedPrice}</b>\n` +
      `• <b>Batas Waktu:</b> <b>30 Menit</b>\n` +
      (result.merchantName ? `• <b>Merchant:</b> ${escapeHtml(result.merchantName)}\n` : '') +
      `\n` +
      `📸 <b>Setelah transfer, silakan kirim foto bukti pembayaran ke chat ini.</b>\n` +
      `<i>Admin akan segera memverifikasi dan benefit paket langsung aktif di akun Anda.</i>`;

    const keyboard = new InlineKeyboard()
      .text('💡 Panduan Kirim Bukti', 'topup:guide')
      .row()
      .text('❌ Batalkan Pesanan', `topup:cancel:${result.orderId}`);

    // Hapus pesan loading jika ada
    if (loadingMsg && ctx.chat) {
      await ctx.api.deleteMessage(ctx.chat.id, loadingMsg.message_id).catch(() => {});
    }

    const inputFile = new InputFile(result.qrBuffer, `qris_${result.orderId}.png`);
    await ctx.replyWithPhoto(inputFile, {
      caption,
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
  } catch (err: any) {
    console.error('Error saat proses generate QRIS Dinamis:', err);
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

// 3. Tombol Panduan Kirim Bukti Transfer
topupComposer.callbackQuery('topup:guide', async ctx => {
  await ctx.answerCallbackQuery({
    text: '📸 Kirim foto tangkapan layar/struk transfer langsung ke chat ini seperti mengirim foto biasa.',
    show_alert: true
  });
});

// 4. Tombol Batalkan Pembayaran
topupComposer.callbackQuery(/^topup:cancel:([A-Za-z0-9_]+)$/, async ctx => {
  try {
    const orderId = ctx.match[1];
    const tx = transactionRepository.getTransaction(orderId);

    if (!tx) {
      await ctx.answerCallbackQuery({ text: 'Pesanan tidak ditemukan.', show_alert: true });
      return;
    }

    if (tx.status === 'SUCCESS') {
      await ctx.answerCallbackQuery({ text: 'Pesanan sudah lunas dan tidak dapat dibatalkan.', show_alert: true });
      return;
    }

    transactionRepository.updateStatus(orderId, 'EXPIRED');
    await ctx.answerCallbackQuery({ text: 'Pesanan telah dibatalkan.' });

    const messageId = ctx.callbackQuery.message?.message_id;
    if (messageId && ctx.chat) {
      await ctx.api.editMessageCaption(ctx.chat.id, messageId, {
        caption: `❌ <b>Pesanan Dibatalkan.</b>\nOrder ID <code>${orderId}</code> telah dibatalkan oleh pengguna.\nKetik /dukung atau /topup jika ingin memilih paket kembali.`,
        parse_mode: 'HTML',
        reply_markup: undefined
      }).catch(() => {});
    }
  } catch (err: any) {
    console.error('Error saat membatalkan pesanan:', err);
    await ctx.answerCallbackQuery({ text: 'Gagal membatalkan pesanan.', show_alert: true }).catch(() => {});
  }
});

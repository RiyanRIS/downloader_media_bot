import { Composer, InlineKeyboard, InputFile } from 'grammy';
import { MyContext } from '../context.js';
import { qrisService } from '../../services/qrisService.js';
import { donationRepository } from '../../database/repositories/donationRepository.js';
import { escapeHtml } from '../../utils/format.js';
import { getAdminContactInfo } from '../../utils/contact.js';

export const topupComposer = new Composer<MyContext>();

// 1. Command Dukung Pengembang (/dukung, /donasi, /traktir, dll.)
topupComposer.command(['dukung', 'support', 'donasi', 'donate', 'traktir', 'qris', 'topup'], async ctx => {
  await sendStaticQris(ctx);
});

// 2. Command Daftar Donatur Bulan Ini (/donatur, /supporters, dll.)
topupComposer.command(['donatur', 'supporters', 'donatur_bulan_ini', 'listdonatur'], async ctx => {
  const { text, keyboard } = renderDonorsList();
  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
});

// Callback navigasi ke QRIS dukungan pengembang
topupComposer.callbackQuery('topup:menu', async ctx => {
  await sendStaticQris(ctx);
});

// Callback navigasi ke daftar donatur bulan ini
topupComposer.callbackQuery('topup:donatur', async ctx => {
  await ctx.answerCallbackQuery().catch(() => {});
  const { text, keyboard } = renderDonorsList();
  if (ctx.callbackQuery.message) {
    if ('photo' in ctx.callbackQuery.message) {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
    } else {
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(async () => {
        await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
      });
    }
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }
});

export function renderDonorsList(): { text: string; keyboard: InlineKeyboard } {
  const donors = donationRepository.getMonthlyDonors(30);

  const now = new Date();
  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const currentMonthName = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;

  let text = `💖 <b>DAFTAR DONATUR BULAN INI</b>\n`;
  text += `🗓️ <b>Periode:</b> ${currentMonthName}\n\n`;

  if (donors.length === 0) {
    text += `<i>Belum ada donatur yang tercatat di bulan ini.</i>\n\n`;
    text += `Jadilah yang pertama mendukung operasional &amp; kelangsungan bot dengan berdonasi sukarela via /dukung! 🙏✨`;
  } else {
    text += `Terima kasih yang sebesar-besarnya kepada para sahabat dermawan yang telah berpartisipasi sukarela mendukung operasional dan kelangsungan bot:\n\n`;

    donors.forEach((donor, idx) => {
      const rankNum = idx + 1;
      const medal = rankNum === 1 ? '🥇' : rankNum === 2 ? '🥈' : rankNum === 3 ? '🥉' : '✨';
      const nameStr = donor.username
        ? `@${escapeHtml(donor.username)}`
        : `Sahabat #${String(donor.telegram_id).slice(-4)}`;
      const roleBadge = donor.role === 'vip' ? '💖 Sahabat Dermawan' : `⭐ Level ${Math.floor(donor.exp / 100) + 1}`;
      const countStr = donor.support_count > 1 ? ` <i>(${donor.support_count}x)</i>` : '';

      text += `${medal} <b>${rankNum}. ${nameStr}</b> — <i>${roleBadge}</i>${countStr}\n`;
    });

    text += `\nTotal: <b>${donors.length}</b> donatur di bulan ini.\n\n`;
    text += `<i>Semoga rezeki para donatur dilipatgandakan dan senantiasa diberikan kelancaran serta keberkahan. Aamiin! 🙏✨</i>`;
  }

  const keyboard = new InlineKeyboard()
    .text('💖 Scan QRIS Donasi', 'topup:menu')
    .text('🔄 Perbarui', 'topup:donatur')
    .row()
    .text('🎮 Arena Games', 'game:nav:menu')
    .text('📋 Menu Utama', 'start:mainmenu');

  return { text, keyboard };
}

export async function sendStaticQris(ctx: MyContext) {
  const from = ctx.from;
  if (!from) return;

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery().catch(() => {});
  }

  const result = await qrisService.getStaticQrisTransaction(from.id, from.username);
  if (!result.success || !result.qrBuffer || result.qrBuffer.length === 0) {
    await ctx.reply(
      `❌ <b>Gagal memuat QRIS:</b>\n${escapeHtml(result.errorMessage || 'Terjadi kesalahan sistem.')}`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  const caption =
    `💖 <b>DUKUNGAN SUKARELA PENGEMBANG</b>\n\n` +
    `Halo <b>${escapeHtml(from.first_name)}</b>! Seluruh fitur bot ini disediakan <b>100% GRATIS SELAMANYA</b>.\n\n` +
    `Bagi Anda yang merasa bot ini bermanfaat dan ingin berbagi rezeki / mentraktir kopi untuk operasional &amp; kelangsungan bot, silakan scan kode QRIS di atas dengan <b>nominal sukarela (bebas berapa saja)</b>.\n\n` +
    (result.merchantName ? `🏪 <b>Merchant:</b> ${escapeHtml(result.merchantName)}\n` : '') +
    `💳 <b>Mendukung Semua Bank &amp; E-Wallet:</b>\n` +
    `BCA, BRI, Mandiri, BNI, BSI, CIMB, GoPay, OVO, DANA, ShopeePay, LinkAja, AstraPay, dll.\n\n` +
    `📸 <b>Kirim Bukti Dukungan:</b>\n` +
    `Setelah transfer, silakan kirimkan foto struk/bukti transfer ke obrolan ini untuk disematkan gelar kehormatan <b>💖 Sahabat Dermawan</b> di profil Anda.\n\n` +
    `📜 <b>Daftar Donatur Bulan Ini:</b>\n` +
    `Ketik /donatur atau klik tombol di bawah untuk melihat daftar sahabat dermawan.`;

  const contact = getAdminContactInfo();
  const keyboard = new InlineKeyboard()
    .text('📜 Donatur Bulan Ini', 'topup:donatur');

  if (contact.isAvailable) {
    keyboard.url('💬 Hubungi Admin / CS', contact.getContactUrl('Halo Admin, saya ingin konfirmasi donasi bot'));
  }
  keyboard
    .row()
    .text('🎮 Arena Games', 'game:nav:menu')
    .text('📋 Menu Utama', 'start:mainmenu');

  const inputFile = new InputFile(result.qrBuffer, `qris_donasi_${from.id}.png`);

  await ctx.replyWithPhoto(inputFile, {
    caption,
    parse_mode: 'HTML',
    reply_markup: keyboard
  });
}

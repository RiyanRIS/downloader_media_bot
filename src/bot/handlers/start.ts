import { Composer, InlineKeyboard } from 'grammy';
import { MyContext } from '../context.js';
import { userRepository } from '../../database/repositories/userRepository.js';
import { config } from '../../config/config.js';
import { escapeHtml } from '../../utils/format.js';
import { getAdminContactInfo } from '../../utils/contact.js';

import { renderFinancialReport } from './expense.js';

export const startComposer = new Composer<MyContext>();

startComposer.command('start', async ctx => {
  const from = ctx.from;
  if (!from) return;

  const refPayload = ctx.match?.trim();

  // Jika payload adalah 'keuangan', buka langsung dompet keuangan pribadi
  if (refPayload === 'keuangan') {
    userRepository.getOrCreateUser(from.id, from.username);
    const { text, keyboard } = renderFinancialReport(from.id);
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
    return;
  }

  userRepository.getOrCreateUser(from.id, from.username);
  const user = userRepository.getUser(from.id)!;

  const roleBadge = user.role === 'admin' ? '👑 Admin' : user.role === 'vip' ? '💖 Sahabat Dermawan' : '👤 Pengguna Aktif';
  const level = Math.floor(user.exp / 100) + 1;

  const welcomeText = 
    `👋 <b>Halo, ${escapeHtml(from.first_name)}!</b>\n\n` +
    `Selamat datang di <b>Multi-Platform Downloader & Komunitas Bot</b>.\n` +
    `Kirimkan link video, audio, atau foto untuk langsung diunduh secara instan!\n\n` +
    `📊 <b>Status Akun:</b> ${roleBadge}\n` +
    `⭐ <b>Peringkat Keaktifan:</b> Level ${level} (<code>${user.exp}</code> EXP)\n` +
    `⚡ <b>Biaya Layanan:</b> 100% GRATIS Selamanya (Berbasis Komunitas)\n\n` +
    `💰 <b>Catat Keuangan & Scan Struk (AI):</b>\n` +
    `Tekan tombol 💰 <b>Keuangan & Dompet</b> di bawah untuk catat pengeluaran & ringkasan.\n\n` +
    `🎮 <b>Aktivitas & Kumpulkan EXP:</b>\n` +
    `• Unduh media favorit (+2 EXP per unduhan)\n` +
    `• Mainkan mini-games seru di /games (Family 100, Tebak Gambar, Dadu, Slot, Kuis)\n` +
    `• Check-in harian di /claim (+20 EXP gratis setiap hari)\n\n` +
    `💖 <b>Dukungan Sukarela (QRIS):</b>\n` +
    `Bot ini bebas digunakan tanpa paksaan membeli paket. Jika Anda ingin mendukung kelangsungan bot, silakan berdonasi secara sukarela via /dukung.\n\n` +
    `🌐 <b>Platform yang Didukung:</b>\n` +
    `YouTube, TikTok, Instagram, X/Twitter, Threads, Facebook, Reddit, Pinterest, Bilibili.`;

  const mainKeyboard = new InlineKeyboard()
    .text('🎮 Arena Games', 'game:nav:menu')
    .text('💰 Keuangan & Dompet', 'keuangan:menu')
    .row()
    .text('💖 Dukung Pengembang', 'topup:menu')
    .text('🎁 Check-in Harian', 'game:action:claim')
    .row()
    .text('📬 Request & Lapor Kendala', 'feedback:menu')
    .row()
    .text('📊 Profil & Statistik', 'start:profile')
    .text('ℹ️ Panduan & Kontak Admin', 'start:help');

  await ctx.reply(welcomeText, { parse_mode: 'HTML', reply_markup: mainKeyboard });
});

// Command /menu — shortcut ke menu navigasi utama
startComposer.command('menu', async ctx => {
  if (!ctx.from) return;
  const keyboard = new InlineKeyboard()
    .text('🎮 Arena Games', 'game:nav:menu')
    .text('💰 Keuangan & Dompet', 'keuangan:menu')
    .row()
    .text('💖 Dukung Pengembang', 'topup:menu')
    .text('🎁 Check-in Harian', 'game:action:claim')
    .row()
    .text('📬 Request & Lapor Kendala', 'feedback:menu')
    .row()
    .text('📊 Profil Saya', 'start:profile')
    .text('ℹ️ Panduan & Kontak Admin', 'start:help');

  await ctx.reply(
    `📋 <b>Menu Utama Bot</b>\n\nPilih salah satu menu di bawah ini:`,
    { parse_mode: 'HTML', reply_markup: keyboard }
  );
});

export function renderHelpContent() {
  const contact = getAdminContactInfo();
  const helpText =
    `📖 <b>Panduan Penggunaan Bot</b>\n\n` +
    `1. <b>Cara Mengunduh Media:</b>\n` +
    `   Cukup salin dan tempelkan tautan dari YouTube, TikTok, Instagram, X/Twitter, Threads, Facebook, Reddit, Pinterest, atau Bilibili ke obrolan ini.\n` +
    `   Pilih format yang diinginkan (Video, Audio MP3, atau Foto/Album).\n` +
    `   Seluruh unduhan <b>100% GRATIS SELAMANYA</b> tanpa batas kuota atau potongan koin!\n\n` +
    `2. <b>Daftar Perintah Pengguna:</b>\n` +
    `   • /start - Pesan pembuka dan informasi akun.\n` +
    `   • /menu - Navigasi tombol menu utama.\n` +
    `   • /profile - Profil akun, level EXP keaktifan, dan statistik.\n` +
    `   • /saran atau /request - Usulkan ide atau fitur baru untuk bot.\n` +
    `   • /lapor atau /bug - Laporkan kendala, bug, atau link rusak.\n` +
    `   • /feedback - Menu request fitur & lapor kendala.\n` +
    `   • /dukung atau /donasi - Dukungan sukarela pengembang via QRIS (nominal bebas).\n` +
    `   • /donatur - Lihat daftar donatur & sahabat dermawan bulan ini.\n` +
    `   • /help - Panduan lengkap bot.\n\n` +
    `3. <b>🎮 Mini-Games & Komunitas:</b>\n` +
    `   • /games - Katalog arena mini-games.\n` +
    `   • /family100 atau /f100 - Game survei Family 100 (+2 EXP per tebakan).\n` +
    `   • /tebakgambar atau /tg - Tebak gambar interaktif (+5 EXP).\n` +
    `   • /dice atau /dadu - Lempar dadu seru lawan bot (+5 EXP).\n` +
    `   • /slot - Putar mesin slot jackpot (hingga +25 EXP).\n` +
    `   • /tebak - Kuis pilihan ganda (+5 EXP).\n` +
    `   • /claim - Check-in harian (+20 EXP gratis setiap hari).\n` +
    `   • /leaderboard - Papan peringkat pengguna paling aktif (Top EXP).\n\n` +
    `4. <b>💰 Catat Keuangan & Pengeluaran (AI):</b>\n` +
    `   Tekan tombol 💰 <b>Keuangan &amp; Dompet</b> di menu utama untuk:\n` +
    `   • 📝 Catat pengeluaran dari cerita belanja teks (/catat)\n` +
    `   • 🧾 Scan foto struk belanja otomatis via AI (/struk)\n` +
    `   • 📊 Lihat ringkasan &amp; laporan pengeluaran harian/bulanan\n\n` +
    `5. <b>💖 Dukungan Komunitas (QRIS):</b>\n` +
    `   Bot ini beroperasi secara independen tanpa membebankan tarif kepada pengguna. Jika Anda merasa terbantu, donasi sukarela dapat disalurkan melalui perintah /dukung.\n\n` +
    `6. <b>📞 Bantuan &amp; Kontak Admin:</b>\n` +
    `   Pertanyaan seputar fitur atau kendala bot?\n` +
    `   Hubungi Admin: <b>${escapeHtml(contact.display)}</b> melalui tombol di bawah ini.`;

  const keyboard = new InlineKeyboard();
  if (contact.isAvailable) {
    keyboard.url('💬 Hubungi Admin', contact.getContactUrl('Halo Admin, saya butuh bantuan bot'));
  }
  keyboard
    .row()
    .text('📬 Request & Lapor Kendala', 'feedback:menu')
    .text('💖 Dukung Pengembang', 'topup:menu')
    .row()
    .text('📋 Menu Utama', 'start:mainmenu');

  return { text: helpText, keyboard };
}

startComposer.command('help', async ctx => {
  const { text, keyboard } = renderHelpContent();
  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
});

// Callback tombol [ℹ️ Bantuan & Kontak Admin] dari menu utama
startComposer.callbackQuery('start:help', async ctx => {
  await ctx.answerCallbackQuery();
  const { text, keyboard } = renderHelpContent();
  if (ctx.callbackQuery.message) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(async () => {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
    });
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }
});

startComposer.command('profile', async ctx => {
  if (!ctx.user) return;

  const user = userRepository.getUser(ctx.user.telegram_id)!;
  const roleBadge = user.role === 'admin' ? '👑 Admin' : user.role === 'vip' ? '💖 Sahabat Dermawan' : '👤 Pengguna Aktif';
  const level = Math.floor(user.exp / 100) + 1;

  let vipInfo = '';
  if (user.role === 'vip' && user.vip_expires_at) {
    const exp = new Date(user.vip_expires_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    vipInfo = `\n⏳ <b>Gelar Sahabat Dermawan Sampai:</b> ${exp}`;
  }

  const profileText =
    `👤 <b>Profil Pengguna</b>\n\n` +
    `• <b>ID Telegram:</b> <code>${user.telegram_id}</code>\n` +
    `• <b>Username:</b> @${escapeHtml(user.username || '-')}\n` +
    `• <b>Status Akun:</b> ${roleBadge}${vipInfo}\n` +
    `• <b>Peringkat Keaktifan:</b> ⭐ Level ${level} (<b>${user.exp} EXP</b>)\n` +
    `• <b>Total Permainan:</b> ${user.games_played} main (${user.games_won}x menang)\n` +
    `• <b>Total Unduhan:</b> ${user.daily_usage} media\n\n` +
    `✨ <i>Seluruh layanan bot 100% gratis. Kumpulkan EXP keaktifan untuk bersaing di papan peringkat /leaderboard!</i>`;

  const keyboard = new InlineKeyboard()
    .text('🎮 Arena Games', 'game:nav:menu')
    .text('💰 Keuangan', 'keuangan:menu')
    .row()
    .text('💖 Dukung Pengembang', 'topup:menu')
    .text('📋 Menu Utama', 'start:mainmenu');

  await ctx.reply(profileText, { parse_mode: 'HTML', reply_markup: keyboard });
});

// Callback: tampilkan profil via tombol
startComposer.callbackQuery('start:profile', async ctx => {
  await ctx.answerCallbackQuery();
  if (!ctx.from) return;

  const user = userRepository.getUser(ctx.from.id);
  if (!user) return;

  const roleBadge = user.role === 'admin' ? '👑 Admin' : user.role === 'vip' ? '💖 Sahabat Dermawan' : '👤 Pengguna Aktif';
  const level = Math.floor(user.exp / 100) + 1;

  let vipInfo = '';
  if (user.role === 'vip' && user.vip_expires_at) {
    const exp = new Date(user.vip_expires_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    vipInfo = `\n⏳ <b>Gelar Sahabat Dermawan Sampai:</b> ${exp}`;
  }

  const profileText =
    `👤 <b>Profil Pengguna</b>\n\n` +
    `• <b>ID Telegram:</b> <code>${user.telegram_id}</code>\n` +
    `• <b>Username:</b> @${escapeHtml(user.username || '-')}\n` +
    `• <b>Status Akun:</b> ${roleBadge}${vipInfo}\n` +
    `• <b>Peringkat Keaktifan:</b> ⭐ Level ${level} (<b>${user.exp} EXP</b>)\n` +
    `• <b>Total Permainan:</b> ${user.games_played} main (${user.games_won}x menang)\n` +
    `• <b>Total Unduhan:</b> ${user.daily_usage} media\n\n` +
    `✨ <i>Seluruh layanan bot 100% gratis. Kumpulkan EXP keaktifan untuk bersaing di papan peringkat /leaderboard!</i>`;

  const keyboard = new InlineKeyboard()
    .text('🎮 Arena Games', 'game:nav:menu')
    .text('💰 Keuangan', 'keuangan:menu')
    .row()
    .text('💖 Dukung Pengembang', 'topup:menu')
    .text('📋 Menu Utama', 'start:mainmenu');

  await ctx.reply(profileText, { parse_mode: 'HTML', reply_markup: keyboard });
});

// Callback: tombol menu utama
startComposer.callbackQuery('start:mainmenu', async ctx => {
  await ctx.answerCallbackQuery();
  const keyboard = new InlineKeyboard()
    .text('🎮 Arena Games', 'game:nav:menu')
    .text('💰 Keuangan & Dompet', 'keuangan:menu')
    .row()
    .text('💖 Dukung Pengembang', 'topup:menu')
    .text('🎁 Check-in Harian', 'game:action:claim')
    .row()
    .text('📬 Request & Lapor Kendala', 'feedback:menu')
    .row()
    .text('📊 Profil Saya', 'start:profile')
    .text('ℹ️ Panduan & Kontak Admin', 'start:help');

  const text = `📋 <b>Menu Utama Bot</b>\n\nPilih salah satu menu di bawah ini:`;
  if (ctx.callbackQuery.message) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(async () => {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
    });
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }
});

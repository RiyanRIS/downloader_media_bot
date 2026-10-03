import { Composer, InlineKeyboard } from 'grammy';
import { MyContext } from '../context.js';
import { userRepository } from '../../database/repositories/userRepository.js';
import { config } from '../../config/config.js';
import { escapeHtml } from '../../utils/format.js';

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

  let referrerId: number | undefined;

  if (refPayload) {
    const parsedRef = parseInt(refPayload, 10);
    if (!isNaN(parsedRef) && parsedRef !== from.id) {
      referrerId = parsedRef;
    }
  }

  const { user, isNew } = userRepository.getOrCreateUser(from.id, from.username, referrerId);

  // Jika user baru dan menggunakan kode referral, beri bonus koin ke pengajak
  if (isNew && referrerId) {
    const referrer = userRepository.getUser(referrerId);
    if (referrer) {
      userRepository.addCoins(referrerId, config.coinReferralBonus, 10);

      // Kirim notifikasi ke pengajak
      const inviterName = escapeHtml(from.username ? `@${from.username}` : from.first_name);
      await ctx.api.sendMessage(
        referrerId,
        `🎉 <b>Teman Baru Bergabung!</b>\nPengguna ${inviterName} mendaftar melalui link referral Anda.\nAnda mendapatkan bonus <b>+${config.coinReferralBonus} Koin</b> (+10 EXP)!`,
        { parse_mode: 'HTML' }
      ).catch(() => {});
    }
  }

  const roleBadge = user.role === 'admin' ? '👑 Admin' : user.role === 'vip' ? '🌟 VIP Member' : '👤 Free User';
  const level = Math.floor(user.exp / 100) + 1;

  const welcomeText = 
    `👋 <b>Halo, ${escapeHtml(from.first_name)}!</b>\n\n` +
    `Selamat datang di <b>Multi-Platform Downloader & STB Utility Bot</b>.\n` +
    `Kirimkan link video, audio, foto, atau album untuk langsung diunduh secara instan!\n\n` +
    `📊 <b>Status Akun:</b> ${roleBadge}\n` +
    `💰 <b>Saldo Koin:</b> <b>${user.coins} Koin</b> (Level ${level} - ${user.exp} EXP)\n` +
    `⚡ <b>Biaya Unduhan:</b> ${user.role === 'vip' || user.role === 'admin' ? 'Gratis (VIP/Admin)' : `${config.coinCostDownload} Koin per unduhan`}\n\n` +
    `💰 <b>Catat Keuangan Cerdas (AI):</b>\n` +
    `Tekan tombol 💰 <b>Keuangan &amp; Dompet</b> di bawah untuk catat pengeluaran &amp; lihat ringkasan.\n\n` +
    `🎮 <b>Cara Mendapatkan Koin:</b>\n` +
    `• Mainkan mini-games seru di /games (Family 100, Tebak Gambar, Dadu, Slot, Kuis)\n` +
    `• Klaim bonus koin harian di /claim (+50 Koin gratis setiap hari)\n` +
    `• Ajak teman bergabung via /ref (+${config.coinReferralBonus} Koin per teman)\n` +
    `• Dukung pengembangan tools ini dengan beli paket berbayar di /dukung (/topup)\n\n` +
    `🌐 <b>Platform yang Didukung:</b>\n` +
    `YouTube, TikTok, Instagram, X/Twitter, Threads, Facebook, Reddit, Pinterest, Bilibili.`;

  const mainKeyboard = new InlineKeyboard()
    .text('🎮 Arena Games', 'game:nav:menu')
    .text('💰 Keuangan & Dompet', 'keuangan:menu')
    .row()
    .text('💖 Dukung Bot (Paket Berbayar)', 'topup:menu')
    .text('🎁 Klaim Harian', 'game:action:claim')
    .row()
    .text('📊 Profil & Statistik', 'start:profile')
    .text(`🔗 Referral (+${config.coinReferralBonus} Koin)`, 'start:ref');

  await ctx.reply(welcomeText, { parse_mode: 'HTML', reply_markup: mainKeyboard });
});

// Command /menu — shortcut ke menu navigasi utama
startComposer.command('menu', async ctx => {
  if (!ctx.from) return;
  const keyboard = new InlineKeyboard()
    .text('🎮 Arena Games', 'game:nav:menu')
    .text('💰 Keuangan & Dompet', 'keuangan:menu')
    .row()
    .text('💖 Dukung Bot (Paket Berbayar)', 'topup:menu')
    .text('🎁 Klaim Harian', 'game:action:claim')
    .row()
    .text('📊 Profil Saya', 'start:profile')
    .text('🔗 Referral', 'start:ref');

  await ctx.reply(
    `📋 <b>Menu Utama Bot</b>\n\nPilih salah satu menu di bawah ini:`,
    { parse_mode: 'HTML', reply_markup: keyboard }
  );
});

startComposer.command('help', async ctx => {
  const helpText =
    `📖 <b>Panduan Penggunaan Bot</b>\n\n` +
    `1. <b>Cara Mengunduh Media:</b>\n` +
    `   Cukup salin dan tempelkan tautan dari YouTube, TikTok, Instagram, X/Twitter, Threads, Facebook, Reddit, Pinterest, atau Bilibili ke obrolan ini.\n` +
    `   Pilih format yang diinginkan (Video, Audio MP3, atau Foto/Album).\n` +
    `   Setiap unduhan membutuhkan <b>${config.coinCostDownload} Koin</b> (Gratis untuk member VIP & Admin).\n\n` +
    `2. <b>Daftar Perintah Pengguna:</b>\n` +
    `   • /start - Pesan pembuka dan status saldo koin.\n` +
    `   • /profile - Detail profil, saldo koin, level EXP, dan statistik.\n` +
    `   • /ref - Link referral untuk mendapatkan +${config.coinReferralBonus} koin per teman.\n` +
    `   • /dukung atau /topup - Dukung pengembangan tools ini dengan beli paket berbayar (Koin & VIP).\n` +
    `   • /help - Panduan lengkap bot.\n\n` +
    `3. <b>🎮 Mini-Games & Hiburan:</b>\n` +
    `   • /games - Katalog arena mini-games.\n` +
    `   • /family100 atau /f100 - Game survei Family 100.\n` +
    `   • /tebakgambar atau /tg - Permainan tebak gambar.\n` +
    `   • /dice &lt;taruhan&gt; - Lempar dadu lawan bot.\n` +
    `   • /slot &lt;taruhan&gt; - Putar mesin slot jackpot.\n` +
    `   • /tebak - Kuis tebak-tebakan logika.\n` +
    `   • /claim - Klaim bonus harian +50 koin gratis.\n` +
    `   • /koin - Cek saldo koin dan level EXP.\n` +
    `   • /tukar - Tukar koin game jadi Status VIP 30 Hari!\n` +
    `   • /leaderboard - Papan peringkat Top Koin & Top EXP.\n\n` +
    `4. <b>💰 Catat Keuangan &amp; Pengeluaran (AI):</b>\n` +
    `   Tekan tombol 💰 <b>Keuangan &amp; Dompet</b> di menu utama untuk:\n` +
    `   • 📝 Catat pengeluaran dari cerita belanja teks (${config.coinCostExpenseText} Koin)\n` +
    `   • 🧾 Scan foto struk belanja otomatis via AI (${config.coinCostExpenseReceipt} Koin)\n` +
    `   • 📊 Lihat ringkasan &amp; laporan pengeluaran harian/bulanan\n` +
    `   • 🌟 VIP &amp; Admin gratis biaya AI.\n\n` +
    `5. <b>Status VIP:</b>\n` +
    `   Ingin download tanpa potong koin selamanya? Dukung kami dengan paket VIP di /dukung (/topup) atau tukarkan 1.500 koin game Anda di /tukar!`;

  await ctx.reply(helpText, { parse_mode: 'HTML' });
});

startComposer.command('profile', async ctx => {
  if (!ctx.user) return;

  const user = userRepository.getUser(ctx.user.telegram_id)!;
  const roleBadge = user.role === 'admin' ? '👑 Admin' : user.role === 'vip' ? '🌟 VIP Member' : '👤 Free User';
  const totalRefs = userRepository.countReferrals(user.telegram_id);
  const level = Math.floor(user.exp / 100) + 1;

  let vipInfo = '';
  if (user.role === 'vip' && user.vip_expires_at) {
    const exp = new Date(user.vip_expires_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    vipInfo = `\n⏳ <b>Masa Aktif VIP Sampai:</b> ${exp}`;
  }

  const profileText =
    `👤 <b>Profil Pengguna</b>\n\n` +
    `• <b>ID Telegram:</b> <code>${user.telegram_id}</code>\n` +
    `• <b>Username:</b> @${escapeHtml(user.username || '-')}\n` +
    `• <b>Status Akun:</b> ${roleBadge}${vipInfo}\n` +
    `• <b>Saldo Koin:</b> 💰 <b>${user.coins} Koin</b>\n` +
    `• <b>Peringkat Level:</b> ⭐ Level ${level} (${user.exp} EXP)\n` +
    `• <b>Total Permainan:</b> ${user.games_played} main (${user.games_won}x menang)\n` +
    `• <b>Total Unduhan:</b> ${user.daily_usage} media\n` +
    `• <b>Teman yang Diundang:</b> ${totalRefs} orang\n\n` +
    `💡 <i>Kumpulkan koin dengan main game di /games atau isi ulang instan di /topup!</i>`;

  const keyboard = new InlineKeyboard()
    .text('🎮 Arena Games', 'game:nav:menu')
    .text('💰 Keuangan', 'keuangan:menu')
    .row()
    .text('📋 Menu Utama', 'start:mainmenu');

  await ctx.reply(profileText, { parse_mode: 'HTML', reply_markup: keyboard });
});

// Callback: tampilkan profil via tombol
startComposer.callbackQuery('start:profile', async ctx => {
  await ctx.answerCallbackQuery();
  if (!ctx.from) return;

  const user = userRepository.getUser(ctx.from.id);
  if (!user) return;

  const roleBadge = user.role === 'admin' ? '👑 Admin' : user.role === 'vip' ? '🌟 VIP Member' : '👤 Free User';
  const totalRefs = userRepository.countReferrals(user.telegram_id);
  const level = Math.floor(user.exp / 100) + 1;

  let vipInfo = '';
  if (user.role === 'vip' && user.vip_expires_at) {
    const exp = new Date(user.vip_expires_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    vipInfo = `\n⏳ <b>Masa Aktif VIP Sampai:</b> ${exp}`;
  }

  const profileText =
    `👤 <b>Profil Pengguna</b>\n\n` +
    `• <b>ID Telegram:</b> <code>${user.telegram_id}</code>\n` +
    `• <b>Username:</b> @${escapeHtml(user.username || '-')}\n` +
    `• <b>Status Akun:</b> ${roleBadge}${vipInfo}\n` +
    `• <b>Saldo Koin:</b> 💰 <b>${user.coins} Koin</b>\n` +
    `• <b>Peringkat Level:</b> ⭐ Level ${level} (${user.exp} EXP)\n` +
    `• <b>Total Permainan:</b> ${user.games_played} main (${user.games_won}x menang)\n` +
    `• <b>Total Unduhan:</b> ${user.daily_usage} media\n` +
    `• <b>Teman yang Diundang:</b> ${totalRefs} orang\n\n` +
    `💡 <i>Kumpulkan koin dengan main game di /games atau isi ulang instan di /topup!</i>`;

  const keyboard = new InlineKeyboard()
    .text('🎮 Arena Games', 'game:nav:menu')
    .text('💰 Keuangan', 'keuangan:menu')
    .row()
    .text('📋 Menu Utama', 'start:mainmenu');

  await ctx.reply(profileText, { parse_mode: 'HTML', reply_markup: keyboard });
});

startComposer.command('ref', async ctx => {
  if (!ctx.user) return;

  const botInfo = await ctx.api.getMe();
  const refLink = `https://t.me/${botInfo.username}?start=${ctx.user.telegram_id}`;
  const totalRefs = userRepository.countReferrals(ctx.user.telegram_id);

  const refText =
    `🔗 <b>Program Referral Bot</b>\n\n` +
    `Bagikan link referral Anda kepada teman atau grup untuk mendapatkan koin gratis!\n\n` +
    `• <b>Link Referral Anda:</b>\n<code>${refLink}</code>\n\n` +
    `🎁 <b>Bonus Hadiah:</b> Setiap pengguna baru yang bergabung melalui link Anda, Anda akan mendapatkan <b>+${config.coinReferralBonus} Koin</b> (+10 EXP).\n` +
    `👥 <b>Total Teman Terundang:</b> ${totalRefs} pengguna`;

  await ctx.reply(refText, { parse_mode: 'HTML' });
});

// Callback: tombol menu utama
startComposer.callbackQuery('start:mainmenu', async ctx => {
  await ctx.answerCallbackQuery();
  const keyboard = new InlineKeyboard()
    .text('🎮 Arena Games', 'game:nav:menu')
    .text('💰 Keuangan & Dompet', 'keuangan:menu')
    .row()
    .text('💖 Dukung Bot (Paket Berbayar)', 'topup:menu')
    .text('🎁 Klaim Harian', 'game:action:claim')
    .row()
    .text('📊 Profil Saya', 'start:profile')
    .text('🔗 Referral', 'start:ref');

  await ctx.reply(
    `📋 <b>Menu Utama Bot</b>\n\nPilih salah satu menu di bawah ini:`,
    { parse_mode: 'HTML', reply_markup: keyboard }
  );
});

// Callback handler untuk tombol [🔗 Ajak Teman]
startComposer.callbackQuery('start:ref', async ctx => {
  await ctx.answerCallbackQuery();
  const botInfo = await ctx.api.getMe();
  const refLink = `https://t.me/${botInfo.username}?start=${ctx.from.id}`;
  const totalRefs = userRepository.countReferrals(ctx.from.id);

  const refText =
    `🔗 <b>Program Referral Bot</b>\n\n` +
    `Bagikan link referral Anda untuk mendapatkan koin unduhan gratis!\n\n` +
    `• <b>Link Referral Anda:</b>\n<code>${refLink}</code>\n\n` +
    `🎁 <b>Bonus Hadiah:</b> Setiap teman baru bergabung, Anda mendapat <b>+${config.coinReferralBonus} Koin</b> (+10 EXP).\n` +
    `👥 <b>Total Teman Terundang:</b> ${totalRefs} pengguna`;

  await ctx.reply(refText, { parse_mode: 'HTML' });
});

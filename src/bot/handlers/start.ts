import { Composer } from 'grammy';
import { MyContext } from '../context.js';
import { userRepository } from '../../database/repositories/userRepository.js';
import { config } from '../../config/config.js';
import { escapeHtml } from '../../utils/format.js';

export const startComposer = new Composer<MyContext>();

startComposer.command('start', async ctx => {
  const from = ctx.from;
  if (!from) return;

  const refPayload = ctx.match?.trim();
  let referrerId: number | undefined;

  if (refPayload) {
    const parsedRef = parseInt(refPayload, 10);
    if (!isNaN(parsedRef) && parsedRef !== from.id) {
      referrerId = parsedRef;
    }
  }

  const { user, isNew } = userRepository.getOrCreateUser(from.id, from.username, referrerId);

  // Jika user baru dan menggunakan kode referral, beri bonus ke pengajak
  if (isNew && referrerId) {
    const referrer = userRepository.getUser(referrerId);
    if (referrer) {
      const currentLimit = userRepository.getEffectiveLimit(referrer);
      userRepository.setCustomLimit(referrerId, currentLimit + config.referralBonusLimit);

      // Kirim notifikasi ke pengajak
      const inviterName = escapeHtml(from.username ? `@${from.username}` : from.first_name);
      await ctx.api.sendMessage(
        referrerId,
        `🎉 <b>Teman Baru Bergabung!</b>\nPengguna ${inviterName} mendaftar melalui link referral Anda.\nAnda mendapatkan bonus kuota <b>+${config.referralBonusLimit} unduhan</b>!`,
        { parse_mode: 'HTML' }
      ).catch(() => {});
    }
  }

  const roleBadge = user.role === 'admin' ? '👑 Admin' : user.role === 'vip' ? '🌟 VIP' : '👤 Free User';
  const effectiveLimit = userRepository.getEffectiveLimit(user);
  const remainingLimit = Math.max(0, effectiveLimit - user.daily_usage);

  const welcomeText = 
    `👋 <b>Halo, ${escapeHtml(from.first_name)}!</b>\n\n` +
    `Selamat datang di <b>Multi-Platform Downloader & STB Bot</b>.\n` +
    `Kirimkan link media video, audio, foto, atau album untuk langsung diunduh secara instan!\n\n` +
    `📊 <b>Status Akun:</b> ${roleBadge}\n` +
    `⚡ <b>Sisa Kuota Hari Ini:</b> ${remainingLimit} / ${effectiveLimit} unduhan\n\n` +
    `🌐 <b>Platform yang Didukung:</b>\n` +
    `• YouTube (Video 720p / 360p & Audio MP3)\n` +
    `• TikTok (Video No Watermark & Audio)\n` +
    `• Instagram (Reels, Post Video, Foto & Album Carousel)\n` +
    `• X / Twitter (Video, MP3 & Foto Multi-Image)\n` +
    `• Threads (Video & Album Foto)\n` +
    `• Facebook (Video & Reels)\n` +
    `• Reddit (Video & Galeri Foto)\n` +
    `• Pinterest (Video Pin & Gambar)\n` +
    `• Bilibili / Bstation (Video Anime & Drama)\n\n` +
    `Ketik /help untuk panduan lengkap atau /profile untuk melihat akun Anda.`;

  await ctx.reply(welcomeText, { parse_mode: 'HTML' });
});

startComposer.command('help', async ctx => {
  const helpText =
    `📖 <b>Panduan Penggunaan Bot</b>\n\n` +
    `1. <b>Cara Mengunduh Media:</b>\n` +
    `   Cukup salin dan tempelkan tautan dari YouTube, TikTok, Instagram, X/Twitter, Threads, Facebook, Reddit, Pinterest, atau Bilibili ke obrolan ini.\n` +
    `   Pilih format yang diinginkan (Video, Audio MP3, atau Foto/Album).\n\n` +
    `2. <b>Daftar Perintah Pengguna:</b>\n` +
    `   • /start - Menampilkan pesan awal dan info status.\n` +
    `   • /profile - Melihat detail profil, sisa kuota, dan masa aktif VIP.\n` +
    `   • /ref - Mendapatkan link referral unik untuk menambah kuota.\n` +
    `   • /help - Menampilkan panduan ini.\n\n` +
    `3. <b>Upgrade Akun VIP:</b>\n` +
    `   Ingin kuota lebih besar tanpa batas kecepatan? Kirim foto bukti pembayaran transfer ke bot ini. Admin akan segera memverifikasinya!\n\n` +
    `⚠️ <i>Catatan:</i> Maksimal ukuran file video yang didukung Telegram adalah 50 MB. Video berukuran lebih besar dapat diunduh dalam versi Audio MP3.`;

  await ctx.reply(helpText, { parse_mode: 'HTML' });
});

startComposer.command('profile', async ctx => {
  if (!ctx.user) return;

  const user = userRepository.getUser(ctx.user.telegram_id)!;
  const roleBadge = user.role === 'admin' ? '👑 Admin' : user.role === 'vip' ? '🌟 VIP' : '👤 Free User';
  const effectiveLimit = userRepository.getEffectiveLimit(user);
  const remaining = Math.max(0, effectiveLimit - user.daily_usage);
  const totalRefs = userRepository.countReferrals(user.telegram_id);

  let vipInfo = '';
  if (user.role === 'vip' && user.vip_expires_at) {
    const exp = new Date(user.vip_expires_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    vipInfo = `\n⏳ <b>Masa Aktif VIP Sampai:</b> ${exp}`;
  }

  const profileText =
    `👤 <b>Profil Pengguna</b>\n\n` +
    `• <b>ID Telegram:</b> <code>${user.telegram_id}</code>\n` +
    `• <b>Username:</b> @${escapeHtml(user.username || '-')}\n` +
    `• <b>Tipe Akun:</b> ${roleBadge}${vipInfo}\n` +
    `• <b>Penggunaan Hari Ini:</b> ${user.daily_usage} / ${effectiveLimit} unduhan\n` +
    `• <b>Sisa Kuota Hari Ini:</b> <b>${remaining} unduhan</b>\n` +
    `• <b>Teman yang Diundang:</b> ${totalRefs} orang\n\n` +
    `💡 <i>Ajak teman bergabung menggunakan /ref untuk mendapatkan tambahan bonus kuota!</i>`;

  await ctx.reply(profileText, { parse_mode: 'HTML' });
});

startComposer.command('ref', async ctx => {
  if (!ctx.user) return;

  const botInfo = await ctx.api.getMe();
  const refLink = `https://t.me/${botInfo.username}?start=${ctx.user.telegram_id}`;
  const totalRefs = userRepository.countReferrals(ctx.user.telegram_id);

  const refText =
    `🔗 <b>Program Referral Bot</b>\n\n` +
    `Bagikan link referral Anda kepada teman atau grup untuk mendapatkan kuota unduhan tambahan!\n\n` +
    `• <b>Link Referral Anda:</b>\n<code>${refLink}</code>\n\n` +
    `🎁 <b>Bonus:</b> Setiap pengguna baru yang bergabung melalui link Anda, Anda akan mendapatkan <b>+${config.referralBonusLimit} kuota unduhan</b>.\n` +
    `👥 <b>Total Teman Terundang:</b> ${totalRefs} pengguna`;

  await ctx.reply(refText, { parse_mode: 'HTML' });
});

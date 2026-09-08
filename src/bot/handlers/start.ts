import { Composer } from 'grammy';
import { MyContext } from '../context.js';
import { userRepository } from '../../database/repositories/userRepository.js';
import { config } from '../../config/config.js';

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
      await ctx.api.sendMessage(
        referrerId,
        `🎉 **Teman Baru Bergabung!**\nPengguna @${from.username || from.id} mendaftar melalui link referral Anda.\nAnda mendapatkan bonus kuota **+${config.referralBonusLimit} unduhan**!`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    }
  }

  const roleBadge = user.role === 'admin' ? '👑 Admin' : user.role === 'vip' ? '🌟 VIP' : '👤 Free User';
  const effectiveLimit = userRepository.getEffectiveLimit(user);
  const remainingLimit = Math.max(0, effectiveLimit - user.daily_usage);

  const welcomeText = 
    `👋 **Halo, ${from.first_name}!**\n\n` +
    `Selamat datang di **Multi-Platform Downloader & STB Bot**.\n` +
    `Kirimkan link media video/audio untuk langsung diunduh secara instan!\n\n` +
    `📊 **Status Akun:** ${roleBadge}\n` +
    `⚡ **Sisa Kuota Hari Ini:** ${remainingLimit} / ${effectiveLimit} unduhan\n\n` +
    `🌐 **Platform yang Didukung:**\n` +
    `• YouTube (Video 720p / 360p & Audio MP3)\n` +
    `• TikTok (Video No Watermark & Audio)\n` +
    `• Instagram (Reels / Post / Stories)\n` +
    `• X / Twitter (Video & MP3)\n` +
    `• Threads\n\n` +
    `Ketik /help untuk panduan lengkap atau /profile untuk melihat akun Anda.`;

  await ctx.reply(welcomeText, { parse_mode: 'Markdown' });
});

startComposer.command('help', async ctx => {
  const helpText =
    `📖 **Panduan Penggunaan Bot**\n\n` +
    `1. **Cara Mengunduh Media:**\n` +
    `   Cukup salin dan tempelkan tautan video dari YouTube, TikTok, Instagram, X/Twitter, atau Threads ke obrolan ini.\n` +
    `   Pilih format yang diinginkan (Video atau Audio MP3).\n\n` +
    `2. **Daftar Perintah Pengguna:**\n` +
    `   • /start - Menampilkan pesan awal dan info status.\n` +
    `   • /profile - Melihat detail profil, sisa kuota, dan masa aktif VIP.\n` +
    `   • /ref - Mendapatkan link referral unik untuk menambah kuota.\n` +
    `   • /help - Menampilkan panduan ini.\n\n` +
    `3. **Upgrade Akun VIP:**\n` +
    `   Ingin kuota lebih besar tanpa batas kecepatan? Kirim foto bukti pembayaran transfer ke bot ini. Admin akan segera memverifikasinya!\n\n` +
    `⚠️ *Catatan:* Maksimal ukuran file video yang didukung Telegram adalah 50 MB. Video berukuran lebih besar dapat diunduh dalam versi Audio MP3.`;

  await ctx.reply(helpText, { parse_mode: 'Markdown' });
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
    vipInfo = `\n⏳ **Masa Aktif VIP Sampai:** ${exp}`;
  }

  const profileText =
    `👤 **Profil Pengguna**\n\n` +
    `• **ID Telegram:** \`${user.telegram_id}\`\n` +
    `• **Username:** @${user.username || '-'}\n` +
    `• **Tipe Akun:** ${roleBadge}${vipInfo}\n` +
    `• **Penggunaan Hari Ini:** ${user.daily_usage} / ${effectiveLimit} unduhan\n` +
    `• **Sisa Kuota Hari Ini:** **${remaining} unduhan**\n` +
    `• **Teman yang Diundang:** ${totalRefs} orang\n\n` +
    `💡 *Ajak teman bergabung menggunakan /ref untuk mendapatkan tambahan bonus kuota!*`;

  await ctx.reply(profileText, { parse_mode: 'Markdown' });
});

startComposer.command('ref', async ctx => {
  if (!ctx.user) return;

  const botInfo = await ctx.api.getMe();
  const refLink = `https://t.me/${botInfo.username}?start=${ctx.user.telegram_id}`;
  const totalRefs = userRepository.countReferrals(ctx.user.telegram_id);

  const refText =
    `🔗 **Program Referral Bot**\n\n` +
    `Bagikan link referral Anda kepada teman atau grup untuk mendapatkan kuota unduhan tambahan!\n\n` +
    `• **Link Referral Anda:**\n\`${refLink}\`\n\n` +
    `🎁 **Bonus:** Setiap pengguna baru yang bergabung melalui link Anda, Anda akan mendapatkan **+${config.referralBonusLimit} kuota unduhan**.\n` +
    `👥 **Total Teman Terundang:** ${totalRefs} pengguna`;

  await ctx.reply(refText, { parse_mode: 'Markdown' });
});

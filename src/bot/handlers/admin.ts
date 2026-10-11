import { Composer, InlineKeyboard, InputFile } from 'grammy';
import { MyContext } from '../context.js';
import { config } from '../../config/config.js';
import { systemService } from '../../services/systemService.js';
import { downloaderService } from '../../services/downloaderService.js';
import { userRepository } from '../../database/repositories/userRepository.js';
import { downloadRepository } from '../../database/repositories/downloadRepository.js';
import { donationRepository } from '../../database/repositories/donationRepository.js';
import { feedbackRepository } from '../../database/repositories/feedbackRepository.js';
import fs from 'fs';
import path from 'path';

export const adminComposer = new Composer<MyContext>();

// Middleware otentikasi Admin untuk semua handler di adminComposer
adminComposer.use(async (ctx, next) => {
  const from = ctx.from;
  if (!from || !config.isAdmin(from.id)) {
    // Jika bukan admin dan mencoba command admin, abaikan atau beri pesan
    if (ctx.message?.text?.startsWith('/health') || 
        ctx.message?.text?.startsWith('/stats') ||
        ctx.message?.text?.startsWith('/backup') ||
        ctx.message?.text?.startsWith('/reboot') ||
        ctx.message?.text?.startsWith('/cleancache') ||
        ctx.message?.text?.startsWith('/speedtest') ||
        ctx.message?.text?.startsWith('/updatedlp') ||
        ctx.message?.text?.startsWith('/broadcast') ||
        ctx.message?.text?.startsWith('/addvip') ||
        ctx.message?.text?.startsWith('/delvip') ||
        ctx.message?.text?.startsWith('/ban') ||
        ctx.message?.text?.startsWith('/unban') ||
        ctx.message?.text?.startsWith('/addexp') ||
        ctx.message?.text?.startsWith('/setexp') ||
        ctx.message?.text?.startsWith('/addkoin') ||
        ctx.message?.text?.startsWith('/delkoin') ||
        ctx.message?.text?.startsWith('/setkoin') ||
        ctx.message?.text?.startsWith('/setlimit')) {
      await ctx.reply('⛔ Perintah ini khusus untuk Admin.');
      return;
    }
    return next();
  }
  return next();
});

// 1. /health - Monitoring Performa Server
adminComposer.command('health', async ctx => {
  const statusMsg = await ctx.reply('⏳ Mengumpulkan metrik sistem server...');
  try {
    const health = await systemService.getHealth();

    const tempEmoji = (health.cpuTempC || 0) > 70 ? '🔥' : '❄️';
    const ramEmoji = health.ramUsedPercent > 80 ? '⚠️' : '📊';

    const healthText =
      `🖥 **Status & Kesehatan Server (${health.osName})**\n\n` +
      `${tempEmoji} **Suhu CPU:** ${health.cpuTempC !== null ? `${health.cpuTempC} °C` : 'N/A (Virtual/No Sensor)'}\n` +
      `⚡ **Beban CPU:** ${health.cpuLoadPercent}%\n` +
      `${ramEmoji} **Penggunaan RAM:** ${health.ramUsedMb} MB / ${health.ramTotalMb} MB (${health.ramUsedPercent}%)\n` +
      `💾 **Kapasitas Disk (Tmp):** Sisa ${health.tmpDiskFreeMb} MB dari ${health.tmpDiskTotalMb} MB (${health.tmpDiskUsedPercent}% terpakai)\n` +
      `⏱ **System Uptime:** ${health.uptimeFormatted}\n` +
      `📁 **Path Tmp:** \`${config.tmpDir}\``;

    await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, healthText, { parse_mode: 'Markdown' });
  } catch (err: any) {
    await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `❌ Gagal mengambil data sistem: ${err.message}`);
  }
});

// 2. /stats - Analitik Bot & Pengunduhan
adminComposer.command('stats', async ctx => {
  const userStats = userRepository.getUserStats();
  const dlStats = downloadRepository.getStats();
  const todayCount = downloadRepository.getTodayCount();
  const donationStats = donationRepository.getStats();
  const fbStats = feedbackRepository.getStats();

  let platformBreakdown = '';
  for (const [plat, count] of Object.entries(dlStats.byPlatform)) {
    platformBreakdown += `• ${plat.toUpperCase()}: ${count}\n`;
  }
  if (!platformBreakdown) platformBreakdown = '• Belum ada transaksi\n';

  const formattedRev = new Intl.NumberFormat('id-ID').format(donationStats.totalRevenue);

  const statsText =
    `📈 **Statistik Bot & Pengunduhan**\n\n` +
    `👥 **Statistik Pengguna:**\n` +
    `• Total Pengguna: ${userStats.total}\n` +
    `• Sahabat Dermawan (VIP): ${userStats.vip}\n` +
    `• Pengguna Diblokir: ${userStats.banned}\n` +
    `• Total Admin: ${userStats.admins}\n\n` +
    `💖 **Statistik Dukungan Donasi Komunitas (QRIS):**\n` +
    `• Total Donasi Terkumpul: Rp ${formattedRev}\n` +
    `• Donasi Berhasil: ${donationStats.totalSuccess} donasi\n\n` +
    `📬 **Masukan & Kendala Komunitas:**\n` +
    `• Total Masukan: ${fbStats.total} (💡 ${fbStats.suggestions} saran, 🚨 ${fbStats.bugs} bug)\n` +
    `• Status: ⏳ ${fbStats.pending} pending, 👀 ${fbStats.read} dibaca, ✅ ${fbStats.resolved} selesai\n\n` +
    `📥 **Statistik Unduhan:**\n` +
    `• Unduhan Hari Ini: ${todayCount}\n` +
    `• Total Seluruh Unduhan: ${dlStats.totalDownloads}\n\n` +
    `🌐 **Berdasarkan Platform:**\n${platformBreakdown}`;

  await ctx.reply(statsText, { parse_mode: 'Markdown' });
});

// 3. /backup - Mengunduh file database SQLite
adminComposer.command('backup', async ctx => {
  const dbFile = path.resolve(config.databasePath);
  if (!fs.existsSync(dbFile)) {
    await ctx.reply('❌ File database SQLite tidak ditemukan.');
    return;
  }

  const statusMsg = await ctx.reply('📦 Menyiapkan file backup database...');
  try {
    const backupName = `backup_bot_${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
    const inputFile = new InputFile(dbFile, backupName);

    await ctx.replyWithDocument(inputFile, {
      caption: `💾 **Backup Database SQLite**\nTanggal: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
      parse_mode: 'Markdown'
    });
    await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
  } catch (err: any) {
    await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `❌ Gagal mengirim backup: ${err.message}`);
  }
});

// 4. /cleancache - Melegakan RAM di Server (Linux drop_caches)
adminComposer.command('cleancache', async ctx => {
  const result = await systemService.cleanCache();
  await ctx.reply(result.message);
});

// 5. /speedtest - Uji kecepatan jaringan Server
adminComposer.command('speedtest', async ctx => {
  const statusMsg = await ctx.reply('⚡ Sedang menguji kecepatan jaringan server (10MB payload)...');
  const result = await systemService.runSimpleSpeedtest();
  await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, result, { parse_mode: 'Markdown' });
});

// 6. /reboot - Restart Server Jarak Jauh
adminComposer.command('reboot', async ctx => {
  const keyboard = new InlineKeyboard()
    .text('⚠️ Ya, Reboot Server Sekarang', 'confirm_reboot')
    .text('❌ Batal', 'cancel_reboot');

  await ctx.reply(
    '⚠️ **Konfirmasi Reboot Server**\nApakah Anda yakin ingin me-restart sistem server? Bot akan offline selama proses boot berlangsung.',
    { reply_markup: keyboard, parse_mode: 'Markdown' }
  );
});

adminComposer.callbackQuery('confirm_reboot', async ctx => {
  if (!config.isAdmin(ctx.from.id)) return;
  await ctx.answerCallbackQuery({ text: 'Memulai proses reboot...' });
  await ctx.editMessageText('🔄 Menjalankan reboot sistem server...');
  const result = await systemService.reboot();
  await ctx.reply(result.message);
});

adminComposer.callbackQuery('cancel_reboot', async ctx => {
  await ctx.answerCallbackQuery({ text: 'Reboot dibatalkan' });
  await ctx.editMessageText('✅ Perintah reboot dibatalkan.');
});

// 7. /updatedlp - Update binary yt-dlp secara mandiri
adminComposer.command('updatedlp', async ctx => {
  const statusMsg = await ctx.reply('🔄 Menjalankan `yt-dlp -U`...');
  try {
    const output = await downloaderService.updateYtDlp();
    await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `✅ **Hasil Update yt-dlp:**\n\`\`\`\n${output}\n\`\`\``, { parse_mode: 'Markdown' });
  } catch (err: any) {
    await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, `❌ Gagal update yt-dlp: ${err.message}`);
  }
});

// 8. /addvip <user_id> <hari>
adminComposer.command('addvip', async ctx => {
  const parts = ctx.match?.trim().split(/\s+/);
  if (!parts || parts.length < 2) {
    await ctx.reply('ℹ️ Format salah. Gunakan: `/addvip <user_id> <jumlah_hari>`\nContoh: `/addvip 123456789 30`', { parse_mode: 'Markdown' });
    return;
  }

  const targetId = parseInt(parts[0], 10);
  const days = parseInt(parts[1], 10);

  if (isNaN(targetId) || isNaN(days) || days <= 0) {
    await ctx.reply('❌ User ID atau jumlah hari tidak valid.');
    return;
  }

  const success = userRepository.setRole(targetId, 'vip', days);
  if (success) {
    await ctx.reply(`✅ Berhasil memberikan status VIP kepada user \`${targetId}\` selama ${days} hari.`, { parse_mode: 'Markdown' });
    await ctx.api.sendMessage(targetId, `🎉 Status akun Anda telah diubah menjadi VIP selama **${days} hari** oleh Admin.`, { parse_mode: 'Markdown' }).catch(() => {});
  } else {
    await ctx.reply('❌ User ID tidak ditemukan di database.');
  }
});

// 9. /delvip <user_id>
adminComposer.command('delvip', async ctx => {
  const targetId = parseInt(ctx.match?.trim() || '', 10);
  if (isNaN(targetId)) {
    await ctx.reply('ℹ️ Format salah. Gunakan: `/delvip <user_id>`', { parse_mode: 'Markdown' });
    return;
  }

  const success = userRepository.setRole(targetId, 'user');
  if (success) {
    await ctx.reply(`✅ Status VIP user \`${targetId}\` telah dicabut.`, { parse_mode: 'Markdown' });
  } else {
    await ctx.reply('❌ User ID tidak ditemukan di database.');
  }
});

// 10. /setlimit <user_id> <kuota>
adminComposer.command('setlimit', async ctx => {
  const parts = ctx.match?.trim().split(/\s+/);
  if (!parts || parts.length < 2) {
    await ctx.reply('ℹ️ Format salah. Gunakan: `/setlimit <user_id> <kuota>`', { parse_mode: 'Markdown' });
    return;
  }

  const targetId = parseInt(parts[0], 10);
  const limit = parseInt(parts[1], 10);

  if (isNaN(targetId) || isNaN(limit) || limit < 0) {
    await ctx.reply('❌ ID atau kuota tidak valid.');
    return;
  }

  const success = userRepository.setCustomLimit(targetId, limit);
  if (success) {
    await ctx.reply(`✅ Kuota khusus untuk user \`${targetId}\` berhasil diatur menjadi ${limit} unduhan/hari.`, { parse_mode: 'Markdown' });
  } else {
    await ctx.reply('❌ User ID tidak ditemukan di database.');
  }
});

// 10a. /addexp <user_id> <jumlah>
adminComposer.command('addexp', async ctx => {
  const parts = ctx.match?.trim().split(/\s+/);
  if (!parts || parts.length < 2) {
    await ctx.reply('ℹ️ Format salah. Gunakan: `/addexp <user_id> <jumlah>`\nContoh: `/addexp 123456789 100`', { parse_mode: 'Markdown' });
    return;
  }

  const targetId = parseInt(parts[0], 10);
  const amount = parseInt(parts[1], 10);

  if (isNaN(targetId) || isNaN(amount) || amount <= 0) {
    await ctx.reply('❌ ID atau jumlah EXP tidak valid.');
    return;
  }

  const user = userRepository.getUser(targetId);
  if (!user) {
    await ctx.reply('❌ User ID tidak ditemukan di database.');
    return;
  }

  userRepository.addExp(targetId, amount);
  const updated = userRepository.getUser(targetId)!;

  await ctx.reply(`✅ Berhasil menambahkan *+${amount} EXP* ke user \`${targetId}\`.\nTotal EXP sekarang: *${updated.exp} EXP*.`, { parse_mode: 'Markdown' });
  await ctx.api.sendMessage(targetId, `⭐ **Bonus EXP dari Admin!**\nAdmin telah menambahkan *+${amount} EXP* ke akun Anda.\nTotal EXP Anda saat ini: *${updated.exp} EXP*.`, { parse_mode: 'Markdown' }).catch(() => {});
});

// 10a2. /setexp <user_id> <jumlah>
adminComposer.command('setexp', async ctx => {
  const parts = ctx.match?.trim().split(/\s+/);
  if (!parts || parts.length < 2) {
    await ctx.reply('ℹ️ Format salah. Gunakan: `/setexp <user_id> <jumlah>`', { parse_mode: 'Markdown' });
    return;
  }

  const targetId = parseInt(parts[0], 10);
  const amount = parseInt(parts[1], 10);

  if (isNaN(targetId) || isNaN(amount) || amount < 0) {
    await ctx.reply('❌ ID atau jumlah EXP tidak valid.');
    return;
  }

  const user = userRepository.getUser(targetId);
  if (!user) {
    await ctx.reply('❌ User ID tidak ditemukan di database.');
    return;
  }

  userRepository.setExp(targetId, amount);
  await ctx.reply(`✅ EXP user \`${targetId}\` berhasil diatur menjadi *${amount} EXP*.`, { parse_mode: 'Markdown' });
});

// 10b. /addkoin <user_id> <jumlah>
adminComposer.command('addkoin', async ctx => {
  const parts = ctx.match?.trim().split(/\s+/);
  if (!parts || parts.length < 2) {
    await ctx.reply('ℹ️ Format salah. Gunakan: `/addkoin <user_id> <jumlah>`\nContoh: `/addkoin 123456789 500`', { parse_mode: 'Markdown' });
    return;
  }

  const targetId = parseInt(parts[0], 10);
  const amount = parseInt(parts[1], 10);

  if (isNaN(targetId) || isNaN(amount) || amount <= 0) {
    await ctx.reply('❌ ID atau jumlah koin tidak valid.');
    return;
  }

  const user = userRepository.getUser(targetId);
  if (!user) {
    await ctx.reply('❌ User ID tidak ditemukan di database.');
    return;
  }

  userRepository.addCoins(targetId, amount, 0);
  const updated = userRepository.getUser(targetId)!;

  await ctx.reply(`✅ Berhasil menambahkan *+${amount} Koin* ke user \`${targetId}\`.\nSaldo sekarang: *${updated.coins} Koin*.`, { parse_mode: 'Markdown' });
  await ctx.api.sendMessage(targetId, `🎉 **Bonus Koin dari Admin!**\nAdmin telah menambahkan *+${amount} Koin* ke akun Anda.\nSaldo koin Anda saat ini: *${updated.coins} Koin*.`, { parse_mode: 'Markdown' }).catch(() => {});
});

// 10c. /delkoin <user_id> <jumlah>
adminComposer.command('delkoin', async ctx => {
  const parts = ctx.match?.trim().split(/\s+/);
  if (!parts || parts.length < 2) {
    await ctx.reply('ℹ️ Format salah. Gunakan: `/delkoin <user_id> <jumlah>`', { parse_mode: 'Markdown' });
    return;
  }

  const targetId = parseInt(parts[0], 10);
  const amount = parseInt(parts[1], 10);

  if (isNaN(targetId) || isNaN(amount) || amount <= 0) {
    await ctx.reply('❌ ID atau jumlah koin tidak valid.');
    return;
  }

  const user = userRepository.getUser(targetId);
  if (!user) {
    await ctx.reply('❌ User ID tidak ditemukan di database.');
    return;
  }

  userRepository.deductCoins(targetId, amount);
  const updated = userRepository.getUser(targetId)!;

  await ctx.reply(`✅ Berhasil memotong *${amount} Koin* dari user \`${targetId}\`.\nSisa saldo: *${updated.coins} Koin*.`, { parse_mode: 'Markdown' });
});

// 10d. /setkoin <user_id> <jumlah>
adminComposer.command('setkoin', async ctx => {
  const parts = ctx.match?.trim().split(/\s+/);
  if (!parts || parts.length < 2) {
    await ctx.reply('ℹ️ Format salah. Gunakan: `/setkoin <user_id> <jumlah>`', { parse_mode: 'Markdown' });
    return;
  }

  const targetId = parseInt(parts[0], 10);
  const amount = parseInt(parts[1], 10);

  if (isNaN(targetId) || isNaN(amount) || amount < 0) {
    await ctx.reply('❌ ID atau jumlah koin tidak valid.');
    return;
  }

  const user = userRepository.getUser(targetId);
  if (!user) {
    await ctx.reply('❌ User ID tidak ditemukan di database.');
    return;
  }

  userRepository.setCoins(targetId, amount);
  await ctx.reply(`✅ Saldo koin user \`${targetId}\` berhasil diatur menjadi *${amount} Koin*.`, { parse_mode: 'Markdown' });
});

// 11. /ban & /unban
adminComposer.command('ban', async ctx => {
  const targetId = parseInt(ctx.match?.trim() || '', 10);
  if (isNaN(targetId)) {
    await ctx.reply('ℹ️ Gunakan: `/ban <user_id>`', { parse_mode: 'Markdown' });
    return;
  }

  const success = userRepository.setBanned(targetId, true);
  if (success) {
    await ctx.reply(`🚫 User \`${targetId}\` telah diblokir.`, { parse_mode: 'Markdown' });
  } else {
    await ctx.reply('❌ User ID tidak ditemukan di database.');
  }
});

adminComposer.command('unban', async ctx => {
  const targetId = parseInt(ctx.match?.trim() || '', 10);
  if (isNaN(targetId)) {
    await ctx.reply('ℹ️ Gunakan: `/unban <user_id>`', { parse_mode: 'Markdown' });
    return;
  }

  const success = userRepository.setBanned(targetId, false);
  if (success) {
    await ctx.reply(`✅ Blokir untuk user \`${targetId}\` telah dibuka.`, { parse_mode: 'Markdown' });
  } else {
    await ctx.reply('❌ User ID tidak ditemukan di database.');
  }
});

// 12. /broadcast <pesan> - Kirim pesan masal dengan batch throttling (anti-flood)
adminComposer.command('broadcast', async ctx => {
  const message = ctx.match?.trim();
  if (!message) {
    await ctx.reply('ℹ️ Format salah. Gunakan: `/broadcast <pesan pengumuman>`', { parse_mode: 'Markdown' });
    return;
  }

  const userIds = userRepository.getAllUserIds();
  const statusMsg = await ctx.reply(`📢 Memulai pengiriman siaran ke ${userIds.length} pengguna...`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < userIds.length; i++) {
    const uid = userIds[i];
    try {
      await ctx.api.sendMessage(uid, `📢 **PENGUMUMAN DARI ADMIN**\n\n${message}`, { parse_mode: 'Markdown' });
      successCount++;
    } catch (err) {
      failCount++;
    }

    // Beri jeda setiap 25 pesan untuk mematuhi rate limit Telegram (maks 30 msg/s)
    if ((i + 1) % 25 === 0) {
      await new Promise(res => setTimeout(res, 1000));
    }
  }

  await ctx.api.editMessageText(
    ctx.chat.id,
    statusMsg.message_id,
    `✅ **Siaran Selesai!**\n• Terkirim: ${successCount}\n• Gagal/Blokir: ${failCount}\n• Total Penerima: ${userIds.length}`,
    { parse_mode: 'Markdown' }
  );
});

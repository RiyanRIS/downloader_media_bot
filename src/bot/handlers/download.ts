import { Composer, InlineKeyboard, InputFile } from 'grammy';
import { MyContext } from '../context.js';
import { extractMediaUrl } from '../middlewares/urlDetector.js';
import { downloaderService, downloadQueue } from '../../services/downloaderService.js';
import { userRepository } from '../../database/repositories/userRepository.js';
import { downloadRepository } from '../../database/repositories/downloadRepository.js';

export const downloadComposer = new Composer<MyContext>();

// Menyimpan cache permintaan sementara untuk tombol inline pilihan format
interface PendingDownload {
  url: string;
  userId: number;
  platform: string;
  title: string;
  createdAt: number;
}

const pendingDownloads = new Map<string, PendingDownload>();

// Bersihkan pending downloads yang kedaluwarsa (> 5 menit)
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of pendingDownloads.entries()) {
    if (now - val.createdAt > 5 * 60 * 1000) {
      pendingDownloads.delete(key);
    }
  }
}, 60 * 1000);

// Listener pesan teks untuk mendeteksi link media
downloadComposer.on('message:text', async (ctx, next) => {
  const text = ctx.message.text.trim();

  // Abaikan jika berupa command bot (dimulai dengan /)
  if (text.startsWith('/')) {
    return next();
  }

  const url = extractMediaUrl(text);
  if (!url) {
    return next();
  }

  const from = ctx.from;
  if (!from || !ctx.user) return;

  const user = userRepository.getUser(from.id)!;

  // 1. Cek kuota harian pengguna
  const effectiveLimit = userRepository.getEffectiveLimit(user);
  if (user.daily_usage >= effectiveLimit) {
    await ctx.reply(
      `⚠️ **Kuota Harian Anda Telah Habis!**\n\n` +
      `Anda telah mencapai batas **${effectiveLimit} unduhan** hari ini.\n` +
      `Kuota akan direset otomatis setiap pukul 00:00 WIB.\n\n` +
      `💡 *Gunakan perintah /ref untuk mengajak teman dan mendapatkan kuota tambahan, atau kirim bukti transfer untuk upgrade ke VIP.*`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // 2. Kirim pesan live status awal
  const statusMsg = await ctx.reply('🔍 **Memeriksa tautan media...**', { parse_mode: 'Markdown' });

  try {
    // 3. Ekstraksi info awal & pre-check ukuran file
    const info = await downloaderService.getMediaInfo(url);
    const requestId = `${from.id}_${Date.now()}`;

    pendingDownloads.set(requestId, {
      url,
      userId: from.id,
      platform: info.platform,
      title: info.title,
      createdAt: Date.now()
    });

    const keyboard = new InlineKeyboard();

    if (info.isOverLimit) {
      // Jika ukuran video melebihi 48MB (batas Telegram)
      keyboard.text('🎧 Unduh Audio MP3 Saja', `dl:${requestId}:audio`);
      
      await ctx.api.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        `⚠️ **Peringatan Batas Ukuran:**\n\n` +
        `📹 **Judul:** ${info.title}\n` +
        `📦 **Estimasi Ukuran:** ~${info.filesizeApproxMb} MB\n\n` +
        `Telegram Bot API membatasi upload maksimal 50 MB. Video ini tidak dapat diunggah sebagai video utuh, namun Anda dapat mengunduh versi audionya:`,
        { reply_markup: keyboard, parse_mode: 'Markdown' }
      );
      return;
    }

    // Pilihan format berdasarkan platform
    if (info.platform === 'youtube') {
      keyboard
        .text('🎬 Video 720p', `dl:${requestId}:video_720p`)
        .text('🎬 Video 360p', `dl:${requestId}:video_360p`)
        .row()
        .text('🎧 Audio MP3', `dl:${requestId}:audio`);
    } else {
      keyboard
        .text('🎬 Unduh Video', `dl:${requestId}:video`)
        .text('🎧 Audio MP3', `dl:${requestId}:audio`);
    }

    const durationStr = info.duration ? `\n⏱ **Durasi:** ${Math.floor(info.duration / 60)}m ${info.duration % 60}s` : '';
    const sizeStr = info.filesizeApproxMb && info.filesizeApproxMb > 0 ? `\n📦 **Estimasi:** ~${info.filesizeApproxMb} MB` : '';

    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      `🎥 **Media Ditemukan:**\n` +
      `📌 **Judul:** ${info.title}${durationStr}${sizeStr}\n` +
      `🌐 **Platform:** ${info.platform.toUpperCase()}\n\n` +
      `Silakan pilih format yang ingin diunduh:`,
      { reply_markup: keyboard, parse_mode: 'Markdown' }
    );
  } catch (err: any) {
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      `❌ **Gagal memproses link:**\n${err.message || 'Tautan tidak valid atau media diprivat.'}`
    ).catch(() => {});
  }
});

// Callback Query ketika user menekan format unduhan
downloadComposer.callbackQuery(/^dl:([^:]+):([a-z0-9_]+)$/, async ctx => {
  const requestId = ctx.match[1];
  const formatChoice = ctx.match[2] as 'video' | 'audio' | 'video_360p' | 'video_720p';

  const pending = pendingDownloads.get(requestId);
  if (!pending) {
    await ctx.answerCallbackQuery({ text: 'Sesi unduhan telah kedaluwarsa. Silakan kirim ulang tautan.', show_alert: true });
    return;
  }

  // Pastikan hanya pengirim tautan yang dapat memilih format
  if (pending.userId !== ctx.from.id) {
    await ctx.answerCallbackQuery({ text: 'Tombol ini hanya untuk pengguna yang mengirimkan tautan!', show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery();
  pendingDownloads.delete(requestId);

  const statusMsgId = ctx.callbackQuery.message?.message_id;
  const chatId = ctx.chat?.id;
  if (!chatId || !statusMsgId) return;

  // Cek antrean p-limit
  const activeCount = downloadQueue.activeCount;
  const pendingQueueCount = downloadQueue.pendingCount;

  let queueNote = '';
  if (activeCount >= 2 || pendingQueueCount > 0) {
    queueNote = '\n*(Server sedang memproses unduhan lain, Anda berada dalam antrean...)*';
  }

  // Update status: Menunggu antrean / Mulai mengunduh
  await ctx.api.editMessageText(
    chatId,
    statusMsgId,
    `⏳ **[1/3] Menyiapkan Pengunduhan...**${queueNote}`,
    { parse_mode: 'Markdown', reply_markup: undefined }
  ).catch(() => {});

  let downloadResult: any = null;

  try {
    // Eksekusi download dalam batas antrean p-limit(2)
    const downloadPromise = downloaderService.downloadMedia(pending.url, formatChoice);

    // Ubah pesan menjadi proses download
    setTimeout(async () => {
      await ctx.api.editMessageText(
        chatId,
        statusMsgId,
        `⬇️ **[2/3] Mengunduh media dari ${pending.platform.toUpperCase()}...**\n*(Harap tunggu, proses ini membutuhkan waktu beberapa detik)*`,
        { parse_mode: 'Markdown' }
      ).catch(() => {});
    }, 1500);

    downloadResult = await downloadPromise;

    // Ubah pesan menjadi proses upload ke Telegram
    await ctx.api.editMessageText(
      chatId,
      statusMsgId,
      `⬆️ **[3/3] Mengunggah file ke Telegram...**`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});

    // Kirim file ke pengguna
    const inputFile = new InputFile(downloadResult.filePath, downloadResult.fileName);
    const caption = `🎬 **${pending.title}**\n\n🤖 Diunduh via @${ctx.me.username}`;

    if (downloadResult.mimeType === 'audio') {
      await ctx.replyWithAudio(inputFile, {
        caption,
        title: pending.title,
        parse_mode: 'Markdown'
      });
    } else {
      await ctx.replyWithVideo(inputFile, {
        caption,
        parse_mode: 'Markdown',
        supports_streaming: true
      });
    }

    // Catat riwayat unduhan & naikkan penggunaan kuota
    userRepository.incrementDailyUsage(pending.userId);
    downloadRepository.logDownload(
      pending.userId,
      pending.platform,
      pending.url,
      downloadResult.mimeType,
      downloadResult.fileSizeBytes
    );

    // Hapus pesan status progress agar obrolan tetap rapi
    await ctx.api.deleteMessage(chatId, statusMsgId).catch(() => {});
  } catch (err: any) {
    await ctx.api.editMessageText(
      chatId,
      statusMsgId,
      `❌ **Proses Pengunduhan Gagal:**\n${err.message || 'Terjadi kesalahan sistem saat mengunduh berkas.'}`
    ).catch(() => {});
  } finally {
    // Zero-persistence: Bersihkan file sementara dari direktori tmp
    if (downloadResult && typeof downloadResult.cleanup === 'function') {
      downloadResult.cleanup();
    }
  }
});

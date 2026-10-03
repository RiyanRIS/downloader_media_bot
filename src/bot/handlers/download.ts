import { Composer, InlineKeyboard, InputFile, InputMediaBuilder } from 'grammy';
import { MyContext } from '../context.js';
import { extractMediaUrl } from '../middlewares/urlDetector.js';
import { downloaderService, downloadQueue } from '../../services/downloaderService.js';
import { photoService, PhotoDownloadResult } from '../../services/photoService.js';
import { userRepository } from '../../database/repositories/userRepository.js';
import { downloadRepository } from '../../database/repositories/downloadRepository.js';
import { config } from '../../config/config.js';
import { escapeHtml } from '../../utils/format.js';

export const downloadComposer = new Composer<MyContext>();

// Menyimpan cache permintaan sementara untuk tombol inline pilihan format
interface PendingDownload {
  url: string;
  userId: number;
  platform: string;
  title: string;
  createdAt: number;
  mediaType?: 'video' | 'audio' | 'photo' | 'album';
  photoUrls?: string[];
  directDownloadUrl?: string;
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

  // 1. Cek biaya koin pengguna (VIP & Admin bebas unduh / 0 koin)
  const isPrivileged = user.role === 'admin' || user.role === 'vip';
  const downloadCost = isPrivileged ? 0 : config.coinCostDownload;

  if (!isPrivileged && user.coins < downloadCost) {
    const shortageKeyboard = new InlineKeyboard()
      .text('🎮 Main Game Cari Koin', 'game:nav:menu')
      .text('🎁 Klaim Harian', 'game:action:claim')
      .row()
      .text('💳 Beli Koin Instan (QRIS)', 'topup:menu')
      .text(`🔗 Ajak Teman (+${config.coinReferralBonus} Koin)`, 'start:ref');

    await ctx.reply(
      `⚠️ <b>Koin Anda Tidak Cukup!</b>\n\n` +
      `Untuk mengunduh media ini membutuhkan <b>${downloadCost} Koin</b>.\n` +
      `Saldo koin Anda saat ini: 💰 <b>${user.coins} Koin</b>.\n\n` +
      `<b>Cara mudah mendapatkan koin:</b>\n` +
      `• Mainkan mini-games seru di /games\n` +
      `• Klaim bonus koin harian di /claim\n` +
      `• Undang teman bergabung via /ref (+${config.coinReferralBonus} Koin)\n` +
      `• Beli koin cepat via QRIS otomatis di /topup`,
      { parse_mode: 'HTML', reply_markup: shortageKeyboard }
    );
    return;
  }

  // 2. Kirim pesan live status awal
  const statusMsg = await ctx.reply('🔍 <b>Memeriksa tautan media...</b>', { parse_mode: 'HTML' });

  try {
    // 3. Ekstraksi info awal & pre-check ukuran file
    const info = await downloaderService.getMediaInfo(url);
    const requestId = `${from.id}_${Date.now()}`;

    pendingDownloads.set(requestId, {
      url,
      userId: from.id,
      platform: info.platform,
      title: info.title,
      createdAt: Date.now(),
      mediaType: info.mediaType,
      photoUrls: info.photoUrls,
      directDownloadUrl: info.directDownloadUrl
    });

    const keyboard = new InlineKeyboard();

    if (info.mediaType === 'photo') {
      keyboard.text('🖼️ Unduh Foto', `dl:${requestId}:photo`);
    } else if (info.mediaType === 'album') {
      keyboard.text(`🖼️ Unduh Album (${info.photoUrls?.length || 0} Foto)`, `dl:${requestId}:album`);
    } else if (info.isOverLimit) {
      // Jika ukuran video melebihi 48MB (batas Telegram)
      const hasDirectUrl = Boolean(info.directDownloadUrl && info.platform !== 'youtube');

      if (hasDirectUrl) {
        keyboard.url('🌐 Unduh Langsung via Browser', info.directDownloadUrl!);
        keyboard.row();
      }
      keyboard.text('🎧 Unduh Audio MP3 Saja', `dl:${requestId}:audio`);

      let overLimitNote = '';
      if (hasDirectUrl) {
        overLimitNote =
          `Telegram Bot API membatasi upload maksimal 50 MB.\n\n` +
          `✨ <b>Solusi:</b> Anda dapat mengklik tombol <b>🌐 Unduh Langsung via Browser</b> di bawah untuk mengunduh video ukuran penuh langsung ke memori ponsel Anda tanpa membebani STB, atau unduh versi Audio MP3:`;
      } else if (info.platform === 'youtube') {
        overLimitNote =
          `Telegram Bot API membatasi upload maksimal 50 MB.\n\n` +
          `ℹ️ <i>Video YouTube ukuran penuh diproteksi IP oleh Google sehingga tidak dapat dibagikan via tautan langsung. Anda tetap dapat mengunduh versi audionya:</i>`;
      } else {
        overLimitNote =
          `Telegram Bot API membatasi upload maksimal 50 MB. Video ini tidak dapat diunggah sebagai video utuh, namun Anda dapat mengunduh versi audionya:`;
      }

      await ctx.api.editMessageText(
        ctx.chat.id,
        statusMsg.message_id,
        `⚠️ <b>Peringatan Batas Ukuran:</b>\n\n` +
        `📹 <b>Judul:</b> ${escapeHtml(info.title)}\n` +
        `📦 <b>Estimasi Ukuran:</b> ~${info.filesizeApproxMb} MB\n\n` +
        overLimitNote,
        { reply_markup: keyboard, parse_mode: 'HTML' }
      );
      return;
    } else if (info.platform === 'youtube') {
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

    const durationStr = info.duration ? `\n⏱ <b>Durasi:</b> ${Math.floor(info.duration / 60)}m ${info.duration % 60}s` : '';
    const sizeStr = info.filesizeApproxMb && info.filesizeApproxMb > 0 ? `\n📦 <b>Estimasi:</b> ~${info.filesizeApproxMb} MB` : '';
    const typeStr = info.mediaType === 'album'
      ? `\n🖼️ <b>Tipe:</b> Album Foto (${info.photoUrls?.length || 0} Foto)`
      : info.mediaType === 'photo'
      ? `\n🖼️ <b>Tipe:</b> Foto Tunggal`
      : '';

    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      `🎥 <b>Media Ditemukan:</b>\n` +
      `📌 <b>Judul:</b> ${escapeHtml(info.title)}${typeStr}${durationStr}${sizeStr}\n` +
      `🌐 <b>Platform:</b> ${info.platform.toUpperCase()}\n\n` +
      `Silakan pilih format yang ingin diunduh:`,
      { reply_markup: keyboard, parse_mode: 'HTML' }
    );
  } catch (err: any) {
    await ctx.api.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      `❌ <b>Gagal memproses link:</b>\n${escapeHtml(err.message || 'Tautan tidak valid atau media diprivat.')}`,
      { parse_mode: 'HTML' }
    ).catch(() => {});
  }
});

// Callback Query ketika user menekan format unduhan
downloadComposer.callbackQuery(/^dl:([^:]+):([a-z0-9_]+)$/, async ctx => {
  const requestId = ctx.match[1];
  const formatChoice = ctx.match[2] as 'video' | 'audio' | 'video_360p' | 'video_720p' | 'photo' | 'album';

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

  // Cek saldo koin sebelum memulai proses antrean download
  const currentUser = userRepository.getUser(pending.userId);
  const isPrivileged = currentUser?.role === 'admin' || currentUser?.role === 'vip';
  const downloadCost = isPrivileged ? 0 : config.coinCostDownload;

  if (!isPrivileged && currentUser && currentUser.coins < downloadCost) {
    await ctx.answerCallbackQuery({
      text: `⚠️ Koin tidak cukup! Butuh ${downloadCost} koin (Saldo Anda: ${currentUser.coins} koin). Ketik /topup untuk beli koin.`,
      show_alert: true
    });
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
    queueNote = '\n<i>(Server sedang memproses unduhan lain, Anda berada dalam antrean...)</i>';
  }

  // Update status: Menunggu antrean / Mulai mengunduh
  await ctx.api.editMessageText(
    chatId,
    statusMsgId,
    `⏳ <b>[1/3] Menyiapkan Pengunduhan...</b>${queueNote}`,
    { parse_mode: 'HTML', reply_markup: undefined }
  ).catch(() => {});

  // ==========================================
  // Cabang Penanganan Foto & Album Carousel
  // ==========================================
  if (formatChoice === 'photo' || formatChoice === 'album') {
    let photoResult: PhotoDownloadResult | null = null;
    try {
      await ctx.api.editMessageText(
        chatId,
        statusMsgId,
        `⬇️ <b>[2/3] Mengunduh foto dari ${pending.platform.toUpperCase()}...</b>`,
        { parse_mode: 'HTML' }
      ).catch(() => {});

      const targetUrls = pending.photoUrls && pending.photoUrls.length > 0
        ? pending.photoUrls
        : [pending.url];

      photoResult = await photoService.downloadPhotos(targetUrls);

      await ctx.api.editMessageText(
        chatId,
        statusMsgId,
        `⬆️ <b>[3/3] Mengunggah foto ke Telegram...</b>`,
        { parse_mode: 'HTML' }
      ).catch(() => {});

      // Potong koin dan beri reward EXP loyalitas
      if (!isPrivileged) {
        userRepository.deductCoins(pending.userId, downloadCost);
      }
      userRepository.addCoins(pending.userId, 0, 2);
      const userAfter = userRepository.getUser(pending.userId);
      const coinBadge = isPrivileged
        ? '🌟 <i>VIP Member (Gratis Unduh)</i>'
        : `💰 <b>Biaya:</b> ${downloadCost} Koin | <b>Sisa:</b> ${userAfter?.coins ?? 0} Koin (+2 EXP)`;

      const cleanTitle = escapeHtml(pending.title.slice(0, 900));
      const caption = `🖼️ <b>${cleanTitle}</b>\n\n${coinBadge}\n🤖 Diunduh via @${ctx.me.username}`;

      if (photoResult.photos.length === 1) {
        const single = photoResult.photos[0];
        const inputFile = new InputFile(single.filePath, single.fileName);
        try {
          await ctx.replyWithPhoto(inputFile, { caption, parse_mode: 'HTML' });
        } catch {
          await ctx.replyWithPhoto(inputFile, {
            caption: `🖼️ ${pending.title.slice(0, 900)}\n\n🤖 Diunduh via @${ctx.me.username}`
          });
        }
      } else {
        const photoBatches = photoService.chunkPhotos(photoResult.photos, 10);
        for (let bIdx = 0; bIdx < photoBatches.length; bIdx++) {
          const batch = photoBatches[bIdx];
          const mediaGroup = batch.map((item, idx) => {
            const inputFile = new InputFile(item.filePath, item.fileName);
            const isFirst = bIdx === 0 && idx === 0;
            return InputMediaBuilder.photo(inputFile, {
              caption: isFirst ? caption : undefined,
              parse_mode: isFirst ? 'HTML' : undefined
            });
          });
          await ctx.replyWithMediaGroup(mediaGroup);
        }
      }

      // Catat riwayat unduhan & naikkan penggunaan kuota
      const totalBytes = photoResult.photos.reduce((acc, p) => acc + p.fileSizeBytes, 0);
      userRepository.incrementDailyUsage(pending.userId);
      downloadRepository.logDownload(
        pending.userId,
        pending.platform,
        pending.url,
        formatChoice,
        totalBytes
      );

      // Hapus pesan status progress agar obrolan tetap rapi
      await ctx.api.deleteMessage(chatId, statusMsgId).catch(() => {});
    } catch (err: any) {
      await ctx.api.editMessageText(
        chatId,
        statusMsgId,
        `❌ <b>Proses Pengunduhan Gagal:</b>\n${escapeHtml(err.message || 'Gagal mengunduh foto.')}`,
        { parse_mode: 'HTML' }
      ).catch(() => {});
    } finally {
      if (photoResult && typeof photoResult.cleanup === 'function') {
        photoResult.cleanup();
      }
    }
    return;
  }

  let downloadResult: any = null;

  try {
    // Eksekusi download dalam batas antrean p-limit(2)
    const downloadPromise = downloaderService.downloadMedia(pending.url, formatChoice);

    // Ubah pesan menjadi proses download
    setTimeout(async () => {
      await ctx.api.editMessageText(
        chatId,
        statusMsgId,
        `⬇️ <b>[2/3] Mengunduh media dari ${pending.platform.toUpperCase()}...</b>\n<i>(Harap tunggu, proses ini membutuhkan waktu beberapa detik)</i>`,
        { parse_mode: 'HTML' }
      ).catch(() => {});
    }, 1500);

    downloadResult = await downloadPromise;

    // Cek batas upload Telegram Bot API (50 MB)
    if (downloadResult.fileSizeBytes > 50 * 1024 * 1024) {
      const sizeMb = (downloadResult.fileSizeBytes / (1024 * 1024)).toFixed(1);
      const overLimitKb = new InlineKeyboard();
      if (pending.directDownloadUrl && pending.platform !== 'youtube') {
        overLimitKb.url('🌐 Unduh Langsung via Browser', pending.directDownloadUrl);
        overLimitKb.row();
      }
      overLimitKb.text('🎧 Unduh Audio MP3 Saja', `dl:${requestId}:audio`);

      await ctx.api.editMessageText(
        chatId,
        statusMsgId,
        `⚠️ <b>Ukuran File Melebihi Batas Telegram:</b>\n\n` +
        `File hasil unduhan berukuran <b>${sizeMb} MB</b>, sedangkan batas maksimal upload Telegram Bot API adalah <b>50 MB</b>.\n\n` +
        `💡 <i>Silakan gunakan tombol di bawah untuk mengunduh langsung ke browser ponsel Anda tanpa melalui server Telegram, atau pilih versi Audio MP3:</i>`,
        { reply_markup: overLimitKb, parse_mode: 'HTML' }
      ).catch(() => {});
      return;
    }

    // Ubah pesan menjadi proses upload ke Telegram
    await ctx.api.editMessageText(
      chatId,
      statusMsgId,
      `⬆️ <b>[3/3] Mengunggah file ke Telegram...</b>`,
      { parse_mode: 'HTML' }
    ).catch(() => {});

    // Potong koin dan beri reward EXP loyalitas
    if (!isPrivileged) {
      userRepository.deductCoins(pending.userId, downloadCost);
    }
    userRepository.addCoins(pending.userId, 0, 2);
    const userAfter = userRepository.getUser(pending.userId);
    const coinBadge = isPrivileged
      ? '🌟 <i>VIP Member (Gratis Unduh)</i>'
      : `💰 <b>Biaya:</b> ${downloadCost} Koin | <b>Sisa:</b> ${userAfter?.coins ?? 0} Koin (+2 EXP)`;

    // Kirim file ke pengguna
    const inputFile = new InputFile(downloadResult.filePath, downloadResult.fileName);
    const cleanTitle = escapeHtml(pending.title.slice(0, 900));
    const caption = `🎬 <b>${cleanTitle}</b>\n\n${coinBadge}\n🤖 Diunduh via @${ctx.me.username}`;

    if (downloadResult.mimeType === 'audio') {
      try {
        await ctx.replyWithAudio(inputFile, {
          caption,
          title: pending.title.slice(0, 200),
          parse_mode: 'HTML'
        });
      } catch (sendErr) {
        // Fallback plain text jika format HTML ditolak Telegram
        await ctx.replyWithAudio(inputFile, {
          caption: `🎬 ${pending.title.slice(0, 900)}\n\n🤖 Diunduh via @${ctx.me.username}`,
          title: pending.title.slice(0, 200)
        });
      }
    } else {
      try {
        await ctx.replyWithVideo(inputFile, {
          caption,
          parse_mode: 'HTML',
          supports_streaming: true
        });
      } catch (sendErr) {
        // Fallback plain text jika format HTML ditolak Telegram
        await ctx.replyWithVideo(inputFile, {
          caption: `🎬 ${pending.title.slice(0, 900)}\n\n🤖 Diunduh via @${ctx.me.username}`,
          supports_streaming: true
        });
      }
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
      `❌ <b>Proses Pengunduhan Gagal:</b>\n${escapeHtml(err.message || 'Terjadi kesalahan sistem saat mengunduh berkas.')}`,
      { parse_mode: 'HTML' }
    ).catch(() => {});
  } finally {
    // Zero-persistence: Bersihkan file sementara dari direktori tmp
    if (downloadResult && typeof downloadResult.cleanup === 'function') {
      downloadResult.cleanup();
    }
  }
});

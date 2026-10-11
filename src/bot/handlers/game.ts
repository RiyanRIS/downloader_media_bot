import { Composer, InlineKeyboard } from 'grammy';
import { MyContext } from '../context.js';
import { userRepository } from '../../database/repositories/userRepository.js';
import { getRandomQuiz, QUIZ_QUESTIONS } from '../../games/quizData.js';
import { getRandomTebakGambar, generateClue, TebakGambarItem } from '../../games/tebakGambarData.js';
import { getRandomFamily100, cleanAnswerText, Family100Item } from '../../games/family100Data.js';
import { sendTttMenu } from './tictactoe.js';
import { escapeHtml } from '../../utils/format.js';

export const gameComposer = new Composer<MyContext>();

// Helper sleep sederhana untuk menunggu animasi Telegram selesai
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Map sesi kuis pilihan ganda aktif
interface ActiveQuizSession {
  questionId: number;
  correctIndex: number;
  options: string[];
  createdAt: number;
}
const activeQuizzes = new Map<number, ActiveQuizSession>();

// Map sesi tebak gambar aktif per chat (bisa dimainkan di grup atau chat pribadi)
interface ActiveTebakGambarSession {
  chatId: number;
  userId: number;
  item: TebakGambarItem;
  startedAt: number;
  clueLevel: number;
  usedClue?: boolean;
  timeoutTimer: NodeJS.Timeout;
}
const activeTebakGambar = new Map<number, ActiveTebakGambarSession>();

// Map sesi game Family 100 aktif per chat (mendukung private chat maupun grup)
interface Family100AnswerItem {
  raw: string;
  clean: string;
  answeredBy?: string;
}

interface ActiveFamily100Session {
  chatId: number;
  starterUserId: number;
  starterName: string;
  soal: string;
  answers: Family100AnswerItem[];
  startedAt: number;
  timeoutTimer: NodeJS.Timeout;
}
const activeFamily100 = new Map<number, ActiveFamily100Session>();

export function getLevelBadge(exp: number): { level: number; title: string; emoji: string } {
  const level = Math.floor(exp / 100) + 1;
  if (level >= 50) return { level, title: 'Legenda', emoji: '⚡' };
  if (level >= 30) return { level, title: 'Sultan', emoji: '👑' };
  if (level >= 15) return { level, title: 'Pendekar', emoji: '🛡️' };
  if (level >= 5) return { level, title: 'Petualang', emoji: '⚔️' };
  return { level, title: 'Pemula', emoji: '🌱' };
}

// -------------------------------------------------------------
// 1. Dashboard Menu Utama Games (/games atau /game)
// -------------------------------------------------------------
gameComposer.command(['games', 'game'], async ctx => {
  if (!ctx.user) return;
  const user = userRepository.getUser(ctx.user.telegram_id);
  if (!user) return;

  const badge = getLevelBadge(user.exp);
  const winRate = user.games_played > 0 
    ? ((user.games_won / user.games_played) * 100).toFixed(1) 
    : '0';

  const menuText =
    `🎮 <b>Arena Permainan & Mini-Games</b>\n\n` +
    `Halo <b>${escapeHtml(ctx.from?.first_name)}</b>! Mainkan permainan untuk melatih otak, bersenang-senang, dan menaikkan <b>Level EXP Keaktifan</b> Anda!\n\n` +
    `⭐ <b>Level & EXP:</b> ${badge.emoji} Level ${badge.level} (${badge.title} — <code>${user.exp}</code> EXP)\n` +
    `🏆 <b>Statistik Main:</b> ${user.games_won} menang / ${user.games_played} main (${winRate}% win rate)\n\n` +
    `<b>Pilihan Permainan (100% Gratis):</b>\n` +
    `• ❌⭕ <b>Tic Tac Toe</b> (/ttt atau /tictactoe) — Duel 3x3 asah taktik vs Bot AI atau tantang teman!\n` +
    `• 👨‍👩‍👧‍👦 <b>Family 100</b> (/family100 atau /f100) — Tebak survei seru (+2 EXP per jawaban)!\n` +
    `• 🖼️ <b>Tebak Gambar</b> (/tebakgambar atau /tg) — Asah imajinasi tebak gambar (+5 EXP)!\n` +
    `• 🎲 <b>Dadu Keberuntungan</b> (/dice) — Lempar dadu seru adu angka lawan bot!\n` +
    `• 🎰 <b>Mesin Slot</b> (/slot) — Putar slot jackpot (Super 777: +25 EXP)!\n` +
    `• 🧩 <b>Kuis Tebak-Tebakan</b> (/tebak) — Asah logika dan teka-teki lucu (+5 EXP)!\n` +
    `• 💖 <b>Dukung Bot</b> (/dukung) — Berbagi rezeki & dukung pengembang via QRIS!`;

  const keyboard = new InlineKeyboard()
    .text('❌⭕ Tic Tac Toe', 'game:nav:ttt')
    .text('👨‍👩‍👧‍👦 Family 100', 'game:nav:family100')
    .row()
    .text('🖼️ Tebak Gambar', 'game:nav:tebakgambar')
    .text('🎲 Main Dadu', 'game:nav:dice')
    .row()
    .text('🎰 Putar Slot', 'game:nav:slot')
    .text('🧩 Kuis Pilihan Ganda', 'game:nav:quiz')
    .row()
    .text('🏆 Papan Peringkat EXP', 'game:action:leaderboard')
    .text('💖 Dukung Pengembang', 'topup:menu')
    .row()
    .text('📋 Menu Utama', 'start:mainmenu');

  await ctx.reply(menuText, { parse_mode: 'HTML', reply_markup: keyboard });
});

// -------------------------------------------------------------
// 2. Info Status EXP & Profil (/koin, /saldo, /dompet)
// -------------------------------------------------------------
gameComposer.command(['koin', 'saldo', 'dompet'], async ctx => {
  if (!ctx.user) return;
  const user = userRepository.getUser(ctx.user.telegram_id);
  if (!user) return;

  const badge = getLevelBadge(user.exp);
  const roleBadge = user.role === 'vip' ? '💖 Sahabat Dermawan' : user.role === 'admin' ? '👑 Admin' : '👤 Pengguna Aktif';
  const winRate = user.games_played > 0 ? ((user.games_won / user.games_played) * 100).toFixed(1) : '0';

  const text =
    `🎖️ <b>Profil Keaktifan & Statistik</b>\n\n` +
    `• <b>ID Pengguna:</b> <code>${user.telegram_id}</code>\n` +
    `• <b>Status Akun:</b> ${roleBadge}\n` +
    `• <b>Peringkat Keaktifan:</b> ${badge.emoji} Level ${badge.level} (${badge.title})\n` +
    `• <b>Total EXP:</b> ⭐ <b>${user.exp} EXP</b>\n` +
    `• <b>Total Permainan:</b> ${user.games_played} kali\n` +
    `• <b>Kemenangan:</b> ${user.games_won} kali (${winRate}% win rate)\n\n` +
    `✨ <i>Catatan: Sistem koin telah ditiadakan! Seluruh fitur unduhan media &amp; pencatatan keuangan kini 100% gratis digunakan. Kumpulkan EXP untuk menaikkan peringkat keaktifan Anda di papan leaderboard!</i>`;

  const keyboard = new InlineKeyboard()
    .text('🎁 Check-in Harian (+20 EXP)', 'game:action:claim')
    .text('🏆 Papan Peringkat EXP', 'game:action:leaderboard')
    .row()
    .text('🎮 Arena Games', 'game:nav:menu')
    .text('💖 Dukung Pengembang', 'topup:menu');

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
});

// -------------------------------------------------------------
// 3. Klaim Bonus Harian (/claim, /daily)
// -------------------------------------------------------------
gameComposer.command(['claim', 'daily'], async ctx => {
  if (!ctx.user) return;
  const res = userRepository.claimDailyBonus(ctx.user.telegram_id, 20);

  if (res.success) {
    const text =
      `🎁 <b>Check-in Harian Berhasil!</b>\n\n` +
      `Anda mendapatkan <b>+20 EXP</b> keaktifan hari ini!\n` +
      `Total EXP Anda sekarang: ⭐ <b>${res.currentExp} EXP</b>.\n\n` +
      `<i>Kembali lagi besok untuk mengklaim EXP berikutnya!</i>`;

    const keyboard = new InlineKeyboard()
      .text('🎲 Main Dadu', 'game:nav:dice')
      .text('🎰 Main Slot', 'game:nav:slot');

    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  } else {
    await ctx.reply(`⏳ <b>Info Check-in:</b>\n${res.message}`, { parse_mode: 'HTML' });
  }
});

// Set untuk mencegah spam klik selama animasi dadu/slot berlangsung
const activeRollers = new Set<number>();

// -------------------------------------------------------------
// Helper: Logika Permainan Dadu (Digunakan oleh Command & Tombol Repeat)
// -------------------------------------------------------------
async function playDiceGame(ctx: MyContext, userId: number, _betAmount?: number) {
  const chatId = ctx.chat?.id || ctx.from?.id;
  if (!chatId) return;

  if (activeRollers.has(userId)) {
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: '⏳ Tunggu lemparan saat ini selesai...', show_alert: true }).catch(() => {});
    } else {
      await ctx.api.sendMessage(chatId, '⏳ Tunggu lemparan saat ini selesai sebelum melempar lagi.').catch(() => {});
    }
    return;
  }

  const user = userRepository.getUser(userId);
  if (!user) return;

  activeRollers.add(userId);
  try {
    await ctx.api.sendMessage(chatId, `🎲 <b>Giliran Anda melempar dadu...</b>`, { parse_mode: 'HTML' });
    const userDice = await ctx.api.sendDice(chatId, '🎲');
    const userVal = userDice.dice.value;

    // Tunggu animasi dadu user (~2.2 detik)
    await sleep(2200);

    await ctx.api.sendMessage(chatId, `🤖 <b>Giliran Bot melempar dadu...</b>`, { parse_mode: 'HTML' });
    const botDice = await ctx.api.sendDice(chatId, '🎲');
    const botVal = botDice.dice.value;

    // Tunggu animasi dadu bot (~2.2 detik)
    await sleep(2200);

    let resultMsg = '';
    const keyboard = new InlineKeyboard()
      .text('🎲 Lempar Lagi', 'game:dice:repeat')
      .row()
      .text('🎮 Menu Games', 'game:nav:menu');

    if (userVal > botVal) {
      // Menang (+5 EXP)
      userRepository.recordGameResult(userId, true, 0, 5);
      const updated = userRepository.getUser(userId)!;
      resultMsg =
        `🎉 <b>SELAMAT ANDA MENANG!</b> 🎉\n\n` +
        `🎲 Skor Anda: <b>${userVal}</b>\n` +
        `🤖 Skor Bot: <b>${botVal}</b>\n\n` +
        `Hadiah: ⭐ <b>+5 EXP</b> keaktifan!\n` +
        `Total EXP Anda: <b>${updated.exp} EXP</b>.`;
    } else if (userVal === botVal) {
      // Seri (+2 EXP)
      userRepository.recordGameResult(userId, false, 0, 2);
      const updated = userRepository.getUser(userId)!;
      resultMsg =
        `🤝 <b>HASILNYA SERI!</b>\n\n` +
        `🎲 Skor Anda: <b>${userVal}</b>\n` +
        `🤖 Skor Bot: <b>${botVal}</b>\n\n` +
        `Hadiah: ⭐ <b>+2 EXP</b> keaktifan!\n` +
        `Total EXP: <b>${updated.exp} EXP</b>.`;
    } else {
      // Kalah (+1 EXP)
      userRepository.recordGameResult(userId, false, 0, 1);
      const updated = userRepository.getUser(userId)!;
      resultMsg =
        `😢 <b>KALI INI BOT LEBIH UNTUNG!</b>\n\n` +
        `🎲 Skor Anda: <b>${userVal}</b>\n` +
        `🤖 Skor Bot: <b>${botVal}</b>\n\n` +
        `Hadiah: ⭐ <b>+1 EXP</b> hiburan.\n` +
        `Total EXP Anda: <b>${updated.exp} EXP</b>. Ayo lempar lagi!`;
    }

    await ctx.api.sendMessage(chatId, resultMsg, { parse_mode: 'HTML', reply_markup: keyboard });
  } finally {
    activeRollers.delete(userId);
  }
}

// -------------------------------------------------------------
// Helper: Logika Permainan Mesin Slot (Digunakan oleh Command & Tombol Repeat)
// -------------------------------------------------------------
async function playSlotGame(ctx: MyContext, userId: number, _betAmount?: number) {
  const chatId = ctx.chat?.id || ctx.from?.id;
  if (!chatId) return;

  if (activeRollers.has(userId)) {
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: '⏳ Tunggu putaran saat ini selesai...', show_alert: true }).catch(() => {});
    } else {
      await ctx.api.sendMessage(chatId, '⏳ Tunggu putaran slot selesai sebelum memutar lagi.').catch(() => {});
    }
    return;
  }

  const user = userRepository.getUser(userId);
  if (!user) return;

  activeRollers.add(userId);
  try {
    await ctx.api.sendMessage(chatId, `🎰 <b>Memutar Mesin Slot...</b>`, { parse_mode: 'HTML' });
    const slotDice = await ctx.api.sendDice(chatId, '🎰');
    const slotVal = slotDice.dice.value;

    // Tunggu animasi reel slot selesai berputar (~2.5 detik)
    await sleep(2500);

    let expGain = 1;
    let statusText = '✨ <b>Putaran Selesai!</b>';

    if (slotVal === 64) {
      // 777
      expGain = 25;
      statusText = '🔥 <b>SUPER JACKPOT 777!</b> 🔥';
    } else if (slotVal === 1) {
      // Tiga BAR
      expGain = 15;
      statusText = '💎 <b>JACKPOT TRIPLE BAR!</b> 💎';
    } else if (slotVal === 22 || slotVal === 43) {
      // Tiga Buah Kembar
      expGain = 10;
      statusText = '🍒 <b>TRIPLE BUAH KEMBAR!</b> 🍒';
    } else if (slotVal % 4 === 0 || slotVal % 7 === 0) {
      // Dua simbol kembar
      expGain = 5;
      statusText = '⭐ <b>DUA SIMBOL KEMBAR!</b> ⭐';
    }

    userRepository.recordGameResult(userId, expGain > 1, 0, expGain);
    const updated = userRepository.getUser(userId)!;

    const keyboard = new InlineKeyboard()
      .text('🎰 Putar Lagi', 'game:slot:repeat')
      .row()
      .text('🎮 Menu Games', 'game:nav:menu');

    await ctx.api.sendMessage(
      chatId,
      `${statusText}\n\n` +
      `Hadiah: ⭐ <b>+${expGain} EXP</b> keaktifan!\n` +
      `Total EXP Anda: <b>${updated.exp} EXP</b>.`,
      { parse_mode: 'HTML', reply_markup: keyboard }
    );
  } finally {
    activeRollers.delete(userId);
  }
}

// -------------------------------------------------------------
// 4. Game Dadu Keberuntungan (/dice, /dadu)
// -------------------------------------------------------------
gameComposer.command(['dice', 'dadu'], async ctx => {
  if (!ctx.user) return;
  await playDiceGame(ctx, ctx.user.telegram_id);
});

// -------------------------------------------------------------
// 5. Game Mesin Slot (/slot, /jackpot)
// -------------------------------------------------------------
gameComposer.command(['slot', 'jackpot'], async ctx => {
  if (!ctx.user) return;
  await playSlotGame(ctx, ctx.user.telegram_id);
});

// -------------------------------------------------------------
// 6. Game Tebak Gambar Interaktif (/tebakgambar, /tg, /nyerah)
// -------------------------------------------------------------
gameComposer.command(['tebakgambar', 'tg'], async ctx => {
  const chatId = ctx.chat.id;
  const userId = ctx.from?.id || chatId;
  await startTebakGambarGame(ctx, chatId, userId);
});

gameComposer.command('nyerah', async ctx => {
  const chatId = ctx.chat.id;
  const session = activeTebakGambar.get(chatId);
  if (!session) {
    await ctx.reply('ℹ️ Tidak ada permainan Tebak Gambar yang sedang aktif di chat ini.');
    return;
  }
  clearTimeout(session.timeoutTimer);
  activeTebakGambar.delete(chatId);

  userRepository.recordGameResult(session.userId, false, 0, 0);

  const surrenderKeyboard = new InlineKeyboard()
    .text('🖼️ Coba Soal Lain', 'game:nav:tebakgambar')
    .row()
    .text('🎮 Menu Games', 'game:nav:menu');

  await ctx.reply(
    `🏳️ <b>Anda Menyerah!</b>\n\n` +
    `👉 Jawaban yang benar: <b>${session.item.jawaban}</b>\n` +
    `📝 Deskripsi: <i>${session.item.deskripsi}</i>\n\n` +
    `Yuk coba tebak gambar yang lain!`,
    { parse_mode: 'HTML', reply_markup: surrenderKeyboard }
  );
});

async function startTebakGambarGame(ctx: MyContext, chatId: number, userId: number) {
  if (activeFamily100.has(chatId)) {
    await ctx.api.sendMessage(
      chatId,
      '⚠️ <b>Masih ada permainan Family 100 yang sedang aktif di chat ini!</b>\nSelesaikan atau ketik /nyerah_f100 terlebih dahulu sebelum memulai Tebak Gambar.',
      { parse_mode: 'HTML' }
    );
    return;
  }

  const existing = activeTebakGambar.get(chatId);
  if (existing) {
    await ctx.api.sendMessage(
      chatId,
      `⚠️ <b>Masih ada permainan Tebak Gambar yang sedang aktif di chat ini!</b>\n` +
      `💡 Petunjuk: <code>${generateClue(existing.item.jawaban, existing.clueLevel)}</code>\n\n` +
      `Ketik jawaban Anda langsung di chat, atau ketik /nyerah jika menyerah.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  const item = getRandomTebakGambar();
  const initialClue = generateClue(item.jawaban, 1);
  const wordCount = item.jawaban.split(' ').length;
  const charCount = item.jawaban.replace(/\s+/g, '').length;

  const captionText =
    `🖼️ <b>TEBAK GAMBAR INTERAKTIF</b> 🖼️\n\n` +
    `Perhatikan gambar di atas dan tebak maknanya!\n\n` +
    `💡 <b>Petunjuk Huruf:</b>\n<code>${initialClue}</code>\n` +
    `📝 <b>Format:</b> ${wordCount} kata (${charCount} huruf)\n\n` +
    `🎁 <b>Hadiah:</b> ⭐ <b>+5 EXP</b> (atau <b>+3 EXP</b> jika menggunakan clue)\n` +
    `⏱️ <b>Waktu:</b> 30 detik\n\n` +
    `<i>Ketik jawaban Anda langsung di obrolan ini!</i>`;

  const keyboard = new InlineKeyboard()
    .text('💡 Bantuan Clue', `tg:clue:${chatId}`)
    .text('🏳️ Menyerah', `tg:surrender:${chatId}`);

  try {
    await ctx.api.sendPhoto(chatId, item.img, {
      caption: captionText,
      parse_mode: 'HTML',
      reply_markup: keyboard
    });
  } catch (err) {
    console.error('[TebakGambar] Gagal mengirim foto:', err);
    await ctx.api.sendMessage(chatId, '⚠️ Gagal memuat gambar tebak gambar. Silakan ketik /tebakgambar lagi.');
    return;
  }

  const timer = setTimeout(async () => {
    const cur = activeTebakGambar.get(chatId);
    if (cur && cur.item.index === item.index) {
      activeTebakGambar.delete(chatId);
      userRepository.recordGameResult(cur.userId, false, 0, 0);
      const timeoutKeyboard = new InlineKeyboard()
        .text('🖼️ Main Lagi', 'game:nav:tebakgambar')
        .row()
        .text('🎮 Menu Games', 'game:nav:menu');

      await ctx.api.sendMessage(
        chatId,
        `⏰ <b>WAKTU TEBAK GAMBAR HABIS (30 Detik)!</b>\n\n` +
        `👉 Jawaban yang benar: <b>${item.jawaban}</b>\n` +
        `📝 Deskripsi: <i>${item.deskripsi}</i>\n\n` +
        `Jangan patah semangat, ayo coba soal berikutnya!`,
        { parse_mode: 'HTML', reply_markup: timeoutKeyboard }
      ).catch(() => {});
    }
  }, 30000);

  activeTebakGambar.set(chatId, {
    chatId,
    userId,
    item,
    startedAt: Date.now(),
    clueLevel: 1,
    usedClue: false,
    timeoutTimer: timer
  });
}

// -------------------------------------------------------------
// Helper: Render Papan Jawaban Family 100
// -------------------------------------------------------------
function renderFamily100Board(session: ActiveFamily100Session, showAll = false): string {
  let text = `📋 <b>Papan Jawaban (Total: ${session.answers.length}):</b>\n`;
  session.answers.forEach((ans, idx) => {
    if (ans.answeredBy) {
      text += `<b>${idx + 1}.</b> ${escapeHtml(ans.raw)} <i>(ditebak oleh ${ans.answeredBy})</i>\n`;
    } else if (showAll) {
      text += `<b>${idx + 1}.</b> ${escapeHtml(ans.raw)} ❌\n`;
    } else {
      text += `<b>${idx + 1}.</b> <i>(Belum Tertebak)</i>\n`;
    }
  });
  return text;
}

// -------------------------------------------------------------
// 7. Game Family 100 Interaktif (/family100, /f100, /nyerah_f100)
// -------------------------------------------------------------
gameComposer.command(['family100', 'f100'], async ctx => {
  const chatId = ctx.chat.id;
  const userId = ctx.from?.id || chatId;
  const userName = escapeHtml(ctx.from?.username ? `@${ctx.from.username}` : ctx.from?.first_name || 'Pemain');
  await startFamily100Game(ctx, chatId, userId, userName);
});

gameComposer.command(['nyerah_f100', 'nyerahf100'], async ctx => {
  const chatId = ctx.chat.id;
  const session = activeFamily100.get(chatId);
  if (!session) {
    await ctx.reply('ℹ️ Tidak ada sesi Family 100 yang sedang aktif di chat ini.');
    return;
  }
  clearTimeout(session.timeoutTimer);
  activeFamily100.delete(chatId);

  const answeredCount = session.answers.filter(a => a.answeredBy).length;
  const fullBoard = renderFamily100Board(session, true);
  const endKeyboard = new InlineKeyboard()
    .text('👨‍👩‍👧‍👦 Main Lagi', 'game:nav:family100')
    .row()
    .text('🎮 Menu Games', 'game:nav:menu');

  if (answeredCount === 0) {
    userRepository.recordGameResult(session.starterUserId, false, 0, 0);
    await ctx.reply(
      `🏳️ <b>Menyerah di Game Family 100!</b>\n\n` +
      `❓ <i>"${escapeHtml(session.soal)}"</i>\n\n` +
      `Belum ada jawaban yang ditebak.\n\n` +
      `👉 <b>Berikut semua jawabannya:</b>\n${fullBoard}`,
      { parse_mode: 'HTML', reply_markup: endKeyboard }
    );
  } else {
    await ctx.reply(
      `🏳️ <b>Sesi Family 100 Diakhiri!</b>\n\n` +
      `❓ <i>"${escapeHtml(session.soal)}"</i>\n\n` +
      `Sebanyak <b>${answeredCount} dari ${session.answers.length}</b> jawaban berhasil ditebak.\n\n` +
      `👉 <b>Daftar Lengkap Jawaban:</b>\n${fullBoard}`,
      { parse_mode: 'HTML', reply_markup: endKeyboard }
    );
  }
});

async function startFamily100Game(ctx: MyContext, chatId: number, userId: number, userName: string) {
  if (activeTebakGambar.has(chatId)) {
    await ctx.api.sendMessage(
      chatId,
      '⚠️ <b>Masih ada permainan Tebak Gambar yang sedang aktif di chat ini!</b>\nSelesaikan atau ketik /nyerah terlebih dahulu sebelum memulai Family 100.',
      { parse_mode: 'HTML' }
    );
    return;
  }

  const existing = activeFamily100.get(chatId);
  if (existing) {
    const board = renderFamily100Board(existing);
    await ctx.api.sendMessage(
      chatId,
      `⚠️ <b>Permainan Family 100 masih aktif di chat ini!</b>\n\n` +
      `❓ <i>"${escapeHtml(existing.soal)}"</i>\n\n` +
      `${board}\n` +
      `Ketik tebakan Anda langsung di chat, atau ketik /nyerah_f100 jika ingin menyerah.`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  const item = getRandomFamily100();
  const answers: Family100AnswerItem[] = item.jawaban.map(raw => ({
    raw,
    clean: cleanAnswerText(raw)
  }));

  const timer = setTimeout(async () => {
    const cur = activeFamily100.get(chatId);
    if (!cur) return;
    activeFamily100.delete(chatId);

    const answeredCount = cur.answers.filter(a => a.answeredBy).length;
    const fullBoard = renderFamily100Board(cur, true);

    const endKeyboard = new InlineKeyboard()
      .text('👨‍👩‍👧‍👦 Main Lagi', 'game:nav:family100')
      .row()
      .text('🎮 Menu Games', 'game:nav:menu');

    if (answeredCount === 0) {
      userRepository.recordGameResult(cur.starterUserId, false, 0, 0);
      await ctx.api.sendMessage(
        chatId,
        `⏰ <b>WAKTU FAMILY 100 HABIS (60 Detik)!</b>\n\n` +
        `❓ <i>"${escapeHtml(cur.soal)}"</i>\n\n` +
        `❌ <b>Tidak ada satupun jawaban yang berhasil ditebak!</b>\n\n` +
        `👉 <b>Berikut survei lengkapnya:</b>\n${fullBoard}`,
        { parse_mode: 'HTML', reply_markup: endKeyboard }
      ).catch(() => {});
    } else {
      await ctx.api.sendMessage(
        chatId,
        `⏰ <b>WAKTU FAMILY 100 HABIS (60 Detik)!</b>\n\n` +
        `❓ <i>"${escapeHtml(cur.soal)}"</i>\n\n` +
        `Sebanyak <b>${answeredCount} dari ${cur.answers.length}</b> jawaban berhasil ditebak.\n\n` +
        `👉 <b>Daftar Lengkap Jawaban:</b>\n${fullBoard}`,
        { parse_mode: 'HTML', reply_markup: endKeyboard }
      ).catch(() => {});
    }
  }, 60000);

  const session: ActiveFamily100Session = {
    chatId,
    starterUserId: userId,
    starterName: userName,
    soal: item.soal,
    answers,
    startedAt: Date.now(),
    timeoutTimer: timer
  };

  activeFamily100.set(chatId, session);

  const initialBoard = renderFamily100Board(session);
  const msgText =
    `👨‍👩‍👧‍👦 <b>SURVEI MEMBUKTIKAN! (FAMILY 100)</b> 👨‍👩‍👧‍👦\n\n` +
    `❓ <b>Pertanyaan:</b>\n` +
    `<i>"${escapeHtml(item.soal)}"</i>\n\n` +
    `${initialBoard}\n` +
    `⏱️ <b>Waktu:</b> 60 detik\n` +
    `🎁 <b>Hadiah:</b> ⭐ <b>+2 EXP</b> per jawaban benar!\n\n` +
    `<i>Ketik jawaban survei Anda langsung di obrolan ini!</i>`;

  const keyboard = new InlineKeyboard()
    .text('🏳️ Menyerah', `f100:surrender:${chatId}`)
    .row()
    .text('🎮 Menu Games', 'game:nav:menu');

  await ctx.api.sendMessage(chatId, msgText, { parse_mode: 'HTML', reply_markup: keyboard });
}

// -------------------------------------------------------------
// 8. Game Kuis Tebak-Tebakan Interaktif (/tebak, /kuis)
// -------------------------------------------------------------
gameComposer.command(['tebak', 'kuis'], async ctx => {
  if (!ctx.user) return;
  await sendNewQuiz(ctx, ctx.user.telegram_id);
});

async function sendNewQuiz(ctx: MyContext, userId: number) {
  const quiz = getRandomQuiz();

  activeQuizzes.set(userId, {
    questionId: quiz.id,
    correctIndex: quiz.correctIndex,
    options: quiz.options,
    createdAt: Date.now()
  });

  const quizText =
    `🧩 <b>KUIS TEBAK-TEBAKAN SERU</b>\n\n` +
    `❓ <b>Pertanyaan:</b>\n<i>"${quiz.question}"</i>\n\n` +
    `Pilih jawaban yang menurut Anda paling tepat:\n` +
    `A. ${quiz.options[0]}\n` +
    `B. ${quiz.options[1]}\n` +
    `C. ${quiz.options[2]}\n` +
    `D. ${quiz.options[3]}\n\n` +
    `🎁 <i>Hadiah: ⭐ <b>+5 EXP</b> jika benar!</i>`;

  const keyboard = new InlineKeyboard()
    .text(`A. ${quiz.options[0].slice(0, 18)}`, `game:quiz:${userId}:${quiz.id}:0`)
    .text(`B. ${quiz.options[1].slice(0, 18)}`, `game:quiz:${userId}:${quiz.id}:1`)
    .row()
    .text(`C. ${quiz.options[2].slice(0, 18)}`, `game:quiz:${userId}:${quiz.id}:2`)
    .text(`D. ${quiz.options[3].slice(0, 18)}`, `game:quiz:${userId}:${quiz.id}:3`)
    .row()
    .text('🔄 Soal Lain', `game:quiz:surrender:${userId}`)
    .text('🎮 Menu Games', 'game:nav:menu');

  await ctx.reply(quizText, { parse_mode: 'HTML', reply_markup: keyboard });
}

export function renderCoinsLeaderboard(): { text: string; keyboard: InlineKeyboard } {
  const leaders = userRepository.getExpLeaderboard(10);
  let text = `🏆 <b>PAPAN PERINGKAT: 10 PENGGUNA PALING AKTIF</b> 🎖️\n\n`;

  if (leaders.length === 0) {
    text += `<i>Belum ada pemain yang terdaftar. Mulai main sekarang!</i>`;
  } else {
    leaders.forEach((player, idx) => {
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `<b>${idx + 1}.</b>`;
      const name = player.username ? `@${escapeHtml(player.username)}` : `User ${player.telegram_id}`;
      const badge = getLevelBadge(player.exp);
      text += `${medal} ${name} — ⭐ <b>${player.exp} EXP</b> (${badge.emoji} Lv.${badge.level} ${badge.title})\n`;
    });
  }

  text += `\n💡 <i>EXP didapatkan dari unduh media, catat pengeluaran, check-in harian, dan mini-games!</i>`;

  const keyboard = new InlineKeyboard()
    .text('🎮 Main Game', 'game:nav:menu')
    .text('💖 Dukung Pengembang', 'topup:menu');

  return { text, keyboard };
}

export function renderExpLeaderboard(): { text: string; keyboard: InlineKeyboard } {
  const leaders = userRepository.getExpLeaderboard(10);
  let text = `⭐ <b>PAPAN PERINGKAT: 10 MASTER EXP & KEAKTIFAN</b> 🎖️\n\n`;

  if (leaders.length === 0) {
    text += `<i>Belum ada pemain yang terdaftar. Mulai main sekarang!</i>`;
  } else {
    leaders.forEach((player, idx) => {
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `<b>${idx + 1}.</b>`;
      const name = player.username ? `@${escapeHtml(player.username)}` : `User ${player.telegram_id}`;
      const badge = getLevelBadge(player.exp);
      text += `${medal} ${name} — ⭐ <b>${player.exp} EXP</b> (${badge.emoji} Lv.${badge.level} ${badge.title}, ${player.games_won}x win)\n`;
    });
  }

  text += `\n💡 <i>EXP didapatkan dari aktivitas bot: download media (+2 EXP), catat keuangan (+3/+5 EXP), check-in harian (+20 EXP), dan game!</i>`;

  const keyboard = new InlineKeyboard()
    .text('🎮 Main Game', 'game:nav:menu')
    .text('💖 Dukung Pengembang', 'topup:menu');

  return { text, keyboard };
}

// -------------------------------------------------------------
// 7. Papan Peringkat (/leaderboard, /topgame, /topexp)
// -------------------------------------------------------------
gameComposer.command(['leaderboard', 'topgame', 'topkoin', 'topcoin', 'topexp', 'toplevel'], async ctx => {
  const { text, keyboard } = renderExpLeaderboard();
  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
});

// -------------------------------------------------------------
// 8. Info Status Layanan 100% Gratis (/tukar, /exchange)
// -------------------------------------------------------------
gameComposer.command(['tukar', 'exchange'], async ctx => {
  const text =
    `ℹ️ <b>SEMUA FITUR 100% GRATIS SELAMANYA!</b>\n\n` +
    `Bot ini telah beralih sepenuhnya ke model <b>komunitas sukarela</b>. Anda <b>TIDAK PERLU</b> membeli koin ataupun menukar kuota untuk menggunakan bot!\n\n` +
    `• 📥 <b>Unduh Media:</b> TikTok, YouTube, IG, FB, dll. tanpa batas.\n` +
    `• 💰 <b>Catat Keuangan & Scan Struk:</b> Bebas pakai kapan saja.\n` +
    `• ⭐ <b>Sistem EXP:</b> Menunjukkan keaktifan Anda di papan /leaderboard.\n\n` +
    `Jika Anda merasa bot ini bermanfaat dan ingin berpartisipasi menjaga operasional server, Anda dapat berdonasi secara sukarela via QRIS melalui perintah /dukung.`;

  const keyboard = new InlineKeyboard()
    .text('💖 Dukung Pengembang', 'topup:menu')
    .row()
    .text('⭐ Lihat Leaderboard', 'game:leaderboard:exp')
    .text('🎮 Arena Games', 'game:nav:menu');

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
});

// -------------------------------------------------------------
// 10. Text Message Listener untuk Menjawab Family 100 & Tebak Gambar
// -------------------------------------------------------------
gameComposer.on('message:text', async (ctx, next) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();

  // 1. Cek Sesi Family 100 Aktif
  const f100Session = activeFamily100.get(chatId);
  if (f100Session) {
    if (text === '/nyerah_f100' || text === '/nyerah') {
      clearTimeout(f100Session.timeoutTimer);
      activeFamily100.delete(chatId);

      const answeredCount = f100Session.answers.filter(a => a.answeredBy).length;
      const fullBoard = renderFamily100Board(f100Session, true);
      const endKeyboard = new InlineKeyboard()
        .text('👨‍👩‍👧‍👦 Main Lagi', 'game:nav:family100')
        .row()
        .text('🎮 Menu Games', 'game:nav:menu');

      if (answeredCount === 0) {
        userRepository.recordGameResult(f100Session.starterUserId, false, 0, 0);
        await ctx.reply(
          `🏳️ <b>Menyerah di Game Family 100!</b>\n\n` +
          `❓ <i>"${escapeHtml(f100Session.soal)}"</i>\n\n` +
          `Belum ada jawaban yang ditebak.\n\n` +
          `👉 <b>Berikut semua jawabannya:</b>\n${fullBoard}`,
          { parse_mode: 'HTML', reply_markup: endKeyboard }
        );
      } else {
        await ctx.reply(
          `🏳️ <b>Sesi Family 100 Diakhiri!</b>\n\n` +
          `❓ <i>"${escapeHtml(f100Session.soal)}"</i>\n\n` +
          `Sebanyak <b>${answeredCount} dari ${f100Session.answers.length}</b> jawaban berhasil ditebak.\n\n` +
          `👉 <b>Daftar Lengkap Jawaban:</b>\n${fullBoard}`,
          { parse_mode: 'HTML', reply_markup: endKeyboard }
        );
      }
      return;
    }

    if (!text.startsWith('/')) {
      const cleanInput = cleanAnswerText(text);
      const matched = f100Session.answers.find(a => !a.answeredBy && a.clean === cleanInput);

      if (matched) {
        const winnerId = ctx.from.id;
        const winnerName = escapeHtml(ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name);

        matched.answeredBy = winnerName;
        userRepository.addExp(winnerId, 2);
        userRepository.recordGameResult(winnerId, true, 0, 2);

        const remaining = f100Session.answers.filter(a => !a.answeredBy);
        if (remaining.length === 0) {
          // Semua jawaban berhasil ditebak!
          clearTimeout(f100Session.timeoutTimer);
          activeFamily100.delete(chatId);

          const fullBoard = renderFamily100Board(f100Session);
          const winKeyboard = new InlineKeyboard()
            .text('👨‍👩‍👧‍👦 Main Lagi', 'game:nav:family100')
            .row()
            .text('🎮 Menu Games', 'game:nav:menu');

          await ctx.reply(
            `🎉 <b>SURVEI MEMBUKTIKAN! SEMUA JAWABAN BERHASIL DITEBAK!</b> 🎉\n\n` +
            `❓ <i>"${escapeHtml(f100Session.soal)}"</i>\n\n` +
            `${fullBoard}\n` +
            `Poin ⭐ <b>+2 EXP</b> telah diberikan per tebakan benar. Kerja sama yang luar biasa! 🏆`,
            { parse_mode: 'HTML', reply_markup: winKeyboard }
          );
        } else {
          const currentBoard = renderFamily100Board(f100Session);
          await ctx.reply(
            `🎯 <b>TEBAKAN BENAR!</b>\n` +
            `👤 <b>${winnerName}</b> berhasil menebak: <b>${escapeHtml(matched.raw)}</b> (⭐ +2 EXP)!\n\n` +
            `${currentBoard}\n` +
            `<i>Sisa ${remaining.length} jawaban lagi! Ayo tebak sebelum 60 detik habis!</i>`,
            { parse_mode: 'HTML' }
          );
        }
        return;
      }
    }
  }

  // 2. Cek Sesi Tebak Gambar Aktif
  const session = activeTebakGambar.get(chatId);
  if (session) {
    // Jika pesan adalah command lain (berawalan '/') selain /nyerah, teruskan
    if (text.startsWith('/') && !text.startsWith('/nyerah')) {
      return next();
    }

    if (text.startsWith('/nyerah')) {
      clearTimeout(session.timeoutTimer);
      activeTebakGambar.delete(chatId);

      userRepository.recordGameResult(session.userId, false, 0, 0);

      const surrenderKeyboard = new InlineKeyboard()
        .text('🖼️ Coba Soal Lain', 'game:nav:tebakgambar')
        .row()
        .text('🎮 Menu Games', 'game:nav:menu');

      await ctx.reply(
        `🏳️ <b>Anda Menyerah!</b>\n\n` +
        `👉 Jawaban yang benar: <b>${session.item.jawaban}</b>\n` +
        `📝 Deskripsi: <i>${session.item.deskripsi}</i>\n\n` +
        `Yuk coba tebak gambar yang lain!`,
        { parse_mode: 'HTML', reply_markup: surrenderKeyboard }
      );
      return;
    }

    // Normalisasi input dan jawaban: lowercase dan buang semua tanda baca/spasi
    const cleanInput = text.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanAnswer = session.item.jawaban.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (cleanInput === cleanAnswer) {
      clearTimeout(session.timeoutTimer);
      activeTebakGambar.delete(chatId);

      const winnerId = ctx.from.id;
      const winnerName = escapeHtml(ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name);

      const expReward = session.usedClue ? 3 : 5;

      userRepository.addExp(winnerId, expReward);
      userRepository.recordGameResult(winnerId, true, 0, expReward);
      const updated = userRepository.getUser(winnerId)!;

      const clueNote = session.usedClue ? ' <i>(dengan bantuan clue)</i>' : '';

      const winKeyboard = new InlineKeyboard()
        .text('🖼️ Main Lagi', 'game:nav:tebakgambar')
        .row()
        .text('🎮 Menu Games', 'game:nav:menu');

      await ctx.reply(
        `🎉 <b>TEBAKAN ANDA TEPAT SEKALI!</b> 🎉\n\n` +
        `👤 Penebak: <b>${winnerName}</b>\n` +
        `👉 Jawaban: <b>${session.item.jawaban}</b>\n` +
        `📝 Deskripsi: <i>${session.item.deskripsi}</i>\n\n` +
        `🎁 Hadiah${clueNote}: ⭐ <b>+${expReward} EXP</b> keaktifan!\n` +
        `Total EXP Anda: <b>${updated.exp} EXP</b>.`,
        { parse_mode: 'HTML', reply_markup: winKeyboard }
      );
      return;
    }
  }

  return next();
});

// -------------------------------------------------------------
// 11. Callback Query Handler (Interaksi Tombol Game)
// -------------------------------------------------------------
gameComposer.on('callback_query:data', async (ctx, next) => {
  const data = ctx.callbackQuery.data;
  if (!data.startsWith('game:') && !data.startsWith('tg:') && !data.startsWith('f100:')) {
    return next();
  }

  const userId = ctx.from.id;
  await ctx.answerCallbackQuery().catch(() => {});

  // Navigasi Menu Games
  if (data === 'game:nav:menu') {
    const user = userRepository.getUser(userId);
    if (!user) return;
    const level = Math.floor(user.exp / 100) + 1;
    const menuText =
      `🎮 <b>Arena Permainan &amp; Mini-Games</b>\n\n` +
      `⭐ <b>Total EXP:</b> <code>${user.exp}</code> EXP | <b>Level:</b> ${level}\n\n` +
      `Pilih salah satu menu atau game berikut:`;

    const keyboard = new InlineKeyboard()
      .text('❌⭕ Tic Tac Toe', 'game:nav:ttt')
      .text('👨‍👩‍👧‍👦 Family 100', 'game:nav:family100')
      .row()
      .text('🖼️ Tebak Gambar', 'game:nav:tebakgambar')
      .text('🎲 Main Dadu', 'game:nav:dice')
      .row()
      .text('🎰 Putar Slot', 'game:nav:slot')
      .text('🧩 Kuis Pilihan Ganda', 'game:nav:quiz')
      .row()
      .text('🏆 Papan Peringkat EXP', 'game:action:leaderboard')
      .text('💖 Dukung Pengembang', 'topup:menu')
      .row()
      .text('📋 Menu Utama', 'start:mainmenu');

    try {
      await ctx.editMessageText(menuText, { parse_mode: 'HTML', reply_markup: keyboard });
    } catch {
      const targetChatId = ctx.chat?.id || userId;
      await ctx.api.sendMessage(targetChatId, menuText, { parse_mode: 'HTML', reply_markup: keyboard }).catch(() => {});
    }
    return;
  }

  // Navigasi Family 100 (Main Lagi / Coba Soal Lain)
  if (data === 'game:nav:family100') {
    const targetChatId = ctx.chat?.id || userId;
    const oldSession = activeFamily100.get(targetChatId);
    if (oldSession) {
      clearTimeout(oldSession.timeoutTimer);
      activeFamily100.delete(targetChatId);
    }
    const userName = escapeHtml(ctx.from?.username ? `@${ctx.from.username}` : ctx.from?.first_name || 'Pemain');
    await startFamily100Game(ctx, targetChatId, userId, userName);
    return;
  }

  // Menyerah Family 100
  if (data.startsWith('f100:surrender:')) {
    const targetChatId = parseInt(data.replace('f100:surrender:', ''), 10) || ctx.chat?.id;
    if (!targetChatId) return;
    const session = activeFamily100.get(targetChatId);
    if (!session) {
      await ctx.reply('⚠️ Sesi Family 100 ini sudah berakhir.');
      return;
    }
    clearTimeout(session.timeoutTimer);
    activeFamily100.delete(targetChatId);

    const answeredCount = session.answers.filter(a => a.answeredBy).length;
    const fullBoard = renderFamily100Board(session, true);
    const endKeyboard = new InlineKeyboard()
      .text('👨‍👩‍👧‍👦 Main Lagi', 'game:nav:family100')
      .row()
      .text('🎮 Menu Games', 'game:nav:menu');

    if (answeredCount === 0) {
      userRepository.recordGameResult(session.starterUserId, false, 0, 0);
      await ctx.api.sendMessage(
        targetChatId,
        `🏳️ <b>Menyerah di Game Family 100!</b>\n\n` +
        `❓ <i>"${escapeHtml(session.soal)}"</i>\n\n` +
        `Belum ada jawaban yang ditebak.\n\n` +
        `👉 <b>Berikut semua jawabannya:</b>\n${fullBoard}`,
        { parse_mode: 'HTML', reply_markup: endKeyboard }
      ).catch(() => {});
    } else {
      await ctx.api.sendMessage(
        targetChatId,
        `🏳️ <b>Sesi Family 100 Diakhiri!</b>\n\n` +
        `❓ <i>"${escapeHtml(session.soal)}"</i>\n\n` +
        `Sebanyak <b>${answeredCount} dari ${session.answers.length}</b> jawaban berhasil ditebak.\n\n` +
        `👉 <b>Daftar Lengkap Jawaban:</b>\n${fullBoard}`,
        { parse_mode: 'HTML', reply_markup: endKeyboard }
      ).catch(() => {});
    }
    return;
  }

  // Navigasi Tebak Gambar (Main Lagi / Coba Soal Lain)
  if (data === 'game:nav:tebakgambar') {
    const targetChatId = ctx.chat?.id || userId;
    // Bersihkan sesi lama jika masih tersisa
    const oldSession = activeTebakGambar.get(targetChatId);
    if (oldSession) {
      clearTimeout(oldSession.timeoutTimer);
      activeTebakGambar.delete(targetChatId);
    }
    await startTebakGambarGame(ctx, targetChatId, userId);
    return;
  }

  // Bantuan Clue Tebak Gambar
  if (data.startsWith('tg:clue:')) {
    const targetChatId = parseInt(data.replace('tg:clue:', ''), 10) || ctx.chat?.id;
    if (!targetChatId) return;
    const session = activeTebakGambar.get(targetChatId);
    if (!session) {
      await ctx.reply('⚠️ Sesi tebak gambar ini sudah berakhir. Mulai baru dengan /tebakgambar.');
      return;
    }
    session.usedClue = true;
    session.clueLevel = 2;
    const moreClue = generateClue(session.item.jawaban, 2);
    await ctx.api.sendMessage(
      targetChatId,
      `💡 <b>Bantuan Clue Tambahan:</b>\n<code>${moreClue}</code>\n\n` +
      `ℹ️ <i>Hadiah tebakan disesuaikan menjadi <b>+3 EXP</b> karena menggunakan bantuan clue.</i>`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  // Menyerah Tebak Gambar
  if (data.startsWith('tg:surrender:')) {
    const targetChatId = parseInt(data.replace('tg:surrender:', ''), 10) || ctx.chat?.id;
    if (!targetChatId) return;
    const session = activeTebakGambar.get(targetChatId);
    if (!session) {
      await ctx.reply('⚠️ Sesi tebak gambar ini sudah berakhir.');
      return;
    }
    clearTimeout(session.timeoutTimer);
    activeTebakGambar.delete(targetChatId);

    userRepository.recordGameResult(session.userId, false, 0, 0);

    const surrenderKeyboard = new InlineKeyboard()
      .text('🖼️ Coba Soal Lain', 'game:nav:tebakgambar')
      .row()
      .text('🎮 Menu Games', 'game:nav:menu');

    await ctx.api.sendMessage(
      targetChatId,
      `🏳️ <b>Menyerah!</b>\n\n` +
      `👉 Jawaban yang benar: <b>${session.item.jawaban}</b>\n` +
      `📝 Deskripsi: <i>${session.item.deskripsi}</i>\n\n` +
      `Yuk coba tebak gambar yang lain!`,
      { parse_mode: 'HTML', reply_markup: surrenderKeyboard }
    );
    return;
  }

  if (data === 'game:nav:ttt') {
    console.log(`[Game] User ${userId} clicked Tic Tac Toe menu`);
    await sendTttMenu(ctx);
    return;
  }

  if (data === 'game:nav:dice') {
    await ctx.reply(
      `🎲 <b>Permainan Dadu:</b>\n` +
      `Ketik <code>/dice</code> atau <code>/dadu</code> untuk bermain.\n\n` +
      `Jika angka dadu Anda lebih besar dari bot, Anda mendapatkan ⭐ <b>+5 EXP</b> keaktifan!`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  if (data === 'game:nav:slot') {
    await ctx.reply(
      `🎰 <b>Permainan Mesin Slot:</b>\n` +
      `Ketik <code>/slot</code> untuk memutar mesin slot.\n\n` +
      `Dapatkan jackpot 777 untuk bonus ⭐ <b>+25 EXP</b>!`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  if (data === 'game:nav:quiz') {
    await sendNewQuiz(ctx, userId);
    return;
  }

  if (data === 'game:action:claim') {
    const res = userRepository.claimDailyBonus(userId, 20);
    if (res.success) {
      await ctx.reply(
        `🎁 <b>Check-in Harian Berhasil!</b>\n` +
        `Anda mendapatkan <b>+20 EXP</b> keaktifan hari ini!\n` +
        `Total EXP Anda sekarang: ⭐ <b>${res.currentExp} EXP</b>.`,
        { parse_mode: 'HTML' }
      );
    } else {
      await ctx.reply(`⏳ <b>Info Check-in:</b>\n${res.message}`, { parse_mode: 'HTML' });
    }
    return;
  }

  if (data === 'game:action:leaderboard' || data === 'game:leaderboard:coins' || data === 'game:leaderboard:exp') {
    const { text, keyboard } = renderExpLeaderboard();
    if (ctx.callbackQuery?.message) {
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(async () => {
        await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
      });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
    }
    return;
  }

  if (data === 'game:action:exchange' || data.startsWith('game:exchange:vip:')) {
    await ctx.reply(
      `ℹ️ <b>SEMUA FITUR 100% GRATIS SELAMANYA!</b>\n\n` +
      `Anda tidak perlu menukarkan koin atau membeli paket apapun untuk mendownload media maupun mencatat keuangan.\n\n` +
      `Jika Anda ingin berpartisipasi sukarela mendukung operasional bot, silakan gunakan perintah /dukung.`,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .text('💖 Dukung Pengembang', 'topup:menu')
          .text('🎮 Menu Games', 'game:nav:menu')
      }
    );
    return;
  }

  // Handle Repeat Dice / Repeat Slot
  if (data.startsWith('game:dice:repeat')) {
    await playDiceGame(ctx, userId);
    return;
  }

  if (data.startsWith('game:slot:repeat')) {
    await playSlotGame(ctx, userId);
    return;
  }

  // Handle Penukaran Koin (game:exchange:cost:quota)
  if (data.startsWith('game:exchange:')) {
    await ctx.reply(
      `ℹ️ Seluruh fitur telah 100% gratis tanpa penukaran kuota. Nikmati bot sepuasnya!`
    );
    return;
  }

  // Handle Jawaban Kuis (game:quiz:userId:questionId:choiceIndex)
  if (data.startsWith('game:quiz:')) {
    const parts = data.split(':');

    // 1. Tombol Menyerah / Soal Lain saat kuis aktif (tanpa penalti)
    if (parts[2] === 'surrender' || parts[2] === 'skip') {
      const targetUserId = parseInt(parts[3], 10);
      if (targetUserId !== userId) return;

      const activeSession = activeQuizzes.get(userId);
      if (activeSession) {
        activeQuizzes.delete(userId);
        userRepository.recordGameResult(userId, false, 0, 0);
        const q = QUIZ_QUESTIONS.find(item => item.id === activeSession.questionId);
        const ansInfo = q 
          ? `\n👉 Jawaban yang benar: <b>${q.options[q.correctIndex]}</b>\n💡 <i>${q.explanation}</i>\n` 
          : '';

        await ctx.api.sendMessage(
          ctx.chat?.id || userId,
          `ℹ️ <b>Soal Kuis Dilewati</b>\n` +
          ansInfo +
          `\nBerikut soal baru untuk Anda:`,
          { parse_mode: 'HTML' }
        ).catch(() => {});
      }

      await sendNewQuiz(ctx, userId);
      return;
    }

    // 2. Tombol Soal Berikutnya (setelah menjawab soal sebelumnya, tanpa penalti)
    if (parts[2] === 'next') {
      const targetUserId = parseInt(parts[3], 10);
      if (targetUserId !== userId) return;
      await sendNewQuiz(ctx, userId);
      return;
    }

    const quizUserId = parseInt(parts[2], 10);
    const questionId = parseInt(parts[3], 10);
    const chosenIndex = parseInt(parts[4], 10);

    if (quizUserId !== userId) {
      await ctx.reply('⚠️ Ini kuis milik pemain lain! Ketik /tebak untuk memulai kuis Anda sendiri.');
      return;
    }

    const question = QUIZ_QUESTIONS.find(q => q.id === questionId);
    if (!question) {
      await ctx.reply('Soal tidak ditemukan.');
      return;
    }

    // Hapus dari activeQuizzes karena user sudah menjawab
    activeQuizzes.delete(userId);

    const isCorrect = chosenIndex === question.correctIndex;
    const nextKeyboard = new InlineKeyboard()
      .text('🧩 Soal Berikutnya', `game:quiz:next:${userId}`)
      .row()
      .text('🎮 Menu Games', 'game:nav:menu');

    if (isCorrect) {
      userRepository.addExp(userId, 5);
      userRepository.recordGameResult(userId, true, 0, 5);
      const updated = userRepository.getUser(userId)!;
      await ctx.editMessageText(
        `✅ <b>JAWABAN ANDA BENAR!</b>\n\n` +
        `❓ <i>"${question.question}"</i>\n\n` +
        `👉 Jawaban: <b>${question.options[chosenIndex]}</b>\n` +
        `💡 <i>${question.explanation}</i>\n\n` +
        `🎁 Hadiah: ⭐ <b>+5 EXP</b>!\n` +
        `Total EXP Anda: <b>${updated.exp} EXP</b>.`,
        { parse_mode: 'HTML', reply_markup: nextKeyboard }
      ).catch(() => {});
    } else {
      userRepository.recordGameResult(userId, false, 0, 0);
      await ctx.editMessageText(
        `❌ <b>YAH, JAWABAN ANDA KURANG TEPAT!</b>\n\n` +
        `❓ <i>"${question.question}"</i>\n\n` +
        `Pilihan Anda: <s>${question.options[chosenIndex]}</s>\n` +
        `👉 Jawaban yang benar: <b>${question.options[question.correctIndex]}</b>\n` +
        `💡 <i>${question.explanation}</i>\n\n` +
        `Jangan patah semangat, yuk coba soal berikutnya!`,
        { parse_mode: 'HTML', reply_markup: nextKeyboard }
      ).catch(() => {});
    }
    return;
  }

  return next();
});

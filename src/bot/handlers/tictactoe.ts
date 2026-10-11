import { Composer, InlineKeyboard } from 'grammy';
import { MyContext } from '../context.js';
import { userRepository } from '../../database/repositories/userRepository.js';
import {
  applyMove,
  Board,
  checkWinner,
  createEmptyBoard,
  deleteSession,
  getBestBotMove,
  getSession,
  saveSession,
  TttSession
} from '../../games/ticTacToe.js';
import { escapeHtml } from '../../utils/format.js';

export const ticTacToeComposer = new Composer<MyContext>();

// -------------------------------------------------------------
// Helper UI Renderers
// -------------------------------------------------------------

export function renderTttMessage(session: TttSession, isBotThinking = false): string {
  const pX = escapeHtml(session.playerX.name);
  const pO = session.playerO.isBot ? '🤖 Bot AI Pintar' : escapeHtml(session.playerO.name);

  let statusMsg = '';
  if (session.status === 'waiting') {
    statusMsg =
      `⚔️ <b>TANTANGAN DIBUKA!</b>\n` +
      `Siapa yang berani melawan <b>${pX}</b>?\n` +
      `Klik tombol <b>"⚔️ Terima Tantangan"</b> di bawah untuk mulai bertanding!`;
  } else if (session.status === 'playing') {
    if (isBotThinking) {
      statusMsg = `👉 <b>Giliran:</b> ⭕ <b>${pO}</b>`;
    } else {
      const isX = session.currentTurn === 'X';
      const turnName = isX ? pX : pO;
      const turnIcon = isX ? '❌' : '⭕';
      statusMsg = `👉 <b>Giliran:</b> ${turnIcon} <b>${turnName}</b>`;
    }
  } else if (session.status === 'ended') {
    if (session.winner === 'draw') {
      statusMsg = `🤝 <b>PERMAINAN SERI!</b>\nPapan telah penuh tanpa pemenang.`;
      if (session.bet > 0) {
        statusMsg += `\n💰 Koin taruhan dikembalikan ke masing-masing pemain (+1 EXP)!`;
      }
    } else if (session.winner === 'X') {
      statusMsg = `🏆 <b>PEMENANG: ❌ ${pX}!</b>\nSelamat atas kemenangannya!`;
      if (session.bet > 0) {
        const reward = session.mode === 'pvp' ? session.bet * 2 : session.bet * 2;
        statusMsg += `\n🎁 Hadiah didapatkan: <b>+${reward} Koin</b> (+10 EXP)!`;
      } else {
        statusMsg += `\n🎁 Hadiah santai: <b>+2 Koin</b> (+1 EXP)!`;
      }
    } else if (session.winner === 'O') {
      statusMsg = `🏆 <b>PEMENANG: ⭕ ${pO}!</b>\nSelamat atas kemenangannya!`;
      if (session.bet > 0) {
        if (session.mode === 'pvp') {
          statusMsg += `\n🎁 Hadiah didapatkan: <b>+${session.bet * 2} Koin</b> (+10 EXP)!`;
        } else {
          statusMsg += `\n❌ Anda kalah dari Bot. Taruhan <b>${session.bet} Koin</b> hangus.`;
        }
      }
    }
  }

  const betInfo =
    session.bet > 0
      ? `💰 <b>Taruhan:</b> ${session.bet} Koin ${session.mode === 'pvp' ? `(Total Pot: <b>${session.bet * 2} Koin</b>)` : ''}`
      : `💰 <b>Taruhan:</b> <i>Mode Santai (Tanpa Taruhan)</i>`;

  return (
    `❌⭕ <b>TIC TAC TOE</b>\n\n` +
    `• ❌ <b>Pemain 1:</b> ${pX}\n` +
    `• ⭕ <b>Pemain 2:</b> ${pO}\n` +
    `• ${betInfo}\n\n` +
    `${statusMsg}`
  );
}

export function renderTttKeyboard(session: TttSession, isBotThinking = false): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  if (session.status === 'waiting') {
    keyboard
      .text('⚔️ Terima Tantangan!', `ttt:accept:${session.id}`)
      .row()
      .text('❌ Batalkan Tantangan', `ttt:cancel:${session.id}`);
    return keyboard;
  }

  // 3x3 Grid polos tanpa spoiler bidak yang akan hilang
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const idx = row * 3 + col;
      const cell = session.board[idx];

      let label = '⬜';
      let action = isBotThinking ? 'ttt:thinking' : `ttt:move:${session.id}:${idx}`;

      if (cell === 'X') {
        label = '❌';
        action = 'ttt:noop';
      } else if (cell === 'O') {
        label = '⭕';
        action = 'ttt:noop';
      } else if (session.status === 'ended') {
        label = '▫️';
        action = 'ttt:noop';
      }

      keyboard.text(label, action);
    }
    keyboard.row();
  }

  if (session.status === 'playing') {
    if (!isBotThinking) {
      keyboard.text('🏳️ Menyerah', `ttt:surrender:${session.id}`);
    } else {
      keyboard.text('🤖 Bot sedang berpikir...', 'ttt:thinking');
    }
  } else if (session.status === 'ended') {
    if (session.mode === 'ai') {
      keyboard.text('🔄 Main Lagi (Lawan Bot)', `ttt:start:ai:${session.bet}`);
    } else {
      keyboard.text('⚔️ Tantang Lagi (PvP)', `ttt:start:pvp:${session.bet}`);
    }
    keyboard.row().text('❌⭕ Menu Tic Tac Toe', 'ttt:menu').text('🎮 Menu Games', 'game:nav:menu');
  }

  return keyboard;
}

export async function sendTttMenu(ctx: MyContext) {
  const userId = ctx.from?.id;
  if (!userId) return;

  const user = userRepository.getUser(userId);
  const exp = user ? user.exp : 0;
  const level = Math.floor(exp / 100) + 1;

  const text =
    `❌⭕ <b>TIC TAC TOE (ARENA 3x3)</b>\n\n` +
    `Susun 3 simbol sejajar untuk memenangkan duel asah taktik dan raih EXP keaktifan!\n\n` +
    `⭐ <b>Level Anda:</b> Level ${level} (<code>${exp}</code> EXP)\n\n` +
    `<b>Pilih Mode Permainan:</b>\n` +
    `• 🤖 <b>Lawan Bot AI (Solo):</b> Bertanding langkah-demi-langkah melawan Bot AI (+5 EXP jika menang).\n` +
    `• ⚔️ <b>Lawan Teman (PvP):</b> Buka tantangan duel di grup atau chat (+5 EXP untuk pemenang).\n\n` +
    `<i>Pilih mode di bawah ini untuk memulai:</i>`;

  const keyboard = new InlineKeyboard()
    .text('🤖 Lawan Bot (Solo)', 'ttt:start:ai:0')
    .text('⚔️ Lawan Teman (PvP)', 'ttt:start:pvp:0')
    .row()
    .text('🎮 Menu Games', 'game:nav:menu');

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(async () => {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
    });
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }
}

// -------------------------------------------------------------
// Commands & Navigation Handlers
// -------------------------------------------------------------

ticTacToeComposer.command(['tictactoe', 'ttt', 'xo'], async ctx => {
  await sendTttMenu(ctx);
});

ticTacToeComposer.callbackQuery('game:nav:ttt', async ctx => {
  await ctx.answerCallbackQuery().catch(() => { });
  await sendTttMenu(ctx);
});

ticTacToeComposer.callbackQuery('ttt:menu', async ctx => {
  await ctx.answerCallbackQuery().catch(() => { });
  await sendTttMenu(ctx);
});

// Menu Pemilihan Mode Lawan Bot (AI)
ticTacToeComposer.callbackQuery('ttt:bet:ai', async ctx => {
  await ctx.answerCallbackQuery().catch(() => { });
  const userId = ctx.from.id;
  const user = userRepository.getUser(userId);
  const exp = user ? user.exp : 0;

  const text =
    `🤖 <b>TIC TAC TOE — LAWAN BOT AI</b>\n\n` +
    `Bertanding solo melawan Bot AI untuk melatih taktik:\n\n` +
    `• 🏆 Menang: <b>+5 EXP</b>\n` +
    `• 🤝 Seri: <b>+2 EXP</b>\n` +
    `• 😢 Kalah: <b>+1 EXP</b>\n\n` +
    `<i>Tekan tombol di bawah untuk mulai bermain:</i>`;

  const keyboard = new InlineKeyboard()
    .text('▶️ Mulai Main Lawan Bot', 'ttt:start:ai:0')
    .row()
    .text('🔙 Kembali', 'ttt:menu');

  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(async () => {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });
});

// Menu Pemilihan Mode Lawan Teman (PvP)
ticTacToeComposer.callbackQuery('ttt:bet:pvp', async ctx => {
  await ctx.answerCallbackQuery().catch(() => { });
  const userId = ctx.from.id;
  const user = userRepository.getUser(userId);

  const text =
    `⚔️ <b>TIC TAC TOE — LAWAN TEMAN (PvP)</b>\n\n` +
    `Tantang teman Anda dalam duel Tic Tac Toe!\n\n` +
    `• 🏆 Pemenang: <b>+5 EXP</b>\n` +
    `• 🤝 Hasil Seri: <b>+2 EXP</b> masing-masing\n` +
    `• 😢 Kalah: <b>+1 EXP</b>\n\n` +
    `<i>Tekan tombol di bawah untuk membuat tantangan:</i>`;

  const keyboard = new InlineKeyboard()
    .text('⚔️ Buat Tantangan Duel', 'ttt:start:pvp:0')
    .row()
    .text('🔙 Kembali', 'ttt:menu');

  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(async () => {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });
});

// -------------------------------------------------------------
// Memulai Permainan (AI Mode)
// -------------------------------------------------------------

ticTacToeComposer.callbackQuery(/^ttt:start:ai:(\d+)$/, async ctx => {
  const bet = parseInt(ctx.match[1], 10);
  const userId = ctx.from.id;
  const user = userRepository.getUser(userId);

  if (!user) {
    await ctx.answerCallbackQuery({ text: 'User tidak ditemukan.', show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery({ text: '🎮 Permainan dimulai! Anda memegang ❌.' }).catch(() => { });

  const sessionId = `ttt_ai_${userId}_${Date.now()}`;
  const session: TttSession = {
    id: sessionId,
    chatId: ctx.chat?.id || userId,
    playerX: { id: userId, name: ctx.from.first_name },
    playerO: { id: 0, name: 'Bot AI', isBot: true },
    currentTurn: 'X',
    board: createEmptyBoard(),
    bet,
    mode: 'ai',
    variant: 'unlimited',
    historyX: [],
    historyO: [],
    status: 'playing',
    createdAt: Date.now(),
    lastMoveAt: Date.now()
  };

  saveSession(session);

  const text = renderTttMessage(session);
  const keyboard = renderTttKeyboard(session);

  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(async () => {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });
});

// -------------------------------------------------------------
// Memulai Permainan (PvP Mode - Tantangan)
// -------------------------------------------------------------

ticTacToeComposer.callbackQuery(/^ttt:start:pvp:(\d+)$/, async ctx => {
  const bet = parseInt(ctx.match[1], 10);
  const userId = ctx.from.id;
  const user = userRepository.getUser(userId);

  if (!user) {
    await ctx.answerCallbackQuery({ text: 'User tidak ditemukan.', show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery({ text: '⚔️ Tantangan PvP dibuat!' }).catch(() => { });

  const sessionId = `ttt_pvp_${userId}_${Date.now()}`;
  const session: TttSession = {
    id: sessionId,
    chatId: ctx.chat?.id || userId,
    playerX: { id: userId, name: ctx.from.first_name },
    playerO: { id: 0, name: 'Menunggu Lawan...', isBot: false },
    currentTurn: 'X',
    board: createEmptyBoard(),
    bet,
    mode: 'pvp',
    variant: 'unlimited',
    historyX: [],
    historyO: [],
    status: 'waiting',
    createdAt: Date.now(),
    lastMoveAt: Date.now()
  };

  // Timer kedaluwarsa tantangan jika tidak ada yang menerima dalam 2 menit
  session.timeoutTimer = setTimeout(async () => {
    const s = getSession(sessionId);
    if (s && s.status === 'waiting') {
      if (s.bet > 0) {
        userRepository.addCoins(s.playerX.id, s.bet, 0);
      }
      deleteSession(sessionId);
      if (s.messageId && s.chatId) {
        await ctx.api
          .editMessageText(
            s.chatId,
            s.messageId,
            `⏳ <b>Tantangan Tic Tac Toe Kedaluwarsa.</b>\nTidak ada yang menerima tantangan dari <b>${escapeHtml(s.playerX.name)}</b> dalam 2 menit. Koin taruhan telah dikembalikan.`,
            { parse_mode: 'HTML' }
          )
          .catch(() => { });
      }
    }
  }, 120000);

  saveSession(session);

  const text = renderTttMessage(session);
  const keyboard = renderTttKeyboard(session);

  const sentMsg = await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  session.messageId = sentMsg.message_id;
  saveSession(session);
});

// Terima Tantangan PvP
ticTacToeComposer.callbackQuery(/^ttt:accept:([a-zA-Z0-9_]+)$/, async ctx => {
  const sessionId = ctx.match[1];
  const session = getSession(sessionId);
  const opponentId = ctx.from.id;

  if (!session || session.status !== 'waiting') {
    await ctx.answerCallbackQuery({ text: 'Tantangan ini sudah tidak aktif.', show_alert: true });
    return;
  }

  if (session.playerX.id === opponentId) {
    await ctx.answerCallbackQuery({ text: 'Anda tidak bisa menerima tantangan dari diri sendiri!', show_alert: true });
    return;
  }

  const user = userRepository.getUser(opponentId);
  if (!user) {
    await ctx.answerCallbackQuery({ text: 'User tidak ditemukan.', show_alert: true });
    return;
  }

  // Bersihkan timer tunggu
  if (session.timeoutTimer) {
    clearTimeout(session.timeoutTimer);
  }

  // Mulai game!
  session.playerO = { id: opponentId, name: ctx.from.first_name, isBot: false };
  session.status = 'playing';
  session.lastMoveAt = Date.now();
  saveSession(session);

  await ctx.answerCallbackQuery({ text: '⚔️ Tantangan diterima! Duel dimulai!' }).catch(() => { });

  const text = renderTttMessage(session);
  const keyboard = renderTttKeyboard(session);

  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(async () => {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });
});

// Batalkan Tantangan PvP (hanya oleh pembuat tantangan)
ticTacToeComposer.callbackQuery(/^ttt:cancel:([a-zA-Z0-9_]+)$/, async ctx => {
  const sessionId = ctx.match[1];
  const session = getSession(sessionId);
  const userId = ctx.from.id;

  if (!session || session.status !== 'waiting') {
    await ctx.answerCallbackQuery({ text: 'Tantangan tidak ditemukan atau sudah dimulai.', show_alert: true });
    return;
  }

  if (session.playerX.id !== userId) {
    await ctx.answerCallbackQuery({ text: 'Hanya pembuat tantangan yang dapat membatalkannya!', show_alert: true });
    return;
  }

  deleteSession(sessionId);

  await ctx.answerCallbackQuery({ text: 'Tantangan berhasil dibatalkan.' }).catch(() => { });
  await ctx.editMessageText(
    `❌ <b>Tantangan Dibatalkan.</b>\nTantangan Tic Tac Toe telah dibatalkan oleh <b>${escapeHtml(session.playerX.name)}</b>.`,
    { parse_mode: 'HTML' }
  ).catch(() => { });
});

// -------------------------------------------------------------
// Gerakan Pemain (Tapping Kotak Grid)
// -------------------------------------------------------------

ticTacToeComposer.callbackQuery(/^ttt:move:([a-zA-Z0-9_]+):(\d)$/, async ctx => {
  const sessionId = ctx.match[1];
  const cellIdx = parseInt(ctx.match[2], 10);
  const userId = ctx.from.id;

  const session = getSession(sessionId);
  if (!session || session.status !== 'playing') {
    await ctx.answerCallbackQuery({ text: 'Sesi permainan telah berakhir.', show_alert: true });
    return;
  }

  // Validasi giliran
  const isPlayerX = session.playerX.id === userId;
  const isPlayerO = session.playerO.id === userId;

  if (!isPlayerX && !isPlayerO) {
    await ctx.answerCallbackQuery({ text: 'Anda bukan pemain di pertandingan ini!', show_alert: true });
    return;
  }

  const expectedTurn = session.currentTurn;
  const isCurrentTurn = (expectedTurn === 'X' && isPlayerX) || (expectedTurn === 'O' && isPlayerO);

  if (!isCurrentTurn) {
    await ctx.answerCallbackQuery({ text: '⏳ Tunggu giliran lawan Anda!', show_alert: true });
    return;
  }

  // Validasi kotak kosong
  if (session.board[cellIdx] !== null) {
    await ctx.answerCallbackQuery({ text: 'Kotak ini sudah terisi!', show_alert: true });
    return;
  }

  // 1. Jalankan langkah pemain menggunakan applyMove
  const moveResult = applyMove(session, cellIdx);
  session.lastMoveAt = Date.now();

  await ctx.answerCallbackQuery().catch(() => { });

  // Jika pemain langsung menang
  if (moveResult.winner) {
    session.status = 'ended';
    session.winner = moveResult.winner;
    session.winningLine = moveResult.line;
    handleGameEnding(session);
    saveSession(session);

    await ctx.editMessageText(renderTttMessage(session), {
      parse_mode: 'HTML',
      reply_markup: renderTttKeyboard(session)
    }).catch(async () => {
      await ctx.reply(renderTttMessage(session), { parse_mode: 'HTML', reply_markup: renderTttKeyboard(session) });
    });
    return;
  }

  // 2. Jika Mode Lawan Bot (AI): Tampilkan langkah user seketika, lalu bot berpikir
  if (session.mode === 'ai') {
    session.currentTurn = 'O';
    saveSession(session);

    // Render seketika: langkah user terlihat, status menunjukkan Bot sedang berpikir
    await ctx.editMessageText(renderTttMessage(session, true), {
      parse_mode: 'HTML',
      reply_markup: renderTttKeyboard(session, true)
    }).catch(async () => {
      await ctx.reply(renderTttMessage(session, true), { parse_mode: 'HTML', reply_markup: renderTttKeyboard(session, true) });
    });

    // Jeda berpikir seolah-olah bot menganalisis papan (~800ms)
    await new Promise(resolve => setTimeout(resolve, 800));

    // Periksa kembali apakah sesi masih ada dan belum berakhir/menyerah
    const currentSession = getSession(sessionId);
    if (!currentSession || currentSession.status !== 'playing') return;

    // Kalkulasi langkah bot
    const botMove = getBestBotMove(
      currentSession.board,
      'O',
      currentSession.historyO,
      currentSession.historyX,
      currentSession.variant === 'unlimited'
    );

    if (botMove !== -1) {
      const botResult = applyMove(currentSession, botMove);
      if (botResult.winner) {
        currentSession.status = 'ended';
        currentSession.winner = botResult.winner;
        currentSession.winningLine = botResult.line;
        handleGameEnding(currentSession);
      } else {
        currentSession.currentTurn = 'X';
      }
    }

    saveSession(currentSession);

    // Render papan baru setelah bot selesai melangkah
    await ctx.editMessageText(renderTttMessage(currentSession), {
      parse_mode: 'HTML',
      reply_markup: renderTttKeyboard(currentSession)
    }).catch(async () => {
      await ctx.reply(renderTttMessage(currentSession), { parse_mode: 'HTML', reply_markup: renderTttKeyboard(currentSession) });
    });
    return;
  }

  // 3. Mode Lawan Teman (PvP): Ganti giliran ke Pemain O
  session.currentTurn = 'O';
  saveSession(session);

  await ctx.editMessageText(renderTttMessage(session), {
    parse_mode: 'HTML',
    reply_markup: renderTttKeyboard(session)
  }).catch(async () => {
    await ctx.reply(renderTttMessage(session), { parse_mode: 'HTML', reply_markup: renderTttKeyboard(session) });
  });
});

// Menyerah Saat Permainan Berlangsung
ticTacToeComposer.callbackQuery(/^ttt:surrender:([a-zA-Z0-9_]+)$/, async ctx => {
  const sessionId = ctx.match[1];
  const userId = ctx.from.id;

  const session = getSession(sessionId);
  if (!session || session.status !== 'playing') {
    await ctx.answerCallbackQuery({ text: 'Sesi permainan sudah selesai.', show_alert: true });
    return;
  }

  const isPlayerX = session.playerX.id === userId;
  const isPlayerO = session.playerO.id === userId;

  if (!isPlayerX && !isPlayerO) {
    await ctx.answerCallbackQuery({ text: 'Anda bukan pemain di pertandingan ini!', show_alert: true });
    return;
  }

  session.status = 'ended';
  session.winner = isPlayerX ? 'O' : 'X';
  handleGameEnding(session);
  saveSession(session);

  const surrenderingName = isPlayerX ? session.playerX.name : session.playerO.name;
  await ctx.answerCallbackQuery({ text: 'Anda telah menyerah.' }).catch(() => { });

  const text =
    renderTttMessage(session) +
    `\n\n🏳️ <i>${escapeHtml(surrenderingName)} memilih untuk menyerah.</i>`;
  const keyboard = renderTttKeyboard(session);

  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(async () => {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  });
});

// Tombol noop (kotak sudah terisi)
ticTacToeComposer.callbackQuery('ttt:noop', async ctx => {
  await ctx.answerCallbackQuery({ text: 'Kotak ini sudah terisi atau permainan telah berakhir.' }).catch(() => { });
});

// Tombol saat bot sedang berpikir
ticTacToeComposer.callbackQuery('ttt:thinking', async ctx => {
  await ctx.answerCallbackQuery({ text: '⏳ Tunggu sebentar, Bot sedang berpikir...', show_alert: false }).catch(() => { });
});

// -------------------------------------------------------------
// Helper: Penyelesaian Koin & Skor Game
// -------------------------------------------------------------

function handleGameEnding(session: TttSession) {
  if (session.timeoutTimer) {
    clearTimeout(session.timeoutTimer);
  }

  const bet = session.bet;

  if (session.mode === 'ai') {
    const user = session.playerX;
    if (session.winner === 'X') {
      // Pemain menang lawan bot: +5 EXP
      userRepository.recordGameResult(user.id, true, 0, 5);
    } else if (session.winner === 'draw') {
      // Seri lawan bot: +2 EXP
      userRepository.recordGameResult(user.id, false, 0, 2);
    } else if (session.winner === 'O') {
      // Bot menang: +1 EXP
      userRepository.recordGameResult(user.id, false, 0, 1);
    }
  } else {
    // Mode PvP
    const pX = session.playerX;
    const pO = session.playerO;

    if (session.winner === 'X') {
      userRepository.recordGameResult(pX.id, true, 0, 5);
      userRepository.recordGameResult(pO.id, false, 0, 1);
    } else if (session.winner === 'O') {
      userRepository.recordGameResult(pO.id, true, 0, 5);
      userRepository.recordGameResult(pX.id, false, 0, 1);
    } else if (session.winner === 'draw') {
      userRepository.recordGameResult(pX.id, false, 0, 2);
      userRepository.recordGameResult(pO.id, false, 0, 2);
    }
  }
}

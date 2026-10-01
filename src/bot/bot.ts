import { Bot } from 'grammy';
import { run } from '@grammyjs/runner';
import { MyContext } from './context.js';
import { config } from '../config/config.js';
import { rateLimiterMiddleware } from './middlewares/rateLimit.js';
import { authMiddleware } from './middlewares/auth.js';
import { startComposer } from './handlers/start.js';
import { vipComposer } from './handlers/vip.js';
import { adminComposer } from './handlers/admin.js';
import { gameComposer } from './handlers/game.js';
import { downloadComposer } from './handlers/download.js';
import { topupComposer } from './handlers/topup.js';
import { ticTacToeComposer } from './handlers/tictactoe.js';

export function createBot(): Bot<MyContext> {
  if (!config.botToken) {
    throw new Error('BOT_TOKEN belum diatur dalam file .env!');
  }

  const bot = new Bot<MyContext>(config.botToken);

  // Global Error Handler agar bot tidak pernah crash
  bot.catch(err => {
    const ctx = err.ctx;
    console.error(`[Bot Error] Terjadi kesalahan saat memproses update ${ctx.update.update_id}:`, err.error);
  });

  // Pasang Middlewares
  bot.use(rateLimiterMiddleware);
  bot.use(authMiddleware);

  // Pasang Handlers / Composers
  bot.use(startComposer);
  bot.use(topupComposer);
  bot.use(vipComposer);
  bot.use(adminComposer);
  bot.use(gameComposer);
  bot.use(ticTacToeComposer);
  bot.use(downloadComposer);

  return bot;
}

export function launchBot(bot: Bot<MyContext>) {
  console.log('🚀 Memulai bot dengan runner concorrency...');
  const runner = run(bot);
  runner.task()?.catch((err: any) => {
    console.error('❌ [Fatal] Grammy runner terhenti (kemungkinan karena 409 Conflict):', err.message || err);
  });
  return runner;
}

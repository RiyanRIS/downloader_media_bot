import { limit } from '@grammyjs/ratelimiter';
import { MyContext } from '../context.js';

export const rateLimiterMiddleware = limit<MyContext, any>({
  timeFrame: 2500, // Rentang waktu 2.5 detik
  limit: 3, // Maksimal 3 pesan per 2.5 detik
  onLimitExceeded: async ctx => {
    await ctx.reply('⏳ Mohon jangan spam. Tunggu beberapa detik sebelum mengirim pesan kembali.').catch(() => {});
  },
  keyGenerator: ctx => ctx.from?.id.toString() || 'anonymous'
});

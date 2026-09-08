import { NextFunction } from 'grammy';
import { MyContext } from '../context.js';
import { userRepository } from '../../database/repositories/userRepository.js';

export async function authMiddleware(ctx: MyContext, next: NextFunction): Promise<void> {
  const from = ctx.from;
  if (!from) {
    return next();
  }

  // Ambil atau buat data user baru di database SQLite
  const { user } = userRepository.getOrCreateUser(
    from.id,
    from.username,
    undefined // referrerId ditangani secara spesifik di command /start
  );

  // Periksa apakah user diblokir
  if (user.is_banned === 1) {
    await ctx.reply('🚫 Akun Anda telah diblokir dari menggunakan layanan bot ini.');
    return;
  }

  ctx.user = user;
  return next();
}

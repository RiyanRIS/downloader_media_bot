import { config } from '../config/config.js';
import { userRepository } from '../database/repositories/userRepository.js';

export interface AdminContactInfo {
  username?: string;
  url: string;
  display: string;
  isAvailable: boolean;
  getContactUrl: (prefillText?: string) => string;
}

/**
 * Mendapatkan informasi kontak admin secara dinamis:
 * 1. Prioritas 1: ADMIN_CONTACT_URL di .env (misal WhatsApp atau link CS khusus)
 * 2. Prioritas 2: ADMIN_CONTACT_USERNAME di .env (username Telegram admin)
 * 3. Prioritas 3: Auto-detect username admin dari database users berdasarkan config.adminIds
 * 4. Fallback: URL default https://t.me jika tidak ada username terdaftar
 */
export function getAdminContactInfo(): AdminContactInfo {
  // 1. Cek konfigurasi Custom URL (misal: WhatsApp https://wa.me/... atau link bot lain)
  if (config.adminContactUrl && config.adminContactUrl.trim() !== '') {
    const rawUrl = config.adminContactUrl.trim();
    const display = config.adminContactUsername
      ? (config.adminContactUsername.startsWith('@') ? config.adminContactUsername : `@${config.adminContactUsername}`)
      : 'Admin CS';

    return {
      username: config.adminContactUsername || undefined,
      url: rawUrl,
      display,
      isAvailable: true,
      getContactUrl: (prefillText?: string) => {
        if (!prefillText) return rawUrl;
        const separator = rawUrl.includes('?') ? '&' : '?';
        return `${rawUrl}${separator}text=${encodeURIComponent(prefillText)}`;
      }
    };
  }

  // 2. Cek konfigurasi Username Telegram di .env
  const rawUsername = config.adminContactUsername?.trim();
  if (rawUsername) {
    const cleanUsername = rawUsername.replace(/^@/, '');
    const url = `https://t.me/${cleanUsername}`;
    return {
      username: cleanUsername,
      url,
      display: `@${cleanUsername}`,
      isAvailable: true,
      getContactUrl: (prefillText?: string) => {
        return prefillText
          ? `https://t.me/${cleanUsername}?text=${encodeURIComponent(prefillText)}`
          : url;
      }
    };
  }

  // 3. Fallback Cerdas: Ambil username dari database users untuk admin pertama
  if (config.adminIds.length > 0) {
    for (const adminId of config.adminIds) {
      const adminUser = userRepository.getUser(adminId);
      if (adminUser?.username) {
        const cleanUsername = adminUser.username.replace(/^@/, '');
        const url = `https://t.me/${cleanUsername}`;
        return {
          username: cleanUsername,
          url,
          display: `@${cleanUsername}`,
          isAvailable: true,
          getContactUrl: (prefillText?: string) => {
            return prefillText
              ? `https://t.me/${cleanUsername}?text=${encodeURIComponent(prefillText)}`
              : url;
          }
        };
      }
    }
  }

  // 4. Fallback jika tidak ada username sama sekali
  return {
    url: 'https://t.me',
    display: 'Admin CS',
    isAvailable: false,
    getContactUrl: () => 'https://t.me'
  };
}

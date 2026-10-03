import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import fs from 'fs';

dotenv.config();

function getEnvNumber(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (!val) return defaultValue;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const val = process.env[key];
  if (!val) return defaultValue;
  return val.toLowerCase() === 'true' || val === '1';
}

function parseAdminIds(raw?: string): number[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(id => parseInt(id.trim(), 10))
    .filter(id => !isNaN(id) && id > 0);
}

function parseApiKeys(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(k => k.trim())
    .filter(k => k.length > 0);
}

// Menentukan direktori temporary secara aman lintas platform (Windows dev vs Linux STB)
let resolvedTmpDir = process.env.TMP_DIR;
if (!resolvedTmpDir || resolvedTmpDir.trim() === '') {
  resolvedTmpDir = process.platform === 'linux' ? '/tmp' : path.join(os.tmpdir(), 'stb_bot_downloads');
}
resolvedTmpDir = path.resolve(resolvedTmpDir);

if (!fs.existsSync(resolvedTmpDir)) {
  try {
    fs.mkdirSync(resolvedTmpDir, { recursive: true });
  } catch (err) {
    console.error(`Gagal membuat temporary directory di ${resolvedTmpDir}:`, err);
  }
}

export const config = {
  botToken: process.env.BOT_TOKEN || '',
  adminIds: parseAdminIds(process.env.ADMIN_IDS),
  databasePath: process.env.DATABASE_PATH || './bot.db',
  tmpDir: resolvedTmpDir,
  ytDlpPath: process.env.YT_DLP_PATH || 'yt-dlp',
  galleryDlPath: process.env.GALLERY_DL_PATH || 'gallery-dl',
  ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
  cookiesPath: process.env.COOKIES_PATH || undefined,
  maxConcurrentDownloads: getEnvNumber('MAX_CONCURRENT_DOWNLOADS', 2),
  maxFileSizeMb: getEnvNumber('MAX_FILE_SIZE_MB', 48),
  downloadTimeoutMs: getEnvNumber('DOWNLOAD_TIMEOUT_MS', 180000), // 3 menit
  freeDailyLimit: getEnvNumber('FREE_DAILY_LIMIT', 5),
  vipDailyLimit: getEnvNumber('VIP_DAILY_LIMIT', 50),
  referralBonusLimit: getEnvNumber('REFERRAL_BONUS_LIMIT', 5),
  coinCostDownload: getEnvNumber('COIN_COST_DOWNLOAD', 5),
  coinReferralBonus: getEnvNumber('COIN_REFERRAL_BONUS', 500),
  coinInitialBonus: getEnvNumber('COIN_INITIAL_BONUS', 500),
  coinCostExpenseText: getEnvNumber('COIN_COST_EXPENSE_TEXT', 5),     // Biaya catat pengeluaran teks
  coinCostExpenseReceipt: getEnvNumber('COIN_COST_EXPENSE_RECEIPT', 10), // Biaya scan foto struk
  qrisStaticString: process.env.QRIS_STATIC_STRING || '',
  enableThermalAlert: getEnvBoolean('ENABLE_THERMAL_ALERT', true),
  thermalAlertTempC: getEnvNumber('THERMAL_ALERT_TEMP_C', 75),
  ramAlertPercent: getEnvNumber('RAM_ALERT_PERCENT', 90),
  geminiApiKeys: parseApiKeys(process.env.GEMINI_API_KEY),
  get geminiApiKey(): string {
    return this.geminiApiKeys[0] || '';
  },

  isAdmin(telegramId: number): boolean {
    return this.adminIds.includes(telegramId);
  }
};

import { Bot } from 'grammy';
import { userRepository } from '../database/repositories/userRepository.js';
import { systemService } from './systemService.js';
import { downloaderService } from './downloaderService.js';
import { config } from '../config/config.js';

let lastAlertTime = 0;
const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 menit jeda antar peringatan suhu/RAM

export function initBackgroundCrons(bot: Bot<any>): void {
  console.log('⏰ Menginisialisasi Background Workers & Cron Jobs...');

  // 1. Cron Job: Orphan File Cleaner di folder tmp (Setiap 30 Menit)
  setInterval(() => {
    try {
      const result = systemService.cleanupOrphanFiles(15);
      if (result.cleanedCount > 0) {
        console.log(`🧹 [Cleaner] Berhasil membersihkan ${result.cleanedCount} file sisa (${(result.freedBytes / 1024 / 1024).toFixed(2)} MB).`);
      }
    } catch (err) {
      console.error('Error pada orphan file cleaner:', err);
    }
  }, 30 * 60 * 1000);

  // 2. Cron Job: Reset Kuota Midnight (Setiap Pergantian Hari Pukul 00:00)
  scheduleMidnightTask(() => {
    try {
      const resetCount = userRepository.resetAllDailyUsage();
      console.log(`🌙 [Midnight] Kuota harian untuk ${resetCount} pengguna berhasil direset ke 0.`);
    } catch (err) {
      console.error('Error saat reset kuota harian midnight:', err);
    }
  });

  // 3. Cron Job: Proactive Thermal & RAM Alert (Setiap 5 Menit)
  if (config.enableThermalAlert && config.adminIds.length > 0) {
    setInterval(async () => {
      try {
        const health = await systemService.getHealth();
        const now = Date.now();

        const isHighTemp = health.cpuTempC !== null && health.cpuTempC >= config.thermalAlertTempC;
        const isHighRam = health.ramUsedPercent >= config.ramAlertPercent;

        if ((isHighTemp || isHighRam) && (now - lastAlertTime > ALERT_COOLDOWN_MS)) {
          lastAlertTime = now;
          let warningText = `🚨 **PERINGATAN HARDWARE SERVER!**\n\n`;

          if (isHighTemp) {
            warningText += `🔥 **Suhu CPU Kritis:** ${health.cpuTempC}°C (Batas: ${config.thermalAlertTempC}°C)\n`;
          }
          if (isHighRam) {
            warningText += `⚠️ **Konsumsi RAM Tinggi:** ${health.ramUsedMb} MB / ${health.ramTotalMb} MB (${health.ramUsedPercent}%)\n`;
          }

          warningText += `\nSegera periksa beban sistem via perintah /health atau jalankan /cleancache.`;

          for (const adminId of config.adminIds) {
            await bot.api.sendMessage(adminId, warningText, { parse_mode: 'Markdown' }).catch(() => {});
          }
        }
      } catch (err) {
        // Abaikan error background health check
      }
    }, 5 * 60 * 1000);
  }

  // 4. Cron Job: Auto-update yt-dlp (Setiap 3 Hari Sekali)
  setInterval(async () => {
    try {
      console.log('🔄 Menjalankan pemeriksaan pembaruan yt-dlp otomatis...');
      const updateResult = await downloaderService.updateYtDlp();
      console.log(`yt-dlp update status: ${updateResult}`);
    } catch (err: any) {
      console.log(`Info update yt-dlp: ${err.message}`);
    }
  }, 3 * 24 * 60 * 60 * 1000);
}

function scheduleMidnightTask(task: () => void): void {
  const scheduleNext = () => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();

    setTimeout(() => {
      task();
      scheduleNext(); // Jadwalkan untuk malam berikutnya
    }, msUntilMidnight);
  };

  scheduleNext();
}

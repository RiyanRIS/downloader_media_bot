import si from 'systeminformation';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { config } from '../config/config.js';

const execAsync = promisify(exec);

export interface SystemHealthData {
  cpuTempC: number | null;
  cpuLoadPercent: number;
  ramTotalMb: number;
  ramUsedMb: number;
  ramUsedPercent: number;
  tmpDiskTotalMb: number;
  tmpDiskFreeMb: number;
  tmpDiskUsedPercent: number;
  uptimeFormatted: string;
  osName: string;
  isLinux: boolean;
}

export const systemService = {
  /**
   * Mengumpulkan statistik performa STB secara real-time
   */
  async getHealth(): Promise<SystemHealthData> {
    const [cpuTemp, currentLoad, mem, fsSize, time, osInfo] = await Promise.all([
      si.cpuTemperature().catch(() => ({ main: null })),
      si.currentLoad().catch(() => ({ currentLoad: 0 })),
      si.mem().catch(() => ({ total: 1, active: 0, available: 1 } as any)),
      si.fsSize().catch(() => []),
      si.time(),
      si.osInfo().catch(() => ({ distro: 'Unknown', platform: process.platform }))
    ]);

    // Hitung waktu uptime dalam format Hari, Jam, Menit
    const uptimeSec = time.uptime || 0;
    const days = Math.floor(uptimeSec / 86400);
    const hours = Math.floor((uptimeSec % 86400) / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);
    const uptimeFormatted = `${days > 0 ? `${days}h ` : ''}${hours}j ${minutes}m`;

    // Cari partisi disk yang menaungi tmpDir
    let diskMatch = fsSize.find(d => config.tmpDir.startsWith(d.mount));
    if (!diskMatch && fsSize.length > 0) {
      diskMatch = fsSize[0]; // fallback ke partisi utama
    }

    const tmpTotalMb = diskMatch ? Math.round(diskMatch.size / (1024 * 1024)) : 0;
    const tmpFreeMb = diskMatch ? Math.round(diskMatch.available / (1024 * 1024)) : 0;
    const tmpUsedPercent = diskMatch ? Math.round(diskMatch.use) : 0;

    return {
      cpuTempC: cpuTemp.main !== null && !isNaN(cpuTemp.main) ? Math.round(cpuTemp.main * 10) / 10 : null,
      cpuLoadPercent: Math.round(currentLoad.currentLoad),
      ramTotalMb: Math.round(mem.total / (1024 * 1024)),
      ramUsedMb: Math.round((mem.active || mem.total - (mem.available || 0)) / (1024 * 1024)),
      ramUsedPercent: Math.round(((mem.active || (mem.total - mem.available)) / mem.total) * 100),
      tmpDiskTotalMb: tmpTotalMb,
      tmpDiskFreeMb: tmpFreeMb,
      tmpDiskUsedPercent: tmpUsedPercent,
      uptimeFormatted,
      osName: `${osInfo.distro} (${osInfo.platform})`,
      isLinux: process.platform === 'linux'
    };
  },

  /**
   * Membersihkan file sampah/orphan yang tertinggal di folder tmp
   * (File yang berusia lebih dari 15 menit)
   */
  cleanupOrphanFiles(maxAgeMinutes = 15): { cleanedCount: number; freedBytes: number } {
    if (!fs.existsSync(config.tmpDir)) {
      return { cleanedCount: 0, freedBytes: 0 };
    }

    let cleanedCount = 0;
    let freedBytes = 0;
    const now = Date.now();
    const maxAgeMs = maxAgeMinutes * 60 * 1000;

    try {
      const files = fs.readdirSync(config.tmpDir);
      for (const file of files) {
        if (!file.startsWith('dl_')) continue;

        const fullPath = path.join(config.tmpDir, file);
        try {
          const stats = fs.statSync(fullPath);
          if (now - stats.mtimeMs > maxAgeMs) {
            freedBytes += stats.size;
            fs.unlinkSync(fullPath);
            cleanedCount++;
          }
        } catch (fileErr) {
          // File mungkin sedang dipakai atau sudah terhapus
        }
      }
    } catch (err) {
      console.error('Error saat pembersihan orphan files:', err);
    }

    return { cleanedCount, freedBytes };
  },

  /**
   * Melegakan RAM di Linux STB (sync && drop_caches)
   */
  async cleanCache(): Promise<{ success: boolean; message: string }> {
    if (process.platform !== 'linux') {
      return {
        success: true,
        message: 'ℹ️ Mode Dev (Windows/Non-Linux): Pembersihan drop_caches hanya dieksekusi di Linux STB.'
      };
    }

    try {
      await execAsync('sync && echo 3 | sudo tee /proc/sys/vm/drop_caches');
      return {
        success: true,
        message: '✅ Berhasil melegakan RAM STB (drop_caches executed).'
      };
    } catch (err: any) {
      return {
        success: false,
        message: `❌ Gagal membersihkan cache RAM: ${err.message}. Pastikan user memiliki izin sudo.`
      };
    }
  },

  /**
   * Me-restart perangkat STB (Safe Reboot)
   */
  async reboot(): Promise<{ success: boolean; message: string }> {
    if (process.platform !== 'linux') {
      return {
        success: true,
        message: '⚠️ Mode Dev (Windows): Perintah reboot disimulasikan agar komputer dev Anda tidak mati.'
      };
    }

    try {
      // Jalankan reboot dengan sedikit jeda agar Telegram sempat mengirim pesan respons
      setTimeout(() => {
        exec('sudo reboot');
      }, 2000);

      return {
        success: true,
        message: '🔄 STB sedang di-reboot. Bot akan offline sementara selama 1-2 menit...'
      };
    } catch (err: any) {
      return {
        success: false,
        message: `❌ Gagal me-reboot STB: ${err.message}`
      };
    }
  },

  /**
   * Uji kecepatan unduh sederhana untuk STB
   */
  async runSimpleSpeedtest(): Promise<string> {
    const startTime = Date.now();
    try {
      // Menguji latensi dan unduhan file uji 10MB dari CDN publik
      const testUrl = 'https://speed.cloudflare.com/__down?bytes=10485760'; // 10MB test file
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15 detik batas waktu

      const res = await fetch(testUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`Status HTTP: ${res.status}`);
      }

      const buffer = await res.arrayBuffer();
      const durationSec = (Date.now() - startTime) / 1000;
      const sizeMb = buffer.byteLength / (1024 * 1024);
      const speedMbps = (sizeMb * 8) / durationSec;

      return `🚀 **Hasil Uji Kecepatan STB:**\n` +
             `• Ukuran Uji: 10 MB\n` +
             `• Waktu Tempuh: ${durationSec.toFixed(2)} detik\n` +
             `• Estimasi Speed: **${speedMbps.toFixed(2)} Mbps**`;
    } catch (err: any) {
      return `⚠️ Gagal menguji kecepatan jaringan: ${err.message}`;
    }
  }
};

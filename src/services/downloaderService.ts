import { execFile, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import pLimit from 'p-limit';
import { config } from '../config/config.js';

export interface MediaMetadata {
  id: string;
  title: string;
  duration?: number;
  filesizeApproxBytes?: number;
  filesizeApproxMb?: number;
  thumbnail?: string;
  extractor: string;
  platform: 'youtube' | 'tiktok' | 'instagram' | 'twitter' | 'threads' | 'facebook' | 'reddit' | 'pinterest' | 'bilibili' | 'generic';
  isOverLimit: boolean;
  raw?: any;
}

export interface DownloadResult {
  filePath: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: 'video' | 'audio';
  cleanup: () => void;
}

// Inisialisasi limit konkurensi (maksimal 2 download bersamaan di STB)
export const downloadQueue = pLimit(config.maxConcurrentDownloads);

export function detectPlatform(url: string): MediaMetadata['platform'] {
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('tiktok.com')) return 'tiktok';
  if (lower.includes('instagram.com')) return 'instagram';
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'twitter';
  if (lower.includes('threads.net')) return 'threads';
  if (lower.includes('facebook.com') || lower.includes('fb.watch') || lower.includes('fb.com')) return 'facebook';
  if (lower.includes('reddit.com') || lower.includes('redd.it')) return 'reddit';
  if (lower.includes('pinterest.') || lower.includes('pin.it')) return 'pinterest';
  if (lower.includes('bilibili.') || lower.includes('b23.tv')) return 'bilibili';
  return 'generic';
}

function buildBaseArgs(url?: string, forceCookies = false): string[] {
  const args: string[] = ['--no-warnings', '--no-playlist', '--js-runtimes', 'node'];
  if (config.cookiesPath && fs.existsSync(config.cookiesPath)) {
    const isYoutube = url ? detectPlatform(url) === 'youtube' : false;
    // Di YouTube, cookie sesi akun Google dari browser sering memicu "The page needs to be reloaded"
    // Oleh karena itu, cookie hanya disertakan untuk platform non-YouTube atau jika diminta secara eksplisit
    if (!isYoutube || forceCookies) {
      args.push('--cookies', config.cookiesPath);
    }
  }
  // Hanya sertakan --ffmpeg-location jika merupakan path direktori/file yang benar-benar ada di filesystem
  if (config.ffmpegPath && (path.isAbsolute(config.ffmpegPath) || fs.existsSync(config.ffmpegPath))) {
    args.push('--ffmpeg-location', config.ffmpegPath);
  }
  return args;
}

export const downloaderService = {
  /**
   * Mengecek apakah binary yt-dlp tersedia
   */
  async checkYtDlpInstalled(): Promise<{ installed: boolean; version?: string; error?: string }> {
    return new Promise(resolve => {
      execFile(
        config.ytDlpPath,
        ['--version'],
        { env: { ...process.env, PYTHONWARNINGS: 'ignore' } },
        (err, stdout) => {
          if (err) {
            resolve({ installed: false, error: err.message });
          } else {
            resolve({ installed: true, version: stdout.trim() });
          }
        }
      );
    });
  },

  /**
   * Mengambil metadata media tanpa mengunduh file utuh (Pre-check)
   */
  async getMediaInfo(url: string): Promise<MediaMetadata> {
    const args = [...buildBaseArgs(url), '--dump-json', url];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000); // 35 detik batas waktu fetch metadata

    return new Promise((resolve, reject) => {
      execFile(
        config.ytDlpPath,
        args,
        {
          signal: controller.signal,
          maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, PYTHONWARNINGS: 'ignore' }
        },
        (err, stdout, stderr) => {
          clearTimeout(timeout);
          if (err) {
            const cleanErr = stderr
              ? stderr
                  .split('\n')
                  .map(l => l.trim())
                  .filter(l => l.length > 0 && !l.toLowerCase().includes('deprecated feature'))
                  .join('\n')
              : err.message;
            return reject(new Error(`Gagal membaca info media: ${cleanErr || err.message}`));
          }

          try {
            const data = JSON.parse(stdout);
            const sizeBytes = data.filesize || data.filesize_approx || 0;
            const sizeMb = sizeBytes > 0 ? sizeBytes / (1024 * 1024) : 0;
            const isOverLimit = sizeMb > config.maxFileSizeMb;

            resolve({
              id: data.id || 'media',
              title: data.title || 'Untitled Media',
              duration: data.duration,
              filesizeApproxBytes: sizeBytes,
              filesizeApproxMb: Math.round(sizeMb * 10) / 10,
              thumbnail: data.thumbnail,
              extractor: data.extractor_key || data.extractor || 'unknown',
              platform: detectPlatform(url),
              isOverLimit,
              raw: data
            });
          } catch (parseErr) {
            reject(new Error('Gagal mengurai respons metadata dari yt-dlp'));
          }
        }
      );
    });
  },

  /**
   * Mengunduh media dalam slot antrean p-limit
   */
  async downloadMedia(
    url: string,
    formatOption: 'video' | 'audio' | 'video_360p' | 'video_720p' = 'video'
  ): Promise<DownloadResult> {
    return downloadQueue(async () => {
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const isAudio = formatOption === 'audio';
      const ext = isAudio ? 'mp3' : 'mp4';
      const outputTemplate = path.join(config.tmpDir, `dl_${timestamp}_${randomStr}.%(ext)s`);

      const args = [...buildBaseArgs(url)];

      if (isAudio) {
        // Ekstraksi Audio MP3
        args.push(
          '-x',
          '--audio-format', 'mp3',
          '--audio-quality', '0',
          '-o', outputTemplate,
          url
        );
      } else if (formatOption === 'video_360p') {
        // Format video 360p (mendukung landscape & potret YouTube Shorts/Reels/TikTok)
        args.push(
          '-S', 'res:360,ext:mp4:m4a',
          '-f', 'bestvideo+bestaudio/best',
          '--merge-output-format', 'mp4',
          '-o', outputTemplate,
          url
        );
      } else if (formatOption === 'video_720p') {
        // Format video 720p (mendukung landscape & potret YouTube Shorts/Reels/TikTok)
        args.push(
          '-S', 'res:720,ext:mp4:m4a',
          '-f', 'bestvideo+bestaudio/best',
          '--merge-output-format', 'mp4',
          '-o', outputTemplate,
          url
        );
      } else {
        // Default video: utamakan hingga 720p agar hemat kuota & aman batas Telegram API 50MB
        args.push(
          '-S', 'res:720,ext:mp4:m4a',
          '-f', 'bestvideo+bestaudio/best',
          '--merge-output-format', 'mp4',
          '-o', outputTemplate,
          url
        );
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.downloadTimeoutMs);

      return new Promise<DownloadResult>((resolve, reject) => {
        const child = spawn(config.ytDlpPath, args, {
          signal: controller.signal,
          env: { ...process.env, PYTHONWARNINGS: 'ignore' }
        });

        let stderrBuffer = '';

        child.stderr?.on('data', data => {
          stderrBuffer += data.toString();
        });

        child.on('error', err => {
          clearTimeout(timeout);
          reject(new Error(`Eksekusi download gagal: ${err.message}`));
        });

        child.on('close', code => {
          clearTimeout(timeout);

          if (code !== 0) {
            const errorLines = stderrBuffer
              .split('\n')
              .map(l => l.trim())
              .filter(l => l.length > 0 && !l.toLowerCase().includes('deprecated feature'));

            const specificError =
              errorLines.filter(l => l.startsWith('ERROR:')).join(' ') ||
              errorLines.slice(-2).join(' ') ||
              `Exit Code ${code}`;

            return reject(new Error(`Gagal mengunduh media: ${specificError}`));
          }

          // Cari file yang dihasilkan di direktori tmp
          try {
            const files = fs.readdirSync(config.tmpDir);
            const exactName = `dl_${timestamp}_${randomStr}.${ext}`;
            const prefix = `dl_${timestamp}_${randomStr}.`;

            // Utamakan file final yang sudah berhasil dimerge (cth: .mp4 atau .mp3)
            const matchedFile =
              files.find(f => f === exactName) ||
              files.find(
                f =>
                  f.startsWith(prefix) &&
                  !f.endsWith('.part') &&
                  !f.endsWith('.ytdl') &&
                  !/\.f\d+\./.test(f)
              ) ||
              files.find(f => f.startsWith(prefix) && !f.endsWith('.part') && !f.endsWith('.ytdl'));

            if (!matchedFile) {
              return reject(new Error('File hasil unduhan tidak ditemukan di direktori sementara'));
            }

            const fullPath = path.join(config.tmpDir, matchedFile);
            const stats = fs.statSync(fullPath);

            const cleanup = () => {
              try {
                if (fs.existsSync(fullPath)) {
                  fs.unlinkSync(fullPath);
                }
              } catch (unlinkErr) {
                console.error(`Gagal menghapus file sementara ${fullPath}:`, unlinkErr);
              }
            };

            resolve({
              filePath: fullPath,
              fileName: matchedFile,
              fileSizeBytes: stats.size,
              mimeType: isAudio ? 'audio' : 'video',
              cleanup
            });
          } catch (err: any) {
            reject(new Error(`Gagal memproses file hasil unduhan: ${err.message}`));
          }
        });
      });
    });
  },

  /**
   * Memperbarui binary yt-dlp ke versi terbaru (Self-Update)
   */
  async updateYtDlp(): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        config.ytDlpPath,
        ['-U'],
        { env: { ...process.env, PYTHONWARNINGS: 'ignore' } },
        (err, stdout, stderr) => {
          if (err) {
            return reject(new Error(`Gagal memperbarui yt-dlp: ${stderr || err.message}`));
          }
          resolve(stdout.trim());
        }
      );
    });
  }
};

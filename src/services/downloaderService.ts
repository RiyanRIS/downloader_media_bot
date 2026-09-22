import { execFile, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import pLimit from 'p-limit';
import { config } from '../config/config.js';
import { photoService } from './photoService.js';

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
  directDownloadUrl?: string;
  mediaType?: 'video' | 'audio' | 'photo' | 'album';
  photoUrls?: string[];
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
  const isYoutube = url ? detectPlatform(url) === 'youtube' : false;
  const args: string[] = ['--no-warnings', '--js-runtimes', 'node'];
  // Hanya sertakan --no-playlist untuk YouTube agar link playlist panjang tidak terunduh massal,
  // namun biarkan playlist aktif untuk Instagram/Threads/X agar carousel foto dapat terbaca.
  if (isYoutube) {
    args.push('--no-playlist');
  }
  if (config.cookiesPath && fs.existsSync(config.cookiesPath)) {
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

/**
 * Mencari tautan unduh/streaming langsung terbaik dari metadata yt-dlp
 */
export function findBestDirectUrl(data: any): string | undefined {
  if (!data) return undefined;

  if (Array.isArray(data.formats) && data.formats.length > 0) {
    // 1. Cari format gabungan (video + audio) dengan protokol HTTP/HTTPS langsung
    const combinedFormats = data.formats.filter(
      (f: any) =>
        f.url &&
        typeof f.url === 'string' &&
        f.url.startsWith('http') &&
        f.vcodec && f.vcodec !== 'none' &&
        f.acodec && f.acodec !== 'none' &&
        (!f.protocol || f.protocol === 'https' || f.protocol === 'http' || !f.protocol.includes('m3u8'))
    );

    if (combinedFormats.length > 0) {
      combinedFormats.sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
      return combinedFormats[0].url;
    }

    // 2. Jika tidak ada format gabungan murni, cari format video langsung apa pun
    const anyVideoWithUrl = data.formats
      .filter((f: any) => f.url && typeof f.url === 'string' && f.url.startsWith('http') && f.vcodec && f.vcodec !== 'none')
      .sort((a: any, b: any) => (b.height || 0) - (a.height || 0));

    if (anyVideoWithUrl.length > 0) {
      return anyVideoWithUrl[0].url;
    }
  }

  // 3. Fallback ke data.url
  if (typeof data.url === 'string' && data.url.startsWith('http')) {
    return data.url;
  }

  return undefined;
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
    const args = [
      ...buildBaseArgs(url),
      '--dump-single-json',
      '--ignore-no-formats-error',
      url
    ];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000); // 35 detik batas waktu fetch metadata

    return new Promise((resolve, reject) => {
      execFile(
        config.ytDlpPath,
        args,
        {
          signal: controller.signal,
          maxBuffer: 15 * 1024 * 1024,
          env: { ...process.env, PYTHONWARNINGS: 'ignore' }
        },
        async (err, stdout, stderr) => {
          clearTimeout(timeout);

          // 1. Coba parse output stdout terlebih dahulu
          // (yt-dlp mencetak data metadata JSON ke stdout meskipun keluar dengan status non-zero jika hanya menemukan foto)
          if (stdout && stdout.trim().length > 0) {
            try {
              let jsonStr = stdout.trim();
              const firstBrace = jsonStr.indexOf('{');
              const lastBrace = jsonStr.lastIndexOf('}');
              if (firstBrace !== -1 && lastBrace !== -1) {
                jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
              }
              const data = JSON.parse(jsonStr);

              // 1a. Cek apakah ini berupa Playlist / Carousel (seperti Instagram Carousel / Threads Album)
              if (data._type === 'playlist' || Array.isArray(data.entries)) {
                const entries: any[] = (data.entries || []).filter(Boolean);
                const hasAnyVideo = entries.some(
                  e => Array.isArray(e.formats) && e.formats.some((f: any) => f.vcodec && f.vcodec !== 'none')
                );

                // Jika bukan video murni (misalnya carousel foto), kumpulkan URL foto beresolusi tinggi
                if (!hasAnyVideo) {
                  const photoUrls: string[] = [];
                  for (const entry of entries) {
                    let photoUrl = entry.thumbnail;
                    if (Array.isArray(entry.thumbnails) && entry.thumbnails.length > 0) {
                      const sorted = [...entry.thumbnails].sort(
                        (a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0))
                      );
                      photoUrl = sorted[0].url || photoUrl;
                    }
                    if (photoUrl) {
                      photoUrls.push(photoUrl);
                    }
                  }

                  if (photoUrls.length > 0) {
                    return resolve({
                      id: data.id || 'album',
                      title: data.title || data.description?.slice(0, 100) || 'Photo Album',
                      extractor: data.extractor_key || data.extractor || 'unknown',
                      platform: detectPlatform(url),
                      isOverLimit: false,
                      mediaType: photoUrls.length > 1 ? 'album' : 'photo',
                      photoUrls
                    });
                  }
                }
              }

              // 1b. Cek apakah ini single item tanpa format video/audio (Single Photo)
              const hasVideo = Array.isArray(data.formats) && data.formats.some((f: any) => f.vcodec && f.vcodec !== 'none');
              const hasAudio = Array.isArray(data.formats) && data.formats.some((f: any) => f.acodec && f.acodec !== 'none');

              if (!hasVideo && !hasAudio) {
                let photoUrl = data.thumbnail;
                if (Array.isArray(data.thumbnails) && data.thumbnails.length > 0) {
                  const sorted = [...data.thumbnails].sort(
                    (a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0))
                  );
                  photoUrl = sorted[0].url || photoUrl;
                }

                if (photoUrl) {
                  return resolve({
                    id: data.id || 'photo',
                    title: data.title || 'Photo',
                    extractor: data.extractor_key || data.extractor || 'unknown',
                    platform: detectPlatform(url),
                    isOverLimit: false,
                    mediaType: 'photo',
                    photoUrls: [photoUrl]
                  });
                }
              }

              // 1c. Jika ada stream video, proses sebagai video normal
              const sizeBytes = data.filesize || data.filesize_approx || 0;
              const sizeMb = sizeBytes > 0 ? sizeBytes / (1024 * 1024) : 0;
              const isOverLimit = sizeMb > config.maxFileSizeMb;
              const directDownloadUrl = findBestDirectUrl(data);

              return resolve({
                id: data.id || 'media',
                title: data.title || 'Untitled Media',
                duration: data.duration,
                filesizeApproxBytes: sizeBytes,
                filesizeApproxMb: Math.round(sizeMb * 10) / 10,
                thumbnail: data.thumbnail,
                extractor: data.extractor_key || data.extractor || 'unknown',
                platform: detectPlatform(url),
                isOverLimit,
                directDownloadUrl,
                mediaType: 'video',
                raw: data
              });
            } catch {
              // Jika parsing gagal, teruskan ke fallback provider
            }
          }

          // 2. Fallback provider ke photoService jika yt-dlp gagal menghasilkan data
          try {
            const photoInfo = await photoService.getPhotoInfo(url);
            if (photoInfo && photoInfo.photoUrls.length > 0) {
              return resolve({
                id: photoInfo.id,
                title: photoInfo.title,
                extractor: photoInfo.platform,
                platform: detectPlatform(url),
                isOverLimit: false,
                mediaType: photoInfo.mediaType,
                photoUrls: photoInfo.photoUrls
              });
            }
          } catch {}

          // 3. Jika semua upaya ekstraksi gagal, kembalikan pesan error yang bersih
          const cleanErr = stderr
            ? stderr
                .split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 0 && !l.toLowerCase().includes('deprecated feature'))
                .join(' ')
            : err?.message || 'Gagal membaca metadata media';

          return reject(new Error(`Gagal membaca info media: ${cleanErr}`));
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

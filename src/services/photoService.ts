import { execFile, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { config } from '../config/config.js';
import { downloadQueue } from './downloaderService.js';

export interface PhotoItem {
  filePath: string;
  fileName: string;
  fileSizeBytes: number;
}

export interface PhotoDownloadResult {
  photos: PhotoItem[];
  cleanup: () => void;
}

export interface PhotoInfoResult {
  id: string;
  title: string;
  platform: string;
  mediaType: 'photo' | 'album';
  photoUrls: string[];
}

/**
 * Mengecek apakah binary gallery-dl tersedia di sistem
 */
export async function checkGalleryDlInstalled(): Promise<{ installed: boolean; version?: string }> {
  return new Promise(resolve => {
    execFile(config.galleryDlPath, ['--version'], (err, stdout) => {
      if (err) {
        resolve({ installed: false });
      } else {
        resolve({ installed: true, version: stdout.trim() });
      }
    });
  });
}

/**
 * Mengambil foto dari X / Twitter via API vxtwitter/fxtwitter (Fallback cepat tanpa binary tambahan)
 */
async function fetchTwitterPhotos(url: string): Promise<PhotoInfoResult | null> {
  const match = url.match(/(?:twitter\.com|x\.com)\/(?:#!\/)?(\w+)\/status(es)?\/(\d+)/i);
  if (!match || !match[3]) return null;

  const tweetId = match[3];
  const apiUrl = `https://api.vxtwitter.com/Twitter/status/${tweetId}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = (await res.json()) as any;

    const mediaList = data.media_extended || [];
    const imageMedia = mediaList.filter((m: any) => m.type === 'image');

    // Jika media_extended tidak ada, periksa mediaURLs
    let photoUrls: string[] = [];
    if (imageMedia.length > 0) {
      photoUrls = imageMedia.map((m: any) => m.url);
    } else if (Array.isArray(data.mediaURLs) && data.mediaURLs.length > 0) {
      photoUrls = data.mediaURLs.filter((u: string) => !u.includes('.mp4'));
    }

    if (photoUrls.length === 0) return null;

    return {
      id: tweetId,
      title: data.text || `Tweet by @${data.user_screen_name || 'user'}`,
      platform: 'twitter',
      mediaType: photoUrls.length > 1 ? 'album' : 'photo',
      photoUrls
    };
  } catch {
    return null;
  }
}

/**
 * Mengambil foto dari Reddit via public JSON endpoint
 */
async function fetchRedditPhotos(url: string): Promise<PhotoInfoResult | null> {
  if (!url.includes('reddit.com') && !url.includes('redd.it')) return null;

  try {
    const cleanUrl = url.split('?')[0].replace(/\/$/, '') + '.json';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(cleanUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'MediaDownloaderBot/1.0.0 (by /u/bot)'
      }
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const postData = json?.[0]?.data?.children?.[0]?.data;
    if (!postData) return null;

    const title = postData.title || 'Reddit Post';
    const photoUrls: string[] = [];

    // Jika berupa galeri Reddit (gallery_data)
    if (postData.is_gallery && postData.media_metadata) {
      for (const itemKey of Object.keys(postData.media_metadata)) {
        const media = postData.media_metadata[itemKey];
        if (media && media.s && media.s.u) {
          // Unescape HTML entities (&amp; -> &)
          const directUrl = media.s.u.replace(/&amp;/g, '&');
          photoUrls.push(directUrl);
        }
      }
    } else if (postData.url && /\.(jpg|jpeg|png|webp)($|\?)/i.test(postData.url)) {
      photoUrls.push(postData.url);
    }

    if (photoUrls.length === 0) return null;

    return {
      id: postData.id || 'reddit',
      title,
      platform: 'reddit',
      mediaType: photoUrls.length > 1 ? 'album' : 'photo',
      photoUrls
    };
  } catch {
    return null;
  }
}

/**
 * Mengambil URL foto/album menggunakan gallery-dl CLI
 */
async function fetchGalleryDlPhotos(url: string): Promise<PhotoInfoResult | null> {
  const args = ['-g', '--no-warnings'];
  if (config.cookiesPath && fs.existsSync(config.cookiesPath)) {
    args.push('--cookies', config.cookiesPath);
  }
  args.push(url);

  return new Promise(resolve => {
    execFile(
      config.galleryDlPath,
      args,
      { timeout: 35000, env: { ...process.env, PYTHONWARNINGS: 'ignore' } },
      (err, stdout) => {
        if (err || !stdout) {
          return resolve(null);
        }

        const lines = stdout
          .split('\n')
          .map(l => l.trim())
          .filter(l => l.startsWith('http'));

        if (lines.length === 0) {
          return resolve(null);
        }

        resolve({
          id: `gdl_${Date.now()}`,
          title: 'Photo Album',
          platform: 'generic',
          mediaType: lines.length > 1 ? 'album' : 'photo',
          photoUrls: lines
        });
      }
    );
  });
}

/**
 * Service untuk mengelola ekstraksi dan pengunduhan foto & album
 */
export const photoService = {
  /**
   * Ekstraksi metadata foto/album dari URL
   */
  async getPhotoInfo(url: string): Promise<PhotoInfoResult | null> {
    const lower = url.toLowerCase();

    // 1. Coba provider cepat Twitter jika URL dari X/Twitter
    if (lower.includes('twitter.com') || lower.includes('x.com')) {
      const twitterResult = await fetchTwitterPhotos(url);
      if (twitterResult) return twitterResult;
    }

    // 2. Coba provider Reddit jika URL dari Reddit
    if (lower.includes('reddit.com') || lower.includes('redd.it')) {
      const redditResult = await fetchRedditPhotos(url);
      if (redditResult) return redditResult;
    }

    // 3. Coba gallery-dl (Instagram, Threads, Pinterest, dll.)
    const galleryResult = await fetchGalleryDlPhotos(url);
    if (galleryResult) {
      return galleryResult;
    }

    return null;
  },

  /**
   * Unduh foto-foto ke TMP_DIR secara lokal dengan proteksi Zero-Persistence
   */
  async downloadPhotos(photoUrls: string[]): Promise<PhotoDownloadResult> {
    return downloadQueue(async () => {
      const timestamp = Date.now();
      const randomPrefix = Math.random().toString(36).substring(2, 7);
      const downloadedItems: PhotoItem[] = [];

      for (let i = 0; i < photoUrls.length; i++) {
        const photoUrl = photoUrls[i];
        const ext = photoUrl.includes('.png') ? 'png' : photoUrl.includes('.webp') ? 'webp' : 'jpg';
        const fileName = `photo_${timestamp}_${randomPrefix}_${i + 1}.${ext}`;
        const filePath = path.join(config.tmpDir, fileName);

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 20000);

          const res = await fetch(photoUrl, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
              'Referer': (photoUrl.includes('instagram.com') || photoUrl.includes('cdninstagram.com'))
                ? 'https://www.instagram.com/'
                : (photoUrl.includes('twimg.com') || photoUrl.includes('x.com'))
                ? 'https://x.com/'
                : 'https://www.google.com/'
            }
          });
          clearTimeout(timeout);

          if (!res.ok || !res.body) {
            continue;
          }

          const fileStream = fs.createWriteStream(filePath);
          // @ts-ignore - Readable.fromWeb kompatibel dengan Node.js stream
          await pipeline(Readable.fromWeb(res.body as any), fileStream);

          const stat = fs.statSync(filePath);
          if (stat.size > 0) {
            downloadedItems.push({
              filePath,
              fileName,
              fileSizeBytes: stat.size
            });
          } else {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          }
        } catch (err) {
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
            } catch {}
          }
        }
      }

      if (downloadedItems.length === 0) {
        throw new Error('Gagal mengunduh berkas foto');
      }

      return {
        photos: downloadedItems,
        cleanup: () => {
          for (const item of downloadedItems) {
            if (fs.existsSync(item.filePath)) {
              try {
                fs.unlinkSync(item.filePath);
              } catch {}
            }
          }
        }
      };
    });
  },

  /**
   * Helper untuk membagi array foto menjadi batch maksimal 10 untuk Telegram MediaGroup
   */
  chunkPhotos<T>(items: T[], chunkSize = 10): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
      chunks.push(items.slice(i, i + chunkSize));
    }
    return chunks;
  }
};

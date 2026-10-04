// RegEx untuk mengekstrak URL dari pesan teks pengguna
const URL_REGEX = /(https?:\/\/[^\s]+)/gi;

const SUPPORTED_PATTERNS = [
  /youtube\.com/i,
  /youtu\.be/i,
  /tiktok\.com/i,
  /instagram\.com/i,
  /twitter\.com/i,
  /x\.com/i,
  /threads\.net/i,
  /facebook\.com/i,
  /fb\.watch/i,
  /fb\.com/i,
  /reddit\.com/i,
  /redd\.it/i,
  /pinterest\./i,
  /pin\.it/i,
  /bilibili\.tv/i,
  /bilibili\.com/i,
  /b23\.tv/i,
  /bili\.im/i
];

/**
 * Membersihkan URL dari parameter tracking dan menormalkan struktur URL (misal Facebook discovery URL)
 */
export function normalizeMediaUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);

    // 1. Normalisasi Facebook
    if (u.hostname.includes('facebook.com') || u.hostname.includes('fb.watch') || u.hostname.includes('fb.com')) {
      // Pola: facebook.com/<page_or_user>/videos/<video_id>/
      const videosMatch = u.pathname.match(/\/videos\/(\d+)/i);
      if (videosMatch && videosMatch[1]) {
        return `https://www.facebook.com/reel/${videosMatch[1]}/`;
      }

      // Pola: facebook.com/reel/<video_id>/
      const reelMatch = u.pathname.match(/\/reel\/(\d+)/i);
      if (reelMatch && reelMatch[1]) {
        return `https://www.facebook.com/reel/${reelMatch[1]}/`;
      }

      // Pola: facebook.com/watch/?v=<video_id>
      const vParam = u.searchParams.get('v');
      if (vParam) {
        return `https://www.facebook.com/watch/?v=${vParam}`;
      }

      // Hapus parameter tracking umum Facebook
      const fbTracking = ['__so__', '__rv__', 'locale', 'mibextid', 'rdid', 'ref', 'paipv', 'source', 'fs'];
      for (const p of fbTracking) {
        u.searchParams.delete(p);
      }
      return u.toString();
    }

    // 2. Normalisasi Instagram
    if (u.hostname.includes('instagram.com')) {
      for (const p of ['igsh', 'utm_source', 'utm_medium', 'stkn', 'locale']) {
        u.searchParams.delete(p);
      }
      return u.toString();
    }

    // 3. Normalisasi TikTok
    if (u.hostname.includes('tiktok.com')) {
      for (const p of ['is_from_webapp', 'sender_device', 'sender_web_id', 'utm_source', 'utm_medium']) {
        u.searchParams.delete(p);
      }
      return u.toString();
    }

    // 4. Normalisasi X / Twitter
    if (u.hostname.includes('twitter.com') || u.hostname.includes('x.com')) {
      for (const p of ['s', 't', 'ref_src']) {
        u.searchParams.delete(p);
      }
      return u.toString();
    }

    // 5. Normalisasi YouTube
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      for (const p of ['si', 'feature', 'pp']) {
        u.searchParams.delete(p);
      }
      return u.toString();
    }

    // 6. Normalisasi Bilibili / Bstation
    if (u.hostname.includes('bilibili.com') || u.hostname.includes('bilibili.tv')) {
      for (const p of ['spm_id_from', 'from_source', 'from', 'seid', 'share_source', 'share_medium', 'share_plat', 'share_session_id', 'share_tag', 'unique_k', 'csource', 'bbid', 'ts', 'bstar_from']) {
        u.searchParams.delete(p);
      }
      return u.toString();
    }
  } catch {
    // Abaikan jika bukan URL standar
  }

  return rawUrl;
}

export function extractMediaUrl(text: string): string | null {
  const matches = text.match(URL_REGEX);
  if (!matches || matches.length === 0) return null;

  for (const match of matches) {
    const isSupported = SUPPORTED_PATTERNS.some(pattern => pattern.test(match));
    if (isSupported) {
      // Bersihkan tanda baca di akhir URL jika ada
      const cleaned = match.replace(/[.,;!?]+$/, '');
      return normalizeMediaUrl(cleaned);
    }
  }

  return null;
}

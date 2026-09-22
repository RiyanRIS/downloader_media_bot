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
  /b23\.tv/i
];

export function extractMediaUrl(text: string): string | null {
  const matches = text.match(URL_REGEX);
  if (!matches || matches.length === 0) return null;

  for (const match of matches) {
    const isSupported = SUPPORTED_PATTERNS.some(pattern => pattern.test(match));
    if (isSupported) {
      // Bersihkan tanda baca di akhir URL jika ada
      return match.replace(/[.,;!?]+$/, '');
    }
  }

  return null;
}

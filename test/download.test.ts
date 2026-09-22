import fs from 'fs';
import { downloaderService } from '../src/services/downloaderService.js';

interface TestTarget {
  name: string;
  url: string;
  expectedPlatform: string;
  formatOption: 'video' | 'video_720p' | 'video_360p' | 'audio';
}

const targets: TestTarget[] = [
  {
    name: 'YouTube Standard Video',
    url: 'https://youtu.be/DB9n7aNM6q0',
    expectedPlatform: 'youtube',
    formatOption: 'video_360p',
  },
  {
    name: 'YouTube Shorts (Vertical Video)',
    url: 'https://youtube.com/shorts/yDIP-SFNDE0',
    expectedPlatform: 'youtube',
    formatOption: 'video_720p',
  },
  {
    name: 'Instagram Reel',
    url: 'https://www.instagram.com/reel/Db6ylaTDR0V/?stkn=N2JidTN0OTE5bjkx',
    expectedPlatform: 'instagram',
    formatOption: 'video',
  },
  {
    name: 'Twitter/X Video',
    url: 'https://x.com/txiokatu/status/1537852176525139971',
    expectedPlatform: 'twitter',
    formatOption: 'video',
  },
];

async function runDownloadTests() {
  console.log('🎬 Memulai Pengujian Unduhan Media Nyata...\n');
  let passed = 0;
  let failed = 0;

  for (const [idx, item] of targets.entries()) {
    const num = idx + 1;
    console.log(`--------------------------------------------------`);
    console.log(`[${num}/${targets.length}] 🎯 Menguji: ${item.name}`);
    console.log(`     🔗 URL: ${item.url}`);
    console.log(`     ⚙️ Format: ${item.formatOption}`);

    const startTime = Date.now();

    try {
      // 1. Uji Fetch Metadata (Pre-check)
      console.log(`     🔍 Mengambil metadata media...`);
      const info = await downloaderService.getMediaInfo(item.url);
      console.log(`     📌 Judul: "${info.title}"`);
      console.log(`     🌐 Platform Terdeteksi: ${info.platform} (Expected: ${item.expectedPlatform})`);
      if (info.duration) console.log(`     ⏱ Durasi: ${info.duration} detik`);
      if (info.filesizeApproxMb) console.log(`     📦 Estimasi Ukuran: ~${info.filesizeApproxMb} MB`);

      if (info.platform !== item.expectedPlatform) {
        throw new Error(`Platform tidak cocok: terdeteksi '${info.platform}', diharapkan '${item.expectedPlatform}'`);
      }

      // 2. Uji Unduh Media & Penggabungan Stream
      console.log(`     ⬇️ Memulai proses unduhan & penggabungan format...`);
      const dlResult = await downloaderService.downloadMedia(item.url, item.formatOption);

      const exists = fs.existsSync(dlResult.filePath);
      const sizeMb = (dlResult.fileSizeBytes / (1024 * 1024)).toFixed(2);
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(`     ✅ Berkas berhasil diunduh:`);
      console.log(`        - Nama File : ${dlResult.fileName}`);
      console.log(`        - Ukuran    : ${sizeMb} MB (${dlResult.fileSizeBytes} bytes)`);
      console.log(`        - Tipe MIME : ${dlResult.mimeType}`);
      console.log(`        - Waktu     : ${elapsedSec}s`);

      if (!exists || dlResult.fileSizeBytes === 0) {
        throw new Error('File hasil unduhan tidak ditemukan di disk atau berukuran 0 byte');
      }

      // 3. Uji Zero-Persistence Cleanup
      dlResult.cleanup();
      const stillExists = fs.existsSync(dlResult.filePath);
      if (stillExists) {
        throw new Error('Cleanup gagal menghapus file sementara dari TMP_DIR');
      }
      console.log(`     🧹 Zero-Persistence: File sementara berhasil dibersihkan.`);

      console.log(`  🎉 PASS: [${item.name}] Berhasil diunduh & diverifikasi!\n`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ FAIL: [${item.name}] Gagal: ${err.message}\n`);
      failed++;
    }
  }

  console.log(`==================================================`);
  console.log(`🏁 Ringkasan Uji Unduhan: ${passed} Berhasil, ${failed} Gagal.`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

runDownloadTests();

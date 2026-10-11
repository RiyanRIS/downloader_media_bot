import { config } from './config/config.js';
import { runMigrations } from './database/migrations.js';
import { closeDatabase } from './database/db.js';
import { createBot, launchBot } from './bot/bot.js';
import { downloaderService } from './services/downloaderService.js';
import { systemService } from './services/systemService.js';
import { initBackgroundCrons } from './services/cronService.js';
import { initTebakGambarData } from './games/tebakGambarData.js';
import { initFamily100Data } from './games/family100Data.js';

async function bootstrap() {
  console.log('====================================================');
  console.log('  Multi-Platform Downloader & Community Bot');
  console.log(`  OS: ${process.platform} (${process.arch}) | Node: ${process.version}`);
  console.log(`  Storage Temp Dir: ${config.tmpDir}`);
  console.log('====================================================');

  // 1. Jalankan migrasi tabel database SQLite
  runMigrations();

  // Inisialisasi dataset game tebak gambar & family 100 di latar belakang
  initTebakGambarData().catch(() => {});
  initFamily100Data().catch(() => {});

  // 2. Periksa ketersediaan binary yt-dlp
  const ytCheck = await downloaderService.checkYtDlpInstalled();
  if (ytCheck.installed) {
    console.log(`✅ Core Downloader: yt-dlp terdeteksi (versi ${ytCheck.version})`);
  } else {
    console.warn(`⚠️ [Perhatian] Binary yt-dlp belum terdeteksi di "${config.ytDlpPath}".`);
    console.warn(`   Di komputer dev, Anda dapat mengunduh yt-dlp.exe atau menginstall via pip: pip install yt-dlp`);
    console.warn(`   Di server Linux nanti, jalankan: sudo apt install python3-pip && sudo pip install yt-dlp`);
  }

  // 3. Bersihkan file sampah di folder tmp saat startup
  const initialClean = systemService.cleanupOrphanFiles(0);
  if (initialClean.cleanedCount > 0) {
    console.log(`🧹 Membersihkan ${initialClean.cleanedCount} file sisa unduhan sebelumnya.`);
  }

  // 4. Inisialisasi bot Telegram
  if (!config.botToken || config.botToken.includes('SAMPLE_TOKEN')) {
    console.warn('⚠️ BOT_TOKEN masih menggunakan token contoh pada file .env.');
    console.warn('   Silakan masukkan BOT_TOKEN asli dari @BotFather di file .env untuk menjalankan bot di Telegram.');
    console.log('   Sistem database, repository, dan modul internal siap diuji.');
    return;
  }

  const bot = createBot();

  // 5. Inisialisasi Background Workers & Crons
  initBackgroundCrons(bot);

  // 6. Jalankan bot
  const runner = launchBot(bot);

  const me = await bot.api.getMe();
  console.log(`🎉 Bot aktif dan terhubung sebagai @${me.username}!`);

  // 7. Daftarkan daftar perintah resmi ke Telegram (Memunculkan tombol Menu di pojok kiri bawah)
  await bot.api.setMyCommands([
    { command: 'start', description: 'Mulai bot & info akun' },
    { command: 'menu', description: 'Menu navigasi bot' },
    { command: 'catat', description: 'Catat pengeluaran keuangan (AI)' },
    { command: 'struk', description: 'Scan foto struk belanja otomatis' },
    { command: 'games', description: 'Arena permainan & mini-games' },
    { command: 'claim', description: 'Check-in harian bonus +20 EXP' },
    { command: 'leaderboard', description: 'Papan peringkat pengguna paling aktif' },
    { command: 'dukung', description: 'Dukung pengembang via QRIS' },
    { command: 'donatur', description: 'Daftar donatur bulan ini' },
    { command: 'profile', description: 'Lihat profil EXP & statistik akun' },
    { command: 'saran', description: 'Request fitur & usulan ide baru' },
    { command: 'lapor', description: 'Laporkan kendala atau link rusak' },
    { command: 'help', description: 'Panduan lengkap & bantuan admin' }
  ]).catch(err => {
    console.warn('⚠️ Gagal mendaftarkan menu perintah Telegram:', err?.message || err);
  });

  // Graceful Shutdown
  const stopApp = async () => {
    console.log('\n🛑 Menghentikan bot dan menutup database dengan aman...');
    if (runner.isRunning()) {
      await runner.stop();
    }
    closeDatabase();
    process.exit(0);
  };

  process.once('SIGINT', stopApp);
  process.once('SIGTERM', stopApp);
}

// Tangani unhandled rejection & uncaught exception agar proses Node v24 tidak crash seketika
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ [Unhandled Rejection at Promise]:', reason);
});

process.on('uncaughtException', err => {
  console.error('⚠️ [Uncaught Exception]:', err);
});

bootstrap().catch(err => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});

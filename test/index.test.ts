import { runMigrations } from '../src/database/migrations.js';
import { userRepository } from '../src/database/repositories/userRepository.js';
import { downloadRepository } from '../src/database/repositories/downloadRepository.js';
import { settingsRepository } from '../src/database/repositories/settingsRepository.js';
import { extractMediaUrl } from '../src/bot/middlewares/urlDetector.js';
import { detectPlatform, findBestDirectUrl } from '../src/services/downloaderService.js';
import { photoService } from '../src/services/photoService.js';
import { systemService } from '../src/services/systemService.js';
import { transactionRepository } from '../src/database/repositories/transactionRepository.js';
import { duitkuService } from '../src/services/duitkuService.js';
import { getLevelBadge } from '../src/bot/handlers/game.js';
import { closeDatabase } from '../src/database/db.js';

async function runTests() {
  console.log('🧪 Memulai Pengujian Unit & Logika Sistem...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failed++;
    }
  }

  const testUserId = 99999991;
  const testRefId = 99999990;

  try {
    // 1. Uji Database Migrations
    runMigrations();
    assert(true, 'Database migrations execute without error');

    // 2. Uji User Repository & Referral
    // Reset user uji jika ada data dari run sebelumnya
    userRepository.setCustomLimit(testUserId, null as any);
    userRepository.setRole(testUserId, 'user');

    // Buat referrer
    const refUser = userRepository.getOrCreateUser(testRefId, 'referrer_user');
    assert(refUser.user.telegram_id === testRefId, 'Create referrer user');

    // Buat new user dengan referrer
    const newUser = userRepository.getOrCreateUser(testUserId, 'test_user', testRefId);
    assert(newUser.user.telegram_id === testUserId, 'Create new user with referrer');
    assert(newUser.user.referrer_id === testRefId, 'Referrer ID correctly linked');

    // Cek limit default
    const defaultLimit = userRepository.getEffectiveLimit(newUser.user);
    assert(defaultLimit === 5, 'Free user default limit is 5');

    // Uji VIP upgrade
    userRepository.setRole(testUserId, 'vip', 30);
    const vipUser = userRepository.getUser(testUserId)!;
    assert(vipUser.role === 'vip', 'User role upgraded to VIP');
    assert(vipUser.vip_expires_at !== null, 'VIP expiration date is set');
    assert(userRepository.getEffectiveLimit(vipUser) === 50, 'VIP user effective limit is 50');

    // Uji Custom limit
    userRepository.setCustomLimit(testUserId, 100);
    const customUser = userRepository.getUser(testUserId)!;
    assert(userRepository.getEffectiveLimit(customUser) === 100, 'Custom limit overrides role limit');

    // Uji Increment Usage & Reset
    userRepository.incrementDailyUsage(testUserId);
    const usedUser = userRepository.getUser(testUserId)!;
    assert(usedUser.daily_usage === 1, 'Daily usage incremented to 1');

    userRepository.resetAllDailyUsage();
    const resetUser = userRepository.getUser(testUserId)!;
    assert(resetUser.daily_usage === 0, 'Daily usage reset to 0');

    // 3. Uji Download Repository
    downloadRepository.logDownload(testUserId, 'youtube', 'https://youtube.com/watch?v=123', 'video', 15000000);
    downloadRepository.logDownload(testUserId, 'tiktok', 'https://tiktok.com/@user/video/123', 'video', 5000000);
    const dlStats = downloadRepository.getStats();
    assert(dlStats.totalDownloads >= 2, 'Download transactions logged');
    assert(dlStats.byPlatform['youtube'] >= 1, 'YouTube download counted');
    assert(dlStats.byPlatform['tiktok'] >= 1, 'TikTok download counted');

    // 4. Uji System Settings
    settingsRepository.setSetting('test_key', 'test_value');
    assert(settingsRepository.getSetting('test_key') === 'test_value', 'Setting stored and retrieved');

    // 5. Uji URL Regex Detector
    const ytUrl = extractMediaUrl('Tolong downloadkan ini dong https://www.youtube.com/watch?v=dQw4w9WgXcQ mantap!');
    assert(ytUrl === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Extract YouTube URL');

    const ttUrl = extractMediaUrl('cek https://vt.tiktok.com/ZS2xyz/ ya');
    assert(ttUrl === 'https://vt.tiktok.com/ZS2xyz/', 'Extract TikTok short URL');

    const igUrl = extractMediaUrl('https://www.instagram.com/reel/C8xyz123/');
    assert(igUrl === 'https://www.instagram.com/reel/C8xyz123/', 'Extract Instagram Reel URL');

    const xUrl = extractMediaUrl('lihat video di https://x.com/user/status/1234567890');
    assert(xUrl === 'https://x.com/user/status/1234567890', 'Extract X (Twitter) URL');

    const threadsUrl = extractMediaUrl('https://www.threads.net/@user/post/C9xyz');
    assert(threadsUrl === 'https://www.threads.net/@user/post/C9xyz', 'Extract Threads URL');

    const fbUrl = extractMediaUrl('video seru di https://www.facebook.com/watch/?v=123456');
    assert(fbUrl === 'https://www.facebook.com/watch/?v=123456', 'Extract Facebook URL');

    const fbPageVideoUrl = extractMediaUrl('https://www.facebook.com/61594527111015/videos/2185507088679087/?__so__=discover&__rv__=video_home_www_loe_popular_videos&locale=id_ID');
    assert(fbPageVideoUrl === 'https://www.facebook.com/reel/2185507088679087/', 'Normalize Facebook page video URL to canonical Reel URL');

    const redditUrl = extractMediaUrl('cek https://reddit.com/r/videos/comments/xyz123/funny_video/');
    assert(redditUrl === 'https://reddit.com/r/videos/comments/xyz123/funny_video/', 'Extract Reddit URL');

    const pinUrl = extractMediaUrl('pin ini https://pin.it/7aBcDeF keren');
    assert(pinUrl === 'https://pin.it/7aBcDeF', 'Extract Pinterest URL');

    const biliUrl = extractMediaUrl('nonton https://www.bilibili.tv/id/video/4790000 mantap');
    assert(biliUrl === 'https://www.bilibili.tv/id/video/4790000', 'Extract Bilibili TV URL');

    const b23Url = extractMediaUrl('link short https://b23.tv/xyz123');
    assert(b23Url === 'https://b23.tv/xyz123', 'Extract Bilibili b23.tv URL');

    assert(detectPlatform('https://www.facebook.com/watch/?v=123') === 'facebook', 'Detect Facebook platform');
    assert(detectPlatform('https://reddit.com/r/funny/comments/123') === 'reddit', 'Detect Reddit platform');
    assert(detectPlatform('https://pin.it/abc') === 'pinterest', 'Detect Pinterest platform');
    assert(detectPlatform('https://www.bilibili.tv/id/video/123') === 'bilibili', 'Detect Bilibili TV platform');
    assert(detectPlatform('https://b23.tv/123') === 'bilibili', 'Detect Bilibili shortlink platform');

    const nonMedia = extractMediaUrl('https://google.com/search?q=test');
    assert(nonMedia === null, 'Ignore non-supported domain');

    // 6. Uji Photo Service Utilities
    const dummyPhotos = Array.from({ length: 25 }, (_, i) => `photo_${i}.jpg`);
    const chunks = photoService.chunkPhotos(dummyPhotos, 10);
    assert(chunks.length === 3, 'Chunk 25 photos into 3 batches (10, 10, 5)');
    assert(chunks[0].length === 10, 'First batch has 10 photos');
    assert(chunks[2].length === 5, 'Third batch has 5 photos');

    downloadRepository.logDownload(testUserId, 'instagram', 'https://instagram.com/p/abc123/', 'album', 3500000);
    const updatedStats = downloadRepository.getStats();
    assert(updatedStats.byPlatform['instagram'] >= 1, 'Instagram album download logged');

    // 7. Uji findBestDirectUrl
    const mockYtDlpData = {
      formats: [
        { url: 'https://cdn.example.com/audio.mp3', vcodec: 'none', acodec: 'mp3' },
        { url: 'https://cdn.example.com/video_720.mp4', vcodec: 'h264', acodec: 'aac', height: 720 },
        { url: 'https://cdn.example.com/video_360.mp4', vcodec: 'h264', acodec: 'aac', height: 360 },
      ]
    };
    const bestUrl = findBestDirectUrl(mockYtDlpData);
    assert(bestUrl === 'https://cdn.example.com/video_720.mp4', 'findBestDirectUrl picks highest combined resolution');

    // 7. Uji System Service Health
    const health = await systemService.getHealth();
    assert(health.ramTotalMb > 0, 'RAM total detected via systeminformation');
    assert(health.uptimeFormatted.length > 0, 'Uptime formatted successfully');
    console.log(`     [Info Sistem Saat Ini: OS=${health.osName}, RAM=${health.ramUsedMb}/${health.ramTotalMb}MB, Uptime=${health.uptimeFormatted}]`);

    // 8. Uji Orphan File Cleaner
    const cleanResult = systemService.cleanupOrphanFiles(0);
    assert(typeof cleanResult.cleanedCount === 'number', 'Orphan cleaner runs safely');

    // 9. Uji Modul Games & Sistem Koin
    const gameUser = userRepository.getUser(testUserId)!;
    assert(typeof gameUser.coins === 'number', 'User has coins field');
    assert(typeof gameUser.exp === 'number', 'User has exp field');

    const initialCoins = gameUser.coins;
    userRepository.addCoins(testUserId, 50, 10);
    const updatedCoinUser = userRepository.getUser(testUserId)!;
    assert(updatedCoinUser.coins === initialCoins + 50, 'addCoins adds 50 coins');
    assert(updatedCoinUser.exp >= 10, 'addCoins adds 10 exp');

    const deductSuccess = userRepository.deductCoins(testUserId, 30);
    assert(deductSuccess === true, 'deductCoins successfully deducts 30 coins');

    const deductFail = userRepository.deductCoins(testUserId, 999999);
    assert(deductFail === false, 'deductCoins prevents overdraft if insufficient coins');

    userRepository.recordGameResult(testUserId, true, 40, 15);
    const wonUser = userRepository.getUser(testUserId)!;
    assert(wonUser.games_played >= 1 && wonUser.games_won >= 1, 'recordGameResult records win statistics');

    // Uji penukaran koin ke kuota
    userRepository.addCoins(testUserId, 200, 0);
    const exchangeRes = userRepository.exchangeCoinsForQuota(testUserId, 100, 5);
    assert(exchangeRes.success === true, 'exchangeCoinsForQuota converts 100 coins into +5 quota');
    assert(exchangeRes.newLimit >= 10, 'Effective limit increased after exchange');

    // Uji Leaderboard Koin & EXP Terpisah
    const coinsLeaderboard = userRepository.getCoinsLeaderboard(5);
    assert(Array.isArray(coinsLeaderboard) && coinsLeaderboard.length > 0, 'getCoinsLeaderboard returns top players by coins');
    assert(coinsLeaderboard[0].coins >= (coinsLeaderboard[1]?.coins ?? 0), 'Coins leaderboard sorted by coins descending');

    const expLeaderboard = userRepository.getExpLeaderboard(5);
    assert(Array.isArray(expLeaderboard) && expLeaderboard.length > 0, 'getExpLeaderboard returns top players by exp');
    assert(expLeaderboard[0].exp >= (expLeaderboard[1]?.exp ?? 0), 'Exp leaderboard sorted by exp descending');

    // Uji Penukaran Koin Game ke VIP 30 Hari
    userRepository.setCoins(testUserId, 2000);
    const vipExchangeRes = userRepository.exchangeCoinsForVip(testUserId, 1500, 30);
    assert(vipExchangeRes.success === true, 'exchangeCoinsForVip converts 1500 coins to VIP');
    const vipExchangedUser = userRepository.getUser(testUserId)!;
    assert(vipExchangedUser.role === 'vip', 'User role updated to VIP after exchange');
    assert(vipExchangedUser.coins === 500, '1500 coins deducted after VIP exchange (2000 - 1500 = 500)');

    // Uji Level Badge Helper
    const badgePemula = getLevelBadge(50);
    assert(badgePemula.level === 1 && badgePemula.title === 'Pemula', 'Level badge for 50 exp is Pemula (Lv.1)');
    const badgeSultan = getLevelBadge(3200);
    assert(badgeSultan.level === 33 && badgeSultan.title === 'Sultan', 'Level badge for 3200 exp is Sultan (Lv.33)');

    // 10. Uji Repository Transaksi & Duitku Service
    const testOrderId = `TEST_ORDER_${Date.now()}`;
    const tx = transactionRepository.createTransaction({
      telegramId: testUserId,
      merchantOrderId: testOrderId,
      packageId: 'pro',
      amount: 10000,
      coins: 500
    });
    assert(tx.merchant_order_id === testOrderId, 'Transaction created with PENDING status');
    assert(tx.status === 'PENDING', 'Initial transaction status is PENDING');

    const updateSuccess = transactionRepository.updateStatus(testOrderId, 'SUCCESS', 'REF123456');
    assert(updateSuccess === true, 'Transaction status updated to SUCCESS');
    const updatedTx = transactionRepository.getTransaction(testOrderId)!;
    assert(updatedTx.status === 'SUCCESS' && updatedTx.paid_at !== null, 'Transaction reflects SUCCESS status with paid_at timestamp');

    // Uji Duitku Signature MD5
    const testSig = duitkuService.generateInquirySignature('MERCHANT01', 'ORDER01', 10000, 'KEY01');
    assert(typeof testSig === 'string' && testSig.length === 32, 'Duitku MD5 inquiry signature is 32-char hex string');

    // Uji Pembuatan QRIS (Mode Simulasi / Buffer PNG)
    const qrisResult = await duitkuService.createQrisTransaction(testUserId, 'pro', 'test_user');
    assert(qrisResult.success === true, 'createQrisTransaction returns success');
    assert(Buffer.isBuffer(qrisResult.qrBuffer) && qrisResult.qrBuffer.length > 0, 'createQrisTransaction produces valid PNG QR buffer');
    assert(qrisResult.packageInfo.coins === 500, 'Selected package gives 500 coins');

    // Uji Kuis Dataset
    const sampleQuiz = (await import('../src/games/quizData.js')).getRandomQuiz();
    assert(sampleQuiz.options.length === 4, 'Quiz question has 4 options');
    assert(sampleQuiz.correctIndex >= 0 && sampleQuiz.correctIndex <= 3, 'Quiz correct index is valid');

    // Uji Tebak Gambar Dataset & Clue Generator
    const { getRandomTebakGambar, generateClue } = await import('../src/games/tebakGambarData.js');
    const tgItem = getRandomTebakGambar();
    assert(typeof tgItem.img === 'string' && tgItem.img.startsWith('http'), 'Tebak gambar item has valid image URL');
    assert(typeof tgItem.jawaban === 'string' && tgItem.jawaban.length > 0, 'Tebak gambar item has valid answer');
    const clue1 = generateClue('TANTANGAN SERU', 1);
    assert(clue1.includes('_'), 'Clue level 1 masks characters with underscore');
    const clue2 = generateClue('TANTANGAN SERU', 2);
    assert(clue2.length > 0, 'Clue level 2 generated');

    console.log(`\n🏁 Hasil Uji: ${passed} Passed, ${failed} Failed.`);
  } catch (err) {
    console.error('Terjadi error selama pengujian:', err);
    failed++;
  } finally {
    // Reset state user uji
    try {
      userRepository.setCustomLimit(testUserId, null as any);
    } catch {}
    closeDatabase();
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

runTests();

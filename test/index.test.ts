import { runMigrations } from '../src/database/migrations.js';
import { userRepository } from '../src/database/repositories/userRepository.js';
import { downloadRepository } from '../src/database/repositories/downloadRepository.js';
import { settingsRepository } from '../src/database/repositories/settingsRepository.js';
import { extractMediaUrl } from '../src/bot/middlewares/urlDetector.js';
import { systemService } from '../src/services/systemService.js';
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

  try {
    // 1. Uji Database Migrations
    runMigrations();
    assert(true, 'Database migrations execute without error');

    // 2. Uji User Repository & Referral
    const testUserId = 99999991;
    const testRefId = 99999990;

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

    const nonMedia = extractMediaUrl('https://google.com/search?q=test');
    assert(nonMedia === null, 'Ignore non-supported domain');

    // 6. Uji System Service Health
    const health = await systemService.getHealth();
    assert(health.ramTotalMb > 0, 'RAM total detected via systeminformation');
    assert(health.uptimeFormatted.length > 0, 'Uptime formatted successfully');
    console.log(`     [Info Sistem Saat Ini: OS=${health.osName}, RAM=${health.ramUsedMb}/${health.ramTotalMb}MB, Uptime=${health.uptimeFormatted}]`);

    // 7. Uji Orphan File Cleaner
    const cleanResult = systemService.cleanupOrphanFiles(0);
    assert(typeof cleanResult.cleanedCount === 'number', 'Orphan cleaner runs safely');

    console.log(`\n🏁 Hasil Uji: ${passed} Passed, ${failed} Failed.`);
  } catch (err) {
    console.error('Terjadi error selama pengujian:', err);
    failed++;
  } finally {
    closeDatabase();
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests();

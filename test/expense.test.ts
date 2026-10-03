import { runMigrations } from '../src/database/migrations.js';
import { expenseRepository } from '../src/database/repositories/expenseRepository.js';
import { userRepository } from '../src/database/repositories/userRepository.js';
import { formatRupiah } from '../src/utils/format.js';

async function testExpenseSystem() {
  console.log('🧪 Menguji Migrasi & Sistem Catat Pengeluaran...');

  // 1. Jalankan migrasi
  runMigrations();

  // 2. Buat user uji coba
  const testTgId = 999888777;
  userRepository.getOrCreateUser(testTgId, 'testuser_expense');

  // 3. Tambah pengeluaran via teks
  const id1 = expenseRepository.addExpense({
    telegramId: testTgId,
    amount: 25000,
    category: 'Makanan & Minuman',
    merchant: 'Janji Jiwa',
    itemsDetail: 'Kopi Susu Senja',
    rawInput: 'beli kopi 25rb di janji jiwa',
    sourceType: 'text'
  });
  console.log(`✅ Catat Pengeluaran 1 berhasil, ID: ${id1}`);

  // 4. Tambah pengeluaran via foto struk
  const id2 = expenseRepository.addExpense({
    telegramId: testTgId,
    amount: 145000,
    category: 'Belanja Harian',
    merchant: 'Alfamart',
    itemsDetail: 'Susu UHT, Minyak Goreng, Beras',
    rawInput: '[Foto Struk Belanja]',
    sourceType: 'receipt'
  });
  console.log(`✅ Catat Pengeluaran 2 berhasil, ID: ${id2}`);

  // 5. Verifikasi getExpenseById
  const exp1 = expenseRepository.getExpenseById(id1);
  if (!exp1 || exp1.amount !== 25000 || exp1.category !== 'Makanan & Minuman') {
    throw new Error('Verifikasi getExpenseById gagal!');
  }
  console.log('✅ Verifikasi getExpenseById berhasil.');

  // 6. Verifikasi Update Kategori
  const updated = expenseRepository.updateExpenseCategory(id1, testTgId, 'Hiburan');
  if (!updated) throw new Error('Gagal update kategori pengeluaran!');
  const exp1Updated = expenseRepository.getExpenseById(id1);
  if (exp1Updated?.category !== 'Hiburan') throw new Error('Kategori baru tidak tersimpan!');
  console.log('✅ Update kategori pengeluaran berhasil.');

  // 6b. Verifikasi Update Notes
  const updatedNote = expenseRepository.updateExpenseNotes(id1, testTgId, 'Reimburse kantor');
  if (!updatedNote) throw new Error('Gagal update notes pengeluaran!');
  const exp1WithNote = expenseRepository.getExpenseById(id1);
  if (exp1WithNote?.notes !== 'Reimburse kantor') throw new Error('Notes baru tidak tersimpan!');
  console.log('✅ Update notes pengeluaran berhasil.');

  // 7. Verifikasi Summary Hari Ini
  const today = expenseRepository.getTodaySummary(testTgId);
  console.log(`📊 Summary Hari Ini: Total ${formatRupiah(today.totalAmount)}, Transaksi: ${today.count}`);
  if (today.totalAmount < 170000 || today.count < 2) {
    throw new Error('Summary hari ini tidak cocok!');
  }

  // 8. Verifikasi Summary Bulan Ini & Breakdown Kategori
  const thisMonth = expenseRepository.getThisMonthSummary(testTgId);
  console.log(`🗓️ Summary Bulan Ini: Total ${formatRupiah(thisMonth.totalAmount)}, Kategori: ${thisMonth.categoryBreakdown.length}`);
  if (thisMonth.categoryBreakdown.length === 0) {
    throw new Error('Breakdown kategori kosong!');
  }

  // 9. Verifikasi Hapus Pengeluaran
  const deleted1 = expenseRepository.deleteExpense(id1, testTgId);
  const deleted2 = expenseRepository.deleteExpense(id2, testTgId);
  if (!deleted1 || !deleted2) {
    throw new Error('Gagal menghapus pengeluaran pengujian!');
  }
  console.log('✅ Hapus pengeluaran uji coba berhasil.');

  console.log('🎉 Semua pengujian sistem pencatat pengeluaran BERHASIL 100%!\n');
}

testExpenseSystem().catch(err => {
  console.error('❌ Pengujian gagal:', err);
  process.exit(1);
});

import QRCode from 'qrcode';
import { config } from '../config/config.js';
import { transactionRepository, Transaction } from '../database/repositories/transactionRepository.js';
import { userRepository, User } from '../database/repositories/userRepository.js';
import { convertQRIS, validateQRIS, parseQRIS } from './qris/index.js';

export interface TopupPackage {
  id: string;
  name: string;
  coins: number;
  price: number; // Rupiah
  description: string;
  isVipBonus?: boolean;
  vipDays?: number;
}

export const TOPUP_PACKAGES: Record<string, TopupPackage> = {
  starter: {
    id: 'starter',
    name: '🥉 Paket Dukungan Starter',
    coins: 200,
    price: 5000,
    description: '200 Koin untuk puluhan unduhan media & tools'
  },
  pro: {
    id: 'pro',
    name: '🥈 Paket Dukungan Pro',
    coins: 500,
    price: 10000,
    description: '500 Koin (Paling Populer untuk dukung tools)'
  },
  sultan: {
    id: 'sultan',
    name: '🥇 Paket Dukungan Sultan',
    coins: 1200,
    price: 20000,
    description: '1.200 Koin (Bonus ekstra 200 koin!)'
  },
  vip: {
    id: 'vip',
    name: '👑 Paket Dukungan VIP Sultan',
    coins: 2000,
    price: 35000,
    description: 'Status VIP 30 Hari + 2.000 Koin (Akses Bebas Sepuasnya)',
    isVipBonus: true,
    vipDays: 30
  }
};

/**
 * QRIS Statis standar Bank Indonesia sebagai default/cadangan
 * jika admin belum mengonfigurasi QRIS_STATIC_STRING di file .env.
 */
export const DEFAULT_STATIC_QRIS =
  '00020101021126590014ID.LINKAJA.WWW011893600914383120301702150000000000000000303UMI51440014ID.LINKAJA.WWW02150000000000000000303UMI5204581253033605802ID5913MERCHANT TEST6007JAKARTA61051234062070703A016304A8B3';

export class QrisService {
  /**
   * Mengambil payload QRIS Statis yang aktif (dari .env atau fallback default).
   */
  getActiveStaticQris(): { qris: string; isFallback: boolean } {
    const customQris = (config.qrisStaticString || '').trim();
    if (customQris) {
      const validation = validateQRIS(customQris);
      if (validation.valid) {
        return { qris: customQris, isFallback: false };
      }
      console.warn('⚠️ QRIS_STATIC_STRING di .env tidak valid. Menggunakan QRIS default cadangan:', validation.errors);
    }
    return { qris: DEFAULT_STATIC_QRIS, isFallback: true };
  }

  /**
   * Membuat transaksi baru dan menghasilkan QR Code QRIS Dinamis
   * dengan nominal pas sesuai harga paket koin.
   */
  async createDynamicQrisTransaction(
    userId: number,
    packageId: string,
    username?: string
  ): Promise<{
    success: boolean;
    orderId: string;
    dynamicQris: string;
    qrBuffer: Buffer;
    packageInfo: TopupPackage;
    isFallback: boolean;
    merchantName?: string;
    errorMessage?: string;
  }> {
    const pkg = TOPUP_PACKAGES[packageId];
    if (!pkg) {
      return {
        success: false,
        orderId: '',
        dynamicQris: '',
        qrBuffer: Buffer.alloc(0),
        packageInfo: null as any,
        isFallback: false,
        errorMessage: 'Paket top-up tidak ditemukan.'
      };
    }

    try {
      const { qris: staticQris, isFallback } = this.getActiveStaticQris();

      // Konversi QRIS Statis menjadi QRIS Dinamis dengan nominal pas
      const dynamicQris = convertQRIS(staticQris, { amount: pkg.price });

      // Generate Gambar QR PNG beresolusi tinggi
      const qrBuffer = await QRCode.toBuffer(dynamicQris, {
        type: 'png',
        width: 450,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });

      const orderId = `TOPUP_${userId}_${Date.now()}`;

      // Simpan ke database transaksi dengan status PENDING
      transactionRepository.createTransaction({
        telegramId: userId,
        merchantOrderId: orderId,
        reference: null,
        packageId: pkg.id,
        amount: pkg.price,
        coins: pkg.coins
      });

      let merchantName: string | undefined;
      try {
        const parsed = parseQRIS(dynamicQris);
        merchantName = parsed.merchantName;
      } catch {
        // Abaikan jika parsing nama gagal
      }

      return {
        success: true,
        orderId,
        dynamicQris,
        qrBuffer,
        packageInfo: pkg,
        isFallback,
        merchantName
      };
    } catch (err: any) {
      console.error('Error saat membuat QRIS Dinamis:', err);
      return {
        success: false,
        orderId: '',
        dynamicQris: '',
        qrBuffer: Buffer.alloc(0),
        packageInfo: pkg,
        isFallback: false,
        errorMessage: err.message || 'Gagal mengubah kode QRIS menjadi dinamis.'
      };
    }
  }

  /**
   * Konfirmasi manual pembayaran oleh Admin:
   * Mengubah status transaksi menjadi SUCCESS, menambahkan koin/EXP ke user,
   * serta mengaktifkan status VIP (jika paket VIP).
   */
  confirmPayment(orderId: string, adminId: number): {
    success: boolean;
    transaction?: Transaction;
    packageInfo?: TopupPackage;
    updatedUser?: User | null;
    errorMessage?: string;
  } {
    const tx = transactionRepository.getTransaction(orderId);
    if (!tx) {
      return { success: false, errorMessage: 'Data transaksi tidak ditemukan di database.' };
    }

    if (tx.status === 'SUCCESS') {
      return { success: false, errorMessage: 'Transaksi ini sudah dikonfirmasi sebelumnya.' };
    }

    const pkg = TOPUP_PACKAGES[tx.package_id];
    if (!pkg) {
      return { success: false, errorMessage: 'Data paket tidak valid.' };
    }

    // Perbarui status transaksi menjadi SUCCESS
    const reference = `MANUAL_ADMIN_${adminId}`;
    transactionRepository.updateStatus(orderId, 'SUCCESS', reference);

    // Tambahkan Koin & EXP ke akun user
    const expBonus = Math.floor(pkg.coins / 10);
    userRepository.addCoins(tx.telegram_id, pkg.coins, expBonus);

    // Jika paket VIP, berikan masa aktif VIP (misal 30 hari)
    if (pkg.isVipBonus && pkg.vipDays) {
      userRepository.setRole(tx.telegram_id, 'vip', pkg.vipDays);
    }

    const updatedUser = userRepository.getUser(tx.telegram_id);

    return {
      success: true,
      transaction: tx,
      packageInfo: pkg,
      updatedUser
    };
  }

  /**
   * Penolakan manual bukti pembayaran oleh Admin.
   */
  rejectPayment(orderId: string, adminId: number): {
    success: boolean;
    transaction?: Transaction;
    errorMessage?: string;
  } {
    const tx = transactionRepository.getTransaction(orderId);
    if (!tx) {
      return { success: false, errorMessage: 'Data transaksi tidak ditemukan.' };
    }

    if (tx.status === 'SUCCESS') {
      return { success: false, errorMessage: 'Transaksi ini sudah berstatus sukses dan tidak dapat ditolak.' };
    }

    const reference = `REJECTED_ADMIN_${adminId}`;
    transactionRepository.updateStatus(orderId, 'REJECTED', reference);

    return {
      success: true,
      transaction: tx
    };
  }
}

export const qrisService = new QrisService();

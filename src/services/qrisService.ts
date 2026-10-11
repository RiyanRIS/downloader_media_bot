import QRCode from 'qrcode';
import { config } from '../config/config.js';
import { donationRepository, Donation } from '../database/repositories/donationRepository.js';
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
   * Membuat transaksi dukungan sukarela langsung menggunakan QRIS Statis murni
   * tanpa penentuan nominal (pengguna bebas transfer berapapun).
   */
  async getStaticQrisTransaction(
    userId: number,
    _username?: string
  ): Promise<{
    success: boolean;
    orderId: string;
    staticQris: string;
    qrBuffer: Buffer;
    merchantName?: string;
    isFallback: boolean;
    errorMessage?: string;
  }> {
    try {
      const { qris: staticQris, isFallback } = this.getActiveStaticQris();

      // Generate Gambar QR PNG dari QRIS Statis murni
      const qrBuffer = await QRCode.toBuffer(staticQris, {
        type: 'png',
        width: 450,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });

      const orderId = `DONASI_${userId}_${Date.now()}`;

      // Simpan ke database donasi sebagai status PENDING
      donationRepository.createDonation({
        telegramId: userId,
        orderId,
        amount: 0
      });

      let merchantName: string | undefined;
      try {
        const parsed = parseQRIS(staticQris);
        merchantName = parsed.merchantName;
      } catch {
        // Abaikan jika parsing nama merchant gagal
      }

      return {
        success: true,
        orderId,
        staticQris,
        qrBuffer,
        merchantName,
        isFallback
      };
    } catch (err: any) {
      console.error('Error saat membuat QRIS Statis:', err);
      return {
        success: false,
        orderId: '',
        staticQris: '',
        qrBuffer: Buffer.alloc(0),
        isFallback: false,
        errorMessage: err.message || 'Gagal menghasilkan gambar QRIS.'
      };
    }
  }

  /**
   * Membuat transaksi baru dan menghasilkan QR Code QRIS Dinamis
   * Mendukung pilihan paket bawaan maupun nominal donasi bebas (minimal Rp 1.000).
   */
  async createDynamicQrisTransaction(
    userId: number,
    packageIdOrAmount: string | number,
    username?: string
  ): Promise<{
    success: boolean;
    orderId: string;
    dynamicQris: string;
    qrBuffer: Buffer;
    amount: number;
    title: string;
    packageInfo?: TopupPackage;
    isFallback: boolean;
    merchantName?: string;
    errorMessage?: string;
  }> {
    let price: number = 0;
    let title: string = 'Dukungan Sukarela';
    let pkg: TopupPackage | undefined;
    let pkgId: string = 'DONATION';
    let coinsBonus: number = 0;

    if (typeof packageIdOrAmount === 'number') {
      price = Math.floor(packageIdOrAmount);
      pkgId = `DONASI_${price}`;
      title = `💖 Donasi Sukarela Rp ${new Intl.NumberFormat('id-ID').format(price)}`;
    } else if (TOPUP_PACKAGES[packageIdOrAmount]) {
      pkg = TOPUP_PACKAGES[packageIdOrAmount];
      price = pkg.price;
      pkgId = pkg.id;
      title = pkg.name;
      coinsBonus = pkg.coins;
    } else {
      const parsedNum = parseInt(packageIdOrAmount.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(parsedNum)) {
        price = parsedNum;
        pkgId = `DONASI_${price}`;
        title = `💖 Donasi Sukarela Rp ${new Intl.NumberFormat('id-ID').format(price)}`;
      }
    }

    if (!price || price < 1000) {
      return {
        success: false,
        orderId: '',
        dynamicQris: '',
        qrBuffer: Buffer.alloc(0),
        amount: 0,
        title: '',
        packageInfo: undefined,
        isFallback: false,
        errorMessage: 'Nominal donasi minimal adalah Rp 1.000.'
      };
    }

    try {
      const { qris: staticQris, isFallback } = this.getActiveStaticQris();

      // Konversi QRIS Statis menjadi QRIS Dinamis dengan nominal pas
      const dynamicQris = convertQRIS(staticQris, { amount: price });

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

      const orderId = `DONASI_${userId}_${Date.now()}`;

      // Simpan ke database donasi dengan status PENDING
      donationRepository.createDonation({
        telegramId: userId,
        orderId,
        amount: price
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
        amount: price,
        title,
        packageInfo: pkg || {
          id: pkgId,
          name: title,
          coins: coinsBonus,
          price,
          description: 'Dukungan sukarela untuk kelangsungan server'
        },
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
        amount: price,
        title: '',
        packageInfo: pkg,
        isFallback: false,
        errorMessage: err.message || 'Gagal mengubah kode QRIS menjadi dinamis.'
      };
    }
  }

  /**
   * Konfirmasi manual pembayaran donasi oleh Admin:
   * Mengubah status transaksi menjadi SUCCESS, memberikan badge Sahabat Dermawan (VIP 30 Hari) & bonus EXP keaktifan.
   */
  confirmPayment(orderId: string, adminId: number): {
    success: boolean;
    transaction?: Donation;
    packageInfo?: TopupPackage;
    updatedUser?: User | null;
    errorMessage?: string;
  } {
    const tx = donationRepository.getDonation(orderId);
    if (!tx) {
      return { success: false, errorMessage: 'Data donasi tidak ditemukan di database.' };
    }

    if (tx.status === 'SUCCESS') {
      return { success: false, errorMessage: 'Donasi ini sudah dikonfirmasi sebelumnya.' };
    }

    const pkg = {
      id: orderId,
      name: tx.amount > 0 ? `Donasi Sukarela Rp ${new Intl.NumberFormat('id-ID').format(tx.amount)}` : 'Dukungan Sukarela',
      coins: 0,
      price: tx.amount,
      description: 'Dukungan sukarela untuk kelangsungan bot'
    };

    // Perbarui status donasi menjadi SUCCESS
    donationRepository.updateStatus(orderId, 'SUCCESS', adminId);

    // Berikan reward EXP keaktifan (minimal 100 EXP untuk donasi sukarela)
    const expBonus = tx.amount > 0 ? Math.max(50, Math.floor(tx.amount / 100)) : 100;
    userRepository.addExp(tx.telegram_id, expBonus);

    // Berikan gelar kehormatan donatur / VIP 30 hari
    userRepository.setRole(tx.telegram_id, 'vip', 30);

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
    transaction?: Donation;
    errorMessage?: string;
  } {
    const tx = donationRepository.getDonation(orderId);
    if (!tx) {
      return { success: false, errorMessage: 'Data donasi tidak ditemukan.' };
    }

    if (tx.status === 'SUCCESS') {
      return { success: false, errorMessage: 'Donasi ini sudah berstatus sukses dan tidak dapat ditolak.' };
    }

    donationRepository.updateStatus(orderId, 'REJECTED', adminId);

    return {
      success: true,
      transaction: tx
    };
  }
}

export const qrisService = new QrisService();

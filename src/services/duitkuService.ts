import crypto from 'crypto';
import QRCode from 'qrcode';
import { Bot, InputFile, Api } from 'grammy';
import { config } from '../config/config.js';
import { transactionRepository } from '../database/repositories/transactionRepository.js';
import { userRepository } from '../database/repositories/userRepository.js';
import { escapeHtml } from '../utils/format.js';

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
    name: '🥉 Paket Starter',
    coins: 200,
    price: 5000,
    description: '200 Koin untuk puluhan unduhan media'
  },
  pro: {
    id: 'pro',
    name: '🥈 Paket Pro',
    coins: 500,
    price: 10000,
    description: '500 Koin (Paling Populer & Hemat)'
  },
  sultan: {
    id: 'sultan',
    name: '🥇 Paket Sultan',
    coins: 1200,
    price: 20000,
    description: '1.200 Koin (Bonus ekstra 200 koin!)'
  },
  vip: {
    id: 'vip',
    name: '👑 Paket VIP Sultan',
    coins: 2000,
    price: 35000,
    description: 'Status VIP 30 Hari + 2.000 Koin (Bebas Unduh Sepuasnya)',
    isVipBonus: true,
    vipDays: 30
  }
};

interface DuitkuInquiryResponse {
  merchantCode?: string;
  reference?: string;
  paymentUrl?: string;
  qrString?: string;
  statusCode?: string;
  statusMessage?: string;
}

interface DuitkuStatusResponse {
  merchantOrderId?: string;
  reference?: string;
  amount?: string;
  statusCode?: string;
  statusMessage?: string;
}

export class DuitkuService {
  private activePollers = new Map<string, NodeJS.Timeout>();

  private getInquiryUrl(): string {
    return config.duitkuSandbox
      ? 'https://sandbox.duitku.com/webapi/api/merchant/v2/inquiry'
      : 'https://passport.duitku.com/webapi/api/merchant/v2/inquiry';
  }

  private getStatusUrl(): string {
    return config.duitkuSandbox
      ? 'https://sandbox.duitku.com/webapi/api/merchant/transactionStatus'
      : 'https://passport.duitku.com/webapi/api/merchant/transactionStatus';
  }

  generateInquirySignature(merchantCode: string, orderId: string, amount: number, apiKey: string): string {
    return crypto
      .createHash('md5')
      .update(`${merchantCode}${orderId}${amount}${apiKey}`)
      .digest('hex');
  }

  generateStatusSignature(merchantCode: string, orderId: string, apiKey: string): string {
    return crypto
      .createHash('md5')
      .update(`${merchantCode}${orderId}${apiKey}`)
      .digest('hex');
  }

  async createQrisTransaction(
    userId: number,
    packageId: string,
    username?: string
  ): Promise<{
    success: boolean;
    orderId: string;
    reference: string;
    qrBuffer: Buffer;
    packageInfo: TopupPackage;
    isSimulated?: boolean;
    errorMessage?: string;
  }> {
    const pkg = TOPUP_PACKAGES[packageId];
    if (!pkg) {
      return { success: false, orderId: '', reference: '', qrBuffer: Buffer.alloc(0), packageInfo: null as any, errorMessage: 'Paket tidak ditemukan.' };
    }

    const orderId = `TOPUP_${userId}_${Date.now()}`;

    // Periksa apakah credentials Duitku sudah diisi
    if (!config.duitkuMerchantCode || !config.duitkuApiKey) {
      // Mode simulasi/testing jika admin belum memasukkan Duitku merchant code di .env
      const dummyQrData = `https://duitku.com/simulasi-qris?order=${orderId}&amount=${pkg.price}`;
      const dummyBuffer = await QRCode.toBuffer(dummyQrData, {
        type: 'png',
        width: 420,
        margin: 2
      });

      transactionRepository.createTransaction({
        telegramId: userId,
        merchantOrderId: orderId,
        reference: `SIM_${Date.now()}`,
        packageId: pkg.id,
        amount: pkg.price,
        coins: pkg.coins
      });

      return {
        success: true,
        orderId,
        reference: `SIM_${Date.now()}`,
        qrBuffer: dummyBuffer,
        packageInfo: pkg,
        isSimulated: true
      };
    }

    // Call official Duitku Inquiry API
    const signature = this.generateInquirySignature(
      config.duitkuMerchantCode,
      orderId,
      pkg.price,
      config.duitkuApiKey
    );

    const payload = {
      merchantCode: config.duitkuMerchantCode,
      paymentAmount: pkg.price,
      paymentMethod: config.duitkuPaymentMethod || 'NQ',
      merchantOrderId: orderId,
      productDetails: `${pkg.name} (${pkg.coins} Koin)`,
      email: `${userId}@telegram.bot`,
      phoneNumber: '08123456789',
      additionalParam: `${userId}:${pkg.id}`,
      merchantUserInfo: `tg_${userId}`,
      customerVaName: username || `User ${userId}`,
      callbackUrl: config.duitkuCallbackUrl || '',
      returnUrl: '',
      signature,
      expiryPeriod: 15 // 15 menit
    };

    try {
      const response = await fetch(this.getInquiryUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const resData = (await response.json()) as DuitkuInquiryResponse;

      if (resData.statusCode === '00' && (resData.qrString || resData.paymentUrl)) {
        const qrString = resData.qrString || resData.paymentUrl!;
        const qrBuffer = await QRCode.toBuffer(qrString, {
          type: 'png',
          width: 420,
          margin: 2
        });

        transactionRepository.createTransaction({
          telegramId: userId,
          merchantOrderId: orderId,
          reference: resData.reference || null,
          packageId: pkg.id,
          amount: pkg.price,
          coins: pkg.coins
        });

        return {
          success: true,
          orderId,
          reference: resData.reference || '',
          qrBuffer,
          packageInfo: pkg
        };
      } else {
        return {
          success: false,
          orderId,
          reference: '',
          qrBuffer: Buffer.alloc(0),
          packageInfo: pkg,
          errorMessage: resData.statusMessage || 'Gagal memproses QRIS dari Duitku.'
        };
      }
    } catch (err: any) {
      console.error('Error saat menghubungi Duitku Inquiry API:', err);
      return {
        success: false,
        orderId,
        reference: '',
        qrBuffer: Buffer.alloc(0),
        packageInfo: pkg,
        errorMessage: err.message || 'Koneksi ke gateway pembayaran Duitku gagal.'
      };
    }
  }

  async checkTransactionStatus(orderId: string): Promise<DuitkuStatusResponse | null> {
    if (!config.duitkuMerchantCode || !config.duitkuApiKey) {
      // Jika mode simulasi
      const tx = transactionRepository.getTransaction(orderId);
      if (!tx) return null;
      return {
        merchantOrderId: orderId,
        reference: tx.reference || '',
        statusCode: tx.status === 'SUCCESS' ? '00' : '01',
        statusMessage: tx.status
      };
    }

    const signature = this.generateStatusSignature(
      config.duitkuMerchantCode,
      orderId,
      config.duitkuApiKey
    );

    const payload = {
      merchantCode: config.duitkuMerchantCode,
      merchantOrderId: orderId,
      signature
    };

    try {
      const response = await fetch(this.getStatusUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      return (await response.json()) as DuitkuStatusResponse;
    } catch (err) {
      console.error(`Gagal cek status transaksi Duitku ${orderId}:`, err);
      return null;
    }
  }

  startPolling(
    botOrApi: Bot<any> | Api | any,
    orderId: string,
    userId: number,
    chatId: number,
    messageId: number,
    packageInfo: TopupPackage
  ): void {
    // Hentikan poller lama jika ada
    this.stopPolling(orderId);

    const api: Api = (botOrApi as any)?.api || botOrApi;
    const startTime = Date.now();
    const maxDurationMs = 15 * 60 * 1000; // 15 Menit

    const timer = setInterval(async () => {
      try {
        // Periksa apakah waktu 15 menit habis
        if (Date.now() - startTime > maxDurationMs) {
          this.stopPolling(orderId);
          transactionRepository.updateStatus(orderId, 'EXPIRED');

          await api.editMessageCaption(chatId, messageId, {
            caption:
              `⌛ <b>WAKTU PEMBAYARAN KEDALUWARSA</b>\n\n` +
              `• <b>Order ID:</b> <code>${orderId}</code>\n` +
              `• <b>Paket:</b> ${escapeHtml(packageInfo.name)}\n` +
              `• <b>Status:</b> Batas waktu pembayaran (15 menit) telah habis.\n\n` +
              `Silakan ketik /topup untuk membuat pesanan baru.`,
            parse_mode: 'HTML'
          }).catch(() => {});
          return;
        }

        // Cek status ke Duitku
        const statusRes = await this.checkTransactionStatus(orderId);
        if (statusRes && statusRes.statusCode === '00') {
          // Pembayaran Sukses!
          this.stopPolling(orderId);
          await this.handlePaymentSuccess(api, orderId, userId, chatId, messageId, packageInfo, statusRes.reference);
        }
      } catch (err) {
        console.error(`[Duitku Poller] Error saat polling transaksi ${orderId}:`, err);
      }
    }, 6000); // Polling setiap 6 detik

    this.activePollers.set(orderId, timer);
  }

  stopPolling(orderId: string): void {
    const timer = this.activePollers.get(orderId);
    if (timer) {
      clearInterval(timer);
      this.activePollers.delete(orderId);
    }
  }

  async handlePaymentSuccess(
    botOrApi: Bot<any> | Api | any,
    orderId: string,
    userId: number,
    chatId: number,
    messageId: number,
    packageInfo: TopupPackage,
    reference?: string
  ): Promise<void> {
    try {
      const api: Api = (botOrApi as any)?.api || botOrApi;
      const tx = transactionRepository.getTransaction(orderId);
      if (tx && tx.status === 'SUCCESS') {
        return; // Sudah diproses
      }

      transactionRepository.updateStatus(orderId, 'SUCCESS', reference);

      // Tambah Koin & EXP ke User
      const expReward = Math.floor(packageInfo.coins / 10);
      userRepository.addCoins(userId, packageInfo.coins, expReward);

      // Jika paket VIP, berikan role VIP
      if (packageInfo.isVipBonus && packageInfo.vipDays) {
        userRepository.setRole(userId, 'vip', packageInfo.vipDays);
      }

      const updatedUser = userRepository.getUser(userId);
      const coinsNow = updatedUser ? updatedUser.coins : 0;
      const formattedPrice = new Intl.NumberFormat('id-ID').format(packageInfo.price);

      const successCaption =
        `🎉 <b>PEMBAYARAN BERHASIL DITERIMA!</b> 🎉\n\n` +
        `Terima kasih! Pembayaran Anda telah kami verifikasi secara otomatis oleh sistem Duitku.\n\n` +
        `🧾 <b>Rincian Transaksi:</b>\n` +
        `• <b>Order ID:</b> <code>${orderId}</code>\n` +
        `• <b>Paket:</b> ${escapeHtml(packageInfo.name)}\n` +
        `• <b>Total Bayar:</b> Rp ${formattedPrice}\n` +
        `• <b>Koin Ditambahkan:</b> <b>+${packageInfo.coins} Koin</b> (+${expReward} EXP)\n` +
        (packageInfo.isVipBonus ? `• <b>Status VIP:</b> Aktif selama 30 Hari!\n` : '') +
        `• <b>Saldo Koin Sekarang:</b> 💰 <b>${coinsNow} Koin</b>\n\n` +
        `Koin Anda sudah siap digunakan untuk mengunduh media atau bermain di arena /games!`;

      await api.editMessageCaption(chatId, messageId, {
        caption: successCaption,
        parse_mode: 'HTML',
        reply_markup: undefined
      }).catch(() => {});

      // Notifikasi ke seluruh Admin
      const adminNotif =
        `💰 <b>NOTIFIKASI PEMBAYARAN MASUK (DUITKU QRIS)</b>\n\n` +
        `• <b>User ID:</b> <code>${userId}</code>\n` +
        `• <b>Order ID:</b> <code>${orderId}</code>\n` +
        `• <b>Paket:</b> ${packageInfo.name}\n` +
        `• <b>Nominal:</b> Rp ${formattedPrice}\n` +
        `• <b>Waktu:</b> ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;

      for (const adminId of config.adminIds) {
        await api.sendMessage(adminId, adminNotif, { parse_mode: 'HTML' }).catch(() => {});
      }
    } catch (err) {
      console.error(`[Duitku] Error saat memproses pembayaran sukses untuk order ${orderId}:`, err);
    }
  }
}

export const duitkuService = new DuitkuService();

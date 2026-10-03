import { GoogleGenAI } from '@google/genai';
import { config } from '../config/config.js';

export interface ExtractedExpense {
  amount: number;
  category: string;
  merchant: string | null;
  items: string[];
  notes?: string;
}

const EXPENSE_CATEGORIES = [
  'Makanan & Minuman',
  'Belanja Harian',
  'Transportasi',
  'Tagihan & Pulsa',
  'Hiburan',
  'Kesehatan',
  'Lainnya'
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

class AiExpenseService {
  private clientPool = new Map<string, GoogleGenAI>();

  private getClient(apiKey: string): GoogleGenAI {
    let client = this.clientPool.get(apiKey);
    if (!client) {
      client = new GoogleGenAI({ apiKey });
      this.clientPool.set(apiKey, client);
    }
    return client;
  }

  /**
   * Format pesan error Google API menjadi penjelasan bahasa Indonesia yang ramah pengguna
   */
  private formatAiError(err: any): Error {
    const rawMsg = err?.message || String(err);

    if (rawMsg.includes('503') || rawMsg.includes('high demand') || rawMsg.includes('UNAVAILABLE')) {
      return new Error('Server Google AI saat ini sedang mengalami lonjakan antrean trafik (High Demand). Mohon tunggu beberapa detik lalu kirim ulang perintah Anda.');
    }
    if (rawMsg.includes('429') || rawMsg.includes('RESOURCE_EXHAUSTED')) {
      return new Error('Batas kuota gratis Google AI (Rate Limit) tercapai pada seluruh API Key yang terdaftar. Silakan coba kembali dalam 1 menit.');
    }
    if (rawMsg.includes('400') || rawMsg.includes('API key not valid')) {
      return new Error('GEMINI_API_KEY tidak valid. Silakan periksa kembali API Key Anda dari Google AI Studio.');
    }
    if (rawMsg.includes('404') || rawMsg.includes('NOT_FOUND')) {
      return new Error('Model Gemini tidak ditemukan atau belum aktif pada akun Anda.');
    }

    return new Error(rawMsg);
  }

  /**
   * Eksekusi pemanggilan Gemini dengan multi-key failover rotation, automatic retry & fallback model
   */
  private async executeGenerate(params: {
    systemPrompt: string;
    userParts: any[];
  }): Promise<string> {
    const keys = config.geminiApiKeys;

    if (keys.length === 0) {
      throw new Error('GEMINI_API_KEY belum disetel pada file .env.');
    }

    // Daftar model resmi yang aktif dan terdaftar langsung di Google API
    const modelsToTry = [
      'gemini-flash-latest',
      'gemini-flash-lite-latest',
      'gemini-3.8-flash',
      'gemini-3.5-flash'
    ];

    let lastError: any = null;
    let encountered503 = false;
    let encountered429 = false;

    // Iterasi melalui daftar API Key yang tersedia (Failover jika ada key yang habis kuota / error)
    for (let keyIdx = 0; keyIdx < keys.length; keyIdx++) {
      const apiKey = keys[keyIdx];
      const ai = this.getClient(apiKey);
      let keyExhausted = false;

      for (const model of modelsToTry) {
        if (keyExhausted) break;

        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const response = await ai.models.generateContent({
              model,
              contents: [
                {
                  role: 'user',
                  parts: [
                    { text: params.systemPrompt },
                    ...params.userParts
                  ]
                }
              ],
              config: {
                responseMimeType: 'application/json'
              }
            });

            const outputText = response.text?.trim();
            if (outputText) return outputText;
          } catch (err: any) {
            lastError = err;
            const msg = err?.message || String(err);

            const isOverloaded = msg.includes('503') || msg.includes('high demand') || msg.includes('UNAVAILABLE');
            const isQuotaExhausted = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota') || msg.includes('Too Many Requests');
            const isKeyInvalid = msg.includes('400') && msg.includes('API key not valid');

            // Jika key ini terkena limit kuota atau invalid, beralih ke key cadangan berikutnya
            if (isQuotaExhausted || isKeyInvalid) {
              encountered429 = true;
              keyExhausted = true;
              const reason = isQuotaExhausted ? 'mencapai batas kuota (429)' : 'tidak valid (400)';
              console.warn(`⚠️ [Gemini Key Failover] Key #${keyIdx + 1} (...${apiKey.slice(-6)}) ${reason}.`);
              if (keyIdx < keys.length - 1) {
                console.log(`🔄 Mengalihkan ke API Key cadangan #${keyIdx + 2} (...${keys[keyIdx + 1].slice(-6)})...`);
              }
              break; // Keluar dari loop model untuk key ini, beralih ke key berikutnya
            }

            if (isOverloaded) {
              encountered503 = true;
              // Jika terkena 503 di percobaan ke-1, tunggu 1.5 detik lalu coba lagi
              if (attempt === 1) {
                await new Promise(resolve => setTimeout(resolve, 1500));
                continue;
              }
            }

            // Jika model tidak ditemukan (404), langsung lewati ke model berikutnya
            break;
          }
        }
      }
    }

    // Jika terjadi 503 pada server Google dan bukan masalah kuota, utamakan pesan lonjakan trafik
    if (encountered503 && !encountered429) {
      throw new Error('Server Google AI saat ini sedang mengalami lonjakan antrean trafik (High Demand). Silakan kirim ulang perintah atau foto Anda dalam beberapa detik.');
    }

    throw this.formatAiError(lastError);
  }

  /**
   * Ekstraksi pengeluaran dari teks santai / cerita pengeluaran
   */
  async parseExpenseFromText(text: string): Promise<ExtractedExpense> {
    const systemPrompt = `
Anda adalah asisten pencatat keuangan pribadi cerdas untuk pengguna di Indonesia.
Tugas Anda mengekstrak informasi pengeluaran/belanja dari kalimat santai pengguna ke dalam format JSON.

Aturan Ekstraksi:
1. Nominal (amount): Cari nominal uang yang dikeluarkan. Pahami bahasa sehari-hari dan slang Indonesia:
   - "25k" / "25rb" -> 25000
   - "150rb" / "150k" -> 150000
   - "ceban" -> 10000, "goceng" -> 5000, "seceng" -> 1000, "noban" -> 20000, "gocap" -> 50000, "cepek" -> 100000
   - "1.5jt" / "1,5 juta" -> 1500000
   - "50 ribu" -> 50000
   Nilai 'amount' HARUS berupa bilangan bulat murni (integer).
2. Kategori (category): Pilih SATU kategori yang paling relevan:
   - "Makanan & Minuman": makan, minum, kopi, kafe, resto, soto, mie, sarapan, nongkrong, dll.
   - "Belanja Harian": alfamart, indomaret, minimarket, sabun, beras, belanja dapur, dll.
   - "Transportasi": bensin, pertalite, pertamax, gojek, grab, ojol, tiket, tol, parkir.
   - "Tagihan & Pulsa": listrik, pln, pulsa, kuota, wifi, indihome, pdam, bpjs, langganan.
   - "Hiburan": nonton, bioskop, game, topup game, jalan-jalan, rekreasi.
   - "Kesehatan": apotek, obat, dokter, vitamin, klinik.
   - "Lainnya": jika tidak cocok dengan kategori di atas.
3. Tempat / Merchant: Nama toko, warung, tempat belanja, atau aplikasi jika ada (misal: "Indomaret", "Starbucks", "Warung Bu Siti", "Pertamina"). Jika tidak disebutkan, isi null.
4. Item: Daftar item atau barang/jasa yang dibeli berupa array string (misal: ["kopi susu", "croissant"]).
5. Catatan (notes): Keterangan singkat mengenai transaksi tersebut.

Format Output WAJIB JSON persis seperti ini:
{
  "amount": 25000,
  "category": "Makanan & Minuman",
  "merchant": "Janji Jiwa",
  "items": ["Kopi Susu"],
  "notes": "Beli kopi sore"
}
Jika kalimat sama sekali bukan pengeluaran atau tidak ada nominal uang yang bisa dihitung, kembalikan:
{
  "amount": 0,
  "category": "Lainnya",
  "merchant": null,
  "items": [],
  "notes": "Bukan pengeluaran yang valid"
}
`;

    const outputText = await this.executeGenerate({
      systemPrompt,
      userParts: [{ text: `Kalimat belanja pengguna: "${text}"` }]
    });

    const parsed = JSON.parse(outputText);

    if (!parsed.amount || parsed.amount <= 0) {
      throw new Error('Nominal pengeluaran tidak ditemukan atau tidak valid dari teks yang Anda berikan.');
    }

    return {
      amount: Math.round(Number(parsed.amount)),
      category: EXPENSE_CATEGORIES.includes(parsed.category) ? parsed.category : 'Lainnya',
      merchant: parsed.merchant || null,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      notes: parsed.notes || undefined
    };
  }

  /**
   * Ekstraksi pengeluaran dari foto struk belanja (Receipt OCR)
   */
  async parseExpenseFromReceipt(imageBuffer: Buffer, mimeType = 'image/jpeg'): Promise<ExtractedExpense> {
    const systemPrompt = `
Anda adalah sistem cerdas pembaca struk / nota belanja (OCR & receipt parser) untuk pengguna di Indonesia.
Analisis foto struk yang diberikan dan ekstrak data transaksi keuangan ke dalam format JSON.

Panduan:
1. Total Pembayaran (amount):
   - Ambil nilai GRAND TOTAL / TOTAL AKHIR yang dibayarkan oleh pelanggan dalam bentuk angka bulat (integer).
   - Perhatikan jika ada diskon, pajak (PPN/tax), atau service charge, yang diambil adalah nilai TOTAL AKHIR YANG HARUS DIBAYAR / DIBAYAR TUNAI/KARTU.
2. Tempat / Merchant:
   - Cari nama toko / restoran / merchant di bagian atas atau logo struk (misal: "Indomaret", "Alfamart", "SPBU", "KFC", "Transmart", dll).
3. Kategori:
   - Pilih satu: "Makanan & Minuman", "Belanja Harian", "Transportasi", "Tagihan & Pulsa", "Hiburan", "Kesehatan", atau "Lainnya".
4. Item:
   - Tuliskan 3-5 item utama yang dibeli pada struk tersebut.
5. Catatan:
   - Tuliskan tanggal transaksi jika terlihat, atau info ringkas lainnya.

Format JSON WAJIB persis seperti:
{
  "amount": 47500,
  "category": "Belanja Harian",
  "merchant": "Alfamart",
  "items": ["Susu UHT 1L", "Roti Cokelat", "Air Mineral"],
  "notes": "Struk Alfamart"
}
Jika gambar buram, bukan foto struk, atau tidak terbaca nominal totalnya, kembalikan:
{
  "amount": 0,
  "category": "Lainnya",
  "merchant": null,
  "items": [],
  "notes": "Struk tidak terbaca atau bukan foto struk"
}
`;

    const base64Data = imageBuffer.toString('base64');

    const outputText = await this.executeGenerate({
      systemPrompt,
      userParts: [
        {
          inlineData: {
            mimeType,
            data: base64Data
          }
        }
      ]
    });

    const parsed = JSON.parse(outputText);

    if (!parsed.amount || parsed.amount <= 0) {
      throw new Error('Total belanja pada foto struk tidak dapat terbaca atau tidak valid. Pastikan foto struk terlihat jelas dan terang.');
    }

    return {
      amount: Math.round(Number(parsed.amount)),
      category: EXPENSE_CATEGORIES.includes(parsed.category) ? parsed.category : 'Lainnya',
      merchant: parsed.merchant || null,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      notes: parsed.notes || undefined
    };
  }
}

export const aiExpenseService = new AiExpenseService();

export interface Family100Item {
  soal: string;
  jawaban: string[];
}

// 40+ Soal Family 100 Lokal Curated sebagai offline fallback
export const FAMILY100_LOCAL: Family100Item[] = [
  {
    soal: "Hotel Bintang 5 Jakarta",
    jawaban: ["hilton", "mandarin", "aryaduta", "borobudur", "sahid"]
  },
  {
    soal: "Perlengkapan Sekolah Anak TK",
    jawaban: ["pensil", "botol minum", "pensil warna", "sapu tangan", "hapusan"]
  },
  {
    soal: "Disaat Apa Saja Orang Membawa Kamera",
    jawaban: ["ulang tahun", "pesta", "pernikahan", "piknik", "wisuda", "reuni", "arisan"]
  },
  {
    soal: "Warna Cat Rambut",
    jawaban: ["merah", "kuning", "coklat", "hijau", "ungu", "emas", "perak"]
  },
  {
    soal: "Artis Yang Rambutnya Kribo",
    jawaban: ["edi brokoli", "ahmad albar", "giring", "marcell"]
  },
  {
    soal: "Jenis Olahraga Air",
    jawaban: ["renang", "selancar", "polo air", "dayung", "menyelam", "ski air"]
  },
  {
    soal: "Nama-Nama Sayuran Berwarna Hijau",
    jawaban: ["bayam", "kangkung", "sawi", "brokoli", "buncis", "kacang panjang"]
  },
  {
    soal: "Benda Yang Sering Dibawa Saat Bepergian",
    jawaban: ["dompet", "hp", "kunci", "kacamata", "jaket", "tas"]
  },
  {
    soal: "Hewan Yang Berkaki Empat",
    jawaban: ["kucing", "anjing", "sapi", "kambing", "kuda", "gajah"]
  },
  {
    soal: "Alat Musik Gesek",
    jawaban: ["biola", "cello", "rebab", "viola", "kontrabas"]
  },
  {
    soal: "Nama Buah Berbiji Banyak",
    jawaban: ["semangka", "pepaya", "melon", "markisa", "jambu biji", "naga"]
  },
  {
    soal: "Bumbu Dapur Yang Sering Digunakan",
    jawaban: ["bawang merah", "bawang putih", "garam", "merica", "ketumbar", "kunyit"]
  },
  {
    soal: "Tempat Yang Sering Dikunjungi Saat Liburan",
    jawaban: ["pantai", "gunung", "mall", "kebun binatang", "taman", "museum"]
  },
  {
    soal: "Benda Yang Ada Di Kamar Tidur",
    jawaban: ["kasur", "bantal", "guling", "selimut", "lemari", "lampu tidur"]
  },
  {
    soal: "Jenis Minuman Hangat",
    jawaban: ["teh", "kopi", "susu", "jahe", "coklat", "wedang ronde"]
  },
  {
    soal: "Peralatan Makan",
    jawaban: ["piring", "sendok", "garpu", "mangkuk", "gelas", "pisau"]
  },
  {
    soal: "Hewan Yang Hidup Di Air Tawar",
    jawaban: ["lele", "nila", "mas", "gurame", "gabus", "bawal"]
  },
  {
    soal: "Kegiatan Yang Dilakukan Saat Akhir Pekan",
    jawaban: ["tidur", "nonton", "olahraga", "jalan-jalan", "belanja", "makan"]
  },
  {
    soal: "Nama Hari Dalam Seminggu",
    jawaban: ["senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "minggu"]
  },
  {
    soal: "Profesi Yang Memakai Seragam",
    jawaban: ["polisi", "tentara", "dokter", "pilot", "satpam", "pramugari"]
  }
];

let dynamicFamily100Data: Family100Item[] = [];

/**
 * Inisialisasi dataset game Family 100 dari repositori GitHub
 */
export async function initFamily100Data() {
  try {
    const url = 'https://raw.githubusercontent.com/plesdisgila/database/refs/heads/master/games/family100.json';
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const data = await res.json() as any[];
      if (Array.isArray(data) && data.length > 0) {
        const valid = data.filter(
          item => item && typeof item.soal === 'string' && Array.isArray(item.jawaban) && item.jawaban.length > 0
        ).map(item => ({
          soal: item.soal.trim(),
          jawaban: item.jawaban.map((j: any) => String(j).trim()).filter((j: string) => j.length > 0)
        }));

        if (valid.length > 0) {
          dynamicFamily100Data = valid;
          console.log(`👨‍👩‍👧‍👦 [Family100] Berhasil memuat ${dynamicFamily100Data.length} soal Family 100.`);
          return;
        }
      }
    }
  } catch (err: any) {
    console.log(`ℹ️ [Family100] Menggunakan ${FAMILY100_LOCAL.length} soal lokal: ${err?.message || err}`);
  }
}

/**
 * Mengambil satu soal Family 100 secara acak
 */
export function getRandomFamily100(): Family100Item {
  const list = dynamicFamily100Data.length > 0 ? dynamicFamily100Data : FAMILY100_LOCAL;
  const randomIndex = Math.floor(Math.random() * list.length);
  return list[randomIndex];
}

/**
 * Normalisasi teks untuk mencocokkan tebakan jawaban (buang spasi & tanda baca)
 */
export function cleanAnswerText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

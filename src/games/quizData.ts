export interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 1,
    question: 'Pintu apa yang didorong oleh 10 orang pun tidak akan pernah terbuka?',
    options: ['Pintu geser', 'Pintu baja', 'Pintu darurat', 'Pintu lift'],
    correctIndex: 0,
    explanation: 'Karena pintu geser harusnya digeser ke samping, bukan didorong!'
  },
  {
    id: 2,
    question: 'Benda apa yang kalau dipotong atau digali justru menjadi semakin besar?',
    options: ['Batu kali', 'Lubang tanah', 'Pohon beringin', 'Balon gas'],
    correctIndex: 1,
    explanation: 'Lubang tanah, kalau terus digali dan dipotong tanahnya justru makin besar ukurannya.'
  },
  {
    id: 3,
    question: 'Hewan apa yang bersaudara dan selalu hidup berdampingan?',
    options: ['Kucing & Tikus', 'Katak beradik', 'Kuda Nil', 'Ikan Lumba-lumba'],
    correctIndex: 1,
    explanation: 'Katak beradik (plesetan dari kakak beradik)!'
  },
  {
    id: 4,
    question: 'Ban apa yang paling basah dan bikin dingin di seluruh dunia?',
    options: ['Ban serep', 'Ban motor', 'Bandung waktu hujan', 'Ban tubeless'],
    correctIndex: 2,
    explanation: 'Bandung waktu hujan pasti basah dan dingin!'
  },
  {
    id: 5,
    question: 'Kenapa pohon kelapa di depan rumah harus ditebang?',
    options: ['Takut jatuh', 'Karena kalau dicabut berat', 'Biar terang', 'Mau dijual'],
    correctIndex: 1,
    explanation: 'Ya karena kalau dicabut berat banget, makanya ditebang!'
  },
  {
    id: 6,
    question: 'Benda apa yang selalu dibeli untuk makan, tapi tidak pernah dimakan?',
    options: ['Piring & Sendok', 'Nasi padang', 'Minyak goreng', 'Sayur bayam'],
    correctIndex: 0,
    explanation: 'Piring dan sendok dibeli untuk makan, tapi bendanya tidak dimakan!'
  },
  {
    id: 7,
    question: 'Penyanyi luar negeri yang hobi banget sepedaan?',
    options: ['Bruno Mars', 'Justin Bieber', 'Selena Gowes', 'Taylor Swift'],
    correctIndex: 2,
    explanation: 'Selena Gomez dipelesetkan jadi Selena Gowes!'
  },
  {
    id: 8,
    question: 'Gajah apa yang belalainya pendek banget?',
    options: ['Gajah sumatera', 'Gajah afrika', 'Gajah pilek', 'Gajah mini'],
    correctIndex: 2,
    explanation: 'Gajah pilek, karena sering bersin jadi belalainya kependekan!'
  },
  {
    id: 9,
    question: 'Siapa nama presiden Indonesia yang paling suka pakai jas dan sepatu?',
    options: ['Presiden Soekarno', 'Presiden Soeharto', 'Presiden Jokowi', 'Semua presiden'],
    correctIndex: 3,
    explanation: 'Masa iya presiden mau memimpin rapat negara tanpa baju dan sepatu? Tentu semua presiden!'
  },
  {
    id: 10,
    question: 'Kota apa di Indonesia yang nilainya selalu tujuh (7)?',
    options: ['Salatiga', 'Pekalongan', 'Solo', 'Semarang'],
    correctIndex: 0,
    explanation: 'Salatiga (karena kalau salah tiga dari 10 soal, nilainya 7)!'
  },
  {
    id: 11,
    question: 'Mata apa yang ukurannya paling besar di dunia?',
    options: ['Matahari', 'Mata sapi', 'Mata ikan paus', 'Mata air'],
    correctIndex: 0,
    explanation: 'Matahari! Lebih besar dari seluruh planet di tata surya.'
  },
  {
    id: 12,
    question: 'Kue apa yang bagian tengahnya bolong tapi sangat populer?',
    options: ['Kue donat', 'Kue cucur', 'Kue lemper', 'Kue nastar'],
    correctIndex: 0,
    explanation: 'Kue donat identik dengan bentuk lingkaran berlubang di tengahnya.'
  },
  {
    id: 13,
    question: 'Benda apa yang memiliki leher dan mulut, tapi tidak punya mata atau telinga?',
    options: ['Gitar', 'Baju kemeja', 'Paku payung', 'Botol'],
    correctIndex: 3,
    explanation: 'Botol memiliki mulut botol dan leher botol!'
  },
  {
    id: 14,
    question: 'Apa yang bisa naik tetapi tidak pernah bisa turun kembali?',
    options: ['Layang-layang', 'Umur manusia', 'Harga bensin', 'Asap rokok'],
    correctIndex: 1,
    explanation: 'Umur manusia setiap tahun selalu bertambah naik dan tak pernah berkurang.'
  },
  {
    id: 15,
    question: 'Hewan apa yang namanya hanya terdiri dari 2 huruf?',
    options: ['U-dan-G', 'I-kan', 'U-lar', 'K-era'],
    correctIndex: 0,
    explanation: 'U dan G (Udang)!'
  },
  {
    id: 16,
    question: 'Kenapa matahari tenggelam ke arah barat?',
    options: ['Gravitasi bumi', 'Karena tidak bisa berenang', 'Rotasi bumi', 'Sudah lelah'],
    correctIndex: 1,
    explanation: 'Karena kalau bisa berenang, namanya bukan matahari tenggelam tapi matahari menyelam!'
  },
  {
    id: 17,
    question: 'Kopi apa yang paling cepat bikin capek?',
    options: ['Kopi espresso', 'Kopikir sendiri', 'Kopi tubruk', 'Kopi luwak'],
    correctIndex: 1,
    explanation: 'Kopikir sendiri (Kau pikir sendiri) bikin pusing dan capek!'
  },
  {
    id: 18,
    question: 'Rambut putih namanya uban, rambut merah namanya pirang, kalau rambut hijau namanya apa?',
    options: ['Rumput lapangan', 'Cat rambut', 'Rambutan belum matang', 'Ganggang laut'],
    correctIndex: 2,
    explanation: 'Rambutan yang masih mentah/belum matang warnanya hijau!'
  },
  {
    id: 19,
    question: 'Mobil apa yang gasnya di belakang dan rodanya cuma tiga?',
    options: ['Bajaj gas elpiji', 'Truk sampah', 'Bemo', 'Tukang jual tabung gas elpiji'],
    correctIndex: 3,
    explanation: 'Tukang bawa tabung gas elpiji di gerobak/motor roda tiga!'
  },
  {
    id: 20,
    question: 'Apa yang selalu datang tapi tidak pernah sampai?',
    options: ['Hari esok', 'Paket kurir', 'Gajian', 'Kereta api'],
    correctIndex: 0,
    explanation: 'Hari esok (Tomorrow), karena saat ia tiba, namanya sudah menjadi hari ini!'
  }
];

export function getRandomQuiz(): QuizQuestion {
  const randomIndex = Math.floor(Math.random() * QUIZ_QUESTIONS.length);
  return QUIZ_QUESTIONS[randomIndex];
}

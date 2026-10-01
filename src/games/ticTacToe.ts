export type Cell = 'X' | 'O' | null;
export type Board = Cell[];

export interface TttPlayer {
  id: number;
  name: string;
  isBot?: boolean;
}

export interface TttSession {
  id: string;
  chatId: number;
  messageId?: number;
  playerX: TttPlayer;
  playerO: TttPlayer;
  currentTurn: 'X' | 'O';
  board: Board;
  bet: number;
  mode: 'ai' | 'pvp';
  variant: 'unlimited' | 'classic'; // 'unlimited' = 3-Piece Moving (Anti-Seri), 'classic' = Standard 3x3
  historyX: number[]; // Urutan langkah X dari yang tertua ke terbaru
  historyO: number[]; // Urutan langkah O dari yang tertua ke terbaru
  status: 'waiting' | 'playing' | 'ended';
  createdAt: number;
  lastMoveAt: number;
  winningLine?: number[];
  winner?: 'X' | 'O' | 'draw';
  timeoutTimer?: NodeJS.Timeout;
}

export const WINNING_COMBOS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // Baris horizontal
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // Kolom vertikal
  [0, 4, 8], [2, 4, 6]             // Diagonal
];

export function createEmptyBoard(): Board {
  return [null, null, null, null, null, null, null, null, null];
}

export function checkWinner(board: Board): { winner: 'X' | 'O' | null; line?: number[]; isDraw: boolean } {
  for (const combo of WINNING_COMBOS) {
    const [a, b, c] = combo;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: combo, isDraw: false };
    }
  }

  const isFull = board.every(cell => cell !== null);
  return { winner: null, isDraw: isFull };
}

/**
 * Menjalankan langkah pada sesi Tic Tac Toe.
 * Jika dalam mode 'unlimited', setiap pemain maksimal memiliki 3 bidak.
 * Bidak ke-4 akan otomatis menghapus bidak pertama/tertua (FIFO).
 */
export function applyMove(
  session: TttSession,
  index: number
): { winner: 'X' | 'O' | null; isDraw: boolean; line?: number[]; removedIndex?: number } {
  const symbol = session.currentTurn;
  const history = symbol === 'X' ? session.historyX : session.historyO;
  let removedIndex: number | undefined;

  // Jika mode unlimited dan pemain sudah punya 3 bidak di papan, hapus bidak tertua
  if (session.variant === 'unlimited' && history.length >= 3) {
    removedIndex = history.shift()!;
    session.board[removedIndex] = null;
  }

  // Tambahkan bidak baru
  history.push(index);
  session.board[index] = symbol;

  // Cek kemenangan
  const winCheck = checkWinner(session.board);

  // Pada mode unlimited, hasil tidak akan pernah seri (isDraw = false)
  if (session.variant === 'unlimited') {
    return {
      winner: winCheck.winner,
      isDraw: false,
      line: winCheck.line,
      removedIndex
    };
  }

  return {
    winner: winCheck.winner,
    isDraw: winCheck.isDraw,
    line: winCheck.line,
    removedIndex
  };
}

/**
 * AI cerdas untuk Tic Tac Toe:
 * Mendukung mode klasik dan mode unlimited (memperhitungkan bidak yang akan hilang).
 */
export function getBestBotMove(
  board: Board,
  botSymbol: 'X' | 'O',
  historyBot: number[] = [],
  historyOpponent: number[] = [],
  isUnlimited: boolean = false
): number {
  const opponentSymbol: 'X' | 'O' = botSymbol === 'X' ? 'O' : 'X';

  // 1. Cek apakah bot bisa langsung menang dalam 1 langkah
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) {
      const simBoard = [...board];
      if (isUnlimited && historyBot.length >= 3) {
        simBoard[historyBot[0]] = null; // Bidak bot tertua akan hilang
      }
      simBoard[i] = botSymbol;
      if (checkWinner(simBoard).winner === botSymbol) {
        return i;
      }
    }
  }

  // 2. Cek apakah lawan berpotensi menang di langkah berikutnya dan lakukan blok
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) {
      const simBoard = [...board];
      if (isUnlimited && historyOpponent.length >= 3) {
        simBoard[historyOpponent[0]] = null;
      }
      simBoard[i] = opponentSymbol;
      if (checkWinner(simBoard).winner === opponentSymbol) {
        return i;
      }
    }
  }

  // 3. Ambil posisi tengah (kotak 4) jika masih kosong
  if (board[4] === null) {
    return 4;
  }

  // 4. Ambil salah satu sudut jika tersedia (0, 2, 6, 8)
  const corners = [0, 2, 6, 8].filter(idx => board[idx] === null);
  if (corners.length > 0) {
    return corners[Math.floor(Math.random() * corners.length)];
  }

  // 5. Ambil sisi yang tersisa (1, 3, 5, 7)
  const sides = [1, 3, 5, 7].filter(idx => board[idx] === null);
  if (sides.length > 0) {
    return sides[Math.floor(Math.random() * sides.length)];
  }

  // Fallback: cari kotak kosong pertama
  return board.findIndex(cell => cell === null);
}

// In-memory store untuk sesi Tic Tac Toe aktif
export const tttSessions = new Map<string, TttSession>();

export function getSession(sessionId: string): TttSession | undefined {
  return tttSessions.get(sessionId);
}

export function saveSession(session: TttSession): void {
  tttSessions.set(session.id, session);
}

export function deleteSession(sessionId: string): void {
  const session = tttSessions.get(sessionId);
  if (session?.timeoutTimer) {
    clearTimeout(session.timeoutTimer);
  }
  tttSessions.delete(sessionId);
}

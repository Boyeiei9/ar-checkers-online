/**
 * rules.js — ตรรกะหมากฮอส (Thai Checkers / หมากฮอสไทย)
 * 
 * ไฟล์นี้เป็น pure functions ไม่ผูกกับ Socket.io หรือ UI
 * ใช้ได้ทั้งฝั่ง server (ตรวจสอบการเดิน) และ client (แสดง legal moves)
 * 
 * ═══════════════════════════════════════════════════════
 * กระดาน 8×8 — เดินเฉพาะช่องสีเข้ม (row+col เป็นเลขคู่)
 * 
 *    col  0  1  2  3  4  5  6  7
 * row 0  [b]  . [b]  . [b]  . [b]  .    ← ดำ แถว 0
 * row 1   . [b]  . [b]  . [b]  . [b]    ← ดำ แถว 1
 * row 2   .  .  .  .  .  .  .  .
 * ...
 * row 6  [w]  . [w]  . [w]  . [w]  .    ← ขาว แถว 6
 * row 7   . [w]  . [w]  . [w]  . [w]    ← ขาว แถว 7
 * 
 * ค่าใน board:
 *   null = ว่าง
 *   'w'  = เบี้ยขาว   'W' = ฮอสขาว
 *   'b'  = เบี้ยดำ    'B' = ฮอสดำ
 * 
 * ขาวเดินขึ้น (row ลดลง)  ดำเดินลง (row เพิ่มขึ้น)
 * ═══════════════════════════════════════════════════════
 */

'use strict';

// ──────────────────────────────────────────────
// Config: เตรียมไว้สลับ ruleset ได้ในอนาคต
// ──────────────────────────────────────────────
const CONFIG = {
  /** ruleset ที่ใช้งานอยู่ — ตอนนี้รองรับ 'thai' */
  ruleset: 'thai',

  /** ขนาดกระดาน */
  boardSize: 8,

  /** จำนวนแถวที่วางหมากตอนเริ่ม (ต่อฝั่ง) */
  startingRows: 2,

  /**
   * ฮอสกิน: 'short' = กระโดดข้ามลงช่องถัดไปทันที
   *         'flying' = ลงช่องไหนก็ได้หลังหมากที่กิน (สำหรับ international)
   */
  kingCapture: 'short',

  /**
   * ฮอสเดิน: 'flying' = เดินไกลกี่ช่องก็ได้ตามแนวทแยง
   *          'short'  = เดินทีละ 1 ช่อง (สำหรับบาง ruleset)
   */
  kingMove: 'flying',
};

// ──────────────────────────────────────────────
// Helper functions
// ──────────────────────────────────────────────

/** ตรวจว่าตำแหน่งอยู่ในกระดานไหม */
function inBounds(r, c) {
  return r >= 0 && r < CONFIG.boardSize && c >= 0 && c < CONFIG.boardSize;
}

/** ตรวจว่าเป็นช่องสีเข้มไหม (เล่นได้เฉพาะช่องเข้ม) */
function isDarkSquare(r, c) {
  return (r + c) % 2 === 0;
}

/** คืนสีของหมาก ('w' หรือ 'b') ไม่ว่าจะเป็นเบี้ยหรือฮอส */
function pieceColor(piece) {
  if (!piece) return null;
  return piece.toLowerCase();
}

/** ตรวจว่าหมากเป็นฮอสไหม */
function isKing(piece) {
  return piece === 'W' || piece === 'B';
}

/** ตรวจว่าหมากเป็นฝั่งตรงข้ามไหม */
function isOpponent(piece, color) {
  if (!piece) return false;
  return pieceColor(piece) !== color;
}

/** Deep copy board (2D array) */
function cloneBoard(board) {
  return board.map(row => [...row]);
}

/** ทิศทาง "ข้างหน้า" ของแต่ละสี: ขาวเดินขึ้น (-1) ดำเดินลง (+1) */
function forwardDir(color) {
  return color === 'w' ? -1 : 1;
}

// ──────────────────────────────────────────────
// สร้างสถานะเริ่มต้น
// ──────────────────────────────────────────────

/**
 * สร้างกระดานเริ่มต้นของหมากฮอสไทย
 * 
 * @param {string} [ruleset] - ชื่อ ruleset (ยังไม่ใช้ เตรียมไว้)
 * @returns {{ board: Array, turn: string }} state เริ่มต้น
 *          - board[row][col] = null | 'w' | 'b' | 'W' | 'B'
 *          - turn = 'w' (ขาวเดินก่อน)
 */
function createInitialState(ruleset) {
  const size = CONFIG.boardSize;
  // สร้างกระดานว่าง
  const board = Array.from({ length: size }, () => Array(size).fill(null));

  // วางหมากดำ — แถว 0 ถึง startingRows-1
  for (let r = 0; r < CONFIG.startingRows; r++) {
    for (let c = 0; c < size; c++) {
      if (isDarkSquare(r, c)) {
        board[r][c] = 'b';
      }
    }
  }

  // วางหมากขาว — แถว (size - startingRows) ถึง size-1
  for (let r = size - CONFIG.startingRows; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (isDarkSquare(r, c)) {
        board[r][c] = 'w';
      }
    }
  }

  // ขาวเดินก่อนเสมอ
  return { board, turn: 'w' };
}

// ──────────────────────────────────────────────
// หา legal moves
// ──────────────────────────────────────────────

/**
 * ทิศทแยง 4 ทิศ
 * สำหรับเบี้ย จะถูกกรองให้เหลือแค่ทิศ "ข้างหน้า" ตอนเดินปกติ
 * แต่ตอนกินเบี้ยก็กินได้เฉพาะข้างหน้า (หมากฮอสไทย)
 */
const DIAG_DIRS = [
  [-1, -1], [-1, 1],   // ขึ้นซ้าย, ขึ้นขวา
  [1, -1],  [1, 1],    // ลงซ้าย, ลงขวา
];

/**
 * หา moves กินของหมากตัวเดียว (recursive สำหรับกินต่อเนื่อง)
 * 
 * @param {Array} board - กระดานปัจจุบัน
 * @param {number} r - แถวของหมาก
 * @param {number} c - คอลัมน์ของหมาก
 * @param {string} color - สีของหมากที่กำลังเดิน ('w' หรือ 'b')
 * @param {string} piece - ชนิดหมาก ('w','b','W','B')
 * @param {Array} captured - หมากที่กินไปแล้วในเทิร์นนี้ [[r,c], ...]
 * @param {Array} path - เส้นทางที่เดินมา [[r,c], ...]
 * @returns {Array} รายการ move objects ที่เป็นไปได้
 */
function findCaptures(board, r, c, color, piece, captured, path) {
  const results = [];
  const king = isKing(piece);

  // เบี้ยกินได้เฉพาะทิศข้างหน้า (หมากฮอสไทย)
  // ฮอสกินได้ทั้ง 4 ทิศ
  const dirs = king
    ? DIAG_DIRS
    : DIAG_DIRS.filter(([dr]) => dr === forwardDir(color));

  for (const [dr, dc] of dirs) {
    // ── ฮอส: เดินไปตามแนวจนเจอหมาก ──
    // ── เบี้ย: ดูแค่ช่องถัดไป ──
    if (king && CONFIG.kingCapture === 'flying') {
      // TODO: implement flying capture สำหรับ international ruleset
      // ตอนนี้ยังไม่ใช้
    }

    // Short capture (ทั้งเบี้ยและฮอสในโหมด thai)
    const mr = r + dr;      // ตำแหน่งหมากคู่แข่งที่จะกระโดดข้าม
    const mc = c + dc;
    const lr = r + dr * 2;  // ตำแหน่งลงหลังกระโดด
    const lc = c + dc * 2;

    if (!inBounds(mr, mc) || !inBounds(lr, lc)) continue;

    const midPiece = board[mr][mc];
    // ต้องเป็นหมากฝั่งตรงข้าม และยังไม่ถูกกินในเทิร์นนี้
    if (!isOpponent(midPiece, color)) continue;
    if (captured.some(([cr, cc]) => cr === mr && cc === mc)) continue;

    // ช่องลงต้องว่าง (หรือเป็นตำแหน่งเดิมของตัวเอง)
    if (board[lr][lc] !== null && !(lr === path[0][0] && lc === path[0][1])) continue;

    const newCaptured = [...captured, [mr, mc]];
    const newPath = [...path, [lr, lc]];

    // ── ตรวจ promotion ระหว่างกินต่อเนื่อง ──
    // ในหมากฮอสไทย: ถ้าเบี้ยถึงแถวสุดท้ายระหว่างกินต่อเนื่อง จะเลื่อนขั้นทันที
    // แต่จะหยุดกินต่อเนื่อง (ไม่กินต่อในเทิร์นเดียวกัน)
    const promotionRow = color === 'w' ? 0 : CONFIG.boardSize - 1;
    const justPromoted = !king && lr === promotionRow;

    if (justPromoted) {
      // เลื่อนขั้นแล้วหยุด — ไม่กินต่อ
      results.push({
        from: [path[0][0], path[0][1]],
        to: [lr, lc],
        captured: newCaptured,
        promoted: true,
      });
    } else {
      // ลองกินต่อเนื่อง (recursive)
      // สร้าง board ชั่วคราวเพื่อตรวจช่องว่าง
      const tempBoard = cloneBoard(board);
      // ลบหมากที่กินออก
      tempBoard[mr][mc] = null;
      // ย้ายหมากตัวเอง
      tempBoard[path[0][0]][path[0][1]] = null;
      tempBoard[lr][lc] = piece;

      const furtherCaptures = findCaptures(
        tempBoard, lr, lc, color,
        king ? piece : piece, // ถ้ายังไม่ใช่ฮอส ก็ยังเป็นเบี้ย
        newCaptured, newPath
      );

      if (furtherCaptures.length > 0) {
        // มีกินต่อได้ → ต้องกินต่อ (บังคับกินมากที่สุด? ไม่ — แค่บังคับกินถ้ากินได้)
        // ในหมากฮอสไทย ต้องกินต่อถ้ากินต่อได้
        results.push(...furtherCaptures);
      } else {
        // กินต่อไม่ได้แล้ว — จบ
        results.push({
          from: [path[0][0], path[0][1]],
          to: [lr, lc],
          captured: newCaptured,
          promoted: false,
        });
      }
    }
  }

  return results;
}

/**
 * หา moves เดินปกติ (ไม่กิน) ของหมากตัวเดียว
 */
function findSimpleMoves(board, r, c, color, piece) {
  const results = [];
  const king = isKing(piece);

  // เบี้ย: เดินข้างหน้าทีละ 1 ช่อง
  // ฮอส: เดินได้ทั้ง 4 ทิศ ไกลกี่ช่องก็ได้ (flying move)
  const dirs = king
    ? DIAG_DIRS
    : DIAG_DIRS.filter(([dr]) => dr === forwardDir(color));

  for (const [dr, dc] of dirs) {
    if (king && CONFIG.kingMove === 'flying') {
      // ฮอสเดินไกลได้ — ไล่ช่องไปจนสุดหรือเจอหมาก
      let nr = r + dr;
      let nc = c + dc;
      while (inBounds(nr, nc) && board[nr][nc] === null) {
        results.push({
          from: [r, c],
          to: [nr, nc],
          captured: [],
          promoted: false,
        });
        nr += dr;
        nc += dc;
      }
    } else {
      // เบี้ย หรือ ฮอสแบบ short move — ทีละ 1 ช่อง
      const nr = r + dr;
      const nc = c + dc;
      if (inBounds(nr, nc) && board[nr][nc] === null) {
        const promotionRow = color === 'w' ? 0 : CONFIG.boardSize - 1;
        results.push({
          from: [r, c],
          to: [nr, nc],
          captured: [],
          promoted: !king && nr === promotionRow,
        });
      }
    }
  }

  return results;
}

/**
 * หา legal moves ทั้งหมดของฝั่งที่กำหนด
 * 
 * กฎบังคับกิน: ถ้ามี move กินได้ → ต้องกินเท่านั้น (เดินธรรมดาไม่ได้)
 * 
 * @param {{ board: Array, turn: string }} state
 * @param {string} color - 'w' หรือ 'b'
 * @returns {Array} รายการ move objects
 *   แต่ละ move = { from: [r,c], to: [r,c], captured: [[r,c],...], promoted: bool }
 */
function getLegalMoves(state, color) {
  const { board } = state;
  let allCaptures = [];
  let allSimple = [];

  for (let r = 0; r < CONFIG.boardSize; r++) {
    for (let c = 0; c < CONFIG.boardSize; c++) {
      const piece = board[r][c];
      if (!piece || pieceColor(piece) !== color) continue;

      // หากิน
      const captures = findCaptures(board, r, c, color, piece, [], [[r, c]]);
      allCaptures.push(...captures);

      // หาเดินธรรมดา
      const simple = findSimpleMoves(board, r, c, color, piece);
      allSimple.push(...simple);
    }
  }

  // ── บังคับกิน: ถ้ามีกินได้ ต้องกิน ──
  if (allCaptures.length > 0) {
    return allCaptures;
  }

  return allSimple;
}

// ──────────────────────────────────────────────
// เดินหมาก (apply move)
// ──────────────────────────────────────────────

/**
 * ตรวจว่า move ที่ส่งมาตรงกับ legal move ไหม
 * Client ส่งแค่ { from, to } — เราต้องหา move เต็มจาก legal moves
 * 
 * @param {Array} legalMoves - จาก getLegalMoves()
 * @param {{ from: number[], to: number[] }} moveInput - จาก client
 * @returns {object|null} move เต็ม หรือ null ถ้าไม่ถูกกติกา
 */
function findMatchingMove(legalMoves, moveInput) {
  const { from, to } = moveInput;
  // อาจมีหลาย move ที่ from/to ตรงกัน (เช่น กินต่อเนื่องหลายเส้นทาง)
  // ในกรณีนั้นเลือก move ที่กินได้มากที่สุด
  const matches = legalMoves.filter(m =>
    m.from[0] === from[0] && m.from[1] === from[1] &&
    m.to[0] === to[0] && m.to[1] === to[1]
  );

  if (matches.length === 0) return null;

  // เลือกที่กินมากสุด (ปกติจะมีแค่ 1)
  matches.sort((a, b) => b.captured.length - a.captured.length);
  return matches[0];
}

/**
 * ดำเนินการเดิน — คืน state ใหม่ (immutable, ไม่แก้ state เดิม)
 * 
 * @param {{ board: Array, turn: string }} state
 * @param {{ from: number[], to: number[], captured: number[][], promoted: boolean }} move
 * @returns {{ board: Array, turn: string }} state ใหม่
 */
function applyMove(state, move) {
  const board = cloneBoard(state.board);
  const { from, to, captured, promoted } = move;

  // หยิบหมากจากต้นทาง
  let piece = board[from[0]][from[1]];
  board[from[0]][from[1]] = null;

  // ลบหมากที่ถูกกิน
  for (const [cr, cc] of captured) {
    board[cr][cc] = null;
  }

  // เลื่อนขั้นเป็นฮอสถ้าถึงแถวสุดท้าย
  if (promoted) {
    piece = piece.toUpperCase();
  }

  // วางหมากที่ปลายทาง
  board[to[0]][to[1]] = piece;

  // สลับตา
  const nextTurn = state.turn === 'w' ? 'b' : 'w';

  return { board, turn: nextTurn };
}

// ──────────────────────────────────────────────
// ตัดสินผู้ชนะ
// ──────────────────────────────────────────────

/**
 * ตรวจว่ามีผู้ชนะหรือยัง
 * 
 * เงื่อนไขแพ้:
 * 1. ไม่มีหมากเหลือ
 * 2. ไม่มีทางเดิน (ถึงตาแต่เดินไม่ได้)
 * 
 * @param {{ board: Array, turn: string }} state
 * @returns {string|null} 'w', 'b' (ผู้ชนะ) หรือ null (ยังไม่จบ)
 */
function getWinner(state) {
  const { board, turn } = state;

  // นับหมากแต่ละฝั่ง
  let whiteCount = 0;
  let blackCount = 0;
  for (let r = 0; r < CONFIG.boardSize; r++) {
    for (let c = 0; c < CONFIG.boardSize; c++) {
      const p = board[r][c];
      if (p === 'w' || p === 'W') whiteCount++;
      if (p === 'b' || p === 'B') blackCount++;
    }
  }

  // ไม่มีหมากเหลือ → ฝั่งตรงข้ามชนะ
  if (whiteCount === 0) return 'b';
  if (blackCount === 0) return 'w';

  // ถึงตาแต่ไม่มีทางเดิน → แพ้
  const moves = getLegalMoves(state, turn);
  if (moves.length === 0) {
    return turn === 'w' ? 'b' : 'w';
  }

  return null; // ยังไม่จบ
}

// ──────────────────────────────────────────────
// Export
// ──────────────────────────────────────────────
module.exports = {
  CONFIG,
  createInitialState,
  getLegalMoves,
  applyMove,
  getWinner,
  findMatchingMove,
  // export helpers สำหรับ test
  _helpers: {
    inBounds,
    isDarkSquare,
    pieceColor,
    isKing,
    isOpponent,
    cloneBoard,
    forwardDir,
  },
};

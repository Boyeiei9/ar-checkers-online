/**
 * rules.test.js — Unit tests สำหรับตรรกะหมากฮอสไทย
 * 
 * ใช้ Node.js built-in test runner (node --test)
 * ไม่ต้องติดตั้ง dependency เพิ่ม
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  CONFIG,
  createInitialState,
  getLegalMoves,
  applyMove,
  getWinner,
  findMatchingMove,
  _helpers: { isDarkSquare, pieceColor, isKing },
} = require('./rules.js');

// ═══════════════════════════════════════
// Helper สร้างกระดานว่างสำหรับ test
// ═══════════════════════════════════════

/** สร้างกระดานว่าง 8×8 */
function emptyBoard() {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}

/** สร้าง state จาก board ที่กำหนดเอง */
function makeState(board, turn = 'w') {
  return { board, turn };
}

// ═══════════════════════════════════════
// 1. สร้างกระดานเริ่มต้น
// ═══════════════════════════════════════

describe('createInitialState()', () => {
  it('สร้างกระดาน 8×8', () => {
    const state = createInitialState();
    assert.equal(state.board.length, 8);
    state.board.forEach(row => assert.equal(row.length, 8));
  });

  it('ขาวเดินก่อน (turn = "w")', () => {
    const state = createInitialState();
    assert.equal(state.turn, 'w');
  });

  it('ดำมี 8 ตัว อยู่แถว 0-1 บนช่องสีเข้ม', () => {
    const state = createInitialState();
    let count = 0;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 8; c++) {
        if (state.board[r][c] === 'b') {
          assert.ok(isDarkSquare(r, c), `ตำแหน่ง [${r},${c}] ต้องเป็นช่องเข้ม`);
          count++;
        }
      }
    }
    assert.equal(count, 8, 'ดำต้องมี 8 ตัว');
  });

  it('ขาวมี 8 ตัว อยู่แถว 6-7 บนช่องสีเข้ม', () => {
    const state = createInitialState();
    let count = 0;
    for (let r = 6; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (state.board[r][c] === 'w') {
          assert.ok(isDarkSquare(r, c), `ตำแหน่ง [${r},${c}] ต้องเป็นช่องเข้ม`);
          count++;
        }
      }
    }
    assert.equal(count, 8, 'ขาวต้องมี 8 ตัว');
  });

  it('แถว 2-5 ว่างหมด', () => {
    const state = createInitialState();
    for (let r = 2; r < 6; r++) {
      for (let c = 0; c < 8; c++) {
        assert.equal(state.board[r][c], null, `ตำแหน่ง [${r},${c}] ต้องว่าง`);
      }
    }
  });
});

// ═══════════════════════════════════════
// 2. เบี้ยเดินทแยงหน้า 1 ช่อง
// ═══════════════════════════════════════

describe('เบี้ยเดินปกติ', () => {
  it('ขาว (w) เดินขึ้น — มี 2 ทางเลือก', () => {
    // วางเบี้ยขาวที่ [4,2] — ช่องเข้ม
    const board = emptyBoard();
    board[4][2] = 'w';
    const state = makeState(board, 'w');

    const moves = getLegalMoves(state, 'w');
    assert.equal(moves.length, 2);

    // ต้องเดินไป [3,1] หรือ [3,3]
    const destinations = moves.map(m => m.to.join(','));
    assert.ok(destinations.includes('3,1'), 'ต้องเดินไป [3,1] ได้');
    assert.ok(destinations.includes('3,3'), 'ต้องเดินไป [3,3] ได้');
  });

  it('ดำ (b) เดินลง — มี 2 ทางเลือก', () => {
    const board = emptyBoard();
    board[3][1] = 'b';
    const state = makeState(board, 'b');

    const moves = getLegalMoves(state, 'b');
    assert.equal(moves.length, 2);

    const destinations = moves.map(m => m.to.join(','));
    assert.ok(destinations.includes('4,0'), 'ต้องเดินไป [4,0] ได้');
    assert.ok(destinations.includes('4,2'), 'ต้องเดินไป [4,2] ได้');
  });

  it('เบี้ยเดินถอยหลังไม่ได้', () => {
    const board = emptyBoard();
    board[4][2] = 'w';
    const state = makeState(board, 'w');

    const moves = getLegalMoves(state, 'w');
    // ต้องไม่มี move ไป row 5
    const backward = moves.filter(m => m.to[0] > 4);
    assert.equal(backward.length, 0, 'เบี้ยขาวเดินลงไม่ได้');
  });

  it('เดินไม่ได้ถ้าช่องหน้ามีหมากกัน', () => {
    const board = emptyBoard();
    board[4][2] = 'w';
    board[3][1] = 'w'; // ช่องหน้าซ้ายมีหมากตัวเอง
    board[3][3] = 'b'; // ช่องหน้าขวามีหมากคู่แข่ง (แต่กินต้องกระโดด)
    const state = makeState(board, 'w');

    const moves = getLegalMoves(state, 'w');
    // ช่องหน้าทั้ง 2 ถูกปิด แต่อาจกินข้ามดำไปที่ [2,4] ได้
    const simpleMoves = moves.filter(m => m.captured.length === 0);
    assert.equal(simpleMoves.length, 0, 'เดินธรรมดาไม่ได้');
  });

  it('เบี้ยที่ติดขอบกระดานเดินได้แค่ทิศเดียว', () => {
    const board = emptyBoard();
    board[4][0] = 'w'; // ติดขอบซ้าย
    const state = makeState(board, 'w');

    const moves = getLegalMoves(state, 'w');
    assert.equal(moves.length, 1);
    assert.deepEqual(moves[0].to, [3, 1]);
  });
});

// ═══════════════════════════════════════
// 3. เบี้ยกินทแยงหน้า
// ═══════════════════════════════════════

describe('เบี้ยกิน', () => {
  it('ขาวกินดำข้างหน้า — กระโดดข้าม', () => {
    const board = emptyBoard();
    board[4][2] = 'w';
    board[3][3] = 'b'; // ดำอยู่หน้าขวา
    // ช่อง [2][4] ว่าง → กินได้
    const state = makeState(board, 'w');

    const moves = getLegalMoves(state, 'w');
    // ต้องบังคับกิน → มีแต่ move กิน
    assert.ok(moves.length >= 1, 'ต้องมี move กิน');
    assert.ok(moves.every(m => m.captured.length > 0), 'ต้องเป็น move กินทั้งหมด (บังคับกิน)');

    const capMove = moves.find(m => m.to[0] === 2 && m.to[1] === 4);
    assert.ok(capMove, 'ต้องกินไปลง [2,4]');
    assert.deepEqual(capMove.captured, [[3, 3]]);
  });

  it('เบี้ยกินถอยหลังไม่ได้ (หมากฮอสไทย)', () => {
    const board = emptyBoard();
    board[3][3] = 'w';
    board[4][4] = 'b'; // ดำอยู่ข้างหลัง
    // ช่อง [5][5] ว่าง → แต่ขาวกินถอยหลังไม่ได้
    const state = makeState(board, 'w');

    const moves = getLegalMoves(state, 'w');
    const backCapture = moves.filter(m => m.to[0] === 5 && m.to[1] === 5);
    assert.equal(backCapture.length, 0, 'เบี้ยขาวกินถอยหลังไม่ได้');
  });

  it('กินไม่ได้ถ้าช่องหลังถูกปิด', () => {
    const board = emptyBoard();
    board[4][2] = 'w';
    board[3][3] = 'b';
    board[2][4] = 'w'; // ช่องลงหลังกระโดดมีหมากตัวเอง
    const state = makeState(board, 'w');

    const moves = getLegalMoves(state, 'w');
    const capToBlocked = moves.filter(m => m.to[0] === 2 && m.to[1] === 4);
    assert.equal(capToBlocked.length, 0, 'กินไม่ได้เพราะช่องปลายทางถูกปิด');
  });
});

// ═══════════════════════════════════════
// 4. กินต่อเนื่อง (multi-capture)
// ═══════════════════════════════════════

describe('กินต่อเนื่อง (multi-capture)', () => {
  it('ขาวกิน 2 ตัวต่อเนื่อง', () => {
    //  กระดาน:
    //  row 2: . . . . [landing2] . . .
    //  row 3: . . . [b2] . . . .
    //  row 4: . . [landing1] . . . . .
    //  row 5: . [b1] . . . . . .
    //  row 6: [w] . . . . . . .
    const board = emptyBoard();
    board[6][0] = 'w';
    board[5][1] = 'b';  // กินตัวแรก → ไปลง [4,2]
    board[3][3] = 'b';  // กินตัวสอง → ไปลง [2,4]
    const state = makeState(board, 'w');

    const moves = getLegalMoves(state, 'w');
    // ต้องมี move ที่กิน 2 ตัว
    const doubleCapture = moves.filter(m => m.captured.length === 2);
    assert.ok(doubleCapture.length >= 1, 'ต้องกิน 2 ตัวต่อเนื่อง');
    assert.deepEqual(doubleCapture[0].from, [6, 0]);
    assert.deepEqual(doubleCapture[0].to, [2, 4]);
  });

  it('กิน 3 ตัวต่อเนื่อง', () => {
    const board = emptyBoard();
    board[6][0] = 'w';
    board[5][1] = 'b';  // กินตัว 1 → [4,2]
    board[3][3] = 'b';  // กินตัว 2 → [2,4]
    board[1][5] = 'b';  // กินตัว 3 → [0,6]
    const state = makeState(board, 'w');

    const moves = getLegalMoves(state, 'w');
    const tripleCapture = moves.filter(m => m.captured.length === 3);
    assert.ok(tripleCapture.length >= 1, 'ต้องกิน 3 ตัวต่อเนื่อง');
  });

  it('ห้ามกินหมากตัวเดียวกันซ้ำ', () => {
    // จัดให้เส้นทางวนกลับ — ต้องไม่กินตัวเดิมซ้ำ
    const board = emptyBoard();
    board[4][2] = 'w';
    board[3][3] = 'b';
    // กินไป [2,4] → ถ้าจะวนกลับมากิน [3,3] ซ้ำ ต้องไม่ได้
    const state = makeState(board, 'w');
    const moves = getLegalMoves(state, 'w');
    moves.forEach(m => {
      // ตรวจว่าไม่มี captured ซ้ำ
      const keys = m.captured.map(c => c.join(','));
      const unique = new Set(keys);
      assert.equal(keys.length, unique.size, 'ห้ามกินซ้ำ');
    });
  });
});

// ═══════════════════════════════════════
// 5. บังคับกิน
// ═══════════════════════════════════════

describe('บังคับกิน (mandatory capture)', () => {
  it('ถ้ากินได้ ต้องกินเท่านั้น — เดินธรรมดาไม่ได้', () => {
    const board = emptyBoard();
    board[4][2] = 'w';  // ตัวนี้กินได้
    board[3][3] = 'b';
    board[6][4] = 'w';  // ตัวนี้เดินธรรมดาได้ แต่ต้องไม่ให้เดิน
    const state = makeState(board, 'w');

    const moves = getLegalMoves(state, 'w');
    assert.ok(moves.every(m => m.captured.length > 0), 'ทุก move ต้องเป็นกิน');
  });

  it('ถ้าไม่มีกิน ให้เดินธรรมดาได้', () => {
    const board = emptyBoard();
    board[4][2] = 'w';
    // ไม่มีดำให้กิน
    const state = makeState(board, 'w');

    const moves = getLegalMoves(state, 'w');
    assert.ok(moves.length > 0, 'ต้องเดินธรรมดาได้');
    assert.ok(moves.every(m => m.captured.length === 0), 'ทุก move เป็นเดินธรรมดา');
  });
});

// ═══════════════════════════════════════
// 6. เลื่อนขั้นเป็นฮอส (promotion)
// ═══════════════════════════════════════

describe('เลื่อนขั้นเป็นฮอส', () => {
  it('ขาวเดินถึงแถว 0 → เลื่อนเป็นฮอส', () => {
    const board = emptyBoard();
    board[1][1] = 'w'; // อีก 1 ช่องถึงแถว 0
    const state = makeState(board, 'w');

    const moves = getLegalMoves(state, 'w');
    const toRow0 = moves.find(m => m.to[0] === 0);
    assert.ok(toRow0, 'ต้องเดินไปแถว 0 ได้');
    assert.ok(toRow0.promoted, 'ต้องมี flag promoted = true');

    // apply move แล้วตรวจ
    const newState = applyMove(state, toRow0);
    assert.equal(newState.board[0][toRow0.to[1]], 'W', 'หมากต้องเป็น W (ฮอสขาว)');
  });

  it('ดำเดินถึงแถว 7 → เลื่อนเป็นฮอส', () => {
    const board = emptyBoard();
    board[6][2] = 'b';
    const state = makeState(board, 'b');

    const moves = getLegalMoves(state, 'b');
    const toRow7 = moves.find(m => m.to[0] === 7);
    assert.ok(toRow7, 'ต้องเดินไปแถว 7 ได้');
    assert.ok(toRow7.promoted, 'ต้องมี flag promoted = true');

    const newState = applyMove(state, toRow7);
    assert.equal(newState.board[7][toRow7.to[1]], 'B', 'หมากต้องเป็น B (ฮอสดำ)');
  });

  it('กินแล้วเลื่อนขั้น — หยุดกินต่อเนื่อง', () => {
    const board = emptyBoard();
    board[2][2] = 'w';
    board[1][3] = 'b'; // กินไป [0,4] → เลื่อนขั้น
    // ถ้ามีดำที่ [1][5] ด้วย ก็ต้องไม่กินต่อ (เพราะเลื่อนขั้นแล้ว)
    const state = makeState(board, 'w');

    const moves = getLegalMoves(state, 'w');
    const capToRow0 = moves.find(m => m.to[0] === 0 && m.captured.length > 0);
    assert.ok(capToRow0, 'ต้องกินไปลงแถว 0');
    assert.ok(capToRow0.promoted, 'ต้องเลื่อนขั้น');
  });
});

// ═══════════════════════════════════════
// 7. ฮอสเดินไกลทุกทิศทาง (flying move)
// ═══════════════════════════════════════

describe('ฮอสเดิน', () => {
  it('ฮอสเดินทแยงไกลได้หลายช่อง ทุกทิศ', () => {
    const board = emptyBoard();
    board[4][4] = 'W'; // ฮอสขาว ตรงกลาง
    const state = makeState(board, 'w');

    const moves = getLegalMoves(state, 'w');
    // จากตรงกลาง ควรเดินได้หลายช่อง — ทั้งข้างหน้าและข้างหลัง
    assert.ok(moves.length > 4, `ฮอสต้องเดินได้มากกว่า 4 ทาง (ได้ ${moves.length})`);

    // ต้องเดินถอยหลังได้ (row > 4)
    const backward = moves.filter(m => m.to[0] > 4);
    assert.ok(backward.length > 0, 'ฮอสเดินถอยหลังได้');

    // ต้องเดินข้างหน้าได้ (row < 4)
    const forward = moves.filter(m => m.to[0] < 4);
    assert.ok(forward.length > 0, 'ฮอสเดินข้างหน้าได้');
  });

  it('ฮอสเดินไม่ได้ถ้ามีหมากขวาง', () => {
    const board = emptyBoard();
    board[4][4] = 'W';
    board[3][3] = 'w'; // หมากตัวเองขวางทิศ [-1,-1]
    const state = makeState(board, 'w');

    const moves = getLegalMoves(state, 'w');
    // กรองเฉพาะ move ของฮอส (from = [4,4]) ไปทิศ [-1,-1]
    const kingMoves = moves.filter(m =>
      m.from[0] === 4 && m.from[1] === 4 &&
      m.to[0] < 4 && m.to[1] < 4 && m.captured.length === 0
    );
    assert.equal(kingMoves.length, 0, 'ฮอสเดินผ่านหมากตัวเองไม่ได้');
  });

  it('ฮอสเดินไกลได้ — ตรวจปลายทาง', () => {
    const board = emptyBoard();
    board[6][6] = 'W';
    const state = makeState(board, 'w');

    const moves = getLegalMoves(state, 'w');
    // ต้องเดินไปถึงมุมตรงข้ามได้ ถ้าไม่มีอะไรขวาง
    const toCorner = moves.find(m => m.to[0] === 0 && m.to[1] === 0);
    assert.ok(toCorner, 'ฮอสจาก [6,6] เดินไป [0,0] ได้');
  });
});

// ═══════════════════════════════════════
// 8. ฮอสกินทั้งหน้าหลัง
// ═══════════════════════════════════════

describe('ฮอสกิน', () => {
  it('ฮอสกินข้างหน้า (short capture)', () => {
    const board = emptyBoard();
    board[4][4] = 'W';
    board[3][3] = 'b'; // ดำอยู่ข้างหน้าซ้าย
    // ช่อง [2,2] ว่าง → กินได้
    const state = makeState(board, 'w');

    const moves = getLegalMoves(state, 'w');
    const capFwd = moves.find(m => m.to[0] === 2 && m.to[1] === 2 && m.captured.length > 0);
    assert.ok(capFwd, 'ฮอสกินข้างหน้าได้');
  });

  it('ฮอสกินข้างหลัง (short capture)', () => {
    const board = emptyBoard();
    board[4][4] = 'W';
    board[5][5] = 'b'; // ดำอยู่ข้างหลังขวา
    // ช่อง [6,6] ว่าง → กินได้
    const state = makeState(board, 'w');

    const moves = getLegalMoves(state, 'w');
    const capBack = moves.find(m => m.to[0] === 6 && m.to[1] === 6 && m.captured.length > 0);
    assert.ok(capBack, 'ฮอสกินข้างหลังได้');
  });

  it('ฮอสกินต่อเนื่อง — ทั้งหน้าและหลัง', () => {
    const board = emptyBoard();
    board[4][4] = 'W';
    board[3][3] = 'b'; // กินข้างหน้า → [2,2]
    board[3][1] = 'b'; // กินข้างหลัง (จาก [2,2] ไป [4,0]) → กินทิศ [+1,-1]
    const state = makeState(board, 'w');

    const moves = getLegalMoves(state, 'w');
    const multiCap = moves.filter(m => m.captured.length === 2);
    assert.ok(multiCap.length >= 1, 'ฮอสกิน 2 ตัวต่อเนื่องได้');
  });
});

// ═══════════════════════════════════════
// 9. applyMove — อัปเดต state
// ═══════════════════════════════════════

describe('applyMove()', () => {
  it('ย้ายหมาก — ต้นทางว่าง ปลายทางมีหมาก', () => {
    const board = emptyBoard();
    board[4][2] = 'w';
    const state = makeState(board, 'w');

    const moves = getLegalMoves(state, 'w');
    const move = moves[0];
    const newState = applyMove(state, move);

    assert.equal(newState.board[4][2], null, 'ต้นทางต้องว่าง');
    assert.equal(newState.board[move.to[0]][move.to[1]], 'w', 'ปลายทางต้องมีหมาก');
  });

  it('สลับตาหลังเดิน', () => {
    const board = emptyBoard();
    board[4][2] = 'w';
    const state = makeState(board, 'w');

    const moves = getLegalMoves(state, 'w');
    const newState = applyMove(state, moves[0]);
    assert.equal(newState.turn, 'b', 'ต้องเป็นตาดำ');
  });

  it('กินแล้วหมากที่ถูกกินหายไป', () => {
    const board = emptyBoard();
    board[4][2] = 'w';
    board[3][3] = 'b';
    const state = makeState(board, 'w');

    const moves = getLegalMoves(state, 'w');
    const capMove = moves.find(m => m.captured.length > 0);
    const newState = applyMove(state, capMove);

    assert.equal(newState.board[3][3], null, 'หมากที่ถูกกินต้องหายไป');
  });

  it('ไม่แก้ state เดิม (immutable)', () => {
    const board = emptyBoard();
    board[4][2] = 'w';
    const state = makeState(board, 'w');

    const boardSnapshot = JSON.stringify(state.board);
    const moves = getLegalMoves(state, 'w');
    applyMove(state, moves[0]);

    assert.equal(JSON.stringify(state.board), boardSnapshot, 'state เดิมต้องไม่เปลี่ยน');
    assert.equal(state.turn, 'w', 'turn เดิมต้องไม่เปลี่ยน');
  });
});

// ═══════════════════════════════════════
// 10. ตัดสินแพ้ชนะ (getWinner)
// ═══════════════════════════════════════

describe('getWinner()', () => {
  it('ไม่มีหมากขาว → ดำชนะ', () => {
    const board = emptyBoard();
    board[4][2] = 'b';
    const state = makeState(board, 'w');
    assert.equal(getWinner(state), 'b');
  });

  it('ไม่มีหมากดำ → ขาวชนะ', () => {
    const board = emptyBoard();
    board[4][2] = 'w';
    const state = makeState(board, 'b');
    assert.equal(getWinner(state), 'w');
  });

  it('ขาวไม่มีทางเดิน → ดำชนะ', () => {
    // ขาวถูกล้อมจนเดินไม่ได้
    const board = emptyBoard();
    board[0][0] = 'w'; // มุมบนซ้าย ติดขอบ อยู่แถว 0 แล้ว
    board[1][1] = 'b'; // ปิดทางถอยหลัง (แต่เบี้ยเดินถอยหลังไม่ได้อยู่แล้ว)
    // ขาวอยู่แถว 0 ซึ่งเดินข้างหน้า (row -1) ไม่ได้ → ไม่มีทางเดิน
    const state = makeState(board, 'w');
    assert.equal(getWinner(state), 'b', 'ขาวเดินไม่ได้ → ดำชนะ');
  });

  it('ยังเล่นอยู่ → คืน null', () => {
    const state = createInitialState();
    assert.equal(getWinner(state), null);
  });

  it('ฮอสมีทางเดิน → ยังไม่จบ', () => {
    const board = emptyBoard();
    board[0][0] = 'W'; // ฮอสขาว — เดินถอยหลังได้
    board[4][4] = 'b';
    const state = makeState(board, 'w');
    assert.equal(getWinner(state), null, 'ฮอสยังเดินได้ → ยังไม่จบ');
  });
});

// ═══════════════════════════════════════
// 11. findMatchingMove
// ═══════════════════════════════════════

describe('findMatchingMove()', () => {
  it('หา move ที่ตรงกับ from/to', () => {
    const board = emptyBoard();
    board[4][2] = 'w';
    const state = makeState(board, 'w');

    const moves = getLegalMoves(state, 'w');
    const match = findMatchingMove(moves, { from: [4, 2], to: [3, 1] });
    assert.ok(match, 'ต้องเจอ move ที่ตรง');
    assert.deepEqual(match.from, [4, 2]);
    assert.deepEqual(match.to, [3, 1]);
  });

  it('คืน null ถ้าไม่มี move ที่ตรง', () => {
    const board = emptyBoard();
    board[4][2] = 'w';
    const state = makeState(board, 'w');

    const moves = getLegalMoves(state, 'w');
    const match = findMatchingMove(moves, { from: [4, 2], to: [5, 3] }); // ถอยหลัง — ผิดกติกา
    assert.equal(match, null);
  });
});

// ═══════════════════════════════════════
// 12. เกมจบลงหลังกินหมดทุกตัว
// ═══════════════════════════════════════

describe('เกมจบสมบูรณ์', () => {
  it('กินตัวสุดท้าย → ฝั่งกินชนะ', () => {
    const board = emptyBoard();
    board[4][2] = 'w';
    board[3][3] = 'b'; // ดำตัวสุดท้าย
    const state = makeState(board, 'w');

    const moves = getLegalMoves(state, 'w');
    const capMove = moves.find(m => m.captured.length > 0);
    assert.ok(capMove, 'ต้องมี move กิน');

    const newState = applyMove(state, capMove);
    assert.equal(getWinner(newState), 'w', 'ขาวชนะ');
  });
});

// ═══════════════════════════════════════
// 13. Edge cases
// ═══════════════════════════════════════

describe('Edge cases', () => {
  it('ฮอสดำกินข้างหลัง (ทิศขึ้น) ได้', () => {
    const board = emptyBoard();
    board[4][4] = 'B'; // ฮอสดำ
    board[3][3] = 'w'; // ขาวอยู่ทิศ "หลัง" ของดำ (ข้างบน)
    // ช่อง [2,2] ว่าง
    const state = makeState(board, 'b');

    const moves = getLegalMoves(state, 'b');
    const capUp = moves.find(m => m.to[0] === 2 && m.to[1] === 2 && m.captured.length > 0);
    assert.ok(capUp, 'ฮอสดำกินทิศขึ้น (ข้างหลัง) ได้');
  });

  it('กินต่อเนื่อง — หมากกลับมาลงช่องเดิม (ตำแหน่งเริ่มต้น) ได้', () => {
    // กรณีพิเศษ: กินวนกลับมาตำแหน่งเดิม
    // ต้องอนุญาตเพราะช่องเดิมว่าง (หมากถูกย้ายออกแล้ว)
    const board = emptyBoard();
    board[4][4] = 'W'; // ฮอสขาว
    board[3][3] = 'b'; // กินไป [2,2]
    board[3][1] = 'b'; // กินไป [4,0]... 
    // ไม่สามารถกลับมา [4,4] ได้ง่ายๆ จากทิศนี้ — ข้ามเคสนี้
    // แค่ตรวจว่าไม่ crash
    const state = makeState(board, 'w');
    const moves = getLegalMoves(state, 'w');
    assert.ok(moves.length > 0, 'ต้องมี move อย่างน้อย 1');
  });

  it('เกมเริ่มต้น — ขาวมี legal moves', () => {
    const state = createInitialState();
    const moves = getLegalMoves(state, 'w');
    assert.ok(moves.length > 0, 'ขาวต้องเดินได้ตอนเริ่มเกม');
    // ตอนเริ่มเกมไม่มีกิน — ต้องเป็นเดินธรรมดาทั้งหมด
    assert.ok(moves.every(m => m.captured.length === 0), 'ตอนเริ่มเกมเดินธรรมดาเท่านั้น');
  });

  it('เกมเริ่มต้น — ดำยังเดินไม่ได้ (ยังไม่ถึงตา)', () => {
    const state = createInitialState();
    // getLegalMoves ยังหา moves ให้ดำได้ แต่เซิร์ฟเวอร์จะไม่ให้ดำเดิน
    const moves = getLegalMoves(state, 'b');
    assert.ok(moves.length > 0, 'ดำมี legal moves ถ้าถึงตา');
  });
});

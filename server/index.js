/**
 * server/index.js — เซิร์ฟเวอร์หลัก Express + Socket.io
 * 
 * รับผิดชอบ:
 * - เสิร์ฟไฟล์ static ในโฟลเดอร์ public
 * - ระบบคิวจับคู่ (Matchmaking Queue)
 * - การจัดการห้องเกม (Room Management)
 * - Server-authoritative logic (ตรวจสอบการเดินหมากผ่าน rules.js)
 */

'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const {
  createInitialState,
  getLegalMoves,
  applyMove,
  getWinner,
  findMatchingMove,
} = require('./game/rules.js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

const PORT = process.env.PORT || 3000;

// เสิร์ฟ static assets จากโฟลเดอร์ public
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// ──────────────────────────────────────────────
// โครงสร้างข้อมูลในหน่วยความจำ (In-memory Store)
// ──────────────────────────────────────────────

/**
 * ผู้เล่นที่ออนไลน์: socket.id -> { id, name, roomId, inQueue }
 */
const players = new Map();

/**
 * คิวรอจับคู่: array ของ socket.id
 */
const matchQueue = [];

/**
 * ห้องเกมที่กำลังเล่นอยู่: roomId -> {
 *   id: string,
 *   players: { w: { id, name }, b: { id, name } },
 *   state: { board, turn },
 *   lastMove: object | null
 * }
 */
const rooms = new Map();

// ──────────────────────────────────────────────
// Helper Functions
// ──────────────────────────────────────────────

/** นับจำนวนหมากที่เหลือของแต่ละฝั่ง */
function countPieces(board) {
  let white = 0;
  let black = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p === 'w' || p === 'W') white++;
      if (p === 'b' || p === 'B') black++;
    }
  }
  return { white, black };
}

/** ส่งจำนวนผู้เล่นออนไลน์และในคิวไปยังทุกคน */
function broadcastLobbyStats() {
  io.emit('lobby_stats', {
    onlineCount: players.size,
    inQueueCount: matchQueue.length,
  });
}

/** ส่ง state ล่าสุดไปยังผู้เล่นทั้งสองฝั่งในห้อง พร้อม legal moves ของคนที่ถึงตา */
function broadcastGameState(room) {
  const currentTurn = room.state.turn;
  const legalMoves = getLegalMoves(room.state, currentTurn);
  const counts = countPieces(room.state.board);
  const mustCapture = legalMoves.some(m => m.captured && m.captured.length > 0);

  ['w', 'b'].forEach((color) => {
    const playerInfo = room.players[color];
    if (!playerInfo) return;

    const socket = io.sockets.sockets.get(playerInfo.id);
    if (socket) {
      socket.emit('state_update', {
        board: room.state.board,
        turn: room.state.turn,
        legalMoves: currentTurn === color ? legalMoves : [],
        mustCapture: currentTurn === color ? mustCapture : false,
        counts,
        lastMove: room.lastMove || null,
        myColor: color,
      });
    }
  });
}

/** ดำเนินการจับคู่เมื่อมีผู้เล่นในคิวตั้งแต่ 2 คนขึ้นไป */
function processMatchmaking() {
  while (matchQueue.length >= 2) {
    const p1Id = matchQueue.shift();
    const p2Id = matchQueue.shift();

    const p1 = players.get(p1Id);
    const p2 = players.get(p2Id);

    // ตรวจสอบว่าผู้เล่นยังเชื่อมต่ออยู่จริง
    const s1 = io.sockets.sockets.get(p1Id);
    const s2 = io.sockets.sockets.get(p2Id);

    if (!p1 || !s1) {
      if (p2 && s2) matchQueue.unshift(p2Id);
      continue;
    }
    if (!p2 || !s2) {
      if (p1 && s1) matchQueue.unshift(p1Id);
      continue;
    }

    // สุ่มสี: ขาวเดินก่อน
    const p1IsWhite = Math.random() < 0.5;
    const whitePlayer = p1IsWhite ? p1 : p2;
    const blackPlayer = p1IsWhite ? p2 : p1;

    const roomId = `room_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    s1.join(roomId);
    s2.join(roomId);

    p1.roomId = roomId;
    p1.inQueue = false;
    p2.roomId = roomId;
    p2.inQueue = false;

    const newRoom = {
      id: roomId,
      players: {
        w: { id: whitePlayer.id, name: whitePlayer.name },
        b: { id: blackPlayer.id, name: blackPlayer.name },
      },
      state: createInitialState(),
      lastMove: null,
    };

    rooms.set(roomId, newRoom);

    // แจ้งเริ่มเกมให้ทั้ง 2 ฝั่ง
    const sWhite = io.sockets.sockets.get(whitePlayer.id);
    const sBlack = io.sockets.sockets.get(blackPlayer.id);

    if (sWhite) {
      sWhite.emit('match_found', {
        room: roomId,
        color: 'w',
        opponentName: blackPlayer.name,
      });
    }

    if (sBlack) {
      sBlack.emit('match_found', {
        room: roomId,
        color: 'b',
        opponentName: whitePlayer.name,
      });
    }

    // ส่งสถานะกระดานตั้งต้น
    broadcastGameState(newRoom);
  }
}

/** ดึง socket ออกจากคิวจับคู่ */
function removeFromQueue(socketId) {
  const idx = matchQueue.indexOf(socketId);
  if (idx !== -1) {
    matchQueue.splice(idx, 1);
  }
  const player = players.get(socketId);
  if (player) {
    player.inQueue = false;
  }
}

/** จัดการเมื่อผู้เล่นออกจากห้อง หรือตัดการเชื่อมต่อ */
function handlePlayerLeaveRoom(socketId, reason = 'left') {
  const player = players.get(socketId);
  if (!player || !player.roomId) return;

  const room = rooms.get(player.roomId);
  if (!room) {
    player.roomId = null;
    return;
  }

  // หาผู้เล่นอีกฝั่ง
  const leavingColor = room.players.w.id === socketId ? 'w' : 'b';
  const opponentColor = leavingColor === 'w' ? 'b' : 'w';
  const opponent = room.players[opponentColor];

  if (opponent) {
    const oppSocket = io.sockets.sockets.get(opponent.id);
    if (oppSocket) {
      oppSocket.emit('opponent_left', { reason });
      oppSocket.emit('game_over', {
        winner: opponentColor,
        reason: reason === 'disconnected' ? 'opponent_disconnected' : 'opponent_resigned',
      });
    }
    const oppPlayer = players.get(opponent.id);
    if (oppPlayer) {
      oppPlayer.roomId = null;
    }
  }

  rooms.delete(room.id);
  player.roomId = null;
}

// ──────────────────────────────────────────────
// Socket.io Connection Event Handler
// ──────────────────────────────────────────────

io.on('connection', (socket) => {
  // บันทึกผู้เล่นใหม่
  players.set(socket.id, {
    id: socket.id,
    name: 'ผู้เล่น',
    roomId: null,
    inQueue: false,
  });

  // แจ้งสถิติห้องให้ทุกคน
  broadcastLobbyStats();

  // 1. ตั้งชื่อผู้เล่น
  socket.on('join', (name) => {
    const player = players.get(socket.id);
    if (!player) return;

    const trimmed = (name || '').trim();
    if (trimmed.length >= 2 && trimmed.length <= 12) {
      player.name = trimmed;
    } else {
      player.name = `ผู้เล่น_${socket.id.substring(0, 4)}`;
    }

    socket.emit('joined', { name: player.name });
    broadcastLobbyStats();
  });

  // 2. ขอจับคู่ด่วน
  socket.on('quick_match', () => {
    const player = players.get(socket.id);
    if (!player) return;

    if (player.roomId) {
      socket.emit('error_msg', 'คุณกำลังอยู่ในห้องเกมอยู่แล้ว');
      return;
    }

    if (!player.inQueue) {
      player.inQueue = true;
      matchQueue.push(socket.id);
      socket.emit('queue_waiting');
      broadcastLobbyStats();
      processMatchmaking();
    }
  });

  // 3. ขอยกเลิกการค้นหาคู่
  socket.on('cancel_match', () => {
    removeFromQueue(socket.id);
    socket.emit('queue_cancelled');
    broadcastLobbyStats();
  });

  // 4. เข้าคิวเล่นต่อหลังจบเกม (Rematch)
  socket.on('rematch_queue', () => {
    const player = players.get(socket.id);
    if (!player) return;

    if (player.roomId) {
      const room = rooms.get(player.roomId);
      if (room) rooms.delete(player.roomId);
      player.roomId = null;
    }

    removeFromQueue(socket.id);
    player.inQueue = true;
    matchQueue.push(socket.id);
    socket.emit('queue_waiting');
    broadcastLobbyStats();
    processMatchmaking();
  });

  // 5. เดินหมาก (Server-Authoritative Check)
  socket.on('move', (moveInput) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) {
      socket.emit('error_msg', 'ไม่อยู่ในห้องเกม');
      return;
    }

    const room = rooms.get(player.roomId);
    if (!room) {
      socket.emit('error_msg', 'ไม่พบห้องเกม');
      return;
    }

    const isWhite = room.players.w.id === socket.id;
    const isBlack = room.players.b.id === socket.id;
    if (!isWhite && !isBlack) return;

    const playerColor = isWhite ? 'w' : 'b';

    console.log(`[SERVER MOVE RECEIVED] Room ${room.id}: Player '${player.name}' (${playerColor}) requested move:`, moveInput);

    // ตรวจสอบว่าถึงตาตัวเองหรือไม่
    if (room.state.turn !== playerColor) {
      console.warn(`[SERVER MOVE REJECTED] Not player's turn: current turn=${room.state.turn}, player=${playerColor}`);
      socket.emit('error_msg', 'ยังไม่ถึงตาของคุณ');
      return;
    }

    if (!moveInput || !moveInput.from || !moveInput.to) {
      socket.emit('error_msg', 'ข้อมูลการเดินไม่สมบูรณ์');
      return;
    }

    // ตรวจสอบความถูกต้องตามกฎกติกา
    const legalMoves = getLegalMoves(room.state, playerColor);
    const validMove = findMatchingMove(legalMoves, moveInput);

    if (!validMove) {
      console.warn(`[SERVER MOVE REJECTED] Move not legal according to Thai Checkers rules:`, moveInput);
      socket.emit('error_msg', 'การเดินนี้ไม่ถูกต้องตามกติกา');
      return;
    }

    console.log(`[SERVER MOVE APPLIED] Valid move:`, validMove);
    // ปรับปรุงกระดาน
    room.state = applyMove(room.state, validMove);
    room.lastMove = validMove;

    // ตรวจสอบการชนะ
    const winner = getWinner(room.state);

    // ส่งกระดานใหม่ให้ทั้งคู่
    broadcastGameState(room);

    if (winner) {
      io.to(room.id).emit('game_over', {
        winner,
        reason: 'checkmate',
      });
      // ล้างสถานะห้องของผู้เล่น
      const pw = players.get(room.players.w.id);
      const pb = players.get(room.players.b.id);
      if (pw) pw.roomId = null;
      if (pb) pb.roomId = null;
      rooms.delete(room.id);
      broadcastLobbyStats();
    }
  });

  // 6. ขอยอมแพ้
  socket.on('resign', () => {
    handlePlayerLeaveRoom(socket.id, 'resigned');
    broadcastLobbyStats();
  });

  // 7. ผู้เล่นตัดการเชื่อมต่อ
  socket.on('disconnect', () => {
    removeFromQueue(socket.id);
    handlePlayerLeaveRoom(socket.id, 'disconnected');
    players.delete(socket.id);
    broadcastLobbyStats();
  });
});

// เริ่มต้นเซิร์ฟเวอร์
server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 AR Checkers Online Server กำลังทำงานที่พอร์ต ${PORT}`);
  console.log(`👉 เปิดเบราว์เซอร์: http://localhost:${PORT}`);
  console.log(`===============================================`);
});

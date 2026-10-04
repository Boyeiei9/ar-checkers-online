/**
 * public/js/net.js — จัดการการเชื่อมต่อ Socket.io ฝั่ง Client
 */

'use strict';

const Net = {
  socket: null,
  callbacks: {},

  init() {
    this.socket = io();

    // ฟังเหตุการณ์ต่างๆ จากเซิร์ฟเวอร์
    const events = [
      'connect',
      'disconnect',
      'joined',
      'queue_waiting',
      'queue_cancelled',
      'match_found',
      'state_update',
      'game_over',
      'opponent_left',
      'error_msg',
      'lobby_stats',
    ];

    events.forEach((ev) => {
      this.socket.on(ev, (data) => {
        if (this.callbacks[ev]) {
          this.callbacks[ev](data);
        }
      });
    });
  },

  on(event, handler) {
    this.callbacks[event] = handler;
  },

  join(name) {
    this.socket.emit('join', name);
  },

  quickMatch() {
    this.socket.emit('quick_match');
  },

  cancelMatch() {
    this.socket.emit('cancel_match');
  },

  sendMove(from, to) {
    console.log('[NET CLIENT] Emitting move event to server:', { from, to });
    const dbgMoveNet = document.getElementById('dbg-move-net');
    if (dbgMoveNet) {
      dbgMoveNet.textContent = `Net Move: [${from}] -> [${to}] (sent)`;
    }
    this.socket.emit('move', { from, to });
  },

  resign() {
    this.socket.emit('resign');
  },

  rematch() {
    this.socket.emit('rematch_queue');
  },
};

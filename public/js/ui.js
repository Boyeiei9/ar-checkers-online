/**
 * public/js/ui.js — จัดการ UI ทั้งหมด (Lobby, 2D Grid, 3D Scene, WebAR MindAR)
 */

'use strict';

const UI = {
  // สถานะผู้เล่นในไคลเอนต์
  playerName: '',
  myColor: null,        // 'w' หรือ 'b'
  opponentName: '',
  currentTurn: 'w',
  boardState: null,
  legalMoves: [],
  selectedSquare: null, // [r, c]
  mustCapture: false,

  // โหมดการแสดงผลปัจจุบัน: '3d' (เริ่มต้น/สำรอง), 'ar', '2d'
  displayMode: '3d',

  // Queue Timer
  queueStartTime: 0,
  queueTimerInterval: null,

  // DOM Elements
  elements: {},

  init() {
    this.cacheDOM();
    this.bindEvents();
    this.bindNetworkEvents();
    this.loadSavedName();

    // เริ่มต้นระบบ 3D & WebAR
    if (window.Game3D) {
      Game3D.init(
        (from, to) => {
          Net.sendMove(from, to);
        },
        (r, c) => {
          this.selectedSquare = [r, c];
          this.renderBoard();
        },
        (targetFound) => {
          this.updateARTrackerStatus(targetFound);
        }
      );
    }
  },

  cacheDOM() {
    this.elements = {
      // Views
      viewName: document.getElementById('view-name'),
      viewLobby: document.getElementById('view-lobby'),
      viewQueue: document.getElementById('view-queue'),
      viewGame: document.getElementById('view-game'),

      // Inputs & Buttons
      inputName: document.getElementById('input-name'),
      nameCount: document.getElementById('name-count'),
      btnJoin: document.getElementById('btn-join'),
      btnEditName: document.getElementById('btn-edit-name'),
      btnQuickMatch: document.getElementById('btn-quick-match'),
      btnCancelQueue: document.getElementById('btn-cancel-queue'),
      btnResign: document.getElementById('btn-resign'),
      btnRules: document.getElementById('btn-rules'),
      btnInGameRules: document.getElementById('btn-in-game-rules'),

      // Mode Switcher Buttons
      modeBtn3D: document.getElementById('mode-btn-3d'),
      modeBtnAR: document.getElementById('mode-btn-ar'),
      modeBtn2D: document.getElementById('mode-btn-2d'),

      // 3D vs 2D Containers & AR Status
      container3d: document.getElementById('container-3d'),
      container2d: document.getElementById('container-2d'),
      arStatus: document.getElementById('ar-status'),
      hintText: document.getElementById('hint-text'),

      // Marker Buttons & Modal
      btnLobbyMarker: document.getElementById('btn-lobby-marker'),
      btnGameMarker: document.getElementById('btn-game-marker'),
      modalMarker: document.getElementById('modal-marker'),
      modalBtnCloseMarker: document.getElementById('modal-btn-close-marker'),
      modalBtnCloseMarkerX: document.getElementById('modal-btn-close-marker-x'),

      // QR Code Sharing Modal
      btnShareQr: document.getElementById('btn-share-qr'),
      modalQr: document.getElementById('modal-qr'),
      modalBtnCloseQr: document.getElementById('modal-btn-close-qr'),
      modalBtnCloseQrX: document.getElementById('modal-btn-close-qr-x'),
      lobbyQrCanvas: document.getElementById('lobby-qrcode-canvas'),
      textLobbyQrUrl: document.getElementById('text-lobby-qr-url'),

      // Lobby displays
      textPlayerName: document.getElementById('text-player-name'),
      statOnline: document.getElementById('stat-online'),
      statQueue: document.getElementById('stat-queue'),
      queueTimer: document.getElementById('queue-timer'),

      // Match displays
      textMyName: document.getElementById('text-my-name'),
      textOpponentName: document.getElementById('text-opponent-name'),
      textMyCount: document.getElementById('text-my-count'),
      textOppCount: document.getElementById('text-opp-count'),
      badgeMyColor: document.getElementById('badge-my-color'),
      badgeOppColor: document.getElementById('badge-opp-color'),
      badgeTurn: document.getElementById('badge-turn'),
      bannerAlert: document.getElementById('banner-alert'),

      boardGrid: document.getElementById('checker-board'),

      // Modals
      modalOverlay: document.getElementById('modal-overlay'),
      modalTitle: document.getElementById('modal-title'),
      modalBody: document.getElementById('modal-body'),
      modalBtnRematch: document.getElementById('modal-btn-rematch'),
      modalBtnLobby: document.getElementById('modal-btn-lobby'),

      modalRules: document.getElementById('modal-rules'),
      modalBtnCloseRules: document.getElementById('modal-btn-close-rules'),
      modalBtnCloseRulesX: document.getElementById('modal-btn-close-rules-x'),
    };
  },

  loadSavedName() {
    try {
      const saved = localStorage.getItem('ar_checkers_player_name');
      if (saved && saved.trim().length >= 2) {
        this.elements.inputName.value = saved.trim();
        this.updateCharCount();
      }
    } catch (e) {}
  },

  updateCharCount() {
    const len = this.elements.inputName.value.length;
    this.elements.nameCount.textContent = `${len}/12`;
    if (len < 2 || len > 12) {
      this.elements.nameCount.style.color = 'var(--danger)';
    } else {
      this.elements.nameCount.style.color = 'var(--accent)';
    }
  },

  showView(viewName) {
    const views = ['Name', 'Lobby', 'Queue', 'Game'];
    views.forEach((v) => {
      const el = this.elements[`view${v}`];
      if (el) {
        if (v.toLowerCase() === viewName.toLowerCase()) {
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
        }
      }
    });

    // จัดการคลาส in-game เพื่อซ่อน Header เมื่อเข้าสู่กระดานเกม
    if (viewName.toLowerCase() === 'game') {
      document.body.classList.add('in-game');
      // กระตุ้นให้ A-Frame WebGL Canvas คำนวณขนาดใหม่ทันทีที่ view-game แสดงผล
      if (window.Game3D && typeof Game3D.resizeScene === 'function') {
        Game3D.resizeScene();
      }
    } else {
      document.body.classList.remove('in-game');
    }

    // คุม Queue Timer
    if (viewName.toLowerCase() === 'queue') {
      this.startQueueTimer();
    } else {
      this.stopQueueTimer();
    }
  },

  startQueueTimer() {
    this.queueStartTime = Date.now();
    this.elements.queueTimer.textContent = '00:00';
    if (this.queueTimerInterval) clearInterval(this.queueTimerInterval);

    this.queueTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - this.queueStartTime) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const secs = String(elapsed % 60).padStart(2, '0');
      this.elements.queueTimer.textContent = `${mins}:${secs}`;
    }, 1000);
  },

  stopQueueTimer() {
    if (this.queueTimerInterval) {
      clearInterval(this.queueTimerInterval);
      this.queueTimerInterval = null;
    }
  },

  showAlert(message, type = 'warning', timeout = 3500) {
    const banner = this.elements.bannerAlert;
    banner.textContent = message;
    banner.className = `notification ${type}`;
    banner.classList.remove('hidden');

    if (this._alertTimeout) clearTimeout(this._alertTimeout);
    this._alertTimeout = setTimeout(() => {
      banner.classList.add('hidden');
    }, timeout);
  },

  /** สลับโหมดการแสดงผล (3D, AR, 2D) */
  async switchDisplayMode(targetMode) {
    if (this.displayMode === targetMode) return;

    // อัปเดตปุ่ม Active ในแถบสลับโหมด
    [this.elements.modeBtn3D, this.elements.modeBtnAR, this.elements.modeBtn2D].forEach((btn) => {
      if (btn) btn.classList.remove('active');
    });

    if (targetMode === 'ar') {
      // ── โหมด AR (เปิดกล้อง & ส่องภาพมาร์กเกอร์) ──
      try {
        document.body.classList.add('ar-active');
        this.elements.container3d.classList.remove('hidden');
        this.elements.container2d.classList.add('hidden');
        this.elements.arStatus.classList.remove('hidden');
        this.elements.arStatus.classList.remove('tracking');
        this.elements.arStatus.textContent = '🔍 กรุณาส่องกล้องไปที่ภาพมาร์กเกอร์';
        this.elements.modeBtnAR.classList.add('active');
        this.elements.hintText.textContent = '💡 ส่องกล้องไปที่ภาพมาร์กเกอร์เพื่อฉายกระดาน แล้วแตะหมากเพื่อเดิน';

        if (window.Game3D) {
          await Game3D.setMode('ar');
          if (this.boardState) {
            Game3D.updateBoard(this.boardState, this.legalMoves, this.mustCapture);
          }
        }
        this.displayMode = 'ar';
      } catch (err) {
        document.body.classList.remove('ar-active');
        this.showAlert('ไม่สามารถเข้าถึงกล้องได้ — สลับกลับสู่โหมด 3D ลอยจอสำรอง', 'warning', 4000);
        this.switchDisplayMode('3d');
      }
    } else if (targetMode === '2d') {
      // ── โหมด 2D (ตาราง HTML เรียบง่าย) ──
      document.body.classList.remove('ar-active');
      this.elements.container3d.classList.add('hidden');
      this.elements.container2d.classList.remove('hidden');
      this.elements.arStatus.classList.add('hidden');
      this.elements.modeBtn2D.classList.add('active');
      this.elements.hintText.textContent = '💡 แตะตัวหมากในตารางเพื่อเลือกตาเดิน';

      // ปิดกล้อง AR ถ้าเปิดค้างอยู่
      if (window.Game3D) {
        Game3D.setMode('3d');
      }
      this.displayMode = '2d';
      this.renderBoard();
    } else {
      // ── โหมด 3D Fallback (กระดานลอยกลางจอ ไม่ใช้กล้อง) ──
      document.body.classList.remove('ar-active');
      this.elements.container3d.classList.remove('hidden');
      this.elements.container2d.classList.add('hidden');
      this.elements.arStatus.classList.add('hidden');
      this.elements.modeBtn3D.classList.add('active');
      this.elements.hintText.textContent = '💡 แตะตัวหมาก 3D เพื่อดูตาเดิน แล้วแตะช่องสีเขียวเพื่อเดิน';

      if (window.Game3D) {
        await Game3D.setMode('3d');
        if (this.boardState) {
          Game3D.updateBoard(this.boardState, this.legalMoves, this.mustCapture);
        }
      }
      this.displayMode = '3d';
    }
  },

  /** อัปเดตป้ายเตือนเมื่อ MindAR เจอมาร์กเกอร์หรือหลุดมาร์กเกอร์ */
  updateARTrackerStatus(targetFound) {
    if (this.displayMode !== 'ar') return;

    clearTimeout(this._arPillTimer);
    if (targetFound) {
      this.elements.arStatus.textContent = '🎯 ล็อกมาร์กเกอร์แล้ว!';
      this.elements.arStatus.classList.add('tracking');
      this.elements.arStatus.classList.remove('hidden');

      // จางหายไปหลังล็อกมาร์กเกอร์ได้ 2.5 วินาที เพื่อไม่ให้เกะกะสายตา
      this._arPillTimer = setTimeout(() => {
        if (this.displayMode === 'ar') {
          this.elements.arStatus.classList.add('hidden');
        }
      }, 2500);
    } else {
      this.elements.arStatus.textContent = '🔍 กรุณาส่องกล้องไปที่ภาพมาร์กเกอร์';
      this.elements.arStatus.classList.remove('tracking');
      this.elements.arStatus.classList.remove('hidden');
    }
  },

  bindEvents() {
    // 1. ช่องกรอกชื่อ: นับตัวอักษร
    this.elements.inputName.addEventListener('input', () => {
      this.updateCharCount();
    });

    // 2. กดปุ่มเข้าระบบตั้งชื่อ
    this.elements.btnJoin.addEventListener('click', () => {
      const name = this.elements.inputName.value.trim();
      if (name.length < 2 || name.length > 12) {
        this.showAlert('กรุณาตั้งชื่อระหว่าง 2 ถึง 12 ตัวอักษร', 'warning');
        return;
      }
      try {
        localStorage.setItem('ar_checkers_player_name', name);
      } catch (e) {}

      Net.join(name);
    });

    this.elements.inputName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.elements.btnJoin.click();
    });

    // 3. เปลี่ยนชื่อในล็อบบี้
    this.elements.btnEditName.addEventListener('click', () => {
      this.showView('name');
      this.elements.inputName.focus();
    });

    // 4. จับคู่ด่วน
    this.elements.btnQuickMatch.addEventListener('click', () => {
      Net.quickMatch();
    });

    // 5. ยกเลิกจับคู่
    this.elements.btnCancelQueue.addEventListener('click', () => {
      Net.cancelMatch();
    });

    // 6. ขอยอมแพ้
    this.elements.btnResign.addEventListener('click', () => {
      if (confirm('คุณต้องการยอมแพ้ใช่หรือไม่?')) {
        Net.resign();
      }
    });

    // 7. ดูกติกา
    const openRules = () => this.elements.modalRules.classList.remove('hidden');
    const closeRules = () => this.elements.modalRules.classList.add('hidden');

    this.elements.btnRules.addEventListener('click', openRules);
    if (this.elements.btnInGameRules) {
      this.elements.btnInGameRules.addEventListener('click', openRules);
    }
    this.elements.modalBtnCloseRules.addEventListener('click', closeRules);
    this.elements.modalBtnCloseRulesX.addEventListener('click', closeRules);

    // 8. ดูภาพมาร์กเกอร์ AR
    const openMarker = () => this.elements.modalMarker.classList.remove('hidden');
    const closeMarker = () => this.elements.modalMarker.classList.add('hidden');

    if (this.elements.btnLobbyMarker) this.elements.btnLobbyMarker.addEventListener('click', openMarker);
    if (this.elements.btnGameMarker) this.elements.btnGameMarker.addEventListener('click', openMarker);
    if (this.elements.modalBtnCloseMarker) this.elements.modalBtnCloseMarker.addEventListener('click', closeMarker);
    if (this.elements.modalBtnCloseMarkerX) this.elements.modalBtnCloseMarkerX.addEventListener('click', closeMarker);

    // 9. แสดง QR Code สำหรับเพื่อนสแกน
    const openQR = () => {
      const url = window.location.origin + '/';
      if (this.elements.lobbyQrCanvas && window.QRCode) {
        this.elements.lobbyQrCanvas.innerHTML = '';
        new QRCode(this.elements.lobbyQrCanvas, {
          text: url,
          width: 180,
          height: 180,
          colorDark: "#0f172a",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.M
        });
      }
      if (this.elements.textLobbyQrUrl) {
        this.elements.textLobbyQrUrl.textContent = url;
      }
      this.elements.modalQr.classList.remove('hidden');
    };
    const closeQR = () => this.elements.modalQr.classList.add('hidden');

    if (this.elements.btnShareQr) this.elements.btnShareQr.addEventListener('click', openQR);
    if (this.elements.modalBtnCloseQr) this.elements.modalBtnCloseQr.addEventListener('click', closeQR);
    if (this.elements.modalBtnCloseQrX) this.elements.modalBtnCloseQrX.addEventListener('click', closeQR);

    // 10. ปุ่มสลับโหมด 3D / AR / 2D
    if (this.elements.modeBtn3D) {
      this.elements.modeBtn3D.addEventListener('click', () => this.switchDisplayMode('3d'));
    }
    if (this.elements.modeBtnAR) {
      this.elements.modeBtnAR.addEventListener('click', () => this.switchDisplayMode('ar'));
    }
    if (this.elements.modeBtn2D) {
      this.elements.modeBtn2D.addEventListener('click', () => this.switchDisplayMode('2d'));
    }

    // 11. เล่นต่อ (Rematch) จาก Modal
    this.elements.modalBtnRematch.addEventListener('click', () => {
      this.elements.modalOverlay.classList.add('hidden');
      Net.rematch();
    });

    // 12. กลับล็อบบี้ จาก Modal
    this.elements.modalBtnLobby.addEventListener('click', () => {
      this.elements.modalOverlay.classList.add('hidden');
      this.switchDisplayMode('3d');
      this.showView('lobby');
    });
  },

  bindNetworkEvents() {
    // เมื่อตั้งชื่อสำเร็จ
    Net.on('joined', (data) => {
      this.playerName = data.name;
      this.elements.textPlayerName.textContent = data.name;
      this.showView('lobby');
    });

    // สถิติออนไลน์สด
    Net.on('lobby_stats', (stats) => {
      if (this.elements.statOnline) this.elements.statOnline.textContent = stats.onlineCount || 1;
      if (this.elements.statQueue) this.elements.statQueue.textContent = stats.inQueueCount || 0;
    });

    // เมื่อเข้าคิวรอ
    Net.on('queue_waiting', () => {
      this.showView('queue');
    });

    // เมื่อยกเลิกคิว
    Net.on('queue_cancelled', () => {
      this.showView('lobby');
    });

    // เมื่อพบห้องเกม
    Net.on('match_found', (data) => {
      this.myColor = data.color;
      this.opponentName = data.opponentName;

      this.elements.textMyName.textContent = this.playerName;
      this.elements.textOpponentName.textContent = this.opponentName;

      const oppColor = this.myColor === 'w' ? 'b' : 'w';
      this.elements.badgeMyColor.className = `piece-badge ${this.myColor === 'w' ? 'white' : 'black'}`;
      this.elements.badgeOppColor.className = `piece-badge ${oppColor === 'w' ? 'white' : 'black'}`;

      // ปรับมุมมอง 3D ตามสีของผู้เล่น
      if (window.Game3D) {
        Game3D.setPlayerPerspective(this.myColor);
      }

      this.selectedSquare = null;
      this.showView('game');
    });

    // เมื่อกระดานอัปเดต
    Net.on('state_update', (data) => {
      this.boardState = data.board;
      this.currentTurn = data.turn;
      this.legalMoves = data.legalMoves || [];
      this.mustCapture = data.mustCapture || false;
      this.selectedSquare = null;

      // อัปเดตกระดาน 3D (ส่ง mustCapture เพื่อให้แสดง capture hint ใน 3D/AR)
      if (window.Game3D) {
        Game3D.updateBoard(this.boardState, this.legalMoves, this.mustCapture);
      }

      // อัปเดตจำนวนหมากคงเหลือ
      if (data.counts) {
        const myCount = this.myColor === 'w' ? data.counts.white : data.counts.black;
        const oppCount = this.myColor === 'w' ? data.counts.black : data.counts.white;
        this.elements.textMyCount.textContent = `เหลือ ${myCount} ตัว`;
        this.elements.textOppCount.textContent = `เหลือ ${oppCount} ตัว`;
      }

      this.updateTurnDisplay();
      this.renderBoard();
    });

    // เมื่อจบเกม
    Net.on('game_over', (data) => {
      const isWinner = data.winner === this.myColor;
      this.elements.modalTitle.textContent = isWinner ? '🎉 คุณชนะ!' : '💀 คุณแพ้';
      
      let reasonText = '';
      if (data.reason === 'checkmate') {
        reasonText = isWinner ? 'คุณกินหมากฝ่ายตรงข้ามหมด หรือศัตรูไม่มีทางเดิน' : 'หมากของคุณหมด หรือไม่มีทางเดินเหลือ';
      } else if (data.reason === 'opponent_disconnected') {
        reasonText = 'คู่ต่อสู้ตัดการเชื่อมต่อ คุณชนะบาย!';
      } else if (data.reason === 'opponent_resigned') {
        reasonText = 'คู่ต่อสู้ขอยอมแพ้';
      }

      this.elements.modalBody.textContent = reasonText;
      this.elements.modalOverlay.classList.remove('hidden');
    });

    // เมื่อคู่ต่อสู้ออกจากเกม
    Net.on('opponent_left', () => {
      this.showAlert('คู่ต่อสู้ได้ออกจากเกมไปแล้ว', 'warning');
    });

    // ข้อความแจ้งเตือนข้อผิดพลาด
    Net.on('error_msg', (msg) => {
      this.showAlert(msg, 'warning');
    });
  },

  /** อัปเดตข้อความสถานะ ("ตาคุณ", "รอคู่แข่ง", "ต้องกินต่อ!") */
  updateTurnDisplay() {
    const isMyTurn = this.currentTurn === this.myColor;
    const badge = this.elements.badgeTurn;

    if (isMyTurn) {
      if (this.mustCapture) {
        badge.textContent = '⚡ ตาคุณ (ต้องกินต่อ!)';
        badge.className = 'turn-pill must-capture';
      } else {
        badge.textContent = '👉 ตาคุณ';
        badge.className = 'turn-pill my-turn';
      }
    } else {
      badge.textContent = '⏳ รอคู่แข่ง...';
      badge.className = 'turn-pill opp-turn';
    }
  },

  toBoardCoord(vr, vc) {
    if (this.myColor === 'b') {
      return [7 - vr, 7 - vc];
    }
    return [vr, vc];
  },

  fromBoardCoord(r, c) {
    if (this.myColor === 'b') {
      return [7 - r, 7 - c];
    }
    return [r, c];
  },

  /** วาดกระดาน 2D สำรอง */
  renderBoard() {
    if (!this.boardState) return;

    const grid = this.elements.boardGrid;
    grid.innerHTML = '';

    const isMyTurn = this.currentTurn === this.myColor;

    for (let vr = 0; vr < 8; vr++) {
      for (let vc = 0; vc < 8; vc++) {
        const [r, c] = this.toBoardCoord(vr, vc);
        const piece = this.boardState[r][c];

        const sq = document.createElement('div');
        const isDark = (r + c) % 2 === 0;
        sq.className = `square ${isDark ? 'dark' : 'light'}`;
        sq.dataset.r = r;
        sq.dataset.c = c;

        // ไฮไลต์ถ้าถูกเลือก
        if (this.selectedSquare && this.selectedSquare[0] === r && this.selectedSquare[1] === c) {
          sq.classList.add('selected');
        }

        // ไฮไลต์หมากที่บังคับกิน
        if (isMyTurn && this.mustCapture && piece && piece.toLowerCase() === this.myColor) {
          const hasCapFromHere = this.legalMoves.some(
            m => m.from[0] === r && m.from[1] === c && m.captured && m.captured.length > 0
          );
          if (hasCapFromHere) {
            sq.classList.add('must-capture-piece');
          }
        }

        // ไฮไลต์เป้าหมายที่เดินได้
        if (this.selectedSquare) {
          const targets = this.legalMoves
            .filter(m => m.from[0] === this.selectedSquare[0] && m.from[1] === this.selectedSquare[1])
            .map(m => m.to);

          if (targets.some(t => t[0] === r && t[1] === c)) {
            sq.classList.add('valid-target');
          }
        }

        // วาดตัวหมาก
        if (piece) {
          const pieceEl = document.createElement('div');
          const isWhitePiece = piece.toLowerCase() === 'w';
          const isKing = piece === 'W' || piece === 'B';

          pieceEl.className = `piece ${isWhitePiece ? 'white' : 'black'} ${isKing ? 'king' : ''}`;
          sq.appendChild(pieceEl);
        }

        // คลิกช่อง
        sq.addEventListener('click', () => {
          this.handleSquareClick(r, c);
        });

        grid.appendChild(sq);
      }
    }
  },

  handleSquareClick(r, c) {
    if (this.currentTurn !== this.myColor) {
      this.showAlert('ยังไม่ถึงตาของคุณ', 'info', 1500);
      return;
    }

    const clickedPiece = this.boardState[r][c];
    const isMyPiece = clickedPiece && clickedPiece.toLowerCase() === this.myColor;

    // ถ้ากดเลือกหมากของตัวเอง
    if (isMyPiece) {
      const pieceMoves = this.legalMoves.filter(m => m.from[0] === r && m.from[1] === c);
      if (pieceMoves.length > 0) {
        this.selectedSquare = [r, c];
        this.renderBoard();
        return;
      } else {
        if (this.mustCapture) {
          this.showAlert('⚠️ กติกาบังคับกิน! คุณต้องเลือกตัวที่มีกรอบสีส้ม', 'warning');
        } else {
          this.showAlert('หมากตัวนี้ไม่มีตาเดินที่ถูกต้อง', 'info', 1500);
        }
        return;
      }
    }

    // ถ้ากดช่องปลายทางที่อยู่ใน valid moves
    if (this.selectedSquare) {
      const validMove = this.legalMoves.find(
        m => m.from[0] === this.selectedSquare[0] &&
             m.from[1] === this.selectedSquare[1] &&
             m.to[0] === r &&
             m.to[1] === c
      );

      if (validMove) {
        const from = this.selectedSquare;
        const to = [r, c];
        this.selectedSquare = null;
        this.renderBoard();
        Net.sendMove(from, to);
        return;
      }
    }

    // คลิกช่องอื่นที่ไม่ถูกต้อง -> ยกเลิกการเลือก
    this.selectedSquare = null;
    this.renderBoard();
  },
};

// เริ่มต้นระบบเมื่อโหลดหน้าเสร็จ
window.addEventListener('DOMContentLoaded', () => {
  Net.init();
  UI.init();
});

/**
 * public/js/game3d.js — จัดการ A-Frame 3D & WebAR MindAR สำหรับกระดานหมากฮอส
 * 
 * - โหมด 3D Fallback: กระดาน 3D ลอยกลางจอ ไม่ต้องใช้กล้อง (พร้อมใช้งานทันที)
 * - โหมด AR (MindAR Image Tracking): ฉายกระดาน 3D บนภาพมาร์กเกอร์ผ่านกล้องมือถือ/เว็บแคม
 * - สลับโหมดได้อย่างราบรื่น ปิด/เปิดกล้องตามต้องการ
 * - รองรับ Raycaster (คลิกหมากและช่องได้เหมือนกันทั้ง 3D และ AR)
 */

'use strict';

const Game3D = {
  sceneEl: null,
  boardGroupEl: null,
  piecesGroupEl: null,
  tilesGroupEl: null,
  highlightsGroupEl: null,
  arTargetEl: null,
  orientWrapperEl: null,
  mainCameraEl: null,
  cameraRigEl: null,

  // [ปัญหา B-2] ขนาดสำหรับกระดานมาร์กเกอร์จัตุรัส 1:1 (กว้าง ~0.99 หน่วย พอดีกับมาร์กเกอร์ 1.0 หน่วย)
  tileSize: 0.12, // 8 * 0.12 = 0.96 (รวมขอบ = 0.99 พอดีมาร์กเกอร์)
  pieceRadius: 0.046, // รัศมีหมากพอดีช่อง
  pieceHeight: 0.028, // หมากสูงไม่เกิน 0.05

  // โหมดปัจจุบัน ('3d' หรือ 'ar')
  currentMode: '3d',

  // สถานะปัจจุบัน
  playerColor: 'w',
  boardState: null,
  legalMoves: [],
  selectedPiece: null, // { r, c, entity }
  isAnimating: false,
  pieceEntities: {}, // key: "r,c" -> entity
  _hudInterval: null,
  _raycasterBound: false,
  _glowAnimFrame: null,   // requestAnimationFrame ID สำหรับ glow animation
  _selectedEntity: null,  // entity ที่เลือกอยู่ตอนนี้ (เพื่อล้างวงแหวน)
  _captureHintAnimFrame: null,  // animation frame สำหรับ capture hint rings
  _captureHintEntities: [],     // entities ที่สร้างอยู่ใน must-capture hint
  mustCapture: false,           // [ข้อ 3] ถ้า true ต้องกิน
  _audioCtx: null,              // [ข้อ 4] Web Audio Context สำหรับเสียงเลื่อนขั้น

  // Callbacks
  onMoveRequested: null,
  onPieceSelected: null,
  onTargetStatusChange: null, // (found: boolean) => void

  /** สร้างกระดานเริ่มต้น 16 ตัว (ขาว 8 ตัว, ดำ 8 ตัว) เพื่อให้มีหมากแสดงทันทีตั้งแต่แรก */
  getDefaultBoard() {
    const b = Array(8).fill(null).map(() => Array(8).fill(null));
    for (let c = 0; c < 8; c++) {
      if ((0 + c) % 2 === 0) b[0][c] = 'b';
      if ((1 + c) % 2 === 0) b[1][c] = 'b';
      if ((6 + c) % 2 === 0) b[6][c] = 'w';
      if ((7 + c) % 2 === 0) b[7][c] = 'w';
    }
    return b;
  },

  init(onMoveCallback, onSelectCallback, onTargetCallback) {
    this.onMoveRequested = onMoveCallback;
    this.onPieceSelected = onSelectCallback;
    this.onTargetStatusChange = onTargetCallback;

    this.sceneEl = document.getElementById('aframe-scene');
    if (!this.sceneEl) return;

    this.boardGroupEl = document.getElementById('board-3d-group');
    this.tilesGroupEl = document.getElementById('tiles-3d-group');
    this.piecesGroupEl = document.getElementById('pieces-3d-group');
    this.highlightsGroupEl = document.getElementById('highlights-3d-group');
    this.arTargetEl = document.getElementById('ar-target-group');
    this.orientWrapperEl = document.getElementById('board-orient-wrapper');
    this.mainCameraEl = document.getElementById('main-camera');

    const onSceneReady = () => {
      this.buildBoardBase();
      if (!this.boardState) {
        this.boardState = this.getDefaultBoard();
      }
      this.updateBoard(this.boardState, this.legalMoves);
      this.setPlayerPerspective(this.playerColor);
      this.updateDebugHUD(false);
      this.setupTouchRaycaster();
    };

    if (this.sceneEl.hasLoaded) {
      onSceneReady();
    } else {
      this.sceneEl.addEventListener('loaded', onSceneReady);
    }

    this.setupARListeners();
    this.setupTouchRaycaster();
  },

  /** [ข้อ 3 & 6] ติดตั้ง Event Listener สำหรับ Image Tracking ของ MindAR พร้อมบังคับ visible = true และอัปเดต HUD */
  setupARListeners() {
    if (!this.arTargetEl) return;

    this.arTargetEl.addEventListener('targetFound', () => {
      console.log('MindAR: Target Found!');

      // บังคับ visible = true ไม่ให้หลุดเป็น false
      if (this.arTargetEl) {
        this.arTargetEl.setAttribute('visible', 'true');
        if (this.arTargetEl.object3D) this.arTargetEl.object3D.visible = true;
      }

      // [ข้อ 1 & 2] กระดานและกลุ่มตัวหมาก
      if (this.boardGroupEl) {
        this.boardGroupEl.setAttribute('visible', 'true');
        if (this.boardGroupEl.object3D) this.boardGroupEl.object3D.visible = true;
        if (this.tilesGroupEl && this.tilesGroupEl.object3D) this.tilesGroupEl.object3D.visible = true;
        if (this.piecesGroupEl && this.piecesGroupEl.object3D) this.piecesGroupEl.object3D.visible = true;
        if (this.highlightsGroupEl && this.highlightsGroupEl.object3D) this.highlightsGroupEl.object3D.visible = true;
      }

      if (this.onTargetStatusChange) {
        this.onTargetStatusChange(true);
      }
      this.updateDebugHUD(true);
    });

    this.arTargetEl.addEventListener('targetLost', () => {
      console.log('MindAR: Target Lost!');
      if (this.onTargetStatusChange) {
        this.onTargetStatusChange(false);
      }
      this.updateDebugHUD(false);
    });

    // อัปเดต Debug HUD ต่อเนื่องทุก 500ms
    if (!this._hudInterval) {
      this._hudInterval = setInterval(() => {
        if (this.currentMode === 'ar') {
          const isTargetVis = this.arTargetEl && this.arTargetEl.object3D ? this.arTargetEl.object3D.visible : false;
          this.updateDebugHUD(isTargetVis);
        }
      }, 500);
    }
  },

  /** [ข้อ 2 & 6] ฟังก์ชันอัปเดตข้อมูลดีบักบนจอ */
  updateDebugHUD(isFound) {
    const elStatus = document.getElementById('dbg-status');
    const elChildren = document.getElementById('dbg-children');
    const elBoard = document.getElementById('dbg-board');
    const elVis = document.getElementById('dbg-vis');
    const elBoardChildren = document.getElementById('dbg-board-children');
    const elPieceSample = document.getElementById('dbg-piece-sample');

    if (elStatus) {
      elStatus.textContent = `Status: ${isFound ? '🎯 TARGET FOUND' : '🔍 SCANNING / LOST'}`;
      elStatus.style.color = isFound ? '#4ade80' : '#f87171';
    }
    if (elChildren && this.arTargetEl) {
      const domChildren = this.arTargetEl.children.length;
      const threeChildren = this.arTargetEl.object3D ? this.arTargetEl.object3D.children.length : 0;
      elChildren.textContent = `Target Children: DOM=${domChildren}, 3D=${threeChildren}`;
    }
    if (elBoard && this.boardGroupEl) {
      const pos = this.boardGroupEl.getAttribute('position') || {};
      const rot = this.boardGroupEl.getAttribute('rotation') || {};
      const scale = this.boardGroupEl.getAttribute('scale') || {};
      const px = typeof pos.x === 'number' ? pos.x.toFixed(2) : (pos.x || '0');
      const py = typeof pos.y === 'number' ? pos.y.toFixed(2) : (pos.y || '0');
      const pz = typeof pos.z === 'number' ? pos.z.toFixed(2) : (pos.z || '0.01');
      const sx = typeof scale.x === 'number' ? scale.x.toFixed(2) : (scale.x || '1');
      const rx = typeof rot.x === 'number' ? rot.x : (rot.x || '-90');
      elBoard.textContent = `Board: pos=(${px},${py},${pz}) rot=(${rx},${rot.y||0},${rot.z||0}) s=${sx}`;
    }
    if (elVis && this.arTargetEl && this.boardGroupEl) {
      const tVis = this.arTargetEl.object3D ? this.arTargetEl.object3D.visible : false;
      const bVis = this.boardGroupEl.object3D ? this.boardGroupEl.object3D.visible : false;
      elVis.textContent = `Visible: target=${tVis}, board=${bVis}`;
    }
    if (elBoardChildren && this.boardGroupEl) {
      const tilesCount = this.tilesGroupEl ? this.tilesGroupEl.children.length : 0;
      const piecesCount = this.piecesGroupEl ? this.piecesGroupEl.children.length : 0;
      elBoardChildren.textContent = `Board Children: ${tilesCount + piecesCount} (tiles=${tilesCount}, pieces=${piecesCount})`;
    }
    if (elPieceSample) {
      const firstKey = Object.keys(this.pieceEntities)[0];
      if (firstKey && this.pieceEntities[firstKey]) {
        const ent = this.pieceEntities[firstKey];
        const objPos = ent.object3D ? ent.object3D.position : null;
        const attrPos = ent.getAttribute('position') || {};
        const px = (objPos && objPos.x !== 0) ? objPos.x : (parseFloat(attrPos.x) || 0);
        const py = (objPos && objPos.y !== 0) ? objPos.y : (parseFloat(attrPos.y) || 0);
        const pz = (objPos && objPos.z !== 0) ? objPos.z : (parseFloat(attrPos.z) || 0);
        elPieceSample.textContent = `Piece[${firstKey}]: pos=(${px.toFixed(3)}, ${py.toFixed(3)}, ${pz.toFixed(3)})`;
      } else {
        elPieceSample.textContent = `Piece[0]: none`;
      }
    }
  },

  /** สลับโหมดการทำงานระหว่าง '3d' และ 'ar' */
  async setMode(mode) {
    if (mode === this.currentMode) return;

    const mindarSystem = this.sceneEl ? this.sceneEl.systems['mindar-image-system'] : null;

    if (mode === 'ar') {
      // ── เปลี่ยนเป็นโหมด AR (เปิดกล้อง & ส่องภาพมาร์กเกอร์) ──
      try {
        if (mindarSystem) {
          await mindarSystem.start();
        }

        // [ปัญหา B-2 & B-3] นำกระดานเข้า orientWrapperEl ซึ่งอยู่ใต้ arTargetEl
        if (this.arTargetEl && this.boardGroupEl) {
          if (this.orientWrapperEl) {
            if (this.orientWrapperEl.parentElement !== this.arTargetEl) {
              this.arTargetEl.appendChild(this.orientWrapperEl);
            }
            if (this.boardGroupEl.parentElement !== this.orientWrapperEl) {
              this.orientWrapperEl.appendChild(this.boardGroupEl);
            }
          } else {
            if (this.boardGroupEl.parentElement !== this.arTargetEl) {
              this.arTargetEl.appendChild(this.boardGroupEl);
            }
          }

          this.boardGroupEl.setAttribute('position', '0 0 0.01');
          this.boardGroupEl.setAttribute('rotation', '-90 0 0');
          this.boardGroupEl.setAttribute('scale', '1 1 1');
          this.boardGroupEl.setAttribute('visible', 'true');
          if (this.boardGroupEl.object3D) {
            this.boardGroupEl.object3D.position.set(0, 0, 0.01);
            this.boardGroupEl.object3D.rotation.set(-Math.PI / 2, 0, 0);
          }
        }

        this.currentMode = 'ar';
        this.setPlayerPerspective(this.playerColor);
        this.updateDebugHUD(false);

        // บังคับ A-Frame ปรับขนาด Canvas ให้เต็มหน้าจอ
        this.resizeScene();
        return true;
      } catch (err) {
        console.error('ไม่สามารถเปิดใช้งานกล้อง AR ได้:', err);
        await this.setMode('3d');
        throw err;
      }
    } else {
      // ── เปลี่ยนเป็นโหมด 3D Fallback (ปิดกล้อง) ──
      if (mindarSystem) {
        try {
          mindarSystem.stop();
        } catch (e) {
          // ignore
        }
      }

      // ย้ายกระดานกลับมาที่ a-scene root สำหรับโหมด 3D ที่ไม่มีมาร์กเกอร์
      if (this.sceneEl && this.boardGroupEl) {
        if (this.boardGroupEl.parentElement !== this.sceneEl) {
          this.sceneEl.appendChild(this.boardGroupEl);
        }
        this.boardGroupEl.setAttribute('position', '0 -0.55 -2.6');
        this.boardGroupEl.setAttribute('scale', '2.6 2.6 2.6'); // สเกลสำหรับโหมด 3D ลอยกลางจอ
        this.boardGroupEl.setAttribute('visible', 'true');
      }

      this.currentMode = '3d';
      this.setPlayerPerspective(this.playerColor);
      this.updateDebugHUD(false);

      this.resizeScene();
      return true;
    }
  },

  /** บังคับปรับขนาด A-Frame Canvas เมื่อมีการสลับโหมดหรือเปลี่ยนหน้า */
  resizeScene() {
    const doResize = () => {
      if (this.sceneEl) {
        if (typeof this.sceneEl.resize === 'function') {
          this.sceneEl.resize();
        }
        if (this.sceneEl.renderer && this.sceneEl.canvas) {
          const w = this.sceneEl.canvas.clientWidth || window.innerWidth;
          const h = this.sceneEl.canvas.clientHeight || window.innerHeight;
          if (w > 0 && h > 0 && (this.sceneEl.canvas.width === 0 || this.sceneEl.canvas.height === 0)) {
            this.sceneEl.renderer.setSize(w, h, false);
          }
        }
      }
      window.dispatchEvent(new Event('resize'));
    };

    // ปรับทันที และหน่วงเวลาสำรองเมื่อ Transition จบ
    doResize();
    setTimeout(doResize, 60);
    setTimeout(doResize, 250);
  },

  /**
   * boardToWorld(r, c) — ฟังก์ชันกลางแปลงพิกัดกระดาน (row 0-7, col 0-7) → พิกัด 3D local (x, z)
   * Convention: row 0 = แถวบนสุดของกระดาน (ฝั่งดำ), col 0 = คอลัมน์ซ้าย (A)
   * x = ซ้าย→ขวา (col ↑ = x ↑), z = บน→ล่าง (row ↑ = z ↑)
   * ทุกโหมด (3D / AR) ใช้ฟังก์ชันนี้ร่วมกัน ห้ามคำนวณตำแหน่งแยก
   */
  boardToWorld(r, c) {
    const half = (7 * this.tileSize) / 2;
    const x = c * this.tileSize - half;
    const z = r * this.tileSize - half;
    return { x, z };
  },

  /** worldToBoard(x, z) — แปลงพิกัด 3D local กลับเป็น (row, col) */
  worldToBoard(x, z) {
    const half = (7 * this.tileSize) / 2;
    const c = Math.round((x + half) / this.tileSize);
    const r = Math.round((z + half) / this.tileSize);
    return { r: Math.max(0, Math.min(7, r)), c: Math.max(0, Math.min(7, c)) };
  },

  /** @deprecated ใช้ boardToWorld แทน */
  gridTo3D(r, c) { return this.boardToWorld(r, c); },

  /** [ข้อ 2, 3 & 4] สร้างฐานกระดานและช่องตาราง 8×8 (แผ่นฐานโปร่งแสง side: double, opacity: 0.6) */
  buildBoardBase() {
    if (!this.tilesGroupEl) return;
    this.tilesGroupEl.innerHTML = '';

    const boardWidth = 8 * this.tileSize + 0.03; // ~0.99 หน่วย (พอดีกับมาร์กเกอร์สี่เหลี่ยมจัตุรัส 1.0 หน่วย)

    // [ข้อ 4] ฐานกระดานไม้สีเข้ม (side: double, opacity: 0.6 ชั่วคราวเพื่อให้มองทะลุเห็นช่องและหมาก)
    const baseBorder = document.createElement('a-entity');
    baseBorder.setAttribute('position', '0 0.004 0');
    baseBorder.setAttribute('material', 'color: #0f172a; roughness: 0.6; metalness: 0.2; transparent: true; opacity: 0.6; side: double');
    if (window.THREE) {
      const baseMesh = new THREE.Mesh(
        new THREE.BoxGeometry(boardWidth, 0.006, boardWidth),
        new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          roughness: 0.6,
          metalness: 0.2,
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide
        })
      );
      baseBorder.setObject3D('mesh', baseMesh);
    }
    this.tilesGroupEl.appendChild(baseBorder);

    // ขอบฟ้าเรืองแสงประดับกระดาน
    const goldRim = document.createElement('a-entity');
    goldRim.setAttribute('position', '0 0.001 0');
    goldRim.setAttribute('material', 'color: #38bdf8; roughness: 0.2; metalness: 0.8; side: double');
    if (window.THREE) {
      const rimMesh = new THREE.Mesh(
        new THREE.BoxGeometry(8 * this.tileSize + 0.008, 0.002, 8 * this.tileSize + 0.008),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2, metalness: 0.8, side: THREE.DoubleSide })
      );
      goldRim.setObject3D('mesh', rimMesh);
    }
    this.tilesGroupEl.appendChild(goldRim);

    const darkMat = window.THREE ? new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide }) : null;
    const lightMat = window.THREE ? new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide }) : null;
    // [ปัญหา A-6] เพิ่มความหนาของช่องเป็น 0.024 เพื่อให้ Raycaster เล็งโดนได้ง่ายขึ้นมาก
    const tileGeom = window.THREE ? new THREE.BoxGeometry(this.tileSize - 0.002, 0.024, this.tileSize - 0.002) : null;

    // [ข้อ 3] ช่องตาราง 8×8 (64 ช่อง) วางอยู่เหนือแผ่นฐานในทิศหันเข้าหากล้อง (-Y ในพิกัดท้องถิ่น = +Z หน้ามาร์กเกอร์)
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const isDark = (r + c) % 2 === 0;
        const pos = this.boardToWorld(r, c);

        const tile = document.createElement('a-entity');
        tile.setAttribute('position', `${pos.x} -0.003 ${pos.z}`);
        tile.setAttribute('data-r', r);
        tile.setAttribute('data-c', c);

        if (window.THREE) {
          const mesh = new THREE.Mesh(tileGeom, isDark ? darkMat : lightMat);
          tile.setObject3D('mesh', mesh);
        }

        if (isDark) {
          tile.classList.add('clickable');
          tile.classList.add('board-tile');

          // คลิกที่ช่องเข้ม
          tile.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleTileClick(r, c);
          });
        }

        this.tilesGroupEl.appendChild(tile);
      }
    }

    // ── ป้ายชั่วคราว A1 (row=7,col=0) และ H8 (row=0,col=7) เพื่อตรวจสอบทิศทาง ──
    this._addCornerLabel('A1', 7, 0);
    this._addCornerLabel('H8', 0, 7);
  },

  /** เพิ่มป้ายตัวอักษรที่มุมกระดานเพื่อตรวจสอบทิศทาง (ชั่วคราว) */
  _addCornerLabel(text, r, c) {
    const pos = this.boardToWorld(r, c);
    const label = document.createElement('a-text');
    label.setAttribute('value', text);
    label.setAttribute('position', `${pos.x} 0.04 ${pos.z}`);
    label.setAttribute('rotation', '-90 0 0');
    label.setAttribute('color', '#fbbf24');
    label.setAttribute('align', 'center');
    label.setAttribute('width', '0.2');
    label.setAttribute('side', 'double');
    label.setAttribute('data-corner-label', text);
    this.tilesGroupEl.appendChild(label);
  },

  /** ตั้งค่ามุมมองกระดานตามสีผู้เล่น
   *  AR: กระดานราบบนมาร์กเกอร์ (rotation=-90 0 0) + หมุน Y-axis เพื่อกำหนดทิศ
   *      ขาว = Y 180° (แถว 7 อยู่ใกล้ผู้เล่น), ดำ = Y 0° (แถว 0 อยู่ใกล้ผู้เล่น)
   *      ใช้ Y-rotation เพื่อไม่ให้ X-axis กลับด้าน (ต่างจาก Z-rotation ที่พลิก X)
   *  3D: กระดานเอียง 45° + หมุน Y-axis
   */
  setPlayerPerspective(color) {
    this.playerColor = color;
    if (!this.boardGroupEl) return;

    if (this.currentMode === 'ar') {
      // กระดานนอนราบบนมาร์กเกอร์ หน้ากระดานขึ้น (rotation -90 0 0)
      this.boardGroupEl.setAttribute('rotation', '-90 0 0');

      // หมุนรอบ Z-axis ของมาร์กเกอร์ (Z 180 = ผู้เล่นขาว แถว 7 อยู่ใกล้ตัว, Z 0 = ผู้เล่นดำ แถว 0 อยู่ใกล้ตัว)
      // ห้ามหมุนแกน Y เด็ดขาดเพราะจะทำให้กระดานพลิกคว่ำเข้าด้านใน (-Z)
      if (this.orientWrapperEl) {
        if (color === 'b') {
          this.orientWrapperEl.setAttribute('rotation', '0 0 0');
          if (this.orientWrapperEl.object3D) {
            this.orientWrapperEl.object3D.rotation.set(0, 0, 0);
          }
        } else {
          this.orientWrapperEl.setAttribute('rotation', '0 0 180');
          if (this.orientWrapperEl.object3D) {
            this.orientWrapperEl.object3D.rotation.set(0, 0, Math.PI);
          }
        }
      }
    } else {
      // โหมด 3D fallback: กระดานเอียง 45° + หมุน Y-axis
      if (color === 'b') {
        this.boardGroupEl.setAttribute('rotation', '45 180 0');
      } else {
        this.boardGroupEl.setAttribute('rotation', '45 0 0');
      }
    }
  },

  /** อัปเดตตัวหมากในกระดาน 3D */
  updateBoard(boardState, legalMoves = [], mustCapture = false) {
    // [ข้อ 4] ตรวจจับว่ามีหมากตัวไหนเพิ่งเลื่อนขั้นเป็นฮอส ('w'->'W' หรือ 'b'->'B')
    const newlyPromoted = [];
    if (this.boardState && boardState) {
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const oldPiece = this.boardState[r][c];
          const newPiece = boardState[r][c];
          if ((oldPiece === 'w' && newPiece === 'W') || (oldPiece === 'b' && newPiece === 'B')) {
            newlyPromoted.push({ r, c, piece: newPiece });
          }
        }
      }
    }

    this.boardState = boardState;
    this.legalMoves = legalMoves;
    this.mustCapture = mustCapture;
    this.clearHighlights();
    this.selectedPiece = null;

    // ถ้ายังไม่มีฐานกระดาน ให้สร้างทันที
    if (!this.tilesGroupEl || this.tilesGroupEl.children.length === 0) {
      this.buildBoardBase();
    }

    if (!this.piecesGroupEl) return;
    this.piecesGroupEl.innerHTML = '';
    if (this.piecesGroupEl.object3D) {
      while (this.piecesGroupEl.object3D.children.length > 0) {
        this.piecesGroupEl.object3D.remove(this.piecesGroupEl.object3D.children[0]);
      }
    }
    this.pieceEntities = {};

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = boardState[r][c];
        if (!piece) continue;

        const entity = this.createPieceEntity(piece, r, c);
        this.piecesGroupEl.appendChild(entity);
        this.pieceEntities[`${r},${c}`] = entity;
      }
    }

    // [ข้อ 4] เล่นเอฟเฟกต์การเลื่อนขั้น (แสงวาบ + หมากเด้งหมุน + เสียง) ทันที
    if (newlyPromoted.length > 0) {
      newlyPromoted.forEach(p => {
        this.triggerPromotionEffect(p.r, p.c, p.piece);
      });
    }

    // [ข้อ 3] แสดง hint วงแหวนส้มสำหรับหมากที่ต้องกิน
    if (mustCapture) {
      this.showMustCaptureHints();
    }

    this.updateDebugHUD(this.currentMode === 'ar');
  },

  /** [ข้อ 4] สังเคราะห์เสียงระฆังทองคำยินดีเมื่อเลื่อนขั้นด้วย Web Audio API */
  playPromotionSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!this._audioCtx) {
        this._audioCtx = new AudioCtx();
      }
      if (this._audioCtx.state === 'suspended') {
        this._audioCtx.resume();
      }
      const ctx = this._audioCtx;
      const now = ctx.currentTime;
      // บันไดเสียงยินดี: C5 (523.25), E5 (659.25), G5 (783.99), C6 (1046.50)
      const chord = [523.25, 659.25, 783.99, 1046.50];
      chord.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0, now + idx * 0.08);
        gain.gain.linearRampToValueAtTime(0.22, now + idx * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.5);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.55);
      });
    } catch (err) {
      console.warn('[Audio] playPromotionSound error:', err);
    }
  },

  /**
   * [ข้อ 4] เอฟเฟกต์เลื่อนขั้น:
   * - หมากเด้งขึ้นและหมุนเกลียว 360° (Bounce & Spin)
   * - วงแหวนคลื่นแสงวาบสีทองระเบิดออก (Shockwave Ring)
   * - ป้ายลอย "👑 KING!"
   */
  triggerPromotionEffect(r, c, pieceCode) {
    // 1. เล่นเสียง Chime
    this.playPromotionSound();

    const entity = this.pieceEntities[`${r},${c}`];
    const pos = this.boardToWorld(r, c);
    const baseY = -(0.005 + this.pieceHeight / 2);

    // 2. แอนิเมชันหมากเด้งขึ้นและหมุน
    if (entity) {
      const duration = 750;
      const startTime = performance.now();
      const initialRotY = entity.object3D ? entity.object3D.rotation.y : 0;

      const animatePromotion = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // เด้งขึ้นแบบ Sine wave (พุ่งเข้าหากล้อง -Y)
        const bounce = -Math.sin(progress * Math.PI) * 0.045;
        const curY = baseY + bounce;

        // หมุนรอบแกน Y 360 องศา
        const rotY = initialRotY + progress * Math.PI * 2;

        entity.setAttribute('position', `${pos.x} ${curY} ${pos.z}`);
        if (entity.object3D) {
          entity.object3D.rotation.y = rotY;
        }

        if (progress < 1) {
          requestAnimationFrame(animatePromotion);
        } else {
          entity.setAttribute('position', `${pos.x} ${baseY} ${pos.z}`);
          if (entity.object3D) {
            entity.object3D.rotation.y = initialRotY;
          }
        }
      };
      requestAnimationFrame(animatePromotion);
    }

    // 3. วงแหวนคลื่นแสงวาบระเบิดออก
    if (this.highlightsGroupEl) {
      const shockwave = document.createElement('a-ring');
      shockwave.setAttribute('position', `${pos.x} -0.006 ${pos.z}`);
      shockwave.setAttribute('rotation', '-90 0 0');
      shockwave.setAttribute('radius-inner', `${this.pieceRadius * 0.4}`);
      shockwave.setAttribute('radius-outer', `${this.pieceRadius * 0.8}`);
      shockwave.setAttribute('material', 'color: #fbbf24; emissive: #fbbf24; emissiveIntensity: 2.5; roughness: 0.1; transparent: true; opacity: 1.0; side: double');
      this.highlightsGroupEl.appendChild(shockwave);

      // 4. ป้ายลอย "👑 KING!"
      const banner = document.createElement('a-text');
      banner.setAttribute('value', '👑 KING!');
      banner.setAttribute('position', `${pos.x} ${baseY - 0.02} ${pos.z}`);
      banner.setAttribute('rotation', '-90 0 0');
      banner.setAttribute('color', '#fbbf24');
      banner.setAttribute('align', 'center');
      banner.setAttribute('width', '0.35');
      banner.setAttribute('side', 'double');
      this.highlightsGroupEl.appendChild(banner);

      const waveDuration = 800;
      const waveStart = performance.now();

      const animateWave = (now) => {
        const elapsed = now - waveStart;
        const p = Math.min(elapsed / waveDuration, 1);
        const easeOut = 1 - Math.pow(1 - p, 2);

        // ขยายวงคลื่น
        const innerR = this.pieceRadius * (0.4 + easeOut * 1.5);
        const outerR = this.pieceRadius * (0.8 + easeOut * 1.8);
        shockwave.setAttribute('radius-inner', `${innerR}`);
        shockwave.setAttribute('radius-outer', `${outerR}`);

        // Fade out
        const opacity = Math.max(0, 1.0 - p);
        const emissive = Math.max(0, 2.5 * (1.0 - p));
        shockwave.object3D && shockwave.object3D.traverse(c => {
          if (c.material) {
            c.material.opacity = opacity;
            c.material.emissiveIntensity = emissive;
            c.material.needsUpdate = true;
          }
        });

        // Banner ลอยสูงขึ้นและจางหาย
        banner.setAttribute('position', `${pos.x} ${baseY - 0.02 - p * 0.025} ${pos.z}`);
        banner.object3D && banner.object3D.traverse(c => {
          if (c.material) {
            c.material.opacity = opacity;
            c.material.needsUpdate = true;
          }
        });

        if (p < 1) {
          requestAnimationFrame(animateWave);
        } else {
          if (shockwave.parentElement) shockwave.parentElement.removeChild(shockwave);
          if (banner.parentElement) banner.parentElement.removeChild(banner);
        }
      };
      requestAnimationFrame(animateWave);
    }
  },

  /**
   * [ข้อ 4] สกินฮอส (King Piece) ในโหมด AR:
   * - ซ้อนทรงกระบอก 2 ชั้น (Double stack)
   * - มงกุฎทองขอบรอบฝา + กรวยแหลม 4 ยอด + อัญมณีตรงกลาง + สัญลักษณ์มงกุฎลอย ♔
   * - แยกสีชัดเจน: ฮอสขาว (ไข่มุกขลิบทอง + เพชรทอง) vs ฮอสดำ (ออบซิเดียนขลิบทอง + ทับทิมแดง)
   * - ความสูงรวมไม่เกิน 0.05 หน่วย (ถูกต้องตามสเกลกระดาน)
   */
  createPieceEntity(pieceCode, r, c) {
    const isWhite = pieceCode.toLowerCase() === 'w';
    const isKing = pieceCode === 'W' || pieceCode === 'B';
    const pos = this.boardToWorld(r, c);
    const pieceY = -(0.005 + this.pieceHeight / 2);

    const group = document.createElement('a-entity');
    group.setAttribute('position', `${pos.x} ${pieceY} ${pos.z}`);
    if (group.object3D) {
      group.object3D.position.set(pos.x, pieceY, pos.z);
    }
    group.setAttribute('data-r', r);
    group.setAttribute('data-c', c);
    group.setAttribute('data-color', isWhite ? 'w' : 'b');
    group.setAttribute('data-king', isKing ? 'true' : 'false');
    group.classList.add('clickable');
    group.classList.add('piece-3d');

    // ═══════════════════════════════════════════════════════════════════════════
    // [แก้ปัญหา iPhone / iOS WebKit] สร้างตัวหมากด้วย Three.js Mesh โดยตรง
    // ทำให้แสดงผลทันที 100% ทั้งบน iOS (Safari) และ Android (Chrome)
    // ═══════════════════════════════════════════════════════════════════════════
    const pieceGroup = new THREE.Group();

    if (isKing) {
      // ─────────────────────────────────────────────────────────────
      // [ข้อ 4] โมเดลฮอส (King) ทรงสูง 2 ชั้น พร้อมมงกุฎทองคำ
      // ─────────────────────────────────────────────────────────────

      // 1. ฐานชั้นล่าง (Tier 1 Cylinder)
      const t1Geom = new THREE.CylinderGeometry(this.pieceRadius, this.pieceRadius, 0.016, 32);
      const t1Mat = new THREE.MeshStandardMaterial({
        color: isWhite ? 0xffffff : 0x0b0f19,
        roughness: 0.15,
        metalness: isWhite ? 0.55 : 0.65,
        side: THREE.DoubleSide
      });
      const t1Mesh = new THREE.Mesh(t1Geom, t1Mat);
      t1Mesh.position.set(0, 0.006, 0);
      pieceGroup.add(t1Mesh);

      // 3. ขอบวงแหวนทองคั่นระหว่างชั้น 1 และชั้น 2
      const midGeom = new THREE.TorusGeometry(this.pieceRadius * 0.88, 0.0025, 16, 32);
      const goldMat = new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        roughness: 0.1,
        metalness: 0.95,
        emissive: 0xd97706,
        emissiveIntensity: 0.35,
        side: THREE.DoubleSide
      });
      const midMesh = new THREE.Mesh(midGeom, goldMat);
      midMesh.rotation.x = Math.PI / 2;
      midMesh.position.set(0, -0.002, 0);
      pieceGroup.add(midMesh);

      // 4. ชั้นบนซ้อนชั้นสอง (Tier 2 Cylinder)
      const t2Geom = new THREE.CylinderGeometry(this.pieceRadius * 0.82, this.pieceRadius * 0.82, 0.014, 32);
      const t2Mat = new THREE.MeshStandardMaterial({
        color: isWhite ? 0xf8fafc : 0x1e293b,
        roughness: 0.15,
        metalness: isWhite ? 0.6 : 0.7,
        side: THREE.DoubleSide
      });
      const t2Mesh = new THREE.Mesh(t2Geom, t2Mat);
      t2Mesh.position.set(0, -0.009, 0);
      pieceGroup.add(t2Mesh);

      // 5. ฐานมงกุฎทองรอบฝาชั้นบน (Crown Rim Torus)
      const crownGeom = new THREE.TorusGeometry(this.pieceRadius * 0.68, 0.003, 16, 32);
      const crownMesh = new THREE.Mesh(crownGeom, goldMat);
      crownMesh.rotation.x = Math.PI / 2;
      crownMesh.position.set(0, -0.016, 0);
      pieceGroup.add(crownMesh);

      // 6. ยอดมงกุฎกรวยทองคำ 4 ยอด (4 Crown Cones)
      const spikeRadius = this.pieceRadius * 0.52;
      const spikeGeom = new THREE.ConeGeometry(0.004, 0.010, 16);
      const spikeMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        roughness: 0.1,
        metalness: 0.9,
        emissive: 0xd97706,
        emissiveIntensity: 0.35,
        side: THREE.DoubleSide
      });
      for (let i = 0; i < 4; i++) {
        const ang = (i * Math.PI) / 2;
        const sx = spikeRadius * Math.cos(ang);
        const sz = spikeRadius * Math.sin(ang);
        const spikeMesh = new THREE.Mesh(spikeGeom, spikeMat);
        spikeMesh.position.set(sx, -0.021, sz);
        spikeMesh.rotation.x = Math.PI; // ยอดแหลมหันหากล้อง (-Y)
        pieceGroup.add(spikeMesh);
      }

      // 7. เม็ดอัญมณียอดมงกุฎตรงกลาง (Center Royal Gem Orb)
      const gemGeom = new THREE.SphereGeometry(0.0055, 16, 16);
      const gemMat = new THREE.MeshStandardMaterial({
        color: isWhite ? 0xfef08a : 0xef4444,
        emissive: isWhite ? 0xfacc15 : 0xdc2626,
        emissiveIntensity: 0.85,
        roughness: 0.1,
        metalness: 0.7,
        side: THREE.DoubleSide
      });
      const gemMesh = new THREE.Mesh(gemGeom, gemMat);
      gemMesh.position.set(0, -0.020, 0);
      pieceGroup.add(gemMesh);

      // 8. สัญลักษณ์มงกุฎลอยเรืองแสง (Floating Royal Crown ♔)
      const crownSymbol = document.createElement('a-text');
      crownSymbol.setAttribute('value', '♔');
      crownSymbol.setAttribute('position', '0 -0.033 0');
      crownSymbol.setAttribute('rotation', '-90 0 0');
      crownSymbol.setAttribute('align', 'center');
      crownSymbol.setAttribute('width', '0.15');
      crownSymbol.setAttribute('color', isWhite ? '#fde047' : '#f59e0b');
      crownSymbol.setAttribute('side', 'double');
      group.appendChild(crownSymbol);

    } else {
      // ─────────────────────────────────────────────────────────────
      // เบี้ยธรรมดา (Single Tier Pawn)
      // ─────────────────────────────────────────────────────────────

      // 1. ทรงกระบอกตัวหมากหลัก
      const cylGeom = new THREE.CylinderGeometry(this.pieceRadius, this.pieceRadius, this.pieceHeight, 32);
      const cylMat = new THREE.MeshStandardMaterial({
        color: isWhite ? 0xf8fafc : 0x0f172a,
        roughness: isWhite ? 0.25 : 0.3,
        metalness: isWhite ? 0.35 : 0.4,
        side: THREE.DoubleSide
      });
      const cylMesh = new THREE.Mesh(cylGeom, cylMat);
      pieceGroup.add(cylMesh);

      // 3. ขอบวงแหวนนูนบนผิวหมาก
      const rimGeom = new THREE.TorusGeometry(this.pieceRadius * 0.75, 0.0035, 16, 32);
      const rimMat = new THREE.MeshStandardMaterial({
        color: isWhite ? 0xcbd5e1 : 0x334155,
        roughness: 0.2,
        metalness: isWhite ? 0.5 : 0.6,
        side: THREE.DoubleSide
      });
      const rimMesh = new THREE.Mesh(rimGeom, rimMat);
      rimMesh.rotation.x = Math.PI / 2;
      rimMesh.position.set(0, -this.pieceHeight / 2, 0);
      pieceGroup.add(rimMesh);
    }

    // ติดตั้ง Three.js Mesh Tree เข้ากับ A-Frame Entity
    group.setObject3D('mesh', pieceGroup);

    // คลิกที่ตัวหมาก (A-Frame event fallback)
    group.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handlePieceClick(r, c);
    });

    // ── วงแหวนเรืองแสงสำหรับไฮไลต์เมื่อเลือก (รอบฐานหมาก) ──
    const glowRing = document.createElement('a-entity');
    glowRing.classList.add('selection-glow-ring');
    glowRing.setAttribute('visible', 'false');

    const glowGeom = new THREE.TorusGeometry(this.pieceRadius * 1.15, 0.006, 16, 32);
    const glowMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xfbbf24,
      emissiveIntensity: 1.2,
      roughness: 0.1,
      metalness: 0.5,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const glowMesh = new THREE.Mesh(glowGeom, glowMat);
    glowMesh.rotation.x = Math.PI / 2;
    glowMesh.position.set(0, 0.010, 0);
    glowRing.setObject3D('mesh', glowMesh);
    group.appendChild(glowRing);

    return group;
  },


  /** จัดการเมื่อผู้เล่นคลิกที่ตัวหมาก */
  handlePieceClick(r, c) {
    if (this.isAnimating) return;
    const piece = this.boardState ? this.boardState[r][c] : null;
    if (!piece) return;

    const isMyPiece = piece.toLowerCase() === this.playerColor;
    console.log(`[3D] Clicked piece at [${r}, ${c}] = '${piece}', isMyPiece: ${isMyPiece}, playerColor: ${this.playerColor}`);

    // ถ้ากดหมากตัวเอง -> เลือกหมากเพื่อดูตาเดิน
    if (isMyPiece) {
      this.selectPiece(r, c);
      if (this.onPieceSelected) {
        this.onPieceSelected(r, c);
      }
      return;
    }

    this.handleTileClick(r, c);
  },

  /** เลือกหมากและยกตัวหมากขึ้น พร้อมไฮไลต์ช่องปลายทาง */
  selectPiece(r, c) {
    const normalY = -(0.005 + this.pieceHeight / 2);
    if (this.selectedPiece && this.selectedPiece.entity) {
      const prevPos = this.boardToWorld(this.selectedPiece.r, this.selectedPiece.c);
      this.selectedPiece.entity.setAttribute('position', `${prevPos.x} ${normalY} ${prevPos.z}`);
    }

    this.clearHighlights();

    const entity = this.pieceEntities[`${r},${c}`];
    if (!entity) return;

    const validMoves = (this.legalMoves || []).filter(m => m.from[0] === r && m.from[1] === c);
    console.log(`[3D] Selected piece [${r}, ${c}], valid moves found: ${validMoves.length}`);

    if (validMoves.length === 0) {
      this.selectedPiece = null;
      return;
    }

    this.selectedPiece = { r, c, entity };

    // ยกหมากขึ้นลอยเข้าหากล้อง
    const pos = this.boardToWorld(r, c);
    const elevatedY = -(0.005 + this.pieceHeight / 2 + 0.025);
    entity.setAttribute('position', `${pos.x} ${elevatedY} ${pos.z}`);

    // [ข้อ 2] เปิดวงแหวนเรืองแสงกะพริบบนหมากที่เลือก
    this.setSelectedHighlight(entity, true);

    // วาดไฮไลต์ช่องปลายทาง
    this.showValidTargets(validMoves);
  },

  /**
   * [ข้อ 2] เปิด/ปิดวงแหวนเรืองแสงสีเหลืองกะพริบบนหมากที่เลือก
   * ทำงานทั้งโหมด 3D และ AR โดยใช้ emissiveIntensity + opacity animation
   */
  setSelectedHighlight(entity, show) {
    // ยกเลิก animation เดิมก่อนเสมอ
    if (this._glowAnimFrame) {
      cancelAnimationFrame(this._glowAnimFrame);
      this._glowAnimFrame = null;
    }

    // ปิดวงแหวนของ entity ที่เลือกก่อนหน้า (ถ้ามี)
    if (this._selectedEntity && this._selectedEntity !== entity) {
      const prevRing = this._selectedEntity.querySelector('.selection-glow-ring');
      if (prevRing) {
        prevRing.setAttribute('visible', 'false');
        if (prevRing.object3D) {
          prevRing.object3D.traverse(c => { if (c.material) { c.material.opacity = 0; } });
        }
      }
    }

    if (!entity) {
      this._selectedEntity = null;
      return;
    }

    const glowRing = entity.querySelector('.selection-glow-ring');
    if (!glowRing) { this._selectedEntity = null; return; }

    if (!show) {
      glowRing.setAttribute('visible', 'false');
      if (glowRing.object3D) {
        glowRing.object3D.traverse(c => { if (c.material) { c.material.opacity = 0; } });
      }
      this._selectedEntity = null;
      return;
    }

    // แสดงวงแหวน
    glowRing.setAttribute('visible', 'true');
    this._selectedEntity = entity;

    // ── Pulse Animation ──
    const startTime = performance.now();
    const animate = (now) => {
      // ตรวจว่ายัง selected entity ตัวเดิมอยู่
      if (this._selectedEntity !== entity) return;

      const t = (now - startTime) / 600; // period ~600ms
      // กะพริบ: opacity 0.6 ↔ 1.0, emissiveIntensity 0.8 ↔ 2.0
      const pulse = (Math.sin(t * Math.PI * 2) + 1) / 2; // 0..1
      const opacity = 0.6 + pulse * 0.4;
      const emissive = 0.8 + pulse * 1.2;

      glowRing.object3D && glowRing.object3D.traverse((child) => {
        if (child.material) {
          child.material.opacity = opacity;
          child.material.emissiveIntensity = emissive;
          child.material.needsUpdate = true;
        }
      });

      this._glowAnimFrame = requestAnimationFrame(animate);
    };
    this._glowAnimFrame = requestAnimationFrame(animate);
  },

  /** [ข้อ 3] แสดงวงแหวนสีส้มกะพริบบนหมากที่ต้องกิน + ป้าย "ต้องกิน!" ในโหมด 3D/AR */
  showMustCaptureHints() {
    if (!this.highlightsGroupEl || !this.boardState) return;

    // เก็บบันทึกตำแหน่งหมากที่กินได้
    const capturablePieces = new Set();
    (this.legalMoves || []).forEach(m => {
      if (m.captured && m.captured.length > 0) {
        capturablePieces.add(`${m.from[0]},${m.from[1]}`);
      }
    });

    if (capturablePieces.size === 0) return;

    // ล้าง hint เก่า
    if (this._captureHintAnimFrame) {
      cancelAnimationFrame(this._captureHintAnimFrame);
      this._captureHintAnimFrame = null;
    }
    this._captureHintEntities = [];

    capturablePieces.forEach(key => {
      const entity = this.pieceEntities[key];
      if (!entity) return;

      // สร้างวงแหวนสีส้มซ้อนทับแผ่นพื้นกระดาน (Three.js Mesh รองรับ iOS/Safari)
      const captureRing = document.createElement('a-entity');
      captureRing.classList.add('capture-hint-ring');

      const capGeom = new THREE.TorusGeometry(this.pieceRadius * 1.3, 0.007, 16, 32);
      const capMat = new THREE.MeshStandardMaterial({
        color: 0xf97316,
        emissive: 0xf97316,
        emissiveIntensity: 1.5,
        roughness: 0.1,
        metalness: 0.4,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
      });
      const capMesh = new THREE.Mesh(capGeom, capMat);
      capMesh.rotation.x = Math.PI / 2;
      capMesh.position.set(0, -this.pieceHeight / 2 - 0.004, 0);
      captureRing.setObject3D('mesh', capMesh);

      entity.appendChild(captureRing);
      this._captureHintEntities.push(captureRing);
    });

    // [ข้อ 3] สร้างป้าย "ต้องกิน!" ลอยเหนือกระดานกลาง
    const existingBanner = this.highlightsGroupEl.querySelector('[data-must-capture-banner]');
    if (!existingBanner) {
      const banner = document.createElement('a-text');
      banner.setAttribute('value', '⚡ ต้องกิน!');
      banner.setAttribute('position', '0 0.08 0');
      banner.setAttribute('rotation', '-90 0 0');
      banner.setAttribute('color', '#f97316');
      banner.setAttribute('align', 'center');
      banner.setAttribute('width', '0.6');
      banner.setAttribute('side', 'double');
      banner.setAttribute('data-must-capture-banner', 'true');
      this.highlightsGroupEl.appendChild(banner);
    }

    // Pulse animation สำหรับวงแหวนสีส้ม
    const startTime = performance.now();
    const animateCapture = (now) => {
      const t = (now - startTime) / 500;
      const pulse = (Math.sin(t * Math.PI * 2) + 1) / 2;
      const opacity = 0.6 + pulse * 0.4;
      const emissive = 1.0 + pulse * 1.5;

      this._captureHintEntities.forEach(ring => {
        ring.object3D && ring.object3D.traverse(child => {
          if (child.material) {
            child.material.opacity = opacity;
            child.material.emissiveIntensity = emissive;
            child.material.needsUpdate = true;
          }
        });
      });

      this._captureHintAnimFrame = requestAnimationFrame(animateCapture);
    };
    this._captureHintAnimFrame = requestAnimationFrame(animateCapture);
  },

  /** [ข้อ 3 - A-5 & A-6] วาดแผ่นไฮไลต์ช่องปลายทาง: กิน=สีส้ม, เดินธรรมดา=สีเขียว */
  showValidTargets(moves) {
    if (!this.highlightsGroupEl) return;
    // เก็บไว้แต่ capture banner และ capture rings ไว้
    const banner = this.highlightsGroupEl.querySelector('[data-must-capture-banner]');
    const existingRings = this.highlightsGroupEl.querySelectorAll('.target-highlight');
    existingRings.forEach(el => el.remove());

    moves.forEach((m) => {
      const [tr, tc] = m.to;
      const pos = this.boardToWorld(tr, tc);
      const isCapture = m.captured && m.captured.length > 0;

      const hl = document.createElement('a-entity');
      hl.setAttribute('position', `${pos.x} -0.006 ${pos.z}`);
      hl.setAttribute('data-r', tr);
      hl.setAttribute('data-c', tc);
      hl.classList.add('clickable');
      hl.classList.add('target-highlight');

      // สีต่างกัน: กิน = สีส้ม, เดิน = สีเขียว
      const dotColor = isCapture ? 0xf97316 : 0x22c55e;
      const dotEmissive = isCapture ? 0xf97316 : 0x22c55e;

      // แผ่นวงกลมเรืองแสงด้วย Three.js Mesh
      const visualGeom = new THREE.CylinderGeometry(this.pieceRadius * 0.95, this.pieceRadius * 0.95, 0.003, 32);
      const visualMat = new THREE.MeshStandardMaterial({
        color: dotColor,
        opacity: 0.9,
        emissive: dotEmissive,
        emissiveIntensity: 0.7,
        transparent: true,
        side: THREE.DoubleSide
      });
      const visualMesh = new THREE.Mesh(visualGeom, visualMat);
      hl.setObject3D('mesh', visualMesh);

      // Invisible Hit Collider สำหรับช่องไฮไลต์
      const hitGeom = new THREE.CylinderGeometry(this.pieceRadius * 1.35, this.pieceRadius * 1.35, 0.04, 16);
      const hitMat = new THREE.MeshBasicMaterial({ visible: false, transparent: true, opacity: 0, depthWrite: false });
      const hitMesh = new THREE.Mesh(hitGeom, hitMat);
      hl.setObject3D('hit', hitMesh);

      // ถ้าเป็นการกิน เพิ่มเครื่องหมาย 'X' ไว้เหนือจุด
      if (isCapture) {
        const capLabel = document.createElement('a-text');
        capLabel.setAttribute('value', '✕');
        capLabel.setAttribute('position', `0 0.025 0`);
        capLabel.setAttribute('rotation', '-90 0 0');
        capLabel.setAttribute('color', '#f97316');
        capLabel.setAttribute('align', 'center');
        capLabel.setAttribute('width', '0.12');
        capLabel.setAttribute('side', 'double');
        hl.appendChild(capLabel);
      }

      // Invisible Hit Collider สำหรับช่องไฮไลต์
      const hitCyl = document.createElement('a-cylinder');
      hitCyl.setAttribute('radius', `${this.pieceRadius * 1.35}`);
      hitCyl.setAttribute('height', '0.04');
      hitCyl.setAttribute('material', 'visible: false; opacity: 0; transparent: true');
      hitCyl.classList.add('clickable');
      hl.appendChild(hitCyl);

      hl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleTileClick(tr, tc);
      });

      this.highlightsGroupEl.appendChild(hl);
    });
  },

  /** ล้างไฮไลต์ช่อง และปิดวงแหวนเรืองแสงบนหมากที่เลือก */
  clearHighlights() {
    if (this.highlightsGroupEl) {
      this.highlightsGroupEl.innerHTML = '';
    }
    // [ข้อ 2] ปิด glow ring ด้วย
    this.setSelectedHighlight(this._selectedEntity, false);
    // [ข้อ 3] ล้าง capture hint rings
    if (this._captureHintAnimFrame) {
      cancelAnimationFrame(this._captureHintAnimFrame);
      this._captureHintAnimFrame = null;
    }
    this._captureHintEntities.forEach(ring => {
      if (ring.parentElement) ring.parentElement.removeChild(ring);
    });
    this._captureHintEntities = [];
  },

  /** จัดการเมื่อคลิกช่องบนกระดาน */
  handleTileClick(r, c) {
    if (this.isAnimating) return;
    const normalY = -(0.005 + this.pieceHeight / 2);

    const pieceOnTile = this.boardState ? this.boardState[r][c] : null;
    const isMyPiece = pieceOnTile && pieceOnTile.toLowerCase() === this.playerColor;

    if (this.selectedPiece) {
      const from = [this.selectedPiece.r, this.selectedPiece.c];
      const to = [r, c];

      const matched = (this.legalMoves || []).find(
        m => m.from[0] === from[0] && m.from[1] === from[1] &&
             m.to[0] === to[0] && m.to[1] === to[1]
      );

      if (matched) {
        console.log(`[3D] Valid move matched: [${from}] -> [${to}]`);
        const dbgMoveNet = document.getElementById('dbg-move-net');
        if (dbgMoveNet) {
          dbgMoveNet.textContent = `Net Move: [${from}] -> [${to}] (sent)`;
        }

        this.animatePieceMove(this.selectedPiece.entity, from, to, () => {
          if (this.onMoveRequested) {
            this.onMoveRequested(from, to);
          }
        });
        return;
      }

      // ถ้าคลิกหมากตัวอื่นของตัวเอง ให้เปลี่ยนไปเลือกตัวนั้นแทน
      if (isMyPiece) {
        this.selectPiece(r, c);
        if (this.onPieceSelected) {
          this.onPieceSelected(r, c);
        }
        return;
      }
    } else {
      // ยังไม่ได้เลือกหมาก แต่คลิกช่องที่มีหมากตัวเองอยู่ ให้เลือกหมากตัวนั้นทันที
      if (isMyPiece) {
        this.selectPiece(r, c);
        if (this.onPieceSelected) {
          this.onPieceSelected(r, c);
        }
        return;
      }
    }

    // คลิกช่องอื่น -> ยกเลิกการเลือก
    if (this.selectedPiece && this.selectedPiece.entity) {
      const prevPos = this.boardToWorld(this.selectedPiece.r, this.selectedPiece.c);
      this.selectedPiece.entity.setAttribute('position', `${prevPos.x} ${normalY} ${prevPos.z}`);
    }
    this.selectedPiece = null;
    this.clearHighlights();
  },

  /** [ปัญหา A-1, A-3 & A-4] ระบบ Direct Touch / Pointer Raycaster ผูกกับกล้อง Three.js ของ MindAR โดยตรง */
  setupTouchRaycaster() {
    if (this._raycasterBound) return;
    this._raycasterBound = true;

    let lastInteractionTime = 0;

    const handlePointerAction = (clientX, clientY, source) => {
      const now = Date.now();
      if (now - lastInteractionTime < 200) return; // Debounce
      lastInteractionTime = now;

      const scene = this.sceneEl;
      if (!scene || !scene.camera) return;

      // ปลดล็อก Web Audio Context บนมือถือเมื่อแตะจอ
      if (this._audioCtx && this._audioCtx.state === 'suspended') {
        this._audioCtx.resume();
      }

      const canvas = scene.canvas || scene.querySelector('canvas');
      const rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };

      const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, scene.camera);

      // รวบรวม clickable meshes ทั้งหมดในกระดาน
      const clickableMeshes = [];
      const meshToEntity = new Map();

      if (this.boardGroupEl && this.boardGroupEl.object3D) {
        this.boardGroupEl.object3D.traverse((obj) => {
          if (obj.isMesh && obj.visible) {
            let cur = obj;
            while (cur) {
              if (cur.el && cur.el.classList && cur.el.classList.contains('clickable')) {
                clickableMeshes.push(obj);
                meshToEntity.set(obj, cur.el);
                break;
              }
              cur = cur.parent;
            }
          }
        });
      }

      const intersects = raycaster.intersectObjects(clickableMeshes, true);
      const hitCount = intersects.length;

      let hitName = 'none';
      let targetEl = null;

      if (hitCount > 0) {
        // ลำดับความสำคัญเมื่อแตะโดนหลายชิ้นซ้อนกัน:
        // 1) Target Highlight (จุดหมายปลายทางที่ต้องการเดิน)
        // 2) Piece 3D (ตัวหมากที่ต้องการเลือก)
        // 3) Tile (ช่องตารางใต้หมาก)
        let chosenEl = null;

        for (const hit of intersects) {
          const el = meshToEntity.get(hit.object);
          if (el && el.classList.contains('target-highlight')) {
            chosenEl = el;
            break;
          }
        }
        if (!chosenEl) {
          for (const hit of intersects) {
            const el = meshToEntity.get(hit.object);
            if (el && el.classList.contains('piece-3d')) {
              chosenEl = el;
              break;
            }
          }
        }
        if (!chosenEl) {
          chosenEl = meshToEntity.get(intersects[0].object);
        }

        targetEl = chosenEl;
        if (targetEl) {
          const r = targetEl.getAttribute('data-r');
          const c = targetEl.getAttribute('data-c');
          const type = targetEl.classList.contains('piece-3d') ? 'Piece'
            : (targetEl.classList.contains('target-highlight') ? 'Highlight' : 'Tile');
          hitName = (r !== null && c !== null) ? `${type}[${r},${c}]` : (targetEl.id || targetEl.tagName);
        }
      }

      // [ปัญหา A-1] แสดงข้อมูลดีบักบนจอทุกครั้งที่แตะ
      const dbgTouch = document.getElementById('dbg-touch');
      if (dbgTouch) {
        dbgTouch.textContent = `Touch: (${clientX.toFixed(0)},${clientY.toFixed(0)}) hits=${hitCount} first=${hitName}`;
        dbgTouch.style.color = hitCount > 0 ? '#4ade80' : '#f87171';
      }

      console.log(`[AR TOUCH/CLICK] Pos: (${clientX}, ${clientY}) Hits: ${hitCount} First: ${hitName}`);

      // ส่งต่อไปยัง handlePieceClick หรือ handleTileClick
      if (targetEl) {
        const r = parseInt(targetEl.getAttribute('data-r'));
        const c = parseInt(targetEl.getAttribute('data-c'));
        if (targetEl.classList.contains('piece-3d')) {
          this.handlePieceClick(r, c);
        } else if (targetEl.classList.contains('target-highlight')) {
          this.handleTileClick(r, c);
        } else if (targetEl.classList.contains('board-tile')) {
          this.handleTileClick(r, c);
        }
      }
    };

    // [ปัญหา A-4] รองรับทั้ง pointerdown, touchstart, และ click
    window.addEventListener('pointerdown', (e) => {
      if (e.target && typeof e.target.closest === 'function') {
        if (e.target.closest('.match-header') || e.target.closest('#btn-resign') || e.target.closest('.modal-content')) {
          return;
        }
      }
      handlePointerAction(e.clientX, e.clientY, 'pointerdown');
    }, { passive: true });

    window.addEventListener('touchstart', (e) => {
      if (e.target && typeof e.target.closest === 'function') {
        if (e.target.closest('.match-header') || e.target.closest('#btn-resign') || e.target.closest('.modal-content')) {
          return;
        }
      }
      if (e.touches && e.touches.length > 0) {
        handlePointerAction(e.touches[0].clientX, e.touches[0].clientY, 'touchstart');
      }
    }, { passive: true });
  },

  /** แอนิเมชันเลื่อนหมาก 3D ไปยังช่องปลายทาง */
  animatePieceMove(entity, from, to, onComplete) {
    if (!entity) {
      if (onComplete) onComplete();
      return;
    }

    this.isAnimating = true;
    this.clearHighlights();

    const targetPos = this.boardToWorld(to[0], to[1]);
    const finalY = -(0.005 + this.pieceHeight / 2);

    const startX = entity.object3D.position.x;
    const startZ = entity.object3D.position.z;
    const startY = entity.object3D.position.y;

    const duration = 280;
    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);

      const curX = startX + (targetPos.x - startX) * ease;
      const curZ = startZ + (targetPos.z - startZ) * ease;
      const arc = -Math.sin(progress * Math.PI) * 0.04;
      const curY = startY + (finalY - startY) * ease + arc;

      entity.setAttribute('position', `${curX} ${curY} ${curZ}`);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        entity.setAttribute('position', `${targetPos.x} ${finalY} ${targetPos.z}`);
        this.isAnimating = false;
        if (onComplete) onComplete();
      }
    };

    requestAnimationFrame(animate);
  },

  /**
   * Helper สำหรับทดสอบการเลื่อนขั้นฮอสใน Console ได้ทันที
   * เรียกใช้: Game3D.testPromotion(row, col, color) เช่น Game3D.testPromotion(0, 1, 'w') หรือ Game3D.testPromotion(7, 0, 'b')
   */
  testPromotion(r = 0, c = 1, color = 'w') {
    const kingCode = color.toUpperCase();
    console.log(`[Game3D] Testing promotion at [${r}, ${c}] with '${kingCode}'`);
    if (!this.boardState) {
      this.boardState = Array(8).fill(null).map(() => Array(8).fill(null));
    }
    const oldP = this.boardState[r][c] || color.toLowerCase();
    this.boardState[r][c] = oldP;
    const newState = this.boardState.map(row => [...row]);
    newState[r][c] = kingCode;
    this.updateBoard(newState, this.legalMoves, false);
  },
};

window.Game3D = Game3D;

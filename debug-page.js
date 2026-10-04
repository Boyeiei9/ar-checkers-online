const { spawn } = require('child_process');
const http = require('http');

async function main() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--disable-gpu',
    '--no-sandbox',
    'http://localhost:3000'
  ]);

  console.log('Chrome spawned, waiting for CDP...');
  await new Promise(r => setTimeout(r, 2000));

  // Get pages from CDP
  http.get('http://127.0.0.1:9222/json/list', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', async () => {
      try {
        const pages = JSON.parse(data);
        console.log('Pages:', pages.map(p => ({ url: p.url, title: p.title })));
        const targetPage = pages.find(p => p.url.includes('localhost:3000') || p.type === 'page');
        if (!targetPage) {
          console.error('No target page');
          chrome.kill();
          return;
        }

        const ws = new WebSocket(targetPage.webSocketDebuggerUrl);
        let msgId = 1;
        const pending = new Map();

        function send(method, params = {}) {
          return new Promise((resolve) => {
            const id = msgId++;
            pending.set(id, resolve);
            ws.send(JSON.stringify({ id, method, params }));
          });
        }

        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data);
          if (msg.method === 'Runtime.consoleAPICalled') {
            console.log(`[BROWSER CONSOLE ${msg.params.type}]`, ...msg.params.args.map(a => a.value || a.description));
          } else if (msg.method === 'Runtime.exceptionThrown') {
            console.error('[BROWSER EXCEPTION]', msg.params.exceptionDetails);
          } else if (msg.id && pending.has(msg.id)) {
            pending.get(msg.id)(msg.result);
            pending.delete(msg.id);
          }
        };

        ws.onopen = async () => {
          console.log('WebSocket connected to CDP');
          await send('Page.enable');
          await send('Runtime.enable');
          await send('Log.enable');

          console.log('Navigating to http://localhost:3000 ...');
          await send('Page.navigate', { url: 'http://localhost:3000' });
          await new Promise(r => setTimeout(r, 4000));

          // Run evaluation
          const evalRes = await send('Runtime.evaluate', {
            expression: `(function() {
              const scene = document.getElementById('aframe-scene');
              const canvas = scene ? scene.querySelector('canvas') : null;
              const board = document.getElementById('board-3d-group');
              const target = document.getElementById('ar-target-group');
              return JSON.stringify({
                hasLoaded: scene ? scene.hasLoaded : false,
                canvasWidth: canvas ? canvas.width : null,
                canvasHeight: canvas ? canvas.height : null,
                boardExists: !!board,
                targetExists: !!target,
                tilesCount: document.getElementById('tiles-3d-group') ? document.getElementById('tiles-3d-group').children.length : 0
              });
            })()`
          });

          console.log('Initial State:', evalRes.result.value);

          // Now test showView('game') and switchDisplayMode('ar')
          console.log('\n--- Calling UI.showView("game") and switchDisplayMode("ar") ---');
          const arRes = await send('Runtime.evaluate', {
            expression: `(async function() {
              try {
                UI.showView('game');
                try {
                  await UI.switchDisplayMode('ar');
                } catch(e) {}
                await new Promise(r => setTimeout(r, 300));

                const defaultBoard = Game3D.getDefaultBoard();
                // Set legal moves for white piece at [6, 2]
                const legalMoves = [
                  { from: [6, 2], to: [5, 1], captured: [] },
                  { from: [6, 2], to: [5, 3], captured: [] }
                ];
                Game3D.playerColor = 'w';
                Game3D.updateBoard(defaultBoard, legalMoves);
                Game3D.setPlayerPerspective('w');

                const scene = document.getElementById('aframe-scene');
                const target = document.getElementById('ar-target-group');
                const board = document.getElementById('board-3d-group');
                const orientWrapper = document.getElementById('board-orient-wrapper');

                // Simulate target found pose (1.2m in front of camera)
                target.object3D.matrixAutoUpdate = false;
                const mat = new THREE.Matrix4();
                mat.makeTranslation(0, 0, -1.2);
                target.object3D.matrix.copy(mat);
                target.object3D.matrixWorld.copy(mat);
                target.object3D.visible = true;

                // Trigger targetFound event
                target.emit('targetFound');

                // Update matrices and render frame
                scene.object3D.updateMatrixWorld(true);
                scene.render();

                // 1. Check piece [6, 2] position on screen
                const piece62 = Game3D.pieceEntities['6,2'];
                const pieceWorldPos = new THREE.Vector3();
                piece62.object3D.getWorldPosition(pieceWorldPos);

                const canvas = scene.canvas || scene.querySelector('canvas');
                const pProj = pieceWorldPos.clone().project(scene.camera);
                const screenX = ((pProj.x + 1) / 2) * window.innerWidth;
                const screenY = ((-pProj.y + 1) / 2) * window.innerHeight;

                // 2. Dispatch pointerdown on piece [6, 2]
                window.dispatchEvent(new PointerEvent('pointerdown', {
                  clientX: screenX,
                  clientY: screenY,
                  bubbles: true
                }));

                await new Promise(r => setTimeout(r, 200));

                const selectedAfterClick = Game3D.selectedPiece ? { r: Game3D.selectedPiece.r, c: Game3D.selectedPiece.c } : null;
                const highlightsCount = Game3D.highlightsGroupEl ? Game3D.highlightsGroupEl.children.length : 0;

                // 3. Project first highlight [5, 1] to screen and dispatch pointerdown to make the move
                let moveTriggered = false;
                const hlFirst = Game3D.highlightsGroupEl ? Game3D.highlightsGroupEl.children[0] : null;
                if (hlFirst) {
                  const hlWorldPos = new THREE.Vector3();
                  hlFirst.object3D.getWorldPosition(hlWorldPos);
                  const hlProj = hlWorldPos.clone().project(scene.camera);
                  const hlScreenX = ((hlProj.x + 1) / 2) * window.innerWidth;
                  const hlScreenY = ((-hlProj.y + 1) / 2) * window.innerHeight;

                  // Clear debounce timer for test
                  Game3D._hudInterval = null;

                  window.dispatchEvent(new PointerEvent('pointerdown', {
                    clientX: hlScreenX,
                    clientY: hlScreenY,
                    bubbles: true
                  }));
                  await new Promise(r => setTimeout(r, 200));
                }

                scene.render();

                const dbgTouchText = document.getElementById('dbg-touch') ? document.getElementById('dbg-touch').textContent : '';
                const dbgMoveText = document.getElementById('dbg-move-net') ? document.getElementById('dbg-move-net').textContent : '';

                return JSON.stringify({
                  canvasWidth: scene.renderer.domElement.width,
                  canvasHeight: scene.renderer.domElement.height,
                  orientWrapperRotation: orientWrapper ? orientWrapper.getAttribute('rotation') : null,
                  boardRotation: board ? board.getAttribute('rotation') : null,
                  pieceScreenCoords: { x: Math.round(screenX), y: Math.round(screenY) },
                  selectedAfterClick,
                  highlightsCount,
                  dbgTouchText,
                  dbgMoveText
                });
              } catch (e) {
                return JSON.stringify({ error: e.message, stack: e.stack });
              }
            })()`,
            awaitPromise: true
          });

          console.log('In-Game AR Render State:', arRes.result.value);

          // Capture screenshot
          const screenshot = await send('Page.captureScreenshot', { format: 'png' });
          const fs = require('fs');
          fs.writeFileSync('C:\\Users\\User\\.gemini\\antigravity-ide\\scratch\\ar-checkers-online\\test-ar-render.png', Buffer.from(screenshot.data, 'base64'));
          chrome.kill();
          process.exit(0);
        };

      } catch (err) {
        console.error('Error in CDP:', err);
        chrome.kill();
        process.exit(1);
      }
    });
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

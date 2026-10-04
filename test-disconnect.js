/**
 * test-disconnect.js — Test disconnect handling
 */
const { io } = require('socket.io-client');
const assert = require('node:assert/strict');

const SERVER_URL = 'http://localhost:3000';

async function runDisconnectTest() {
  console.log('Testing Disconnect handling...');

  const s1 = io(SERVER_URL);
  const s2 = io(SERVER_URL);

  s1.emit('join', 'Alice');
  s2.emit('join', 'Bob');

  await Promise.all([
    new Promise((r) => s1.on('joined', r)),
    new Promise((r) => s2.on('joined', r)),
  ]);

  s1.emit('quick_match');
  s2.emit('quick_match');

  await Promise.all([
    new Promise((r) => s1.on('match_found', r)),
    new Promise((r) => s2.on('match_found', r)),
  ]);

  // Alice disconnects suddenly
  const bobGameOverPromise = new Promise((resolve) => {
    s2.on('game_over', (data) => {
      console.log('Bob received game over:', data);
      assert.equal(data.reason, 'opponent_disconnected');
      resolve();
    });
  });

  console.log('Disconnecting Alice...');
  s1.disconnect();

  await bobGameOverPromise;
  s2.disconnect();
  console.log('✔ Disconnect handling test passed!');
  process.exit(0);
}

runDisconnectTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

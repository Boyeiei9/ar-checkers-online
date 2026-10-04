/**
 * test-matchmaking.js — Automated integration test for Phase 2
 */
const { io } = require('socket.io-client');
const assert = require('node:assert/strict');

const SERVER_URL = 'http://localhost:3000';

async function runTest() {
  console.log('Testing Socket.io matchmaking & gameplay...');

  const s1 = io(SERVER_URL);
  const s2 = io(SERVER_URL);

  await new Promise((res) => {
    let connected = 0;
    const check = () => { if (++connected === 2) res(); };
    s1.on('connect', check);
    s2.on('connect', check);
  });
  console.log('✔ Both sockets connected.');

  // Join
  s1.emit('join', 'Alice');
  s2.emit('join', 'Bob');

  await Promise.all([
    new Promise((res) => s1.on('joined', (d) => { assert.equal(d.name, 'Alice'); res(); })),
    new Promise((res) => s2.on('joined', (d) => { assert.equal(d.name, 'Bob'); res(); })),
  ]);
  console.log('✔ Both players successfully registered names.');

  // Queue up with listeners ready
  let p1Match, p2Match;
  let p1State, p2State;

  const matchPromise = Promise.all([
    new Promise((res) => s1.once('match_found', (d) => { p1Match = d; res(); })),
    new Promise((res) => s2.once('match_found', (d) => { p2Match = d; res(); })),
    new Promise((res) => s1.once('state_update', (d) => { p1State = d; res(); })),
    new Promise((res) => s2.once('state_update', (d) => { p2State = d; res(); })),
  ]);

  s1.emit('quick_match');
  s2.emit('quick_match');

  await matchPromise;
  console.log(`✔ Match found! Room: ${p1Match.room}, P1: ${p1Match.color}, P2: ${p2Match.color}`);
  assert.equal(p1Match.room, p2Match.room);
  assert.ok((p1Match.color === 'w' && p2Match.color === 'b') || (p1Match.color === 'b' && p2Match.color === 'w'));

  let whiteSocket = p1Match.color === 'w' ? s1 : s2;
  let blackSocket = p1Match.color === 'w' ? s2 : s1;
  let whiteState = p1Match.color === 'w' ? p1State : p2State;
  let blackState = p1Match.color === 'w' ? p2State : p1State;

  console.log('✔ Initial state received. Turn:', whiteState.turn);
  assert.equal(whiteState.turn, 'w');
  assert.ok(whiteState.legalMoves.length > 0, 'White should have legal moves');
  assert.equal(blackState.legalMoves.length, 0, 'Black should not have legal moves on turn w');

  // White makes the first legal move
  const firstMove = whiteState.legalMoves[0];
  console.log(`White making move from [${firstMove.from}] to [${firstMove.to}]...`);

  const nextStatePromise = Promise.all([
    new Promise((res) => whiteSocket.once('state_update', res)),
    new Promise((res) => blackSocket.once('state_update', res)),
  ]);

  whiteSocket.emit('move', { from: firstMove.from, to: firstMove.to });

  const [newWhiteState, newBlackState] = await nextStatePromise;
  console.log('✔ State update received after move. New turn:', newWhiteState.turn);
  assert.equal(newWhiteState.turn, 'b');
  assert.equal(newBlackState.turn, 'b');
  assert.ok(newBlackState.legalMoves.length > 0, 'Black should now have legal moves');

  // Test resignation
  const gameOverPromise = new Promise((res) => {
    whiteSocket.once('game_over', (d) => {
      console.log('✔ Game over received:', d);
      assert.equal(d.winner, 'w');
      assert.equal(d.reason, 'opponent_resigned');
      res();
    });
  });

  console.log('Testing resignation by Black...');
  blackSocket.emit('resign');
  await gameOverPromise;

  s1.disconnect();
  s2.disconnect();
  console.log('🎉 ALL INTEGRATION TESTS PASSED!');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

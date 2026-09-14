import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerState, canPlayerAct, applyPlayerHit, advancePlayerState } from '../src/player-state.js';

test('a light hit locks control, then grants a short playable recovery window', () => {
  const state = createPlayerState();
  assert.equal(applyPlayerHit(state, 100), true);
  assert.equal(canPlayerAct(state), false);
  advancePlayerState(state, 339);
  assert.equal(canPlayerAct(state), false);
  advancePlayerState(state, 340);
  assert.equal(canPlayerAct(state), true);
  assert.equal(applyPlayerHit(state, 689), false);
  assert.equal(applyPlayerHit(state, 690), true);
});

test('a heavy hit must finish knockdown and getup before accepting actions', () => {
  const state = createPlayerState();
  applyPlayerHit(state, 100, { knockdown: true, direction: -1 });
  assert.equal(state.direction, -1);
  assert.equal(advancePlayerState(state, 799), 'knockdown');
  assert.equal(advancePlayerState(state, 800), 'getup');
  assert.equal(canPlayerAct(state), false);
  assert.equal(advancePlayerState(state, 1080), 'ready');
  assert.equal(applyPlayerHit(state, 1429), false);
  assert.equal(applyPlayerHit(state, 1430), true);
});

test('repeated hits cannot restart or extend an active reaction', () => {
  const state = createPlayerState();
  applyPlayerHit(state, 0, { knockdown: true });
  const snapshot = { ...state };
  assert.equal(applyPlayerHit(state, 500), false);
  assert.deepEqual(state, snapshot);
});

test('a long frame crosses all elapsed recovery phases without adding time', () => {
  const state = createPlayerState();
  applyPlayerHit(state, 0, { knockdown: true });
  assert.equal(advancePlayerState(state, 2000), 'ready');
  assert.equal(applyPlayerHit(state, 2000), true);
});

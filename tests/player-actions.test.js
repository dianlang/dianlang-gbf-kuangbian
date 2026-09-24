import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER_ACTIONS, PLAYER_ATTACKS, actionFrame } from '../src/player-actions.js';
import { PLAYER_REACTION } from '../src/player-state.js';
import { PLAYER_ART_SOURCES, sourceCells } from '../src/player-art.js';

test('attack contact starts on the extended fist or charging shoulder pose', () => {
  const impactFrames = { light1: 2, light2: 2, light3: 2, heavy: 2, finisher: 2, dashLight: 2, dashHeavy: 7, grabPunch: 10, throw: 14 };
  for (const [name, frame] of Object.entries(impactFrames)) {
    assert.equal(actionFrame(name, PLAYER_ACTIONS[name].hit).frame, frame, name);
  }
});

test('reactions fit the control lock, and a defeat holds its final floor pose', () => {
  for (const name of ['hurt', 'knockdown', 'getup']) {
    assert.equal(PLAYER_ACTIONS[name].duration, PLAYER_REACTION[name]);
  }
  assert.equal(actionFrame('defeat', 10000).frame, 7);
  assert.equal(actionFrame('victory', PLAYER_ACTIONS.victory.duration + 1).frame, 14);
});

test('every attack and animation frame resolves to a source atlas frame', () => {
  for (const name of Object.keys(PLAYER_ATTACKS)) assert.ok(PLAYER_ACTIONS[name]);
  for (const action of Object.values(PLAYER_ACTIONS)) {
    for (const frame of action.frames) {
      const source = PLAYER_ART_SOURCES.find(s => s.key === frame.texture);
      assert.ok(source, frame.texture);
      assert.ok(frame.frame < sourceCells(source, 1254, 1254).length);
    }
  }
});

test('source regions partition each atlas without overruns or missing cells', () => {
  for (const source of PLAYER_ART_SOURCES) {
    const cells = sourceCells(source, 1254, 1254);
    assert.equal(cells.reduce((sum, c) => sum + c.width * c.height, 0), 1254 ** 2);
    assert.ok(cells.every(c => c.x >= 0 && c.y >= 0 && c.x + c.width <= 1254 && c.y + c.height <= 1254));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as playerState from '../src/player-state.js';

// Exercise the production scene with small engine doubles; no DOM or renderer.
// Actual Phaser bundling is checked separately by npm run build.
const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace(/new Phaser.Game\([\s\S]*$/, 'return PrototypeScene;');

class Vector2 {
  constructor(x, y) { this.x = x; this.y = y; }
  lengthSq() { return this.x ** 2 + this.y ** 2; }
  normalize() { return this.scale(1 / (Math.hypot(this.x, this.y) || 1)); }
  scale(n) { this.x *= n; this.y *= n; return this; }
}
const Phaser = {
  Scene: class {},
  Scenes: { Events: { SHUTDOWN: 'shutdown' } },
  Input: { Keyboard: { JustDown(key) {
    const down = Boolean(key._justDown);
    key._justDown = false;
    return down;
  } } },
  Math: {
    Clamp: (n, min, max) => Math.max(min, Math.min(max, n)),
    Linear: (a, b, t) => a + (b - a) * t,
    Between: (min) => min,
    Distance: { Between: (x, y, a, b) => Math.hypot(x - a, y - b) },
    Vector2,
  },
};
const Scene = new Function('Phaser', ...Object.keys(playerState), source)(
  Phaser, ...Object.values(playerState),
);

function sprite(x = 200, y = 400) {
  return {
    active: true, x, y, angle: 0, alpha: 1, hp: 10, facing: 1, baseSpeed: 150,
    body: { enable: true, velocity: { x: 0, y: 0 } },
    anims: { isPlaying: true, stop() { this.isPlaying = false; } },
    setVelocity(x, y) { this.body.velocity = { x, y }; return this; },
    setVelocityX(x) { this.body.velocity.x = x; return this; },
    setAngularVelocity() { return this; },
    setAngle(angle) { this.angle = angle; return this; },
    setAlpha(alpha) { this.alpha = alpha; return this; },
    setTint() { return this; }, setTintFill() { return this; },
    clearTint() { return this; }, setDepth() { return this; },
    setFlipX() { return this; }, setText() { return this; },
    setOrigin() { return this; }, setScrollFactor() { return this; },
    setStrokeStyle() { return this; },
    destroy() { this.active = false; },
  };
}

function scene() {
  const s = new Scene();
  s.init();
  s.player = sprite();
  s.time = { now: 1000, calls: [], delayedCall(delay, callback) { this.calls.push({ delay, callback }); } };
  s.keys = Object.fromEntries('W A S D J K L SPACE R'.split(' ').map((key) => [key, {}]));
  s.cursors = { left: {}, right: {}, up: {}, down: {} };
  s.comboText = sprite();
  s.areaText = sprite();
  s.cameras = { main: { shake() {}, flash() {} } };
  s.tweens = { items: [], add(config) { this.items.push(config); } };
  s.physics = { world: { paused: false, pause() { this.paused = true; } } };
  s.add = { rectangle: () => sprite(), text: () => sprite() };
  s.flashComboLabel = () => {};
  return s;
}

function enemy(x = 160, y = 400) {
  return Object.assign(sprite(x, y), {
    hp: 6, speed: 60, defeated: false, attackCount: 0, pendingAttack: null,
    attackReadyAt: 0, stunUntil: 0, knockedDownUntil: 0, thrownUntil: 0,
  });
}

test('taking damage cancels dash and combo without letting held movement erase knockback', () => {
  const s = scene();
  s.isDashing = true;
  s.comboCount = 2;
  s.keys.D.isDown = true;
  s.hurtPlayer(-1);
  s.updatePlayerMovement();
  assert.equal(s.player.hp, 9);
  assert.equal(s.isDashing, false);
  assert.equal(s.comboCount, 0);
  assert.equal(s.player.body.velocity.x, -220);
  s.hurtPlayer(1, true);
  assert.equal(s.player.hp, 9);
});

test('a heavy hit releases grabs and allows movement only after getting up', () => {
  const s = scene();
  s.grabbedEnemy = enemy();
  s.grabbedEnemy.grabbed = true;
  s.grabbedEnemy.body.enable = false;
  const held = s.grabbedEnemy;
  s.hurtPlayer(1, true);
  assert.equal(s.player.hp, 8);
  assert.equal(s.grabbedEnemy, null);
  assert.equal(held.body.enable, true);
  assert.equal(s.player.angle, 90);
  s.time.now = 1700;
  s.updatePlayerReaction(1700, 16);
  assert.equal(s.canPlayerControl(), false);
  s.time.now = 1980;
  s.updatePlayerReaction(1980, 16);
  assert.equal(s.canPlayerControl(), true);
  assert.equal(s.player.angle, 0);
  s.keys.D.isDown = true;
  s.updatePlayerMovement();
  assert.equal(s.player.body.velocity.x, 150);
});

test('attack, grab, rage and dash inputs are discarded during recovery', () => {
  const s = scene();
  s.hurtPlayer(1);
  s.rage = 100;
  for (const key of ['J', 'K', 'L', 'SPACE']) s.keys[key]._justDown = true;
  s.updateCombat(s.time.now);
  s.startDash(1);
  s.activateRage();
  for (const key of ['J', 'K', 'L', 'SPACE']) assert.equal(s.keys[key]._justDown, false);
  assert.equal(s.isDashing, false);
  assert.equal(s.rageUntil, 0);
});

test('rage prevents both damage and reaction changes', () => {
  const s = scene();
  s.rageUntil = 2000;
  s.hurtPlayer(-1, true);
  assert.equal(s.player.hp, 10);
  assert.equal(s.playerState.phase, 'ready');
});

test('enemy telegraph does no immediate damage and commits to its original lane', () => {
  const s = scene();
  const e = enemy();
  s.enemies = [e];
  s.enemyAttack(e);
  assert.equal(s.player.hp, 10);
  assert.ok(e.pendingAttack);
  s.player.y += 70;
  s.time.now = 1340;
  s.updateEnemies(1340);
  assert.equal(e.pendingAttack, null);
  assert.equal(s.player.hp, 10);
});

test('third enemy strike warns longer and knocks the player down on contact', () => {
  const s = scene();
  const e = enemy();
  e.attackCount = 2;
  s.enemies = [e];
  s.enemyAttack(e);
  assert.equal(e.pendingAttack.heavy, true);
  s.updateEnemies(1559);
  assert.equal(s.player.hp, 10);
  s.time.now = 1560;
  s.updateEnemies(1560);
  assert.equal(s.player.hp, 8);
  assert.equal(s.playerState.phase, 'knockdown');
});

test('hitting a winding-up enemy destroys the warning and interrupts its attack', () => {
  const s = scene();
  const e = enemy(240);
  s.enemies = [e];
  s.enemyAttack(e);
  const marker = e.pendingAttack.marker;
  const label = e.pendingAttack.label;
  s.doAttack({ type: 'light1', damage: 1, range: 82, knockback: 95, stun: 165, cooldown: 175 });
  assert.equal(e.hp, 5);
  assert.equal(e.pendingAttack, null);
  assert.equal(marker.active, false);
  assert.equal(label.active, false);
  s.resolveEnemyAttack(e);
  assert.equal(s.player.hp, 10);
});

test('grabbing a winding-up enemy also cancels its warning', () => {
  const s = scene();
  const e = enemy(240);
  s.enemies = [e];
  s.enemyAttack(e);
  s.tryGrabEnemy();
  assert.equal(s.grabbedEnemy, e);
  assert.equal(e.pendingAttack, null);
});

test('a defeated enemy cannot attack or receive more hits during its fade-out', () => {
  const s = scene();
  const e = enemy(240);
  s.enemies = [e];
  s.defeatEnemy(e);
  const count = s.tweens.items.length;
  s.defeatEnemy(e);
  assert.equal(s.tweens.items.length, count);
  assert.equal(e.active, true);
  assert.equal(s.isEnemyAlive(e), false);
  s.enemyAttack(e);
  assert.equal(e.pendingAttack, null);
  s.doAttack({ type: 'light1', damage: 1, range: 82, knockback: 95, stun: 165, cooldown: 175 });
  assert.equal(e.hp, 6);
});

test('queued wave spawns prevent early wave completion and stop after death', () => {
  const s = scene();
  s.activeEncounter = s.encounters[0];
  s.spawnEnemy = () => { throw new Error('spawned after game over'); };
  s.spawnEncounterWave(0);
  const count = s.time.calls.length;
  assert.equal(s.pendingWaveSpawns, 3);
  s.updateStageFlow();
  assert.equal(s.time.calls.length, count);
  s.gameOver = true;
  s.time.calls.forEach(({ callback }) => callback());
});

test('the wave counter reaches zero only after every queued spawn', () => {
  const s = scene();
  s.activeEncounter = s.encounters[0];
  s.spawnEnemy = (x, y) => s.enemies.push(enemy(x, y));
  s.spawnEncounterWave(0);
  s.time.calls.forEach(({ callback }) => callback());
  assert.equal(s.pendingWaveSpawns, 0);
  assert.equal(s.enemies.length, 3);
});

test('death stops physics and cancels pending attacks; R requests a restart', () => {
  const s = scene();
  const e = enemy();
  s.enemies = [e];
  s.enemyAttack(e);
  s.player.hp = 1;
  s.hurtPlayer(1, true);
  assert.equal(s.player.hp, 0);
  assert.equal(s.gameOver, true);
  assert.equal(s.physics.world.paused, true);
  assert.equal(e.pendingAttack, null);
  let restarts = 0;
  s.scene = { restart() { restarts += 1; } };
  s.keys.R._justDown = true;
  s.update(1100, 16);
  assert.equal(restarts, 1);
});

test('scene init resets a reused scene after death or stage completion', () => {
  const s = scene();
  s.gameOver = true;
  s.stageComplete = true;
  s.rage = 100;
  s.activeEncounter = s.encounters[1];
  s.encounters[0].cleared = true;
  s.currentWaveIndex = 1;
  s.pendingWaveSpawns = 5;
  s.enemies.push(enemy());
  s.playerState.phase = 'knockdown';
  s.init();
  assert.equal(s.gameOver, false);
  assert.equal(s.stageComplete, false);
  assert.equal(s.activeEncounter, null);
  assert.equal(s.currentWaveIndex, -1);
  assert.equal(s.pendingWaveSpawns, 0);
  assert.equal(s.rage, 0);
  assert.equal(s.enemies.length, 0);
  assert.ok(s.encounters.every((encounter) => !encounter.cleared));
  assert.equal(s.playerState.phase, 'ready');
});

test('holding a direction does not count as a second tap, and shutdown removes handlers', () => {
  const s = scene();
  const handlers = new Map();
  let cleanup;
  s.input = { keyboard: {
    on: (event, handler) => handlers.set(event, handler),
    off: (event, handler) => { if (handlers.get(event) === handler) handlers.delete(event); },
  } };
  s.events = { once: (_event, callback) => { cleanup = callback; } };
  s.bindDashInputs();
  handlers.get('keydown-D')({ repeat: false });
  s.time.now += 100;
  handlers.get('keydown-D')({ repeat: true });
  assert.equal(s.isDashing, false);
  handlers.get('keydown-D')({ repeat: false });
  assert.equal(s.isDashing, true);
  cleanup();
  assert.equal(handlers.size, 0);
});

test('stage completion blocks double-tap dash and allows R to replay', () => {
  const s = scene();
  s.stageComplete = true;
  s.handleDashTap('right');
  s.time.now += 100;
  s.handleDashTap('right');
  assert.equal(s.isDashing, false);
  let restarts = 0;
  s.scene = { restart() { restarts += 1; } };
  s.keys.R._justDown = true;
  s.update(1100, 16);
  assert.equal(restarts, 1);
});

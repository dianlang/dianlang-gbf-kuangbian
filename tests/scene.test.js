import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as playerState from '../src/player-state.js';
import * as enemyTypes from '../src/enemy-types.js';
import * as playerActions from '../src/player-actions.js';
import * as playerArt from '../src/player-art.js';
import { BOSS_METHODS } from '../src/boss-scene.js';
import { createBossState, createBossAttack } from '../src/boss-combat.js';

const require = createRequire(import.meta.url);
const ArcadeBody = require('phaser/src/physics/arcade/Body.js');
const ArcadeWorld = require('phaser/src/physics/arcade/World.js');

// Exercise the production scene with small engine doubles; no DOM or renderer.
// Actual Phaser bundling is checked separately by npm run build.
const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace(/new Phaser.Game\([\s\S]*$/, 'return PrototypeScene;');

class Vector2 {
  constructor(x, y) { this.x = x; this.y = y; }
  copy(other) { this.x = other.x; this.y = other.y; return this; }
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
const dependencies = { ...playerState, ...enemyTypes, ...playerActions, ...playerArt, BOSS_METHODS };
const Scene = new Function('Phaser', ...Object.keys(dependencies), source)(
  Phaser, ...Object.values(dependencies),
);

function sprite(x = 200, y = 400) {
  const object = {
    active: true, x, y, angle: 0, alpha: 1, hp: 10, maxHp: 10, facing: 1, baseSpeed: 150,
    body: { enable: true, velocity: { x: 0, y: 0 } },
    anims: { isPlaying: true, stop() { this.isPlaying = false; } },
    setVelocity(x, y) { this.body.velocity.x = x; this.body.velocity.y = y; return this; },
    setVelocityX(x) { this.body.velocity.x = x; return this; },
    setAngularVelocity() { return this; },
    setAngle(angle) { this.angle = angle; return this; },
    setAlpha(alpha) { this.alpha = alpha; return this; },
    setTint() { return this; }, setTintFill() { return this; },
    clearTint() { return this; }, setDepth() { return this; },
    setFlipX() { return this; }, setText() { return this; },
    setOrigin() { return this; }, setScrollFactor() { return this; },
    setStrokeStyle() { return this; },
    setVisible(visible) { this.visible = visible; return this; },
    setFillStyle() { return this; }, setCollideWorldBounds() { return this; },
    once() { return this; },
    destroy() { this.active = false; },
  };
  Object.assign(object.body, {
    position: new Vector2(x, y), prev: new Vector2(x, y), prevFrame: new Vector2(x, y),
    stop() { this.velocity.x = 0; this.velocity.y = 0; },
    updateFromGameObject() { this.position.copy(object); },
    setSize() { return this; }, setOffset() { return this; },
    reset(x, y) { object.x = x; object.y = y; },
  });
  return object;
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
  s.cameras = { main: { shake() {}, flash() {}, stopFollow() {}, pan() {}, setScroll() {} } };
  s.tweens = { items: [], add(config) { this.items.push(config); } };
  s.physics = { world: { paused: false, pause() { this.paused = true; } } };
  s.add = { rectangle: () => sprite(), text: () => sprite(), ellipse: () => sprite() };
  s.enemyHint = sprite();
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

function spartan(x = 240) {
  return Object.assign(enemy(x), {
    kind: 'spartan', hp: 10, maxHp: 10, facing: -1,
    guardBrokenUntil: 0, recoveryUntil: 0,
  });
}

function siete(x = 240) {
  return Object.assign(enemy(x), createBossState(), {
    kind: 'siete', hp: 90, maxHp: 90, facing: -1, speed: 65, recoveryUntil: 0,
  });
}

test('boss spawning creates its own phase state, body and HUD without changing small enemies', () => {
  const s = scene();
  s.physics.add = { sprite: (x, y) => sprite(x, y) };
  s.spawnEnemy(4210, 405, 0, 'siete');
  assert.equal(s.boss, s.enemies[0]);
  assert.equal(s.boss.hp, 90);
  assert.equal(s.boss.phase, 'normal');
  assert.equal(s.bossHpBar.width, 440);
  assert.equal(s.boss.nameTag, undefined);
  assert.equal(enemyTypes.enemyProfile().hp, 6);
});

test('boss armor resists grab, knockdown and flinching but still takes each attack once', () => {
  const s = scene();
  const b = siete();
  s.enemies = [b];
  s.startBossAttack(b, createBossAttack(b, s.player, s.bossBounds(), 1000));
  const cast = b.pendingAttack;
  s.tryGrabEnemy();
  assert.equal(s.grabbedEnemy, null);
  const targets = new Set();
  s.doAttack(playerActions.PLAYER_ATTACKS.heavy, targets);
  s.doAttack(playerActions.PLAYER_ATTACKS.heavy, targets);
  assert.equal(b.hp, 88);
  assert.equal(b.pendingAttack, cast);
  assert.equal(b.knockedDownUntil, 0);
  assert.equal(b.body.velocity.x, 0);
  assert.equal(b.angle, 0);
});

test('boss telegraphs wait for contact, miss a player who leaves, and preserve recovery', () => {
  const s = scene();
  const b = siete();
  s.enemies = [b];
  s.updateEnemies(1000);
  const cast = b.pendingAttack;
  assert.ok(cast);
  s.time.now = cast.hitAt - 1;
  s.updateEnemies(s.time.now);
  assert.equal(s.player.hp, 10);
  s.player.y = 490;
  s.time.now = cast.hitAt;
  s.updateEnemies(s.time.now);
  assert.equal(s.player.hp, 10);
  assert.equal(b.pendingAttack, null);
  assert.equal(b.recoveryUntil, s.time.now + cast.recovery);
  assert.ok(cast.markers.every(marker => !marker.active));
  s.updateEnemies(s.time.now + 1);
  assert.equal(b.pendingAttack, null);
  assert.equal(b.body.velocity.x, 0);
});

test('overlapping boss areas deal a single hit and a long frame cannot replay the cast', () => {
  const s = scene();
  const b = siete();
  Object.assign(b, { phase: 'overdrive', hp: 50, attackCount: 2 });
  s.enemies = [b];
  s.startBossAttack(b, createBossAttack(b, s.player, s.bossBounds(), 1000));
  const cast = b.pendingAttack;
  s.time.now = cast.hitAt + 3000;
  s.updateEnemies(s.time.now);
  assert.equal(s.player.hp, 8);
  s.updateEnemies(s.time.now);
  assert.equal(s.player.hp, 8);
});

test('Break destroys all warnings, prevents the pending hit and gives a damage window', () => {
  const s = scene();
  const b = siete();
  Object.assign(b, { phase: 'overdrive', hp: 50, modeGauge: 10 });
  s.enemies = [b];
  s.startBossAttack(b, createBossAttack(b, s.player, s.bossBounds(), 1000));
  const cast = b.pendingAttack;
  s.doAttack(playerActions.PLAYER_ATTACKS.heavy);
  assert.equal(b.phase, 'break');
  assert.equal(b.pendingAttack, null);
  assert.ok(cast.markers.every(marker => !marker.active));
  assert.equal(cast.label.active, false);
  s.time.now = cast.hitAt;
  s.updateEnemies(s.time.now);
  assert.equal(s.player.hp, 10);
  s.doAttack(playerActions.PLAYER_ATTACKS.heavy);
  assert.equal(b.hp, 45);
  s.time.now = b.breakUntil;
  s.updateEnemies(s.time.now);
  assert.equal(b.phase, 'normal');
  assert.equal(b.pendingAttack, null);
});

test('thrown enemies hurt the boss once without spinning, launching or knocking it down', () => {
  const s = scene();
  const b = siete();
  Object.assign(b, { phase: 'overdrive', hp: 50 });
  const thrown = enemy(220);
  thrown.thrownUntil = 1600;
  thrown.throwHitTargets = new Set();
  thrown.setVelocity(650, 0);
  s.enemies = [b, thrown];
  s.updateThrownEnemies(1000);
  s.updateThrownEnemies(1100);
  assert.equal(b.hp, 48);
  assert.equal(b.modeGauge, 80);
  assert.equal(b.knockedDownUntil, 0);
  assert.equal(b.body.velocity.x, 0);
  assert.equal(b.angle, 0);
});

test('clearing six waves still requires the boss, and its delayed spawn cannot finish the stage', () => {
  const s = scene();
  s.encounters.filter(e => !e.boss).forEach(e => { e.cleared = true; });
  s.player.x = 4350;
  s.updateStageFlow();
  assert.equal(s.activeEncounter.boss, true);
  assert.equal(s.stageComplete, false);
  assert.equal(s.waveTransitionPending, true);
  assert.equal(s.bossCheckpoint, true);
  s.updateStageFlow();
  assert.equal(s.time.calls.length, 1);
  assert.equal(s.stageComplete, false);
});

test('boss practice skips only the prior waves and R retries at the boss after death', () => {
  const s = scene();
  s.player.hp = 1;
  s.startBossPractice();
  assert.ok(s.encounters.filter(e => !e.boss).every(e => e.cleared));
  assert.equal(s.activeEncounter.cleared, false);
  assert.equal(s.player.hp, 10);
  assert.ok(s.player.x > s.lockLeft && s.player.x < s.lockRight);
  s.endGame();
  let data;
  s.scene = { restart(args) { data = args; } };
  s.keys.R._justDown = true;
  s.update(1100, 16);
  assert.deepEqual(data, { bossPractice: true });
  s.init(data);
  assert.equal(s.bossPractice, true);
  assert.equal(s.boss, null);
  assert.equal(s.pendingWaveSpawns, 0);
});

test('defeating the boss cancels its attack and completes the stage once the wave settles', () => {
  const s = scene();
  const b = siete();
  s.enemies = [b];
  s.activeEncounter = s.encounters.find(e => e.boss);
  s.currentWaveIndex = 0;
  s.startBossAttack(b, createBossAttack(b, s.player, s.bossBounds(), 1000));
  s.hitBoss(b, 100, 'finisher');
  assert.equal(b.defeated, true);
  assert.equal(b.pendingAttack, null);
  s.time.calls = [];
  s.updateStageFlow();
  assert.equal(s.time.calls.length, 1);
  s.time.calls[0].callback();
  assert.equal(s.stageComplete, true);
  assert.equal(s.physics.world.paused, true);
  assert.equal(s.activeEncounter, null);
});

test('a blocked punch deals no damage or rage and cannot interrupt a shield bash', () => {
  const s = scene();
  const e = spartan();
  s.enemies = [e];
  s.enemyAttack(e);
  const warning = e.pendingAttack;
  s.doAttack({ type: 'light1', damage: 1, range: 82, knockback: 95, stun: 165, cooldown: 175 });
  assert.equal(e.hp, 10);
  assert.equal(s.rage, 0);
  assert.equal(e.pendingAttack, warning);
});

test('a heavy strike breaks the shield, interrupts the bash and allows follow-up hits', () => {
  const s = scene();
  const e = spartan();
  s.enemies = [e];
  s.enemyAttack(e);
  s.doAttack({ type: 'heavy', damage: 2, range: 108, knockback: 310, stun: 400, cooldown: 470, knockdown: true });
  assert.equal(e.hp, 8);
  assert.equal(e.pendingAttack, null);
  assert.equal(e.guardBrokenUntil, 2600);
  assert.ok(e.knockedDownUntil > s.time.now);
  s.time.now = 1500;
  s.doAttack({ type: 'light1', damage: 1, range: 82, knockback: 95, stun: 165, cooldown: 175 });
  assert.equal(e.hp, 7);
});

test('a rear punch bypasses the shield and interrupts the bash', () => {
  const s = scene();
  const e = spartan();
  s.enemies = [e];
  s.enemyAttack(e);
  s.player.x = 280;
  s.player.facing = -1;
  s.doAttack({ type: 'light1', damage: 1, range: 82, knockback: 95, stun: 165, cooldown: 175 });
  assert.equal(e.hp, 9);
  assert.equal(e.pendingAttack, null);
});

test('grabbing and throwing a guarding defender remains a valid counter', () => {
  const s = scene();
  const e = spartan();
  s.enemies = [e];
  s.enemyAttack(e);
  s.tryGrabEnemy();
  assert.equal(s.grabbedEnemy, e);
  assert.equal(e.pendingAttack, null);
  s.throwGrabbedEnemy();
  assert.equal(s.grabbedEnemy, null);
  assert.ok(e.thrownUntil > s.time.now);
  assert.equal(e.body.enable, true);
});

test('a missed shield bash has a punishable recovery window', () => {
  const s = scene();
  const e = spartan();
  s.enemies = [e];
  s.enemyAttack(e);
  assert.equal(e.pendingAttack.hitAt, 1740);
  s.player.y = 470;
  s.time.now = 1740;
  s.updateEnemies(1740);
  assert.equal(s.player.hp, 10);
  assert.equal(e.recoveryUntil, 2390);
  assert.equal(enemyTypes.enemyCanGuard(e, 1740), false);
  s.time.now = 1900;
  s.updateEnemies(1900);
  assert.equal(e.body.velocity.x, 0);
  assert.equal(e.body.velocity.y, 0);
  assert.equal(enemyTypes.enemyCanGuard(e, 2390), true);
});

test('encounters introduce one defender before increasing mixed-wave pressure', () => {
  const s = scene();
  const counts = s.encounters.filter(encounter => !encounter.boss).flatMap((encounter) => encounter.waves)
    .map((wave) => wave.filter((pos) => pos.kind === 'spartan').length);
  assert.deepEqual(counts, [0, 1, 1, 2, 2, 2]);
  s.activeEncounter = s.encounters[0];
  const spawned = [];
  s.spawnEnemy = (_x, _y, _index, kind = 'raider') => spawned.push(kind);
  s.spawnEncounterWave(1);
  s.time.calls.forEach(({ callback }) => callback());
  assert.equal(spawned.filter((kind) => kind === 'spartan').length, 1);
});

test('enemy UI is destroyed together with a defeated defender', () => {
  const s = scene();
  const e = spartan();
  const ui = [sprite(), sprite(), sprite()];
  [e.nameTag, e.healthBg, e.healthBar] = ui;
  s.defeatEnemy(e);
  assert.ok(ui.every((item) => !item.active));
  assert.equal(e.nameTag, null);
  s.destroyEnemyUi(e);
});

test('a thrown raider can knock down a guarding defender and hit it only once', () => {
  const s = scene();
  const thrown = enemy(220);
  thrown.thrownUntil = 1600;
  thrown.throwHitTargets = new Set();
  thrown.setVelocity(650, 0);
  const target = spartan(250);
  s.enemies = [thrown, target];
  s.enemyAttack(target);
  s.updateThrownEnemies(1000);
  assert.equal(target.hp, 8);
  assert.equal(target.pendingAttack, null);
  assert.ok(target.knockedDownUntil > 1000);
  s.updateThrownEnemies(1000);
  assert.equal(target.hp, 8);
});

function tickAction(s, time) {
  s.time.now = time;
  s.updatePlayerAction(time);
}

test('a heavy windup deals no damage until its contact pose and hits each target once', () => {
  const s = scene();
  const e = enemy(240); s.enemies = [e];
  s.keys.K._justDown = true; s.updateCombat(1000);
  assert.equal(s.playerAction.name, 'heavy');
  assert.equal(e.hp, 6);
  tickAction(s, 1179); assert.equal(e.hp, 6);
  tickAction(s, 1180); assert.equal(e.hp, 4);
  tickAction(s, 1190); tickAction(s, 1220); assert.equal(e.hp, 4);
  assert.equal(s.attackCooldown, 1470);
  tickAction(s, 1470); assert.equal(s.playerAction, null);
});

test('being hit during windup cancels the pending attack and combo buffer', () => {
  const s = scene();
  const e = enemy(240); s.enemies = [e];
  s.doLightComboAttack(1000);
  s.time.now = 1080; s.keys.J._justDown = true; s.updateCombat(1080);
  assert.ok(s.bufferedAttack);
  s.hurtPlayer(-1);
  tickAction(s, 1200);
  assert.equal(e.hp, 6);
  assert.equal(s.playerAction, null);
  assert.equal(s.bufferedAttack, null);
});

test('buffered J-J-K completes in order, while movement cannot turn a punch mid-swing', () => {
  const s = scene();
  s.doLightComboAttack(1000);
  s.keys.A.isDown = true;
  s.updatePlayerMovement();
  assert.equal(s.player.facing, 1);
  assert.equal(s.player.body.velocity.x, 0);
  s.time.now = 1110; s.keys.J._justDown = true; s.updateCombat(1110);
  tickAction(s, 1200); s.updateCombat(1200);
  assert.equal(s.playerAction.name, 'light2');
  s.time.now = 1320; s.keys.K._justDown = true; s.updateCombat(1320);
  tickAction(s, 1420); s.updateCombat(1420);
  assert.equal(s.playerAction.name, 'finisher');
});

test('an early input is discarded and simultaneous combat keys cannot leak into a later action', () => {
  const s = scene();
  s.doLightComboAttack(1000);
  s.time.now = 1010; s.keys.J._justDown = true; s.updateCombat(1010);
  assert.equal(s.bufferedAttack, null);
  tickAction(s, 1200); s.updateCombat(1200);
  assert.equal(s.playerAction, null);
  for (const key of ['J', 'K', 'L']) s.keys[key]._justDown = true;
  s.updateCombat(1200);
  assert.equal(s.playerAction.name, 'grab');
  assert.ok(['J', 'K', 'L'].every(key => !s.keys[key]._justDown));
});

test('grab, pummel, and throw each resolve on their own contact frame', () => {
  const s = scene();
  const e = enemy(240); s.enemies = [e];
  s.keys.L._justDown = true; s.updateCombat(1000);
  assert.equal(s.grabbedEnemy, null);
  tickAction(s, 1100); assert.equal(s.grabbedEnemy, e);
  tickAction(s, 1220);
  s.keys.J._justDown = true; s.updateCombat(1220);
  assert.equal(e.hp, 6);
  tickAction(s, 1280); assert.equal(e.hp, 5);
  tickAction(s, 1280); assert.equal(e.hp, 5);
  tickAction(s, 1450);
  s.keys.K._justDown = true; s.updateCombat(1450);
  assert.equal(e.body.enable, false);
  tickAction(s, 1610);
  assert.equal(s.grabbedEnemy, null);
  assert.equal(e.body.enable, true);
  assert.ok(e.thrownUntil > 1610);
});

test('interrupting a throw releases the held enemy without launching a delayed throw', () => {
  const s = scene();
  const e = enemy(240); s.enemies = [e]; s.tryGrabEnemy();
  s.time.now = 1220; s.beginPlayerAction('throw');
  s.time.now = 1250; s.hurtPlayer(-1);
  tickAction(s, 1500);
  assert.equal(e.grabbed, false);
  assert.equal(e.body.enable, true);
  assert.equal(e.thrownUntil, 0);
});

test('dash attack brakes on startup and can hit a new enemy entering its stationary range', () => {
  const s = scene();
  const e = enemy(240), later = enemy(390); s.enemies = [e, later];
  s.startDash(1); s.doDashAttack(true);
  s.updatePlayerMovement(); assert.equal(s.player.body.velocity.x, 0);
  assert.equal(s.isDashing, false);
  assert.equal(s.dashUntil, 0);
  tickAction(s, 1080); assert.equal(e.hp, 1); assert.equal(later.hp, 6);
  later.x = 300; tickAction(s, 1160);
  assert.equal(e.hp, 1); assert.equal(later.hp, 1);
  tickAction(s, 1320); s.updatePlayerMovement();
  assert.equal(s.player.body.velocity.x, 0);
  assert.equal(s.player.x, 200);
});

// Exercise the actual frame ordering while leaving unrelated HUD/stage work out.
function tickScene(s, time) {
  const delta = time - s.time.now;
  s.time.now = time;
  s.updateStageFlow = () => {};
  s.updateUi = () => {};
  s.update(time, delta);
}

test('every attack brakes both axes through recovery and resumes held movement afterwards', () => {
  const names = [...Object.keys(playerActions.PLAYER_ATTACKS), 'grab', 'grabPunch', 'throw', 'release', 'rage'];
  for (const name of names) {
    for (const direction of [-1, 1]) {
      const s = scene();
      s.player.facing = direction;
      s.player.setVelocity(direction * 520, 120);
      s.keys[direction > 0 ? 'A' : 'D'].isDown = true;
      s.keys.S.isDown = true;
      s.beginPlayerAction(name, playerActions.PLAYER_ATTACKS[name]);
      const endsAt = s.playerAction.endsAt;
      assert.deepEqual(s.player.body.velocity, { x: 0, y: 0 }, name);
      for (const time of [1001, endsAt - 1]) {
        tickScene(s, time);
        assert.equal(s.player.facing, direction, name);
        assert.deepEqual(s.player.body.velocity, { x: 0, y: 0 }, name);
      }
      tickScene(s, endsAt);
      assert.equal(s.playerAction, null, name);
      assert.equal(Math.sign(s.player.body.velocity.x), -direction, name);
      assert.ok(s.player.body.velocity.y > 0, name);
    }
  }
});

test('buffered combos stay facing forward across full scene updates, including the first buffer frame', () => {
  for (const lastKey of ['J', 'K']) {
    const s = scene();
    s.keys.J._justDown = true;
    tickScene(s, 1000);
    s.keys.A.isDown = true;
    s.keys.W.isDown = true;
    // Earliest eligible buffer press, then a real frame overshoot at recovery.
    s.keys.J._justDown = true;
    tickScene(s, 1060);
    tickScene(s, 1208);
    assert.equal(s.playerAction.name, 'light2');
    assert.equal(s.player.facing, 1);
    assert.deepEqual(s.player.body.velocity, { x: 0, y: 0 });
    s.keys[lastKey]._justDown = true;
    tickScene(s, 1300);
    tickScene(s, 1436);
    assert.equal(s.playerAction.name, lastKey === 'J' ? 'light3' : 'finisher');
    assert.equal(s.playerAction.facing, 1);
    assert.deepEqual(s.player.body.velocity, { x: 0, y: 0 });
  }
});

test('direction taps during an attack cannot dash or prime a dash after recovery', () => {
  const s = scene();
  s.handleDashTap('right');
  s.beginPlayerAction('heavy', playerActions.PLAYER_ATTACKS.heavy);
  s.time.now = 1400; s.handleDashTap('left');
  s.time.now = 1430; s.handleDashTap('left'); s.startDash(-1);
  assert.equal(s.isDashing, false);
  assert.equal(s.player.facing, 1);
  tickScene(s, 1470);
  s.time.now = 1480; s.handleDashTap('left');
  assert.equal(s.isDashing, false);
  s.time.now = 1510; s.handleDashTap('left');
  assert.equal(s.isDashing, true);
  assert.equal(s.player.body.velocity.x, -520);
});

function useArcadeBody(s) {
  // Real Phaser integration and postUpdate, with only rendering left out.
  Object.assign(s.player, {
    width: 256, height: 256, scaleX: 0.56, scaleY: 0.56,
    displayWidth: 143.36, displayHeight: 143.36,
    displayOriginX: 128, displayOriginY: 244 - 38 / 0.56,
  });
  const world = Object.assign(Object.create(ArcadeWorld.prototype), {
    defaults: {}, gravity: { x: 0, y: 0 },
    bounds: { x: 0, y: 0, right: 3600, bottom: 540 },
    checkCollision: { left: true, right: true, up: true, down: true },
  });
  s.player.body = new ArcadeBody(world, s.player);
  s.player.body.setSize(92, 150, false);
  s.player.body.setOffset(82, 84);
  s.player.body.collideWorldBounds = true;
  return s.player.body;
}

test('real Arcade physics keeps every attack at its start position, even on the first moving frame', () => {
  for (const fps of [30, 60, 144]) {
    for (const direction of [-1, 1]) {
      for (const name of Object.keys(playerActions.PLAYER_ATTACKS)) {
        const s = scene(), body = useArcadeBody(s);
        const delta = 1000 / fps;
        s.player.facing = direction;
        s.keys[direction > 0 ? 'A' : 'D'].isDown = true;
        s.keys.W.isDown = true;
        s.player.setVelocity(direction * 520, 150);
        // Phaser has already integrated this frame before Scene.update runs.
        body.preUpdate(true, delta / 1000);
        s.beginPlayerAction(name, playerActions.PLAYER_ATTACKS[name]);
        tickScene(s, 1000);
        body.postUpdate();
        const endsAt = s.playerAction.endsAt;
        for (let time = 1000 + delta; time < endsAt; time += delta) {
          body.preUpdate(true, delta / 1000);
          tickScene(s, time);
          body.postUpdate();
          assert.equal(s.player.x, 200, `${name}, ${fps}fps, x`);
          assert.equal(s.player.y, 400, `${name}, ${fps}fps, y`);
          assert.equal(s.player.facing, direction, name);
          assert.equal(body.deltaX(), 0, name);
          assert.equal(body.deltaY(), 0, name);
        }
        // Recovery unlocks held input; the next physics step must actually move.
        tickScene(s, endsAt);
        body.preUpdate(true, delta / 1000);
        tickScene(s, endsAt + delta);
        body.postUpdate();
        assert.equal(Math.sign(s.player.x - 200), -direction, name);
        assert.ok(s.player.y < 400, name);
      }
    }
  }
});

test('real Arcade physics still applies knockback after damage cancels the attack lock', () => {
  const s = scene(), body = useArcadeBody(s);
  s.keys.D.isDown = true;
  s.beginPlayerAction('heavy', playerActions.PLAYER_ATTACKS.heavy);
  s.hurtPlayer(-1);
  body.preUpdate(true, 1 / 60);
  tickScene(s, 1000 + 1000 / 60);
  body.postUpdate();
  assert.equal(s.playerAction, null);
  assert.equal(s.playerState.phase, 'hurt');
  assert.ok(s.player.x < 200);
  assert.ok(body.velocity.x < 0);
});

test('a long frame resolves one scheduled contact and then completes recovery', () => {
  const s = scene(); const e = enemy(240); s.enemies = [e];
  s.beginPlayerAction('heavy', playerActions.PLAYER_ATTACKS.heavy);
  tickAction(s, 1800);
  assert.equal(e.hp, 4);
  assert.equal(s.playerAction, null);
  tickAction(s, 1900); assert.equal(e.hp, 4);
});

test('rage interrupts windup, releases a held enemy, and resets on a new run', () => {
  const s = scene(); const e = enemy(240); s.enemies = [e]; s.tryGrabEnemy();
  s.activateRage();
  assert.equal(s.playerAction.name, 'rage');
  assert.equal(s.grabbedEnemy, null);
  assert.equal(e.body.enable, true);
  s.hurtPlayer(-1, true); assert.equal(s.player.hp, 10);
  s.init();
  assert.equal(s.playerAction, null);
  assert.equal(s.bufferedAttack, null);
  assert.equal(s.rageUntil, 0);
});

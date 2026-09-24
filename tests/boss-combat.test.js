import test from 'node:test';
import assert from 'node:assert/strict';
import { SIETE, BOSS_IMPACT, createBossState, advanceBossPhase, damageBoss, createBossAttack, bossAttackContains } from '../src/boss-combat.js';

const boss = () => ({ ...createBossState(), hp: 90, maxHp: 90, attackCount: 0, x: 4150, y: 410, facing: -1 });
const bounds = { left: 3670, right: 4490, top: 315, bottom: 500 };

test('crossing 60 percent health starts Overdrive once, and heavy hits deplete its gauge', () => {
  const b = boss();
  assert.equal(damageBoss(b, 36, BOSS_IMPACT.heavy, 1000).transition, 'overdrive');
  assert.equal(b.modeGauge, 100);
  assert.equal(advanceBossPhase(b, 1001), null);
  damageBoss(b, 2, BOSS_IMPACT.heavy, 1100);
  assert.equal(b.modeGauge, 82);
  damageBoss(b, 1, BOSS_IMPACT.light1, 1300);
  assert.equal(b.modeGauge, 76);
});

test('Break increases damage and expires into a playable normal phase before another Overdrive', () => {
  const b = boss();
  b.hp = 54;
  advanceBossPhase(b, 1000);
  const result = damageBoss(b, 4, 100, 1100);
  assert.equal(result.transition, 'break');
  assert.equal(b.breakUntil, 5300);
  assert.equal(damageBoss(b, 2, 100, 1200).damage, 3);
  assert.equal(b.breakUntil, 5300);
  assert.equal(advanceBossPhase(b, 5299), null);
  assert.equal(advanceBossPhase(b, 5300), 'normal');
  assert.equal(advanceBossPhase(b, 14299), null);
  assert.equal(advanceBossPhase(b, 14300), 'overdrive');
});

test('a hit exactly after Break expires loses the bonus, and lethal damage cannot revive a phase', () => {
  const b = boss();
  Object.assign(b, { phase: 'break', breakUntil: 2000, hp: 3 });
  assert.equal(damageBoss(b, 2, 20, 2000).damage, 2);
  damageBoss(b, 5, 20, 2100);
  assert.equal(b.hp, 0);
  assert.equal(advanceBossPhase(b, 20000), null);
  assert.equal(damageBoss(b, 9, 100, 21000).damage, 0);
});

test('sweep is directional and the warning stays at the captured position', () => {
  const b = boss();
  const p = { x: 4050, y: 410 };
  const attack = createBossAttack(b, p, bounds, 1000);
  assert.equal(attack.type, 'sweep');
  assert.equal(bossAttackContains(attack, p.x, p.y), true);
  assert.equal(bossAttackContains(attack, 4190, 410), false);
  b.x = 3900;
  p.y = 500;
  assert.equal(bossAttackContains(attack, 4050, 410), true);
  assert.equal(bossAttackContains(attack, 4050, 500), false);
});

test('rain circles and cross strips use exactly the shapes displayed to the player', () => {
  const b = boss();
  b.attackCount = 1;
  const rain = createBossAttack(b, { x: 4050, y: 410 }, bounds, 0);
  const center = rain.areas[1];
  assert.equal(bossAttackContains(rain, center.x + 48, center.y), true);
  assert.equal(bossAttackContains(rain, center.x + 49, center.y), false);
  b.phase = 'overdrive'; b.attackCount = 2;
  const cross = createBossAttack(b, { x: 4050, y: 410 }, bounds, 0);
  assert.equal(cross.type, 'cross');
  assert.equal(bossAttackContains(cross, 4050, 500), true);
  assert.equal(bossAttackContains(cross, 4400, 410), true);
  assert.equal(bossAttackContains(cross, 4400, 500), false);
});

test('every rain and cross warning leaves a walkable escape, including arena corners', () => {
  for (const x of [bounds.left, 4000, bounds.right]) {
    for (const y of [bounds.top, 410, bounds.bottom]) {
      for (const attackCount of [1, 2]) {
        const b = Object.assign(boss(), { phase: 'overdrive', attackCount });
        const a = createBossAttack(b, { x, y }, bounds, 0);
        const travel = 150 * (a.hitAt - 200) / 1000; // Allow 200ms to react.
        let escape = false;
        for (let px = bounds.left; px <= bounds.right; px += 10) {
          for (let py = bounds.top; py <= bounds.bottom; py += 5) {
            if (Math.hypot(px - x, py - y) <= travel && !bossAttackContains(a, px, py)) escape = true;
          }
        }
        assert.ok(escape, `${a.type} has no escape from ${x},${y}`);
      }
    }
  }
});

test('only Overdrive adds the cross attack and every cast keeps a recovery window', () => {
  const b = boss();
  for (const phase of ['normal', 'overdrive']) {
    b.phase = phase;
    const types = [];
    for (let i = 0; i < 12; i++) {
      b.attackCount = i;
      const attack = createBossAttack(b, { x: 4000, y: 400 }, bounds, 0);
      types.push(attack.type);
      assert.ok(attack.hitAt >= 650 && attack.recovery >= 900);
    }
    assert.equal(types.includes('cross'), phase === 'overdrive');
  }
});

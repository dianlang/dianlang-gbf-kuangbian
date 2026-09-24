import { SIETE } from './boss-combat.js';

// Enemy balance and combat rules. Times are in milliseconds.
export const ENEMY_TYPES = Object.freeze({
  raider: Object.freeze({
    name: '骑空士', texture: 'enemy', hp: 6, speed: 52, speedVariation: 7,
    guard: false, turnDelay: 0, recovery: 0,
    lightWindup: 340, heavyWindup: 560, cooldownMin: 950, cooldownMax: 1450,
  }),
  spartan: Object.freeze({
    name: '斯巴达', texture: 'enemy-spartan', hp: 10, speed: 38, speedVariation: 3,
    guard: true, turnDelay: 450, recovery: 650,
    lightWindup: 740, heavyWindup: 740, cooldownMin: 1500, cooldownMax: 1850,
  }),
  siete: Object.freeze({
    name: '希耶提 · 神将形态', texture: 'boss-siete', hp: SIETE.hp,
    speed: SIETE.speed, speedVariation: 0, guard: false, boss: true,
  }),
});

export function enemyProfile(kind = 'raider') {
  return ENEMY_TYPES[kind] ?? ENEMY_TYPES.raider;
}

export function enemyCanGuard(enemy, now) {
  return enemyProfile(enemy.kind).guard && enemy.active && !enemy.defeated
    && !enemy.grabbed && !(enemy.thrownUntil > now)
    && !(enemy.knockedDownUntil > now) && !(enemy.stunUntil > now)
    && !(enemy.guardBrokenUntil > now) && !(enemy.recoveryUntil > now);
}

export function enemyHitResponse(enemy, attackerX, attackType, now, raging = false) {
  const fromFront = (attackerX - enemy.x) * enemy.facing >= 0;
  if (!fromFront || !enemyCanGuard(enemy, now)) return 'hit';
  if (raging || ['heavy', 'finisher', 'dashHeavy'].includes(attackType)) return 'break';
  return 'block';
}

export function turnEnemyToward(enemy, targetX, now) {
  const desired = Math.sign(targetX - enemy.x) || enemy.facing;
  if (desired === enemy.facing) {
    enemy.turnAt = 0;
    enemy.turnDirection = 0;
    return;
  }
  const delay = enemyProfile(enemy.kind).turnDelay;
  if (enemy.turnDirection !== desired) {
    enemy.turnDirection = desired;
    enemy.turnAt = now + delay;
  }
  if (now >= enemy.turnAt) {
    enemy.facing = desired;
    enemy.turnAt = 0;
    enemy.turnDirection = 0;
  }
}

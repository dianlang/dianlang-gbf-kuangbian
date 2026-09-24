// Siete encounter rules. All times use the scene clock, all areas use lane coordinates.
export const SIETE = Object.freeze({
  hp: 90, speed: 65, overdriveRatio: 0.6, breakDuration: 4200,
  breakMultiplier: 1.5, overdriveCooldown: 9000,
});

export const BOSS_IMPACT = Object.freeze({
  light1: 6, light2: 7, light3: 12, heavy: 18,
  finisher: 26, dashLight: 14, dashHeavy: 30, thrown: 20,
});

export function createBossState() {
  return { phase: 'normal', modeGauge: 100, breakUntil: 0, overdriveReadyAt: 0 };
}

export function advanceBossPhase(boss, now) {
  if (boss.hp <= 0 || boss.defeated) return null;
  if (boss.phase === 'break' && now >= boss.breakUntil) {
    boss.phase = 'normal';
    boss.modeGauge = 100;
    boss.overdriveReadyAt = now + SIETE.overdriveCooldown;
    return 'normal';
  }
  if (boss.phase === 'normal' && boss.hp <= boss.maxHp * SIETE.overdriveRatio
    && now >= boss.overdriveReadyAt) {
    boss.phase = 'overdrive';
    boss.modeGauge = 100;
    return 'overdrive';
  }
  return null;
}

export function damageBoss(boss, baseDamage, impact, now) {
  if (boss.hp <= 0 || boss.defeated) return { damage: 0, transition: null };
  let transition = advanceBossPhase(boss, now);
  const damage = Math.ceil(baseDamage * (boss.phase === 'break' ? SIETE.breakMultiplier : 1));
  boss.hp = Math.max(0, boss.hp - damage);
  if (boss.hp > 0) {
    if (boss.phase === 'overdrive') {
      boss.modeGauge = Math.max(0, boss.modeGauge - impact);
      if (boss.modeGauge === 0) {
        boss.phase = 'break';
        boss.breakUntil = now + SIETE.breakDuration;
        transition = 'break';
      }
    } else {
      transition = advanceBossPhase(boss, now) ?? transition;
    }
  }
  return { damage, transition };
}

const rect = (x, y, width, height) => ({ shape: 'rect', x, y, width, height });
const circle = (x, y, radius) => ({ shape: 'circle', x, y, radius });
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// Capture the target position once. Telegraphs never follow subsequent movement.
export function createBossAttack(boss, player, bounds, now) {
  const overdrive = boss.phase === 'overdrive';
  const sequence = overdrive ? ['sweep', 'rain', 'cross', 'rain'] : ['sweep', 'rain', 'sweep'];
  const type = sequence[boss.attackCount % sequence.length];
  const direction = Math.sign(player.x - boss.x) || boss.facing;
  const timings = {
    sweep: [800, 1100, '神将横扫 · 绕后或离开剑光'],
    rain: [1100, 1250, '落剑 · 离开光圈'],
    cross: [1300, 1500, '交叉剑阵 · 避开十字'],
  };
  const [windup, recovery, label] = timings[type];
  let areas;
  if (type === 'sweep') {
    areas = [rect(boss.x + direction * 95, boss.y, 190, 96)];
  } else if (type === 'rain') {
    areas = [-135, 0, 135].map((offset, index) => circle(
      clamp(player.x + offset, bounds.left + 48, bounds.right - 48),
      clamp(player.y + (index - 1) * 45, bounds.top + 20, bounds.bottom - 20), 48,
    ));
  } else {
    areas = [
      rect((bounds.left + bounds.right) / 2, player.y, bounds.right - bounds.left, 76),
      rect(player.x, (bounds.top + bounds.bottom) / 2, 106, bounds.bottom - bounds.top),
    ];
  }
  return {
    type, direction, label, areas, heavy: type !== 'rain',
    startedAt: now, hitAt: now + windup - (overdrive ? 150 : 0),
    recovery: recovery - (overdrive ? 200 : 0),
  };
}

export function bossAttackContains(attack, x, y) {
  return attack.areas.some(area => area.shape === 'circle'
    ? (x - area.x) ** 2 + (y - area.y) ** 2 <= area.radius ** 2
    : Math.abs(x - area.x) <= area.width / 2 && Math.abs(y - area.y) <= area.height / 2);
}

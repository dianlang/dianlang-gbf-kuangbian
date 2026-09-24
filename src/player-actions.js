// One clock controls both the displayed pose and the gameplay event.
const clip = (texture, frames, durations, extra = {}) => ({
  frames: frames.map((frame, i) => ({ texture, frame, duration: durations[i] })),
  duration: durations.reduce((sum, n) => sum + n, 0),
  ...extra,
});
const combat = 'bii-combat';
const reaction = 'bii-reactions';
export const PLAYER_ACTIONS = Object.freeze({
  light1: clip('bii-punch', [0, 1, 2, 3], [50, 40, 65, 45], { hit: 90, active: 45 }),
  light2: clip('bii-punch', [1, 0, 2, 3], [40, 45, 75, 60], { hit: 85, active: 55 }),
  light3: clip(combat, [0, 1, 2, 3], [60, 55, 90, 95], { hit: 115, active: 60 }),
  heavy: clip(combat, [0, 1, 2, 3], [100, 80, 80, 210], { hit: 180, active: 65 }),
  finisher: clip(combat, [0, 1, 2, 3], [120, 90, 100, 290], { hit: 210, active: 90 }),
  dash: clip(combat, [4, 5], [65, 65], { loop: true }),
  dashLight: {
    frames: [
      { texture: combat, frame: 4, duration: 40 },
      { texture: 'bii-punch', frame: 1, duration: 30 },
      { texture: 'bii-punch', frame: 2, duration: 110 },
      { texture: 'bii-punch', frame: 3, duration: 210 },
    ], duration: 390, hit: 70, active: 110,
  },
  dashHeavy: clip(combat, [6, 7, 7, 6, 3], [80, 80, 160, 160, 240],
    { hit: 80, active: 240 }),
  grab: clip(combat, [8, 9], [100, 120], { hit: 100 }),
  grabHold: clip(combat, [9, 11], [280, 280], { loop: true }),
  grabPunch: clip(combat, [9, 10, 11], [60, 70, 100], { hit: 60 }),
  throw: clip(combat, [12, 13, 14, 15], [60, 100, 90, 270], { hit: 160 }),
  release: clip(combat, [8, 3], [80, 80], { hit: 0 }),
  hurt: clip(reaction, [0, 1, 2], [60, 80, 100]),
  knockdown: clip(reaction, [4, 5, 6, 7], [75, 85, 100, 440]),
  getup: clip(reaction, [8, 9, 10, 11], [60, 80, 80, 60]),
  rage: clip(reaction, [12, 13, 14], [100, 200, 180]),
  rageIdle: clip(reaction, [14, 15], [340, 340], { loop: true }),
  victory: clip(reaction, [14, 15], [240, 240], { loop: true }),
  defeat: clip(reaction, [4, 5, 6, 7], [80, 90, 100, 430]),
});

export function actionFrame(name, elapsed) {
  const action = PLAYER_ACTIONS[name];
  let time = Math.max(0, elapsed);
  if (action.loop) time %= action.duration;
  for (const frame of action.frames) {
    if (time < frame.duration) return frame;
    time -= frame.duration;
  }
  return action.frames.at(-1);
}

export function createAction(name, now, facing, config = null) {
  const definition = PLAYER_ACTIONS[name];
  return {
    name, startedAt: now, endsAt: now + definition.duration,
    hitAt: definition.hit === undefined ? Infinity : now + definition.hit,
    activeUntil: now + (definition.hit ?? 0) + (definition.active ?? 0),
    eventDone: false, hitTargets: new Set(), facing, config,
  };
}

export const COMBO_INPUT_BUFFER = 140;

export const PLAYER_ATTACKS = Object.freeze({
  light1: { type: 'light1', damage: 1, range: 82, knockback: 95, stun: 240 },
  light2: { type: 'light2', damage: 1, range: 88, knockback: 120, stun: 280 },
  light3: { type: 'light3', damage: 2, range: 98, knockback: 250, stun: 300, knockdown: true },
  heavy: { type: 'heavy', damage: 2, range: 108, knockback: 310, stun: 400, knockdown: true },
  finisher: { type: 'finisher', damage: 4, range: 124, knockback: 480, stun: 650, knockdown: true, shake: 0.011 },
  dashLight: { type: 'dashLight', damage: 2, range: 112, knockback: 350, stun: 420, knockdown: true, shake: 0.007 },
  dashHeavy: { type: 'dashHeavy', damage: 5, range: 142, knockback: 570, stun: 760, knockdown: true, shake: 0.014 },
});

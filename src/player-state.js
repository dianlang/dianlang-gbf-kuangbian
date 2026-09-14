// Timings are in milliseconds. Keep reaction rules independent of Phaser.
export const PLAYER_REACTION = Object.freeze({
  hurt: 240,
  knockdown: 700,
  getup: 280,
  recoveryGrace: 350,
});

export function createPlayerState() {
  return { phase: 'ready', until: 0, invulnerableUntil: 0, direction: 1 };
}

export function canPlayerAct(state) {
  return state.phase === 'ready';
}

export function applyPlayerHit(state, now, { direction = 1, knockdown = false } = {}) {
  if (!canPlayerAct(state) || now < state.invulnerableUntil) return false;
  state.phase = knockdown ? 'knockdown' : 'hurt';
  state.direction = direction < 0 ? -1 : 1;
  state.until = now + PLAYER_REACTION[state.phase];
  state.invulnerableUntil = state.until
    + (knockdown ? PLAYER_REACTION.getup : 0)
    + PLAYER_REACTION.recoveryGrace;
  return true;
}

export function advancePlayerState(state, now) {
  // Use scheduled boundaries so a long frame cannot extend recovery.
  while (state.phase !== 'ready' && now >= state.until) {
    if (state.phase === 'knockdown') {
      state.phase = 'getup';
      state.until += PLAYER_REACTION.getup;
    } else {
      state.phase = 'ready';
      state.until = 0;
    }
  }
  return state.phase;
}

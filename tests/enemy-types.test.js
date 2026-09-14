import test from 'node:test';
import assert from 'node:assert/strict';
import { enemyProfile, enemyCanGuard, enemyHitResponse, turnEnemyToward } from '../src/enemy-types.js';

function defender() {
  return { kind: 'spartan', active: true, x: 100, facing: 1 };
}

test('the defender trades speed for durability while untyped enemies stay raiders', () => {
  assert.equal(enemyProfile().hp, 6);
  assert.ok(enemyProfile('spartan').hp > enemyProfile().hp);
  assert.ok(enemyProfile('spartan').speed < enemyProfile().speed);
});

test('front light combos and dash punches are blocked, while the rear is vulnerable', () => {
  const e = defender();
  for (const type of ['light1', 'light2', 'light3', 'dashLight']) {
    assert.equal(enemyHitResponse(e, 130, type, 1000), 'block');
    assert.equal(enemyHitResponse(e, 70, type, 1000), 'hit');
  }
  e.facing = -1;
  assert.equal(enemyHitResponse(e, 70, 'light1', 1000), 'block');
  assert.equal(enemyHitResponse(e, 130, 'light1', 1000), 'hit');
});

test('heavy branches and rage break a raised shield', () => {
  for (const type of ['heavy', 'finisher', 'dashHeavy']) {
    assert.equal(enemyHitResponse(defender(), 130, type, 1000), 'break');
  }
  assert.equal(enemyHitResponse(defender(), 130, 'light1', 1000, true), 'break');
});

test('grabs, throws, reactions and attack recovery all disable guard', () => {
  for (const state of [
    { grabbed: true }, { thrownUntil: 1200 }, { stunUntil: 1200 },
    { knockedDownUntil: 1200 }, { guardBrokenUntil: 1200 }, { recoveryUntil: 1200 },
    { defeated: true }, { active: false },
  ]) {
    assert.equal(enemyCanGuard({ ...defender(), ...state }, 1000), false);
  }
  assert.equal(enemyCanGuard({ ...defender(), guardBrokenUntil: 1000 }, 1000), true);
});

test('turning leaves a real flank window and cancels if the player crosses back', () => {
  const e = defender();
  turnEnemyToward(e, 70, 1000);
  turnEnemyToward(e, 70, 1449);
  assert.equal(e.facing, 1);
  turnEnemyToward(e, 70, 1450);
  assert.equal(e.facing, -1);
  turnEnemyToward(e, 130, 1500);
  turnEnemyToward(e, 70, 1550);
  assert.equal(e.turnAt, 0);
  turnEnemyToward(e, 130, 2000);
  assert.equal(e.facing, -1);
  assert.equal(e.turnAt, 2450);
});

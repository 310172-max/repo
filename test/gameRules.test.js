import test from 'node:test';
import assert from 'node:assert/strict';
import { depositLoot, EXTRACTION_TARGET, lootResetState, movementSpeed, shouldWarnWhisker, WHISKER_WARNING_RANGE } from '../src/gameRules.js';

test('loot delivery succeeds once the recovery target is met', () => {
  assert.deepEqual(depositLoot(15, 5), { score: EXTRACTION_TARGET, extracted: true });
});

test('loot delivery stays in the run below the recovery target', () => {
  assert.deepEqual(depositLoot(5, 10), { score: 15, extracted: false });
});

test('carrying slows the player and prevents sprint speed', () => {
  assert.equal(movementSpeed({ carrying: true, sprinting: true }), 2.05);
  assert.equal(movementSpeed({ carrying: true }), 2.05);
});

test('an empty handed player can sprint faster than walking', () => {
  assert.ok(movementSpeed({ sprinting: true }) > movementSpeed());
});

test('the whisker cat warns only when idle and inside its warning range', () => {
  assert.equal(shouldWarnWhisker('idle', WHISKER_WARNING_RANGE - 0.1), true);
  assert.equal(shouldWarnWhisker('idle', WHISKER_WARNING_RANGE), false);
  assert.equal(shouldWarnWhisker('chase', 1), false);
});

test('restarting a run restores a carried loot item to its spawn transform', () => {
  assert.deepEqual(lootResetState({ spawnX: -6.1, spawnY: 0.35, spawnZ: 7.8, spawnAngle: 2.4 }), {
    active: true,
    carried: false,
    position: { x: -6.1, y: 0.35, z: 7.8 },
    angle: 2.4,
  });
});

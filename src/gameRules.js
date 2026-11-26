export const EXTRACTION_TARGET = 20;
export const WHISKER_WARNING_RANGE = 6.2;

export function depositLoot(currentScore, itemValue) {
  const score = currentScore + itemValue;
  return { score, extracted: score >= EXTRACTION_TARGET };
}

export function movementSpeed({ carrying = false, sprinting = false } = {}) {
  if (carrying) return 2.05;
  return sprinting ? 5.55 : 3.35;
}

export function shouldWarnWhisker(monsterState, distance) {
  return monsterState === 'idle' && distance < WHISKER_WARNING_RANGE;
}

export function lootResetState({ spawnX, spawnY, spawnZ, spawnAngle }) {
  return {
    active: true,
    carried: false,
    position: { x: spawnX, y: spawnY, z: spawnZ },
    angle: spawnAngle,
  };
}

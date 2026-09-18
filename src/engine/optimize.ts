import type { Gear, Weights } from '../gear/types';

/** 가중치를 적용해 장비 하나의 점수를 계산한다. */
export function scoreGear(gear: Gear, weights: Weights): number {
  return (
    gear.stats.atk * weights.atk +
    gear.stats.def * weights.def +
    gear.stats.hp * weights.hp
  );
}

/**
 * 주어진 가중치에서 점수가 가장 높은 장비를 고른다.
 * 후보가 없으면 null을 반환한다.
 */
export function pickBest(gears: Gear[], weights: Weights): Gear | null {
  if (gears.length === 0) return null;
  return gears.reduce((best, cur) =>
    scoreGear(cur, weights) > scoreGear(best, weights) ? cur : best,
  );
}

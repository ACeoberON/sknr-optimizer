import { describe, expect, it } from 'vitest';
import { pickBest, scoreGear } from '../src/engine/optimize';
import type { Gear, Weights } from '../src/gear/types';

const weights: Weights = { atk: 1, def: 1, hp: 0.5 };

const gears: Gear[] = [
  { id: 'a', name: '검', stats: { atk: 30, def: 0, hp: 0 } },
  { id: 'b', name: '방패', stats: { atk: 0, def: 10, hp: 40 } },
];

describe('optimize engine', () => {
  it('가중치를 적용해 점수를 계산한다', () => {
    expect(scoreGear(gears[0], weights)).toBe(30);
    expect(scoreGear(gears[1], weights)).toBe(30);
  });

  it('점수가 가장 높은 장비를 고른다', () => {
    const highHp: Weights = { atk: 1, def: 1, hp: 1 };
    expect(pickBest(gears, highHp)?.id).toBe('b');
  });

  it('후보가 없으면 null을 반환한다', () => {
    expect(pickBest([], weights)).toBeNull();
  });
});

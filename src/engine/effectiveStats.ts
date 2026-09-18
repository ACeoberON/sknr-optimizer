import type { Character, Content, Stat, UserCharacter } from '../data/types';

/** 스탯 상한. 치확·약확은 100, 치피는 상한 없음. (SPEC 1.3) */
const STAT_CAP: Record<Stat, number> = {
  crit: 100,
  critDmg: Number.POSITIVE_INFINITY,
  weakRate: 100,
};

const STATS: Stat[] = ['crit', 'critDmg', 'weakRate'];

export type BuffSums = Record<Stat, number>;

/**
 * 콘텐츠에서 charId에게 적용되는 전투 버프 합 (스탯별).
 * 실제 대상은 콘텐츠 DB의 buffTargets가 지정한다. uptime "always" 기준.
 */
export function buffSums(
  charId: string,
  content: Content,
  characters: Character[],
): BuffSums {
  const sums: BuffSums = { crit: 0, critDmg: 0, weakRate: 0 };
  for (const character of characters) {
    for (const effect of character.effects) {
      const targets = content.buffTargets[effect.id];
      if (targets && targets.includes(charId)) {
        sums[effect.stat] += effect.value;
      }
    }
  }
  return sums;
}

export interface StatBreakdown {
  base: number; // 장비 미착용 마을값 (초월 반영)
  equipment: number; // 장비 (v0.1에서는 0)
  buff: number; // 전투 버프 합
  raw: number; // base + equipment + buff (상한 적용 전)
  total: number; // 상한 적용 후 실효 스탯
  waste: number; // 상한 초과분 (낭비량)
}

/**
 * 버프를 반영한 전투 스탯. 장비는 아직 0으로 둔다. (SPEC 4장)
 * 반환값에 상한 초과분(낭비량)도 포함한다.
 */
export function effectiveStats(
  user: UserCharacter,
  content: Content,
  characters: Character[],
): Record<Stat, StatBreakdown> {
  const buffs = buffSums(user.charId, content, characters);
  const result = {} as Record<Stat, StatBreakdown>;
  for (const stat of STATS) {
    const base = user.baseStats[stat];
    const equipment = 0;
    const buff = buffs[stat];
    const raw = base + equipment + buff;
    const cap = STAT_CAP[stat];
    const total = Math.min(raw, cap);
    const waste = raw > cap ? raw - cap : 0;
    result[stat] = { base, equipment, buff, raw, total, waste };
  }
  return result;
}

import { analyticStats } from '../engine/analytic';
import type { SimUnit } from '../engine/simulate';
import { BEST1_Z } from './optimize';
import { SUB_UNIT } from './types';

export interface MarginalValue {
  crit: number; // 치확 +1줄(+4) 시 J 증가율 (%)
  critDmg: number; // 치피 +1줄(+6)
  weakRate: number; // 약확 +1줄(+5)
}

function objective(unit: SimUnit): number {
  const a = analyticStats(unit);
  return a.mean + BEST1_Z * a.std;
}

function withStat(unit: SimUnit, stat: keyof SimUnit['stats'], delta: number): SimUnit {
  return { ...unit, stats: { ...unit.stats, [stat]: unit.stats[stat] + delta } };
}

/**
 * 줄당 가치. (SPEC v0.3 5.2)
 * 현재 세팅에서 각 스탯 1줄(부옵 기본값 1개)을 더했을 때의 J 증가율.
 * 상한(치확·약확 100)을 넘어 효과가 없으면 0%.
 */
export function marginalValue(unit: SimUnit): MarginalValue {
  const j0 = objective(unit);
  if (j0 === 0) return { crit: 0, critDmg: 0, weakRate: 0 };
  const pct = (delta: SimUnit) => ((objective(delta) - j0) / j0) * 100;
  return {
    crit: pct(withStat(unit, 'crit', SUB_UNIT.crit)),
    critDmg: pct(withStat(unit, 'critDmg', SUB_UNIT.critDmg)),
    weakRate: pct(withStat(unit, 'weakRate', SUB_UNIT.weakRate)),
  };
}

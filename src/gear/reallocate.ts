import type { Character, Content, Stat } from '../data/types';
import { analyticStats } from '../engine/analytic';
import { buildSimUnit, type CombatStats } from '../engine/simulate';
import type { BuffSums } from '../engine/effectiveStats';
import {
  RING_CRIT,
  RING_SIEGE_MULT,
  RING_WEAK,
  SUB_UNIT,
  weaponMainTotals,
  type MainStat,
  type RingCarve,
} from './types';
import { BEST1_Z } from './optimize';

const MAIN_COMBOS: [MainStat, MainStat][] = [
  ['crit', 'crit'],
  ['crit', 'critDmg'],
  ['crit', 'weakRate'],
  ['critDmg', 'critDmg'],
  ['critDmg', 'weakRate'],
  ['weakRate', 'weakRate'],
];
const RINGS: RingCarve[] = ['crit', 'weak', 'siege', 'survival'];

const STEP = 0.5;
/** 스탯별 상한: 부옵 4줄 + 강화 20회 = 24단위. (SPEC v0.4 4장) */
export const PER_STAT_CAP = 24;

export interface BudgetBest {
  weaponMains: [MainStat, MainStat];
  ringCarve: RingCarve;
  critUnits: number;
  weakUnits: number;
  critDmgUnits: number;
  combat: CombatStats;
  targetVillage: { crit: number; critDmg: number; weakRate: number };
  scaleMult: number;
  mean: number;
  std: number;
  objective: number; // μ + 1.163σ
}

function ringStat(ring: RingCarve): { crit: number; weak: number } {
  if (ring === 'crit') return { crit: RING_CRIT, weak: 0 };
  if (ring === 'weak') return { crit: 0, weak: RING_WEAK };
  return { crit: 0, weak: 0 };
}

export interface BudgetInput {
  char: Character;
  content: Content;
  baseStats: Record<Stat, number>;
  buffs: BuffSums;
  units: number; // 배분할 총 유효 단위 U
  scale?: number;
  basicCount?: number;
}

/**
 * 같은 유효 단위 U를 치확·치피·약확에 자유 재배분해 최대 J를 찾는다. (SPEC v0.4 4장)
 * 무기 주옵·세공 재선택 포함, 스탯별 상한 24단위. 0.5단위 간격.
 */
export function optimizeBudget(input: BudgetInput): BudgetBest {
  const { char, content, baseStats, buffs } = input;
  const U = input.units;
  const scale = input.scale ?? 1;

  let best: BudgetBest | null = null;
  const cap = Math.min(PER_STAT_CAP, U);

  for (const mains of MAIN_COMBOS) {
    const wm = weaponMainTotals(mains);
    for (const ring of RINGS) {
      const rs = ringStat(ring);
      const sc = ring === 'siege' ? scale * RING_SIEGE_MULT : scale;
      for (let uc = 0; uc <= cap + 1e-9; uc += STEP) {
        for (let uw = 0; uc + uw <= U + 1e-9 && uw <= PER_STAT_CAP + 1e-9; uw += STEP) {
          const ud = U - uc - uw;
          if (ud < -1e-9 || ud > PER_STAT_CAP + 1e-9) continue;

          const combat: CombatStats = {
            crit: baseStats.crit + wm.crit + SUB_UNIT.crit * uc + rs.crit + buffs.crit,
            critDmg: baseStats.critDmg + wm.critDmg + SUB_UNIT.critDmg * ud + buffs.critDmg,
            weakRate: baseStats.weakRate + wm.weakRate + SUB_UNIT.weakRate * uw + rs.weak + buffs.weakRate,
          };
          const unit = buildSimUnit(char, content, combat, sc, input.basicCount);
          const a = analyticStats(unit);
          const objective = a.mean + BEST1_Z * a.std;
          if (!best || objective > best.objective) {
            best = {
              weaponMains: mains,
              ringCarve: ring,
              critUnits: uc,
              weakUnits: uw,
              critDmgUnits: ud,
              combat,
              targetVillage: {
                crit: baseStats.crit + wm.crit + SUB_UNIT.crit * uc,
                critDmg: baseStats.critDmg + wm.critDmg + SUB_UNIT.critDmg * ud,
                weakRate: baseStats.weakRate + wm.weakRate + SUB_UNIT.weakRate * uw,
              },
              scaleMult: sc,
              mean: a.mean,
              std: a.std,
              objective,
            };
          }
        }
      }
    }
  }
  return best!;
}

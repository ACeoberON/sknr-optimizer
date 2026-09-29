import type { Character, Content, Stat } from '../data/types';
import { analyticStats } from '../engine/analytic';
import { buildSimUnit, type CombatStats } from '../engine/simulate';
import type { BuffSums } from '../engine/effectiveStats';
import {
  DEFAULT_LINES,
  RING_CRIT,
  RING_SIEGE_MULT,
  RING_WEAK,
  SUB_UNIT,
  WEAPON_MAIN_VALUE,
  weaponMainTotals,
  type LineCounts,
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

export const MAX_LINES = 4;
/** 강화 1줄당 최대 강화 횟수 (15강 = 5회). */
export const ENHANCE_PER_LINE = 5;
/** 스탯별 최대 유효 단위 = 부옵 4줄 + 강화 20회 = 24. */
export const PER_STAT_CAP = MAX_LINES + MAX_LINES * ENHANCE_PER_LINE;

export type Slot4 = 'weak' | 'flatAtk';

export interface StructuredBest {
  weaponMains: [MainStat, MainStat];
  ringCarve: RingCarve;
  slot4: Slot4;
  enhance: { crit: number; critDmg: number; weakRate: number }; // k_c, k_d, k_w
  combat: CombatStats;
  targetVillage: { crit: number; critDmg: number; weakRate: number };
  scaleMult: number;
  mean: number;
  std: number;
  objective: number;
  /** 이 줄 수로 도달 가능한 전투 약확 상한 (부족 안내용). */
  maxWeak: number;
}

export interface StructuredInput {
  char: Character;
  content: Content;
  baseStats: Record<Stat, number>;
  buffs: BuffSums;
  enhance: number; // 유효 강화 횟수 (종결 20 / A 17 / B 13 / C 9)
  lineCounts?: LineCounts;
  allowFlatAtk?: boolean; // 4번째 칸 깡공 허용 (기본 false)
  scale?: number;
  basicCount?: number;
}

function ringStat(ring: RingCarve): { crit: number; weak: number } {
  if (ring === 'crit') return { crit: RING_CRIT, weak: 0 };
  if (ring === 'weak') return { crit: 0, weak: RING_WEAK };
  return { crit: 0, weak: 0 };
}

/**
 * v0.3.2 장비 구조 기반 최적화. (SPEC v0.4 수정)
 *
 * 부옵 기본 줄(스탯별 lineCounts, 기본 4/4/4)은 항상 포함되는 고정값이고,
 * 최적화는 강화 배분(k_c+k_d+k_w = enhance) + 무기 주옵 2개 + 반지 세공.
 * 스탯별 강화 ≤ 줄 수 × 5, 줄 수 0이면 강화 배분 불가. 약확 줄은 유지된다.
 */
export function optimizeStructured(input: StructuredInput): StructuredBest {
  const { char, content, baseStats, buffs } = input;
  const lc = input.lineCounts ?? DEFAULT_LINES;
  const scale = input.scale ?? 1;
  const modes: Slot4[] = input.allowFlatAtk ? ['weak', 'flatAtk'] : ['weak'];

  // 약확 줄로 도달 가능한 전투 약확 상한 (약확 주옵 + 세공 + 줄·강화 최대)
  const maxWeak =
    baseStats.weakRate +
    buffs.weakRate +
    WEAPON_MAIN_VALUE.weakRate +
    RING_WEAK +
    SUB_UNIT.weakRate * (lc.weakRate + Math.min(input.enhance, lc.weakRate * ENHANCE_PER_LINE));

  let best: StructuredBest | null = null;

  for (const mains of MAIN_COMBOS) {
    const wm = weaponMainTotals(mains);
    for (const ring of RINGS) {
      const rs = ringStat(ring);
      const sc = ring === 'siege' ? scale * RING_SIEGE_MULT : scale;
      for (const slot4 of modes) {
        const wLines = slot4 === 'weak' ? lc.weakRate : 0;
        const capacity = ENHANCE_PER_LINE * (lc.crit + lc.critDmg + wLines);
        const eff = Math.min(input.enhance, capacity); // 줄이 부족하면 남는 강화는 손실
        const kcMax = lc.crit * ENHANCE_PER_LINE;
        const kdMax = lc.critDmg * ENHANCE_PER_LINE;
        const kwMax = wLines * ENHANCE_PER_LINE;
        for (let kc = 0; kc <= Math.min(eff, kcMax); kc++) {
          for (let kd = 0; kd <= Math.min(eff - kc, kdMax); kd++) {
            const kw = eff - kc - kd;
            if (kw < 0 || kw > kwMax) continue;

            const subCrit = SUB_UNIT.crit * (lc.crit + kc);
            const subCritDmg = SUB_UNIT.critDmg * (lc.critDmg + kd);
            const subWeak = SUB_UNIT.weakRate * (wLines + kw);
            const combat: CombatStats = {
              crit: baseStats.crit + wm.crit + subCrit + rs.crit + buffs.crit,
              critDmg: baseStats.critDmg + wm.critDmg + subCritDmg + buffs.critDmg,
              weakRate: baseStats.weakRate + wm.weakRate + subWeak + rs.weak + buffs.weakRate,
            };
            const unit = buildSimUnit(char, content, combat, sc, input.basicCount);
            const a = analyticStats(unit);
            const objective = a.mean + BEST1_Z * a.std;
            if (!best || objective > best.objective) {
              best = {
                weaponMains: mains,
                ringCarve: ring,
                slot4,
                enhance: { crit: kc, critDmg: kd, weakRate: kw },
                combat,
                targetVillage: {
                  crit: baseStats.crit + wm.crit + subCrit,
                  critDmg: baseStats.critDmg + wm.critDmg + subCritDmg,
                  weakRate: baseStats.weakRate + wm.weakRate + subWeak,
                },
                scaleMult: sc,
                mean: a.mean,
                std: a.std,
                objective,
                maxWeak,
              };
            }
          }
        }
      }
    }
  }
  return best!;
}

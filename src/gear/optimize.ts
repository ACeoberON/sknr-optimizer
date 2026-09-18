import type { Character, Content, Stat } from '../data/types';
import { analyticStats } from '../engine/analytic';
import { buildSimUnit, simulate, type CombatStats, type SimUnit } from '../engine/simulate';
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

/** best1/5 정규 근사 계수 (5개 표본 최대의 기대값). */
export const BEST1_Z = 1.163;

const MAIN_COMBOS: [MainStat, MainStat][] = [
  ['crit', 'crit'],
  ['crit', 'critDmg'],
  ['crit', 'weakRate'],
  ['critDmg', 'critDmg'],
  ['critDmg', 'weakRate'],
  ['weakRate', 'weakRate'],
];
const RINGS: RingCarve[] = ['crit', 'weak', 'siege'];
const STEP = 0.5; // 0.5단위 간격

export interface Candidate {
  weaponMains: [MainStat, MainStat];
  ringCarve: RingCarve;
  /** 부옵 배분 (단위) */
  critUnits: number;
  weakUnits: number;
  critDmgUnits: number;
  combat: CombatStats; // 전투 스탯 (상한 적용 전)
  targetVillage: { crit: number; critDmg: number; weakRate: number };
  mean: number;
  std: number;
  objective: number; // μ + 1.163σ
}

export interface OptimizeInput {
  char: Character;
  content: Content;
  baseStats: Record<Stat, number>;
  buffs: BuffSums;
  budgetUnits: number;
  scale?: number;
  basicCount?: number;
}

export interface OptimizeResult {
  best: Candidate;
  best1: number; // 시뮬레이터로 확정한 베스트1/5 기대값
  topConfirmed: { candidate: Candidate; best1: number }[];
}

/** 현재 세팅의 전투 스탯과 딜 배율(세공)을 만든다. */
export function setupCombat(
  baseStats: Record<Stat, number>,
  buffs: BuffSums,
  mains: [MainStat, MainStat],
  ring: RingCarve,
  sub: { subCrit: number; subCritDmg: number; subWeak: number },
): { stats: CombatStats; scaleMult: number } {
  const wm = weaponMainTotals(mains);
  const rs = ringStat(ring);
  return {
    stats: {
      crit: baseStats.crit + wm.crit + sub.subCrit + rs.crit + buffs.crit,
      critDmg: baseStats.critDmg + wm.critDmg + sub.subCritDmg + buffs.critDmg,
      weakRate: baseStats.weakRate + wm.weakRate + sub.subWeak + rs.weak + buffs.weakRate,
    },
    scaleMult: ring === 'siege' ? RING_SIEGE_MULT : 1,
  };
}

function ringStat(ring: RingCarve): { crit: number; weak: number } {
  if (ring === 'crit') return { crit: RING_CRIT, weak: 0 };
  if (ring === 'weak') return { crit: 0, weak: RING_WEAK };
  return { crit: 0, weak: 0 };
}

function ringScale(scale: number, ring: RingCarve): number {
  return ring === 'siege' ? scale * RING_SIEGE_MULT : scale;
}

/** 후보 하나의 전투 스탯·시뮬 단위를 만든다. */
function buildCandidateUnit(input: OptimizeInput, c: Candidate): SimUnit {
  return buildSimUnit(input.char, input.content, c.combat, ringScale(input.scale ?? 1, c.ringCarve), input.basicCount);
}

/**
 * 딜러 1명 최적화. (SPEC v0.3 4.1 탐색 + 4.3 확인)
 *
 * 무기 주옵 6조합 × 세공 3가지 × 예산 0.5단위 분할을 해석식으로 평가하고,
 * 상위 5개를 시뮬레이터로 재평가해 베스트1/5 기대값을 확정한다.
 * 치확·약확이 100 + 1단위를 넘는 낭비 후보는 제외한다.
 */
export function optimizeDealer(input: OptimizeInput): OptimizeResult {
  const { baseStats, buffs, budgetUnits } = input;
  const B = budgetUnits;
  const critCap = 100 + SUB_UNIT.crit; // 낭비 한도 1단위
  const weakCap = 100 + SUB_UNIT.weakRate;

  const candidates: Candidate[] = [];

  for (const mains of MAIN_COMBOS) {
    const wm = weaponMainTotals(mains);
    for (const ring of RINGS) {
      const rs = ringStat(ring);
      const kMax = Math.max(0, Math.round(B / STEP));
      for (let kc = 0; kc <= kMax; kc++) {
        const uc = kc * STEP;
        if (uc > B) break;
        for (let kw = 0; kc + kw <= kMax; kw++) {
          const uw = kw * STEP;
          if (uc + uw > B) break;
          const ud = B - uc - uw;

          const subCrit = uc * SUB_UNIT.crit;
          const subWeak = uw * SUB_UNIT.weakRate;
          const subCritDmg = ud * SUB_UNIT.critDmg;

          const combat: CombatStats = {
            crit: baseStats.crit + wm.crit + subCrit + rs.crit + buffs.crit,
            critDmg: baseStats.critDmg + wm.critDmg + subCritDmg + buffs.critDmg,
            weakRate: baseStats.weakRate + wm.weakRate + subWeak + rs.weak + buffs.weakRate,
          };
          // 상한 초과 낭비 후보 제외 (낭비 한도 1단위)
          if (combat.crit > critCap || combat.weakRate > weakCap) continue;

          const cand: Candidate = {
            weaponMains: mains,
            ringCarve: ring,
            critUnits: uc,
            weakUnits: uw,
            critDmgUnits: ud,
            combat,
            targetVillage: {
              crit: baseStats.crit + wm.crit + subCrit,
              critDmg: baseStats.critDmg + wm.critDmg + subCritDmg,
              weakRate: baseStats.weakRate + wm.weakRate + subWeak,
            },
            mean: 0,
            std: 0,
            objective: 0,
          };
          const unit = buildCandidateUnit(input, cand);
          const a = analyticStats(unit);
          cand.mean = a.mean;
          cand.std = a.std;
          cand.objective = a.mean + BEST1_Z * a.std;
          candidates.push(cand);
        }
      }
    }
  }

  candidates.sort((a, b) => b.objective - a.objective);

  // 4.3 확인: 상위 5개를 시뮬레이터로 재평가
  const top = candidates.slice(0, 5);
  const topConfirmed = top.map((candidate) => {
    const unit = buildCandidateUnit(input, candidate);
    const res = simulate(unit, 20000, 20240601);
    return { candidate, best1: res.bestOf };
  });
  topConfirmed.sort((a, b) => b.best1 - a.best1);

  return {
    best: topConfirmed[0].candidate,
    best1: topConfirmed[0].best1,
    topConfirmed,
  };
}

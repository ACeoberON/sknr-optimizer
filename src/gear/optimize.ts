import type { Character, Content, Stat } from '../data/types';
import { analyticStats } from '../engine/analytic';
import { buildSimUnit, simulate, type CombatStats } from '../engine/simulate';
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

/** 장비 구조 상수 (SPEC v0.3.2 1장). 각 장비 1줄씩 × 4장비 = 4줄. */
export const CRIT_LINES = 4;
export const CRITDMG_LINES = 4;
export const WEAK_LINES = 4; // 4번째 칸이 약확일 때
export const TOTAL_ENHANCE = 20; // 장비당 5회 × 4

/** 콘텐츠 편성에서 최적화 대상 멤버(진형 순서). optimize=false는 제외. */
export function optimizedMembers(content: Content): string[] {
  return content.lineup.filter((id) => content.optimize?.[id] !== false);
}

const MAIN_COMBOS: [MainStat, MainStat][] = [
  ['crit', 'crit'],
  ['crit', 'critDmg'],
  ['crit', 'weakRate'],
  ['critDmg', 'critDmg'],
  ['critDmg', 'weakRate'],
  ['weakRate', 'weakRate'],
];
const RINGS: RingCarve[] = ['crit', 'weak', 'siege', 'survival'];

/** 4번째 칸: 약확 줄 또는 깡공(계산 제외). */
export type Slot4 = 'weak' | 'flatAtk';

export interface Candidate {
  weaponMains: [MainStat, MainStat];
  ringCarve: RingCarve;
  slot4: Slot4;
  enhance: { crit: number; critDmg: number; weakRate: number }; // k_c, k_d, k_w
  combat: CombatStats; // 전투 스탯 (상한 적용 전)
  targetVillage: { crit: number; critDmg: number; weakRate: number };
  scaleMult: number; // 세공 딜 배율 (공성 ×1.04)
  mean: number;
  std: number;
  objective: number; // μ + 1.163σ
}

export interface OptimizeInput {
  char: Character;
  content: Content;
  baseStats: Record<Stat, number>;
  buffs: BuffSums;
  lostUpgrades: number; // 강화가 모공·깡공에 붙은 수 (0~20)
  reservedSpeedLines?: number; // 4번째 칸을 속공으로 대체한 줄 수
  scale?: number;
  basicCount?: number;
}

export interface OptimizeResult {
  best: Candidate;
  best1: number; // 시뮬레이터로 확정한 베스트1/5
  topConfirmed: { candidate: Candidate; best1: number }[];
}

function ringStat(ring: RingCarve): { crit: number; weak: number } {
  if (ring === 'crit') return { crit: RING_CRIT, weak: 0 };
  if (ring === 'weak') return { crit: 0, weak: RING_WEAK };
  return { crit: 0, weak: 0 }; // siege, survival
}

function ringScale(scale: number, ring: RingCarve): number {
  return ring === 'siege' ? scale * RING_SIEGE_MULT : scale;
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

/**
 * 4번째 칸 결정 (SPEC v0.3.2 1장/3장).
 * 기본 약확 + 버프 + 약확 4줄(20)만으로 100 이상이면 약확 슬롯이 (거의) 낭비 → 깡공.
 * 그 외(약확이 부족한 캐릭터)는 약확·깡공 둘 다 평가한다.
 */
export function slot4Modes(baseBuffWeak: number, weakLines: number): Slot4[] {
  const withSlot = baseBuffWeak + weakLines * SUB_UNIT.weakRate;
  return withSlot >= 100 ? ['flatAtk'] : ['weak', 'flatAtk'];
}

/**
 * 딜러 1명 최적화 — 장비 구조 기반 전수 탐색. (SPEC v0.3.2 3장)
 *
 * 무기 주옵 6조합 × 반지 세공 4가지 × 4번째 칸(약확/깡공) × 강화 배분(k_c+k_d+k_w = 20−손실).
 * 해석 목적함수 μ + 1.163σ로 평가하고 상위 5개를 시뮬레이터로 확정한다.
 */
export function optimizeDealer(input: OptimizeInput): OptimizeResult {
  const { char, content, baseStats, buffs } = input;
  const K = Math.max(0, TOTAL_ENHANCE - input.lostUpgrades);
  const reserved = input.reservedSpeedLines ?? 0;
  const weakLines = Math.max(0, WEAK_LINES - reserved); // 속공 줄이 4번째 칸을 대체
  const baseBuffWeak = baseStats.weakRate + buffs.weakRate;
  const modes = slot4Modes(baseBuffWeak, weakLines);
  const scale = input.scale ?? 1;

  const candidates: Candidate[] = [];

  for (const mains of MAIN_COMBOS) {
    const wm = weaponMainTotals(mains);
    for (const ring of RINGS) {
      const rs = ringStat(ring);
      const sc = ringScale(scale, ring);
      for (const slot4 of modes) {
        const wLines = slot4 === 'weak' ? weakLines : 0;
        for (let kc = 0; kc <= K; kc++) {
          for (let kd = 0; kd <= K - kc; kd++) {
            const kw = K - kc - kd;
            if (slot4 === 'flatAtk' && kw > 0) continue; // 약확 줄이 없으면 약확 강화 불가

            const subCrit = SUB_UNIT.crit * (CRIT_LINES + kc);
            const subCritDmg = SUB_UNIT.critDmg * (CRITDMG_LINES + kd);
            const subWeak = SUB_UNIT.weakRate * (wLines + kw);

            const combat: CombatStats = {
              crit: baseStats.crit + wm.crit + subCrit + rs.crit + buffs.crit,
              critDmg: baseStats.critDmg + wm.critDmg + subCritDmg + buffs.critDmg,
              weakRate: baseStats.weakRate + wm.weakRate + subWeak + rs.weak + buffs.weakRate,
            };

            const unit = buildSimUnit(char, content, combat, sc, input.basicCount);
            const a = analyticStats(unit);
            candidates.push({
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
              objective: a.mean + BEST1_Z * a.std,
            });
          }
        }
      }
    }
  }

  candidates.sort((a, b) => b.objective - a.objective);
  const top = candidates.slice(0, 5);
  const topConfirmed = top.map((candidate) => {
    const unit = buildSimUnit(char, content, candidate.combat, candidate.scaleMult, input.basicCount);
    return { candidate, best1: simulate(unit, 20000, 20240601).bestOf };
  });
  topConfirmed.sort((a, b) => b.best1 - a.best1);

  return { best: topConfirmed[0].candidate, best1: topConfirmed[0].best1, topConfirmed };
}

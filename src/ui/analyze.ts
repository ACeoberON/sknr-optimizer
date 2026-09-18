import type { Character, Content, UserCharacter } from '../data/types';
import { buildSimUnit, simulate } from '../engine/simulate';
import { analyticStats } from '../engine/analytic';
import { buffSums } from '../engine/effectiveStats';
import { marginalValue, type MarginalValue } from '../gear/marginal';
import { computeBudget, type Budget } from '../gear/budget';
import { BEST1_Z, optimizeDealer, setupCombat, type Candidate } from '../gear/optimize';
import { SUB_UNIT, weaponMainTotals, type CurrentSetup } from '../gear/types';

export interface DealerReport {
  charId: string;
  name: string;
  budget: Budget; // 현황 표시용 (예산 방식은 최적화에서 제거됨)
  currentBest1: number;
  currentMean: number;
  currentStd: number;
  currentJ: number;
  marginal: MarginalValue;
  wasteCritUnits: number; // 장비로 줄일 수 있는 상한 초과 낭비 (단위)
  wasteWeakUnits: number;
  target: Candidate;
  targetBest1: number;
  targetJ: number;
  deltaPct: number; // 현재 대비 J 증감 (%)
  critLineDiff: number; // 현재 − 목표 치확 줄 수
  weakLineDiff: number;
}

const SEED = 20240601;

/** 딜러 1명의 현재 세팅을 분석해 예산·목표·레시피·줄당 가치·경고를 계산한다. */
export function analyzeDealer(
  setup: CurrentSetup,
  char: Character,
  user: UserCharacter,
  content: Content,
  characters: Character[],
  basicCount: number,
): DealerReport {
  const base = user.baseStats;
  const buffs = buffSums(char.id, content, characters);
  const budget = computeBudget(setup, base);

  const cur = setupCombat(base, buffs, setup.weaponMains, setup.ringCarve, budget);
  const curUnit = buildSimUnit(char, content, cur.stats, cur.scaleMult, basicCount);
  const curAnalytic = analyticStats(curUnit);
  const currentJ = curAnalytic.mean + BEST1_Z * curAnalytic.std;
  const currentBest1 = simulate(curUnit, 20000, SEED).bestOf;
  const marginal = marginalValue(curUnit);

  const opt = optimizeDealer({
    char,
    content,
    baseStats: base,
    buffs,
    lostUpgrades: setup.lostUpgrades ?? 0,
    reservedSpeedLines: setup.reservedSpeedLines ?? 0,
    scale: 1,
    basicCount,
  });
  const targetJ = opt.best.objective;

  // 장비로 줄일 수 있는 초과분만 낭비로 센다 (기본 + 버프로 넘는 부분 제외).
  const critFloor = Math.max(100, base.crit + buffs.crit);
  const weakFloor = Math.max(100, base.weakRate + buffs.weakRate);

  // 현재 − 목표 부옵 줄 수 (양수 = 현재가 목표보다 많음)
  const wmTarget = weaponMainTotals(opt.best.weaponMains);
  const targetSubCrit = opt.best.targetVillage.crit - base.crit - wmTarget.crit;
  const targetSubWeak = opt.best.targetVillage.weakRate - base.weakRate - wmTarget.weakRate;
  const critLineDiff = (budget.subCrit - targetSubCrit) / SUB_UNIT.crit;
  const weakLineDiff = (budget.subWeak - targetSubWeak) / SUB_UNIT.weakRate;

  return {
    charId: char.id,
    name: char.name,
    budget,
    currentBest1,
    currentMean: curAnalytic.mean,
    currentStd: curAnalytic.std,
    currentJ,
    marginal,
    wasteCritUnits: Math.max(0, cur.stats.crit - critFloor) / SUB_UNIT.crit,
    wasteWeakUnits: Math.max(0, cur.stats.weakRate - weakFloor) / SUB_UNIT.weakRate,
    target: opt.best,
    targetBest1: opt.best1,
    targetJ,
    deltaPct: currentJ > 0 ? ((targetJ - currentJ) / currentJ) * 100 : 0,
    critLineDiff,
    weakLineDiff,
  };
}

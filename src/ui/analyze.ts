import type { Character, Content, UserCharacter } from '../data/types';
import { buildSimUnit, simulate } from '../engine/simulate';
import { analyticStats } from '../engine/analytic';
import { buffSums } from '../engine/effectiveStats';
import { marginalValue, type MarginalValue } from '../gear/marginal';
import { computeBudget, type Budget } from '../gear/budget';
import { optimizeDealer, setupCombat, type Candidate } from '../gear/optimize';
import { SUB_UNIT, type CurrentSetup } from '../gear/types';

export interface DealerReport {
  charId: string;
  name: string;
  budget: Budget;
  currentBest1: number;
  currentMean: number; // 현재 세팅 해석 평균 (팀 목적함수용)
  currentStd: number;
  marginal: MarginalValue;
  wasteCritUnits: number; // 장비로 줄일 수 있는 치확 상한 초과 낭비 (단위)
  wasteWeakUnits: number;
  target: Candidate; // target.mean / target.std = 최적 세팅 평균·표준편차
  targetBest1: number;
  deltaPct: number; // 현재 대비 증감 (%)
}

const SEED = 20240601;

/** 딜러 1명의 현재 세팅을 분석해 예산·목표·줄당 가치·경고를 계산한다. */
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
  const currentBest1 = simulate(curUnit, 20000, SEED).bestOf;
  const curAnalytic = analyticStats(curUnit);
  const marginal = marginalValue(curUnit);

  const opt = optimizeDealer({
    char,
    content,
    baseStats: base,
    buffs,
    budgetUnits: budget.units,
    scale: 1,
    basicCount,
  });

  // 장비로 줄일 수 있는 초과분만 낭비로 센다.
  // 기본 스탯 + 전투 버프만으로 이미 100을 넘는 부분은 장비로 못 줄이므로 제외.
  const critFloor = Math.max(100, base.crit + buffs.crit);
  const weakFloor = Math.max(100, base.weakRate + buffs.weakRate);

  return {
    charId: char.id,
    name: char.name,
    budget,
    currentBest1,
    currentMean: curAnalytic.mean,
    currentStd: curAnalytic.std,
    marginal,
    wasteCritUnits: Math.max(0, cur.stats.crit - critFloor) / SUB_UNIT.crit,
    wasteWeakUnits: Math.max(0, cur.stats.weakRate - weakFloor) / SUB_UNIT.weakRate,
    target: opt.best,
    targetBest1: opt.best1,
    deltaPct: currentBest1 > 0 ? ((opt.best1 - currentBest1) / currentBest1) * 100 : 0,
  };
}

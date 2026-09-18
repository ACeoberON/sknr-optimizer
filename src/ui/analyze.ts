import type { Character, Content, UserCharacter } from '../data/types';
import { buildSimUnit, simulate } from '../engine/simulate';
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
  marginal: MarginalValue;
  wasteCritUnits: number; // 치확 상한 초과 낭비 (단위)
  wasteWeakUnits: number;
  target: Candidate;
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

  return {
    charId: char.id,
    name: char.name,
    budget,
    currentBest1,
    marginal,
    wasteCritUnits: Math.max(0, cur.stats.crit - 100) / SUB_UNIT.crit,
    wasteWeakUnits: Math.max(0, cur.stats.weakRate - 100) / SUB_UNIT.weakRate,
    target: opt.best,
    targetBest1: opt.best1,
    deltaPct: currentBest1 > 0 ? ((opt.best1 - currentBest1) / currentBest1) * 100 : 0,
  };
}

import type { Character, Content, UserCharacter } from '../data/types';
import { buildSimUnit } from '../engine/simulate';
import { analyticStats } from '../engine/analytic';
import { buffSums } from '../engine/effectiveStats';
import { computeBudget } from '../gear/budget';
import { BEST1_Z, setupCombat } from '../gear/optimize';
import { optimizeStructured, type StructuredBest } from '../gear/reallocate';
import { effectiveUnits, grade, roundU, type Grade } from '../gear/grade';
import { DEFAULT_LINES, SUB_UNIT, type CurrentSetup } from '../gear/types';

/** 종결 유효 강화 횟수 (= 20). */
const ENDGAME_ENHANCE = 20;

export interface BasicReport {
  charId: string;
  name: string;
  U: number; // 유효 단위 (표시용 반올림 전)
  uEff: number;
  uDisplay: number; // 소수 첫째 자리
  grade: Grade;
  mogongKnown: boolean;
  efficiency: number; // J_now / J_best × 100 (≤100)
  currentMean: number;
  currentStd: number;
  currentSplit: { critUnits: number; weakUnits: number; critDmgUnits: number };
  bestAtU: StructuredBest; // 같은 강화 횟수 재배분 최적
  bestAtUPlus: StructuredBest; // 강화 +1 (개선 우선순위용)
  target: StructuredBest; // 종결 목표 (강화 20)
}

/** 딜러 1명의 Basic 분석 (등급·배분 효율·종결 목표). */
export function analyzeBasic(
  setup: CurrentSetup,
  char: Character,
  user: UserCharacter,
  content: Content,
  characters: Character[],
  basicCount: number,
): BasicReport {
  const base = user.baseStats;
  const buffs = buffSums(char.id, content, characters);
  const budget = computeBudget(setup, base);
  const U = budget.units;
  const mogongKnown = setup.mogongLines != null;
  const uEff = effectiveUnits(U, setup.mogongLines ?? null);

  const cur = setupCombat(base, buffs, setup.weaponMains, setup.ringCarve, budget);
  const curA = analyticStats(buildSimUnit(char, content, cur.stats, cur.scaleMult, basicCount));
  const currentJ = curA.mean + BEST1_Z * curA.std;

  // U = 줄 수 합 + 강화 횟수 → 현재 유효 강화 = U − 줄 수 합
  const lineCounts = setup.lineCounts ?? DEFAULT_LINES;
  const lineSum = lineCounts.crit + lineCounts.critDmg + lineCounts.weakRate;
  const enhanceNow = Math.max(0, Math.round(U - lineSum));

  const structuredArgs = { char, content, baseStats: base, buffs, lineCounts, scale: 1, basicCount };
  const bestAtU = optimizeStructured({ ...structuredArgs, enhance: enhanceNow });
  const bestAtUPlus = optimizeStructured({ ...structuredArgs, enhance: Math.min(ENDGAME_ENHANCE, enhanceNow + 1) });
  const target = optimizeStructured({ ...structuredArgs, enhance: ENDGAME_ENHANCE });

  const efficiency = bestAtU.objective > 0 ? Math.min(100, (currentJ / bestAtU.objective) * 100) : 100;

  return {
    charId: char.id,
    name: char.name,
    U,
    uEff,
    uDisplay: roundU(U),
    grade: grade(uEff),
    mogongKnown,
    efficiency,
    currentMean: curA.mean,
    currentStd: curA.std,
    currentSplit: {
      critUnits: budget.subCrit / SUB_UNIT.crit,
      weakUnits: budget.subWeak / SUB_UNIT.weakRate,
      critDmgUnits: budget.subCritDmg / SUB_UNIT.critDmg,
    },
    bestAtU,
    bestAtUPlus,
    target,
  };
}

/** 팀 목적함수 J = Σμ + 1.163√(Σσ²). */
export function teamObjective(means: number[], stds: number[]): number {
  const sumMean = means.reduce((a, b) => a + b, 0);
  const sumVar = stds.reduce((a, b) => a + b * b, 0);
  return sumMean + BEST1_Z * Math.sqrt(sumVar);
}

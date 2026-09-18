import type { Stat } from '../data/types';
import { SUB_UNIT, weaponMainTotals, type CurrentSetup } from './types';

export interface Budget {
  /** 부옵으로 채워진 스탯 포인트 */
  subCrit: number;
  subCritDmg: number;
  subWeak: number;
  /** 예산 B (단위, 소수 허용) */
  units: number;
}

/**
 * 예산 산출. (SPEC v0.3 3장)
 *
 *   부옵 스탯 = 마을 − 기본 − 무기 주옵 합
 *   B = 부옵치확/4 + 부옵치피/6 + 부옵약확/5
 *
 * 잡옵·공%·속공 줄은 예산에 안 잡히므로 장비 완성도가 자동 반영된다.
 */
export function computeBudget(
  setup: CurrentSetup,
  baseStats: Record<Stat, number>,
): Budget {
  const wm = weaponMainTotals(setup.weaponMains);
  const subCrit = setup.village.crit - baseStats.crit - wm.crit;
  const subCritDmg = setup.village.critDmg - baseStats.critDmg - wm.critDmg;
  const subWeak = setup.village.weakRate - baseStats.weakRate - wm.weakRate;
  const units = subCrit / SUB_UNIT.crit + subCritDmg / SUB_UNIT.critDmg + subWeak / SUB_UNIT.weakRate;
  return { subCrit, subCritDmg, subWeak, units };
}

/**
 * 역산 검증용: 기본 + 주옵 + 부옵으로 마을 스탯을 복원한다.
 */
export function reconstructVillage(
  setup: CurrentSetup,
  baseStats: Record<Stat, number>,
  budget: Budget,
): { crit: number; critDmg: number; weakRate: number } {
  const wm = weaponMainTotals(setup.weaponMains);
  return {
    crit: baseStats.crit + wm.crit + budget.subCrit,
    critDmg: baseStats.critDmg + wm.critDmg + budget.subCritDmg,
    weakRate: baseStats.weakRate + wm.weakRate + budget.subWeak,
  };
}

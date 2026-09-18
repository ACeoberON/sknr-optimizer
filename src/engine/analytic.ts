import type { SimUnit } from './simulate';

export interface AnalyticResult {
  mean: number;
  variance: number;
  std: number;
  relStd: number;
}

/**
 * 히트별 해석식으로 캐릭터 딜의 평균·분산을 구한다. (SPEC v0.3 4.2)
 * 시뮬레이터와 동일한 히트 목록·가중치를 쓰므로 결과가 1% 이내로 일치한다.
 *
 *   치명항 X_c: E = 1 + p_c(cd/100 − 1),   Var = p_c(1−p_c)(cd/100 − 1)²
 *   약공항 X_w: E = 1 + 0.3 p_w,            Var = p_w(1−p_w)(0.3)²
 *   E[X] = E_c E_w,  Var[X] = E[X_c²]E[X_w²] − E[X]²
 *   μ = scale Σ w_h E[X_h],  σ² = scale² Σ w_h² Var[X_h]
 */
export function analyticStats(unit: SimUnit): AnalyticResult {
  const pCrit = Math.min(100, unit.stats.crit) / 100;
  const pWeak = Math.min(100, unit.stats.weakRate) / 100;

  const eWeak = 1 + 0.3 * pWeak;
  const varWeak = pWeak * (1 - pWeak) * 0.3 * 0.3;
  const eWeak2 = varWeak + eWeak * eWeak;

  // 한 히트의 E[X], Var[X]
  const hitMoments = (critDmgBonus: number) => {
    const critMult = (unit.stats.critDmg + critDmgBonus) / 100;
    const d = critMult - 1;
    const eCrit = 1 + pCrit * d;
    const varCrit = pCrit * (1 - pCrit) * d * d;
    const eCrit2 = varCrit + eCrit * eCrit;
    const eX = eCrit * eWeak;
    const varX = eCrit2 * eWeak2 - eX * eX;
    return { eX, varX };
  };

  let sumMean = 0;
  let sumVar = 0;
  for (const h of unit.skillHits) {
    const m = hitMoments(h.critDmgBonus);
    sumMean += h.weight * m.eX;
    sumVar += h.weight * h.weight * m.varX;
  }

  // 평타: 정수부는 온전 히트, 소수부는 가중 히트 (simulateRun과 동일한 모멘트)
  const basic = hitMoments(0);
  const full = Math.floor(unit.basicCount);
  const frac = unit.basicCount - full;
  const w = unit.basicWeight;
  sumMean += (full + frac) * w * basic.eX;
  sumVar += (full + frac * frac) * w * w * basic.varX;

  const mean = unit.scale * sumMean;
  const variance = unit.scale * unit.scale * sumVar;
  const std = Math.sqrt(variance);
  return { mean, variance, std, relStd: mean !== 0 ? std / mean : 0 };
}

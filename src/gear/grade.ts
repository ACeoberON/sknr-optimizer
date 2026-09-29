// 장비 품질 등급 · 유효 단위 (SPEC v0.4 2·3장).

export type Grade = 'S' | 'A' | 'B' | 'C';

/** 종결 최대 유효 단위 = 12줄 + 강화 20회. */
export const ENDGAME_MAX_U = 32;

/** 등급 구간 경계 (설정 상수로 분리, 추후 조정 용이). */
export const GRADE_THRESHOLDS = { S: 30, A: 27, B: 23 } as const;

/** 유효 단위 → 등급. 현실 종결(27~30)을 A로 둔다. */
export function grade(uEff: number): Grade {
  if (uEff >= GRADE_THRESHOLDS.S) return 'S';
  if (uEff >= GRADE_THRESHOLDS.A) return 'A';
  if (uEff >= GRADE_THRESHOLDS.B) return 'B';
  return 'C';
}

/**
 * 모공 줄 보정. (SPEC v0.4 2장)
 * 모공 줄 수를 알면 U_eff = U − (4 − 모공 줄 수), 모르면(null) U_eff = U.
 */
export function effectiveUnits(u: number, mogongLines: number | null): number {
  if (mogongLines == null) return u;
  return u - (4 - mogongLines);
}

/** 화면 표시용: 소수 첫째 자리 반올림. */
export function roundU(u: number): number {
  return Math.round(u * 10) / 10;
}

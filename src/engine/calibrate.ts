import { simulate, type SimUnit } from './simulate';

/**
 * 캐릭터별 스케일 계수 산출. (SPEC v0.2 3.2)
 *
 * scale = 실측 평균 딜 / 시뮬레이션 평균 딜(보정 전, scale=1).
 * 스케일은 배분이 바뀌어도 고정이며, 모델은 배분에 따른 상대 변화·흔들림을 담당한다.
 */
export function calibrateScale(
  unit: SimUnit,
  actualMean: number,
  n = 20000,
  seed = 1,
): number {
  const raw = simulate({ ...unit, scale: 1 }, n, seed);
  return raw.mean === 0 ? 1 : actualMean / raw.mean;
}

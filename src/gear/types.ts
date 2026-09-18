// 장비 도메인 타입·상수 (SPEC v0.3 1장).

export type MainStat = 'crit' | 'critDmg' | 'weakRate';
export type RingCarve = 'crit' | 'weak' | 'siege' | 'survival';

/** 딜러별 현재 세팅 입력 (SPEC v0.3 2장 / v0.3.2 2장). */
export interface CurrentSetup {
  charId: string;
  village: { crit: number; critDmg: number; weakRate: number }; // 현재 마을 스탯
  weaponMains: [MainStat, MainStat];
  ringCarve: RingCarve;
  lostUpgrades?: number; // 강화가 모공·깡공에 붙은 수 (0~20, 기본 0 = 종결)
  reservedSpeedLines?: number; // 속공 부옵이 필요한 줄 수 (4번째 칸 대체, 기본 0)
}

/** 무기 주옵 1개가 주는 스탯. */
export const WEAPON_MAIN_VALUE: Record<MainStat, number> = {
  crit: 24,
  critDmg: 36,
  weakRate: 28,
};

/** 부옵/강화 1단위 = 스탯 1개분. */
export const SUB_UNIT: Record<MainStat, number> = {
  crit: 4,
  critDmg: 6,
  weakRate: 5,
};

/** 장신구 세공 전투 효과. crit/weak는 스탯 가산, siege는 딜 배율. */
export const RING_CRIT = 10;
export const RING_WEAK = 12;
export const RING_SIEGE_MULT = 1.04; // 미검증(커뮤니티 가정)

/** 무기 주옵 2개가 주는 스탯 합. */
export function weaponMainTotals(mains: [MainStat, MainStat]): {
  crit: number;
  critDmg: number;
  weakRate: number;
} {
  const totals = { crit: 0, critDmg: 0, weakRate: 0 };
  for (const m of mains) totals[m] += WEAPON_MAIN_VALUE[m];
  return totals;
}

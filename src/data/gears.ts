import type { Gear } from '../gear/types';

/** 예시 장비 데이터. 추후 실제 데이터로 교체 예정. */
export const SAMPLE_GEARS: Gear[] = [
  { id: 'sword', name: '강철 검', stats: { atk: 30, def: 2, hp: 0 } },
  { id: 'shield', name: '참나무 방패', stats: { atk: 0, def: 25, hp: 10 } },
  { id: 'amulet', name: '생명의 부적', stats: { atk: 5, def: 5, hp: 40 } },
];

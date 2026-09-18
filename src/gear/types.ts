/** 장비가 제공하는 스탯. */
export interface Stats {
  atk: number;
  def: number;
  hp: number;
}

/** 하나의 장비 아이템. */
export interface Gear {
  id: string;
  name: string;
  stats: Stats;
}

/** 스탯별 가중치. 최적화 엔진이 점수를 매길 때 사용한다. */
export type Weights = Stats;

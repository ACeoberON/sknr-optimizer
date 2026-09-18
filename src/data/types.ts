// SPEC.md 2장 데이터 스키마.

export type Stat = 'crit' | 'critDmg' | 'weakRate';
export type SkillSlot = 'upper' | 'lower' | 'basic';

// ── 캐릭터 DB ──
export interface Skill {
  kind: 'damage' | 'buff';
  targets: 'all' | 'single'; // all = 적 전체 (실제 수는 콘텐츠의 적 수)
  hitsPerTarget: number; // "N회 피해"의 N. buff면 0
  canCrit?: boolean; // 기본 true
}

export interface Effect {
  id: string;
  source: 'passive' | SkillSlot;
  stat: Stat;
  value: number;
  scope: 'self' | 'allAllies' | 'selectedAllies';
  maxTargets?: number; // selectedAllies일 때
  selectionRule?: string; // 예: "공격력 상위" (실제 대상은 콘텐츠 DB가 지정)
  durationOwnTurns?: number; // 버프 지속 (대상 자신의 평타 턴 기준)
}

export interface Character {
  id: string;
  name: string;
  skills: Record<SkillSlot, Skill>;
  effects: Effect[]; // 치확·치피·약확 관련 효과만
  rawText?: string; // 원문 (엔진 미사용)
}

// ── 콘텐츠 DB ──
export interface SkillOrderEntry {
  char: string;
  skill: SkillSlot;
  turn: string;
}

export interface Content {
  id: string;
  name: string;
  enemies: string[]; // 적 수 = length
  lineup: string[]; // 진형 순서 1~5 (결과 화면 행 순서 대조용)
  skillOrder: SkillOrderEntry[];
  totalTurns: number;
  buffTargets: Record<string, string[]>; // effect.id → 대상 캐릭터 id
  buffUptime?: Record<string, 'always' | number>; // 기본 "always"
  scoring: { type: 'bestOf'; runs: number }; // 공성전: 5판 중 베스트1
  mechanic: 'standard'; // 추후: "missZero" | "multiHitWeighted" | "threshold"
}

// ── 사용자 데이터 ──
export interface UserCharacter {
  charId: string;
  speed: number;
  baseStats: Record<Stat, number>; // 장비 미착용 마을값 (초월 반영)
}

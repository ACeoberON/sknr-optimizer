import type { Character, Content } from '../data/types';

export interface HitCounts {
  /** 스킬 판정 수 = Σ(시전 횟수 × 대상 수 × hitsPerTarget). buff 스킬은 hitsPerTarget 0이라 0. */
  skillHits: number;
  /** 평타 판정 수 = totalTurns ÷ (아군 수 + 적 수). 소수 허용. */
  basicHits: number;
}

/** 캐릭터가 콘텐츠 로테이션에서 만들어내는 스킬 판정 수. */
export function skillHits(char: Character, content: Content): number {
  const enemyCount = content.enemies.length;
  let total = 0;
  for (const entry of content.skillOrder) {
    if (entry.char !== char.id) continue;
    const skill = char.skills[entry.skill];
    if (!skill) continue;
    const targetCount = skill.targets === 'all' ? enemyCount : 1;
    total += targetCount * skill.hitsPerTarget;
  }
  return total;
}

/** 유닛당 평타 판정 수 (모든 유닛 공통). */
export function basicHits(content: Content): number {
  const unitCount = content.lineup.length + content.enemies.length;
  return content.totalTurns / unitCount;
}

/** 캐릭터의 스킬·평타 판정 수를 함께 계산한다. */
export function computeHits(char: Character, content: Content): HitCounts {
  return {
    skillHits: skillHits(char, content),
    basicHits: basicHits(content),
  };
}

import type { Character, Content } from '../data/types';
import { mulberry32 } from './rng';

/** 시뮬레이션에 필요한 전투 스탯 (상한 적용 전). */
export interface CombatStats {
  crit: number; // 치확 (0~, 상한 100은 시뮬 내부에서 적용)
  critDmg: number; // 치피 (예: 258 → 배율 2.58)
  weakRate: number; // 약확 (0~, 상한 100)
}

interface Hit {
  weight: number; // 기본값 (치명·약공 모두 미발동 시 한 히트 대미지)
  critDmgBonus: number; // 스킬 고유 치피 보정
}

/** 한 캐릭터의 시뮬레이션 단위. 히트 목록과 전투 스탯, 스케일 계수를 담는다. */
export interface SimUnit {
  charId: string;
  skillHits: Hit[]; // 스킬 히트 (대상별로 전개됨)
  basicWeight: number; // 평타 한 히트 기본값
  basicCount: number; // 평타 수 (소수 허용, 예: 8.5)
  stats: CombatStats;
  scale: number; // 캐릭터별 스케일 계수 (SPEC v0.2 3.2)
}

/**
 * 캐릭터별 평타 횟수를 결정적으로 배분한다. (SPEC v0.3 6장)
 *
 * 총 턴 T, 유닛 수 N → 모든 유닛 ⌊T/N⌋회, 속공 내림차순 앞 (T mod N)명이 +1회.
 * 동속이면 진형 순서(lineup) 우선. 적 속공은 content.enemySpeeds, 없으면 아군 뒤로 가정.
 */
export function computeBasicCounts(
  content: Content,
  allySpeeds: Record<string, number>,
): Record<string, number> {
  const unitCount = content.lineup.length + content.enemies.length;
  const base = Math.floor(content.totalTurns / unitCount);
  const extra = content.totalTurns - base * unitCount; // T mod N

  interface Unit {
    id: string;
    speed: number;
    priority: number; // 동속 시 낮을수록 앞 (아군 진형 순서, 적은 뒤로)
    ally: boolean;
  }
  const units: Unit[] = [];
  content.lineup.forEach((id, i) => {
    units.push({ id, speed: allySpeeds[id] ?? 0, priority: i, ally: true });
  });
  content.enemies.forEach((_, i) => {
    const speed = content.enemySpeeds?.[i];
    units.push({
      id: `__enemy${i}`,
      speed: speed ?? Number.NEGATIVE_INFINITY,
      priority: 1000 + i,
      ally: false,
    });
  });
  units.sort((a, b) => b.speed - a.speed || a.priority - b.priority);

  const counts: Record<string, number> = {};
  units.forEach((u, rank) => {
    if (u.ally) counts[u.id] = base + (rank < extra ? 1 : 0);
  });
  return counts;
}

/**
 * 캐릭터 DB · 콘텐츠 DB · 전투 스탯으로 시뮬레이션 단위를 만든다.
 *
 * 히트 목록 = 스킬 순서 × 대상 수 × hitsPerTarget + 평타.
 * hitWeights에 값이 없으면 기본 가중치 1 (지크·비스킷: 딜 비중 1% 미만 → 스케일만 보정).
 * basicCount를 주면 그 값을 쓰고, 없으면 T/N (평균, 소수 허용).
 */
export function buildSimUnit(
  char: Character,
  content: Content,
  stats: CombatStats,
  scale = 1,
  basicCount?: number,
): SimUnit {
  const enemyCount = content.enemies.length;
  const weights = content.hitWeights?.[char.id] ?? {};
  const skillHits: Hit[] = [];

  for (const entry of content.skillOrder) {
    if (entry.char !== char.id) continue;
    const skill = char.skills[entry.skill];
    if (!skill || skill.kind !== 'damage') continue; // 버프 스킬은 딜 히트 없음
    const weight = weights[entry.skill] ?? 1;
    const critDmgBonus = skill.critDmgBonus ?? 0;
    const targetCount = skill.targets === 'all' ? enemyCount : 1;
    const hitCount = targetCount * skill.hitsPerTarget;
    for (let i = 0; i < hitCount; i++) {
      skillHits.push({ weight, critDmgBonus });
    }
  }

  return {
    charId: char.id,
    skillHits,
    basicWeight: weights.basic ?? 1,
    basicCount: basicCount ?? content.totalTurns / (content.lineup.length + enemyCount),
    stats,
    scale,
  };
}

/** 한 히트의 대미지. 치명·약공은 히트마다 독립 판정. */
function rollHit(
  weight: number,
  critDmgBonus: number,
  critDmg: number,
  pCrit: number,
  pWeak: number,
  rng: () => number,
): number {
  const critTerm = rng() < pCrit ? (critDmg + critDmgBonus) / 100 : 1;
  const weakTerm = rng() < pWeak ? 1.3 : 1;
  return weight * critTerm * weakTerm;
}

/**
 * 한 판 시뮬레이션. 캐릭터의 총 대미지를 반환한다.
 *
 * 평타 수가 소수(예: 8.5)면 정수부는 온전한 히트, 소수부는 그만큼 가중한 히트로 처리한다.
 * (SPEC 3.1은 판마다 8/9 반반을 제안하지만, 그러면 5.3의 결정성 테스트에서
 *  평타 개수 흔들림 때문에 표준편차가 0이 되지 않는다. 기대값은 동일하게 유지하되
 *  결정성을 보장하기 위해 소수 가중 히트로 구현한다.)
 */
export function simulateRun(unit: SimUnit, rng: () => number): number {
  const pCrit = Math.min(100, unit.stats.crit) / 100;
  const pWeak = Math.min(100, unit.stats.weakRate) / 100;
  const cd = unit.stats.critDmg;

  let total = 0;
  for (const h of unit.skillHits) {
    total += rollHit(h.weight, h.critDmgBonus, cd, pCrit, pWeak, rng);
  }

  const full = Math.floor(unit.basicCount);
  const frac = unit.basicCount - full;
  for (let i = 0; i < full; i++) {
    total += rollHit(unit.basicWeight, 0, cd, pCrit, pWeak, rng);
  }
  if (frac > 0) {
    total += frac * rollHit(unit.basicWeight, 0, cd, pCrit, pWeak, rng);
  }

  return total * unit.scale;
}

export interface SimResult {
  mean: number;
  std: number; // 절대 표준편차
  relStd: number; // 상대 표준편차 (std / mean)
  bestOf: number; // groupSize판 묶음 최대값의 평균 (채점 bestOf)
  values: number[];
}

/**
 * N판 반복 시뮬레이션 후 통계 산출. 시드가 같으면 결과가 재현된다.
 */
export function simulate(unit: SimUnit, n = 20000, seed = 1, groupSize = 5): SimResult {
  const rng = mulberry32(seed);
  const values = new Array<number>(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = simulateRun(unit, rng);
    values[i] = v;
    sum += v;
  }
  const mean = sum / n;

  let sq = 0;
  for (let i = 0; i < n; i++) {
    const d = values[i] - mean;
    sq += d * d;
  }
  const std = Math.sqrt(sq / n);
  const relStd = mean !== 0 ? std / mean : 0;

  let groups = 0;
  let bestSum = 0;
  for (let i = 0; i + groupSize <= n; i += groupSize) {
    let m = -Infinity;
    for (let j = 0; j < groupSize; j++) m = Math.max(m, values[i + j]);
    bestSum += m;
    groups++;
  }
  const bestOf = groups > 0 ? bestSum / groups : mean;

  return { mean, std, relStd, bestOf, values };
}

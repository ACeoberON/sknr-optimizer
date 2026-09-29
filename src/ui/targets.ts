import type { Character, Content, UserCharacter } from '../data/types';
import { buffSums } from '../engine/effectiveStats';
import { computeBasicCounts } from '../engine/simulate';
import { optimizeBudget, type BudgetBest } from '../gear/reallocate';
import { teamObjective } from './analyze';

export interface TargetRow {
  charId: string;
  name: string;
  optimize: boolean;
  best?: BudgetBest; // optimize=false면 없음
  combatCrit?: number; // 전투 치확 (상한 100)
  combatWeak?: number; // 전투 약확 (상한 100)
}

export interface TargetResult {
  rows: TargetRow[]; // 진형 순서 전원
  teamMean: number;
  teamStd: number;
  teamJ: number;
}

/** 장비 수준(유효 단위 U)을 예산으로 편성 전원의 목표 세팅을 계산한다. (SPEC 목표 탭) */
export function computeTargets(
  content: Content,
  characters: Character[],
  users: UserCharacter[],
  units: number,
): TargetResult {
  const byId = (id: string) => characters.find((c) => c.id === id)!;
  const userById = (id: string) => users.find((u) => u.charId === id);
  const allySpeeds = Object.fromEntries(users.map((u) => [u.charId, u.speed]));
  const basicCounts = computeBasicCounts(content, allySpeeds);

  const rows: TargetRow[] = [];
  const means: number[] = [];
  const stds: number[] = [];

  for (const id of content.lineup) {
    const char = byId(id);
    const user = userById(id);
    const optimize = content.optimize?.[id] !== false;
    if (!optimize || !user) {
      rows.push({ charId: id, name: char.name, optimize: false });
      continue;
    }
    const best = optimizeBudget({
      char,
      content,
      baseStats: user.baseStats,
      buffs: buffSums(id, content, characters),
      units,
      scale: 1,
      basicCount: basicCounts[id],
    });
    rows.push({
      charId: id,
      name: char.name,
      optimize: true,
      best,
      combatCrit: Math.min(100, best.combat.crit),
      combatWeak: Math.min(100, best.combat.weakRate),
    });
    means.push(best.mean);
    stds.push(best.std);
  }

  return { rows, teamMean: means.reduce((a, b) => a + b, 0), teamStd: 0, teamJ: teamObjective(means, stds) };
}

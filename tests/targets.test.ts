import { describe, expect, it } from 'vitest';
import charactersJson from '../src/data/characters.json';
import siegeFriJson from '../src/data/contents/siege-fri.json';
import usersJson from '../src/data/users.json';
import type { Character, Content, UserCharacter } from '../src/data/types';
import { computeTargets } from '../src/ui/targets';
import { weaponMainTotals } from '../src/gear/types';
import { CRITDMG_LINES, TOTAL_ENHANCE } from '../src/gear/optimize';
import { SUB_UNIT } from '../src/gear/types';

const characters = charactersJson as unknown as Character[];
const content = siegeFriJson as unknown as Content;
const users = usersJson as unknown as UserCharacter[];
const userById = (id: string) => users.find((u) => u.charId === id)!;

const LEVELS = [32, 29, 25, 21];
const results = LEVELS.map((u) => ({ u, r: computeTargets(content, characters, users, u) }));

const critDmgOf = (u: number, id: string) =>
  results.find((x) => x.u === u)!.r.rows.find((row) => row.charId === id)!.best!.targetVillage.critDmg;
const critOf = (u: number, id: string) =>
  results.find((x) => x.u === u)!.r.rows.find((row) => row.charId === id)!.best!.targetVillage.crit;

describe('목표 탭 계산', () => {
  // 유효 단위 32 > 29 > 25 > 21 순으로 목표 치피 단조 감소
  it('장비 수준이 낮을수록 목표 치피 단조 감소', () => {
    for (const id of ['ryan', 'taka', 'rachel', 'sieg']) {
      for (let i = 1; i < LEVELS.length; i++) {
        expect(critDmgOf(LEVELS[i], id)).toBeLessThan(critDmgOf(LEVELS[i - 1], id) + 1e-9);
      }
    }
  });

  // 유효 단위가 낮을수록 목표 치확도 감소(또는 같음)
  it('장비 수준이 낮을수록 목표 치확 감소 또는 같음', () => {
    for (const id of ['ryan', 'taka', 'rachel', 'sieg']) {
      for (let i = 1; i < LEVELS.length; i++) {
        expect(critOf(LEVELS[i], id)).toBeLessThanOrEqual(critOf(LEVELS[i - 1], id) + 1e-9);
      }
    }
  });

  // 목표 마을 치피 ≤ 150 + 주옵 치피 + 6×(4+20)
  it('목표 마을 치피가 물리적 상한 이내', () => {
    for (const { r } of results) {
      for (const row of r.rows) {
        if (!row.best) continue;
        const base = userById(row.charId).baseStats;
        const wmCritDmg = weaponMainTotals(row.best.weaponMains).critDmg;
        const cap = base.critDmg + wmCritDmg + SUB_UNIT.critDmg * (CRITDMG_LINES + TOTAL_ENHANCE);
        expect(row.best.targetVillage.critDmg).toBeLessThanOrEqual(cap + 1e-9);
      }
    }
  });

  // 입력 없이 편성 전원 행 출력, 비스킷은 optimize=false
  it('편성 전원 행 + 비스킷 생존 세팅', () => {
    const { rows } = results[0].r;
    expect(rows.map((x) => x.charId)).toEqual(['sieg', 'rachel', 'biscuit', 'ryan', 'taka']);
    const biscuit = rows.find((x) => x.charId === 'biscuit')!;
    expect(biscuit.optimize).toBe(false);
    expect(biscuit.best).toBeUndefined();
    expect(results[0].r.teamJ).toBeGreaterThan(0);
  });
});

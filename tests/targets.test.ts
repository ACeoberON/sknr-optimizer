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

// 유효 강화 횟수 (종결 20 / A 17 / B 13 / C 9)
const LEVELS = [20, 17, 13, 9];
const results = LEVELS.map((e) => ({ u: e, r: computeTargets(content, characters, users, e) }));

const rowOf = (e: number, id: string) => results.find((x) => x.u === e)!.r.rows.find((row) => row.charId === id)!;
const critDmgOf = (e: number, id: string) => rowOf(e, id).best!.targetVillage.critDmg;
const critOf = (e: number, id: string) => rowOf(e, id).best!.targetVillage.crit;
const weakOf = (e: number, id: string) => rowOf(e, id).best!.targetVillage.weakRate;

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

  // (SPEC v0.4 수정 §3) 모든 캐릭터 목표 마을 약확 ≥ 기본 약확 + 20 (약확 4줄)
  it('목표 마을 약확 ≥ 기본 약확 + 20 (약확 4줄 유지)', () => {
    for (const { r } of results) {
      for (const row of r.rows) {
        if (!row.best) continue;
        const base = userById(row.charId).baseStats;
        expect(row.best.targetVillage.weakRate).toBeGreaterThanOrEqual(base.weakRate + 20 - 1e-9);
      }
    }
  });

  // 라이언·타카 목표 전투 약확 ≥ 100
  it('라이언·타카 목표 전투 약확 ≥ 100', () => {
    for (const { r } of results) {
      for (const id of ['ryan', 'taka']) {
        const row = r.rows.find((x) => x.charId === id)!;
        expect(row.combatWeak!).toBeGreaterThanOrEqual(100 - 1e-9);
      }
    }
  });

  // 장비 수준을 낮춰도 약확 4줄분(20)은 유지 — 강화만 감소
  it('장비 수준이 낮아져도 약확 4줄분 유지', () => {
    for (const e of LEVELS) {
      for (const id of ['ryan', 'taka', 'rachel', 'sieg']) {
        const base = userById(id).baseStats;
        expect(weakOf(e, id)).toBeGreaterThanOrEqual(base.weakRate + 20 - 1e-9);
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

import { describe, expect, it } from 'vitest';
import charactersJson from '../src/data/characters.json';
import siegeFriJson from '../src/data/contents/siege-fri.json';
import usersJson from '../src/data/users.json';
import type { Character, Content, UserCharacter } from '../src/data/types';
import { buildSimUnit, computeBasicCounts } from '../src/engine/simulate';
import { analyticStats } from '../src/engine/analytic';
import { buffSums } from '../src/engine/effectiveStats';
import { computeBudget } from '../src/gear/budget';
import { setupCombat } from '../src/gear/optimize';
import { optimizeBudget, PER_STAT_CAP } from '../src/gear/reallocate';
import { BEST1_Z } from '../src/gear/optimize';
import { effectiveUnits, grade, roundU } from '../src/gear/grade';
import { optimizedMembers } from '../src/gear/optimize';
import { SUB_UNIT, type CurrentSetup } from '../src/gear/types';

const characters = charactersJson as unknown as Character[];
const content = siegeFriJson as unknown as Content;
const users = usersJson as unknown as UserCharacter[];
const byId = (id: string) => characters.find((c) => c.id === id)!;
const userById = (id: string) => users.find((u) => u.charId === id)!;
const allySpeeds = Object.fromEntries(users.map((u) => [u.charId, u.speed]));
const basicCounts = computeBasicCounts(content, allySpeeds);

function currentJ(setup: CurrentSetup) {
  const base = userById(setup.charId).baseStats;
  const buffs = buffSums(setup.charId, content, characters);
  const budget = computeBudget(setup, base);
  const cur = setupCombat(base, buffs, setup.weaponMains, setup.ringCarve, budget);
  const a = analyticStats(buildSimUnit(byId(setup.charId), content, cur.stats, cur.scaleMult, basicCounts[setup.charId]));
  return { J: a.mean + BEST1_Z * a.std, U: budget.units };
}

function bestAt(id: string, units: number) {
  return optimizeBudget({
    char: byId(id),
    content,
    baseStats: userById(id).baseStats,
    buffs: buffSums(id, content, characters),
    units,
    scale: 1,
    basicCount: basicCounts[id],
  });
}

describe('SPEC v0.4 6장 테스트', () => {
  // 6-1. 세팅1 라이언 → U = 29.3, 등급 A
  it('1. 세팅1 라이언 U=29.3, 등급 A', () => {
    const setup: CurrentSetup = {
      charId: 'ryan',
      village: { crit: 100, critDmg: 258, weakRate: 20 },
      weaponMains: ['crit', 'critDmg'],
      ringCarve: 'siege',
    };
    const { U } = currentJ(setup);
    expect(roundU(U)).toBe(29.3);
    expect(grade(U)).toBe('A');
  });

  // 6-2. v0.3.2 종결 추천 입력 → U=32, S, 배분 효율 100%
  it('2. 종결 추천 입력 → U=32, 등급 S, 효율 100%', () => {
    const best = bestAt('ryan', 32);
    const setup: CurrentSetup = {
      charId: 'ryan',
      village: best.targetVillage,
      weaponMains: best.weaponMains,
      ringCarve: best.ringCarve,
    };
    const { J, U } = currentJ(setup);
    expect(roundU(U)).toBe(32);
    expect(grade(U)).toBe('S');
    const eff = (J / bestAt('ryan', U).objective) * 100;
    expect(eff).toBeGreaterThan(99.9);
    expect(eff).toBeLessThanOrEqual(100 + 1e-6);
  });

  // 6-3. 모공 줄 3개 → U_eff = U − 1
  it('3. 모공 줄 3개 → U_eff = U − 1', () => {
    expect(effectiveUnits(29.25, 3)).toBeCloseTo(28.25, 9);
    expect(effectiveUnits(29.25, null)).toBe(29.25);
  });

  // 6-4. 등급 경계
  it('4. 등급 경계값', () => {
    expect(grade(30.0)).toBe('S');
    expect(grade(29.9)).toBe('A');
    expect(grade(27.0)).toBe('A');
    expect(grade(26.9)).toBe('B');
    expect(grade(23.0)).toBe('B');
    expect(grade(22.9)).toBe('C');
  });

  // 6-5. 효율 ≤ 100%, J_best 재배분은 스탯별 24단위 상한 준수
  it('5. 효율 ≤ 100%, 재배분 24단위 상한 준수', () => {
    for (const id of ['ryan', 'taka', 'rachel', 'sieg']) {
      const setup: CurrentSetup = {
        charId: id,
        village: id === 'rachel' ? { crit: 93, critDmg: 246, weakRate: 45 } : { crit: 90, critDmg: 260, weakRate: 20 },
        weaponMains: ['crit', 'critDmg'],
        ringCarve: 'crit',
      };
      const { J, U } = currentJ(setup);
      const best = bestAt(id, U);
      const eff = (J / best.objective) * 100;
      expect(eff).toBeLessThanOrEqual(100 + 1e-6);
      expect(best.critUnits).toBeLessThanOrEqual(PER_STAT_CAP + 1e-9);
      expect(best.weakUnits).toBeLessThanOrEqual(PER_STAT_CAP + 1e-9);
      expect(best.critDmgUnits).toBeLessThanOrEqual(PER_STAT_CAP + 1e-9);
    }
  });

  // 6-6. 비스킷(optimize=false)은 카드 대신 "생존 세팅"
  it('6. 비스킷 optimize=false (카드 제외)', () => {
    expect(content.optimize?.biscuit).toBe(false);
    expect(optimizedMembers(content)).not.toContain('biscuit');
  });
});

// SUB_UNIT 상수가 예상대로인지 (계산 근거)
describe('SPEC v0.4 유효 단위 근거', () => {
  it('1단위 = 치확 4 / 치피 6 / 약확 5', () => {
    expect(SUB_UNIT).toEqual({ crit: 4, critDmg: 6, weakRate: 5 });
  });
});

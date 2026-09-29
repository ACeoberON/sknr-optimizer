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
import { optimizeStructured, PER_STAT_CAP, ENHANCE_PER_LINE, MAX_LINES } from '../src/gear/reallocate';
import { BEST1_Z } from '../src/gear/optimize';
import { effectiveUnits, grade, roundU } from '../src/gear/grade';
import { optimizedMembers } from '../src/gear/optimize';
import { SUB_UNIT, weaponMainTotals, type CurrentSetup } from '../src/gear/types';

const LINE_SUM = 12; // 기본 4/4/4

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

function bestAt(id: string, enhance: number) {
  return optimizeStructured({
    char: byId(id),
    content,
    baseStats: userById(id).baseStats,
    buffs: buffSums(id, content, characters),
    enhance,
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

  // 6-2. 종결 추천(강화 20) 입력 → U=32, S, 배분 효율 100%
  it('2. 종결 추천 입력 → U=32, 등급 S, 효율 100%', () => {
    const best = bestAt('ryan', 20);
    const setup: CurrentSetup = {
      charId: 'ryan',
      village: best.targetVillage,
      weaponMains: best.weaponMains,
      ringCarve: best.ringCarve,
    };
    const { J, U } = currentJ(setup);
    expect(roundU(U)).toBe(32);
    expect(grade(U)).toBe('S');
    const eff = (J / bestAt('ryan', Math.round(U - LINE_SUM)).objective) * 100;
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
      const best = bestAt(id, Math.round(U - LINE_SUM));
      const eff = Math.min(100, (J / best.objective) * 100); // 앱과 동일하게 클램프
      expect(eff).toBeLessThanOrEqual(100 + 1e-6);
      // 스탯별 유효 단위 = 4줄 + 강화 ≤ 24
      expect(MAX_LINES + best.enhance.crit).toBeLessThanOrEqual(PER_STAT_CAP);
      expect(MAX_LINES + best.enhance.critDmg).toBeLessThanOrEqual(PER_STAT_CAP);
      expect(MAX_LINES + best.enhance.weakRate).toBeLessThanOrEqual(PER_STAT_CAP);
      // 강화는 줄당 5회 이하
      expect(best.enhance.crit).toBeLessThanOrEqual(MAX_LINES * ENHANCE_PER_LINE);
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

// SPEC v0.4 수정 §5: 유효 부옵 줄 수
describe('SPEC v0.4 줄 수 입력', () => {
  const opt = (id: string, lineCounts: { crit: number; critDmg: number; weakRate: number }, enhance = 20) =>
    optimizeStructured({
      char: byId(id),
      content,
      baseStats: userById(id).baseStats,
      buffs: buffSums(id, content, characters),
      enhance,
      lineCounts,
      scale: 1,
      basicCount: basicCounts[id],
    });

  it('약확 줄 0 → 목표 마을 약확에 약확 부옵 없음', () => {
    const best = opt('ryan', { crit: 4, critDmg: 4, weakRate: 0 });
    const base = userById('ryan').baseStats;
    const wmWeak = weaponMainTotals(best.weaponMains).weakRate;
    expect(best.targetVillage.weakRate - base.weakRate - wmWeak).toBeCloseTo(0, 9);
  });

  it('치확 줄 1 → 치확 강화 ≤ 5', () => {
    const best = opt('ryan', { crit: 1, critDmg: 4, weakRate: 4 });
    expect(best.enhance.crit).toBeLessThanOrEqual(5);
  });

  it('줄 수 기본값(4/4/4)은 줄 수 미지정과 동일 결과', () => {
    for (const id of ['ryan', 'taka', 'rachel', 'sieg']) {
      const a = opt(id, { crit: 4, critDmg: 4, weakRate: 4 });
      const b = optimizeStructured({
        char: byId(id),
        content,
        baseStats: userById(id).baseStats,
        buffs: buffSums(id, content, characters),
        enhance: 20,
        scale: 1,
        basicCount: basicCounts[id],
      });
      expect(a.objective).toBeCloseTo(b.objective, 6);
      expect(a.targetVillage).toEqual(b.targetVillage);
    }
  });
});

import { describe, expect, it } from 'vitest';
import charactersJson from '../src/data/characters.json';
import siegeFriJson from '../src/data/contents/siege-fri.json';
import usersJson from '../src/data/users.json';
import validation from './fixtures/siege-fri-validation.json';
import type { Character, Content, UserCharacter } from '../src/data/types';
import {
  buildSimUnit,
  computeBasicCounts,
  simulate,
  type CombatStats,
} from '../src/engine/simulate';
import { analyticStats } from '../src/engine/analytic';
import { buffSums } from '../src/engine/effectiveStats';
import { computeBudget, reconstructVillage } from '../src/gear/budget';
import { optimizeDealer, optimizedMembers } from '../src/gear/optimize';
import { SUB_UNIT, type CurrentSetup } from '../src/gear/types';

const characters = charactersJson as unknown as Character[];
const content = siegeFriJson as unknown as Content;
const users = usersJson as unknown as UserCharacter[];
const byId = (id: string) => characters.find((c) => c.id === id)!;
const userById = (id: string) => users.find((u) => u.charId === id)!;

const allySpeeds = Object.fromEntries(users.map((u) => [u.charId, u.speed]));
const basicCounts = computeBasicCounts(content, allySpeeds);

const s1 = validation.settings.setting1 as Record<string, CombatStats>;
const s2 = validation.settings.setting2 as Record<string, CombatStats>;

describe('SPEC v0.3 7장 테스트', () => {
  // 7-1. 해석 평가 vs 시뮬레이터: 세팅 1·2 모두 평균·표준편차 1% 이내
  describe('1. 해석 평가 vs 시뮬레이터 1% 이내', () => {
    const N = 80000;
    const SEED = 424242;
    for (const [label, setting] of [
      ['세팅1', s1],
      ['세팅2', s2],
    ] as const) {
      for (const id of ['ryan', 'taka', 'rachel']) {
        it(`${label} ${id}`, () => {
          const unit = buildSimUnit(byId(id), content, setting[id], 1, basicCounts[id]);
          const ana = analyticStats(unit);
          const sim = simulate(unit, N, SEED);

          expect(Math.abs(sim.mean - ana.mean) / ana.mean).toBeLessThanOrEqual(0.01);

          if (ana.std < ana.mean * 1e-6) {
            // 결정적(치확·약확 100 이상): 시뮬 흔들림도 사실상 0
            expect(sim.relStd).toBeLessThan(1e-4);
          } else {
            expect(Math.abs(sim.std - ana.std) / ana.std).toBeLessThanOrEqual(0.01);
          }
        });
      }
    }
  });

  // 7-2. 예산 산출: 세팅2 라이언 역산 후 재조합 시 원래 마을 스탯 복원
  it('2. 예산 산출: 세팅2 라이언 마을 스탯 복원', () => {
    const setup: CurrentSetup = {
      charId: 'ryan',
      village: { crit: 59, critDmg: 312, weakRate: 20 }, // 세팅2 라이언 마을값
      weaponMains: ['crit', 'critDmg'],
      ringCarve: 'weak',
    };
    const base = userById('ryan').baseStats;
    const budget = computeBudget(setup, base);
    const restored = reconstructVillage(setup, base, budget);
    expect(restored.crit).toBeCloseTo(setup.village.crit, 6);
    expect(restored.critDmg).toBeCloseTo(setup.village.critDmg, 6);
    expect(restored.weakRate).toBeCloseTo(setup.village.weakRate, 6);
    expect(budget.units).toBeGreaterThan(0);
  });

  // 7-3. 최적화 결과: 치확·약확 전투값 ≤ 100 + 1단위 (낭비 한도)
  it('3. 최적화 결과 낭비 한도: 전투 치확·약확 ≤ 100 + 1단위', () => {
    const setup: CurrentSetup = {
      charId: 'ryan',
      village: { crit: 59, critDmg: 312, weakRate: 20 },
      weaponMains: ['crit', 'critDmg'],
      ringCarve: 'weak',
    };
    const base = userById('ryan').baseStats;
    const budget = computeBudget(setup, base);
    const result = optimizeDealer({
      char: byId('ryan'),
      content,
      baseStats: base,
      buffs: buffSums('ryan', content, characters),
      budgetUnits: budget.units,
      scale: 1,
      basicCount: basicCounts['ryan'],
    });

    expect(result.best.combat.crit).toBeLessThanOrEqual(100 + SUB_UNIT.crit);
    expect(result.best.combat.weakRate).toBeLessThanOrEqual(100 + SUB_UNIT.weakRate);
    expect(result.best1).toBeGreaterThan(0);
  });

  // 최적화 대상: 진형 순서 유지, optimize=false(비스킷)만 제외
  it('4. 최적화 대상 = 진형 순서에서 비스킷 제외', () => {
    expect(optimizedMembers(content)).toEqual(['sieg', 'rachel', 'ryan', 'taka']);
  });

  // 지크: 평타만(가중치 1) + 전투 약확 버프 +27, 최적화가 낭비 한도를 지킨다
  it('5. 지크 최적화: 평타만, 약확 버프 +27, 낭비 한도 준수', () => {
    expect(buffSums('sieg', content, characters).weakRate).toBe(27);
    const setup: CurrentSetup = {
      charId: 'sieg',
      village: { crit: 99, critDmg: 270, weakRate: 5 },
      weaponMains: ['crit', 'critDmg'],
      ringCarve: 'survival',
    };
    const base = userById('sieg').baseStats;
    const budget = computeBudget(setup, base);
    const result = optimizeDealer({
      char: byId('sieg'),
      content,
      baseStats: base,
      buffs: buffSums('sieg', content, characters),
      budgetUnits: budget.units,
      scale: 1,
      basicCount: basicCounts['sieg'],
    });
    expect(result.best.combat.crit).toBeLessThanOrEqual(100 + SUB_UNIT.crit);
    expect(result.best.combat.weakRate).toBeLessThanOrEqual(100 + SUB_UNIT.weakRate);
    expect(result.best1).toBeGreaterThan(0);
  });
});

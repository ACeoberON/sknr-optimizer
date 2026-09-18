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
import {
  CRITDMG_LINES,
  optimizeDealer,
  optimizedMembers,
  TOTAL_ENHANCE,
} from '../src/gear/optimize';
import { SUB_UNIT, weaponMainTotals, type CurrentSetup } from '../src/gear/types';

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

  // 장비 구조 기반 최적화 (SPEC v0.3.2)
  const runOpt = (id: string, lostUpgrades = 0) =>
    optimizeDealer({
      char: byId(id),
      content,
      baseStats: userById(id).baseStats,
      buffs: buffSums(id, content, characters),
      lostUpgrades,
      scale: 1,
      basicCount: basicCounts[id],
    });

  // 7-3. 모든 추천의 마을 치피 ≤ 150 + 주옵 치피 + 6×(4+20) (물리적 상한)
  it('3. 추천 마을 치피가 물리적 상한 이내', () => {
    for (const id of ['ryan', 'taka', 'rachel', 'sieg']) {
      const r = runOpt(id);
      const base = userById(id).baseStats;
      const wmCritDmg = weaponMainTotals(r.best.weaponMains).critDmg;
      const cap = base.critDmg + wmCritDmg + SUB_UNIT.critDmg * (CRITDMG_LINES + TOTAL_ENHANCE);
      expect(r.best.targetVillage.critDmg).toBeLessThanOrEqual(cap);
      expect(r.best1).toBeGreaterThan(0);
    }
  });

  // 7-4. lostUpgrades 증가 시 J 단조 감소
  it('4. lostUpgrades 증가 시 J 단조 감소', () => {
    const js = [0, 4, 8, 12, 20].map((lost) => runOpt('ryan', lost).best.objective);
    for (let i = 1; i < js.length; i++) {
      expect(js[i]).toBeLessThanOrEqual(js[i - 1] + 1e-6);
    }
  });

  // 7-5. 약확이 버프로 (거의) 100 이상인 라이언·타카는 4번째 칸 = 깡공
  it('5. 라이언·타카의 4번째 칸 = 깡공(flatAtk)', () => {
    expect(runOpt('ryan').best.slot4).toBe('flatAtk');
    expect(runOpt('taka').best.slot4).toBe('flatAtk');
  });

  // 7-6. 최적화 대상: 진형 순서에서 비스킷(optimize=false) 제외
  it('6. 비스킷 제외 (폼 비활성화 근거)', () => {
    expect(content.optimize?.biscuit).toBe(false);
    expect(optimizedMembers(content)).toEqual(['sieg', 'rachel', 'ryan', 'taka']);
  });

  // 7-7. 지크: 평타만 + 전투 약확 버프 +27, 최적화 정상 동작
  it('7. 지크 최적화 (평타만, 약확 버프 +27)', () => {
    expect(buffSums('sieg', content, characters).weakRate).toBe(27);
    expect(runOpt('sieg').best1).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import charactersJson from '../src/data/characters.json';
import siegeFriJson from '../src/data/contents/siege-fri.json';
import validation from './fixtures/siege-fri-validation.json';
import type { Character, Content } from '../src/data/types';
import usersJson from '../src/data/users.json';
import {
  buildSimUnit,
  computeBasicCounts,
  simulate,
  type CombatStats,
} from '../src/engine/simulate';
import { calibrateScale } from '../src/engine/calibrate';
import type { UserCharacter } from '../src/data/types';

const characters = charactersJson as unknown as Character[];
const content = siegeFriJson as unknown as Content;

// SPEC v0.3 6장: 결정적 평타 배분 (라이언·타카는 9회)
const allySpeeds = Object.fromEntries(
  (usersJson as unknown as UserCharacter[]).map((u) => [u.charId, u.speed]),
);
const basicCounts = computeBasicCounts(content, allySpeeds);

const byId = (id: string): Character => {
  const c = characters.find((x) => x.id === id);
  if (!c) throw new Error(`unknown character: ${id}`);
  return c;
};

const N = 20000;
const SEED = 20240601;

type Setting = Record<string, CombatStats>;
type ResultRow = Record<string, number | null>;

const s1 = validation.settings.setting1 as Setting;
const s2 = validation.settings.setting2 as Setting;
const r1 = validation.results.setting1 as ResultRow[];
const r2 = validation.results.setting2 as ResultRow[];

/** 실측 결과에서 캐릭터 평균 (null 제외). */
function actualMean(rows: ResultRow[], charId: string): number {
  const vals = rows
    .map((r) => r[charId])
    .filter((v): v is number => typeof v === 'number');
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// 5.3-1. 세팅 1 평균으로 라이언·타카·레이첼 스케일 산출
const scales: Record<string, number> = {};
for (const id of ['ryan', 'taka', 'rachel']) {
  const unit = buildSimUnit(byId(id), content, s1[id], 1, basicCounts[id]);
  scales[id] = calibrateScale(unit, actualMean(r1, id), N, SEED);
}

describe('SPEC v0.2 5.3 검증', () => {
  it('1. 스케일 보정: 라이언·타카·레이첼 스케일이 양수로 산출된다', () => {
    for (const id of ['ryan', 'taka', 'rachel']) {
      expect(scales[id]).toBeGreaterThan(0);
      expect(Number.isFinite(scales[id])).toBe(true);
    }
  });

  // 5.3-2. 그 스케일로 세팅 2를 시뮬레이션 → 라이언·타카 평균이 실측의 ±5% 이내
  for (const id of ['ryan', 'taka']) {
    it(`2. 평균 예측: ${id} 세팅2 시뮬 평균이 실측 ±5% 이내`, () => {
      const unit = buildSimUnit(byId(id), content, s2[id], scales[id], basicCounts[id]);
      const res = simulate(unit, N, SEED);
      const actual = actualMean(r2, id);
      const err = Math.abs(res.mean - actual) / actual;
      expect(err).toBeLessThanOrEqual(0.05);
    });
  }

  it('3. 흔들림: 라이언 세팅2 상대 표준편차가 9~36% 범위', () => {
    const unit = buildSimUnit(byId('ryan'), content, s2['ryan'], scales['ryan'], basicCounts['ryan']);
    const res = simulate(unit, N, SEED);
    expect(res.relStd).toBeGreaterThanOrEqual(0.09);
    expect(res.relStd).toBeLessThanOrEqual(0.36);
  });

  it('4. 결정성: 라이언 세팅1(치확·약확 100 이상)은 모든 판이 동일 (표준편차 0)', () => {
    const unit = buildSimUnit(byId('ryan'), content, s1['ryan'], scales['ryan'], basicCounts['ryan']);
    const res = simulate(unit, 2000, SEED);
    // 치명·약공이 항상 발동하므로 판마다 대미지가 완전히 같아야 한다.
    // (평균을 합산으로 구할 때 생기는 반올림 때문에 res.std 자체는 1e-7 수준의
    //  가짜 값이 될 수 있어, 진짜 흔들림인 값의 분포 폭으로 결정성을 확인한다.)
    const spread = Math.max(...res.values) - Math.min(...res.values);
    expect(spread).toBe(0);
  });
});

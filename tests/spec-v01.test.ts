import { describe, expect, it } from 'vitest';
import charactersJson from '../src/data/characters.json';
import siegeFriJson from '../src/data/contents/siege-fri.json';
import type { Character, Content } from '../src/data/types';
import { basicHits, skillHits } from '../src/engine/hits';
import { buffSums } from '../src/engine/effectiveStats';

const characters = charactersJson as unknown as Character[];
const content = siegeFriJson as unknown as Content;

const byId = (id: string): Character => {
  const c = characters.find((x) => x.id === id);
  if (!c) throw new Error(`unknown character: ${id}`);
  return c;
};

// SPEC 4장 테스트 표
const TABLE: { id: string; skill: number; basic: number; weak: number }[] = [
  { id: 'taka', skill: 21, basic: 8.5, weak: 81 },
  { id: 'ryan', skill: 21, basic: 8.5, weak: 81 },
  { id: 'rachel', skill: 18, basic: 8.5, weak: 27 },
  { id: 'sieg', skill: 0, basic: 8.5, weak: 27 },
  { id: 'biscuit', skill: 0, basic: 8.5, weak: 27 },
];

describe('SPEC 4장 v0.1 테스트 표', () => {
  for (const row of TABLE) {
    describe(row.id, () => {
      it(`스킬 판정 = ${row.skill}`, () => {
        expect(skillHits(byId(row.id), content)).toBe(row.skill);
      });

      it(`평타 판정 = ${row.basic}`, () => {
        expect(basicHits(content)).toBe(row.basic);
      });

      it(`전투 약확 버프 합 = ${row.weak}`, () => {
        expect(buffSums(row.id, content, characters).weakRate).toBe(row.weak);
      });
    });
  }
});

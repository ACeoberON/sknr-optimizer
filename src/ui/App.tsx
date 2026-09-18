import type { CSSProperties } from 'react';
import charactersJson from '../data/characters.json';
import siegeFriJson from '../data/contents/siege-fri.json';
import usersJson from '../data/users.json';
import type { Character, Content, UserCharacter } from '../data/types';
import { buffSums } from '../engine/effectiveStats';
import { buildSimUnit, simulate, type CombatStats } from '../engine/simulate';

const characters = charactersJson as unknown as Character[];
const content = siegeFriJson as unknown as Content;
const users = usersJson as unknown as UserCharacter[];

const N = 5000;
const SEED = 20240601;

const findChar = (id: string) => characters.find((c) => c.id === id);
const findUser = (id: string) => users.find((u) => u.charId === id);

/** 반지 전투 효과 (SPEC v0.2 2.2). */
function ringBonus(ring: UserCharacter['ring']): Partial<CombatStats> {
  switch (ring) {
    case 'crit':
      return { crit: 10 };
    case 'weak':
      return { weakRate: 12 };
    default:
      return {};
  }
}

/** 현재 계정 기준 전투 스탯 (마을 + 버프 + 반지 + 전투 전용, 상한 적용 전). */
function combatStats(user: UserCharacter): CombatStats {
  const buff = buffSums(user.charId, content, characters);
  const ring = ringBonus(user.ring);
  const b = user.battleOnlyBonus ?? {};
  return {
    crit: user.baseStats.crit + buff.crit + (ring.crit ?? 0) + (b.crit ?? 0),
    critDmg: user.baseStats.critDmg + buff.critDmg + (b.critDmg ?? 0),
    weakRate: user.baseStats.weakRate + buff.weakRate + (ring.weakRate ?? 0) + (b.weakRate ?? 0),
  };
}

const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

export function App() {
  const rows = content.lineup.map((id) => {
    const char = findChar(id);
    const user = findUser(id);
    if (!char || !user) return null;
    const unit = buildSimUnit(char, content, combatStats(user), 1);
    const res = simulate(unit, N, SEED);
    return { name: char.name, res };
  });

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 720 }}>
      <h1>sknr-optimizer</h1>
      <p>{content.name} · v0.2 몬테카를로 시뮬레이터</p>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            {['캐릭터', '평균 딜', '상대 편차', '베스트1 기대값'].map((h) => (
              <th key={h} style={{ ...cell, textAlign: 'left', borderBottom: '2px solid #888' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(
            (row) =>
              row && (
                <tr key={row.name}>
                  <td style={cell}>{row.name}</td>
                  <td style={num}>{fmt(row.res.mean)}</td>
                  <td style={num}>{(row.res.relStd * 100).toFixed(1)}%</td>
                  <td style={num}>{fmt(row.res.bestOf)}</td>
                </tr>
              ),
          )}
        </tbody>
      </table>
      <p style={{ color: '#666', fontSize: 13 }}>
        현재 계정(users.json) 기준 · 스케일 미보정({N.toLocaleString('ko-KR')}판, seed {SEED}). 절대값보다 상대 편차·분포를 보기 위한 데모.
      </p>
    </main>
  );
}

const cell: CSSProperties = { borderBottom: '1px solid #ddd', padding: '6px 10px' };
const num: CSSProperties = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

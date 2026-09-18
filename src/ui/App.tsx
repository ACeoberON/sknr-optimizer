import type { CSSProperties } from 'react';
import charactersJson from '../data/characters.json';
import siegeFriJson from '../data/contents/siege-fri.json';
import usersJson from '../data/users.json';
import type { Character, Content, UserCharacter } from '../data/types';
import { basicHits, skillHits } from '../engine/hits';
import { buffSums, effectiveStats } from '../engine/effectiveStats';

const characters = charactersJson as unknown as Character[];
const content = siegeFriJson as unknown as Content;
const users = usersJson as unknown as UserCharacter[];

const findChar = (id: string) => characters.find((c) => c.id === id);
const findUser = (id: string) => users.find((u) => u.charId === id);

export function App() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 760 }}>
      <h1>sknr-optimizer</h1>
      <p>{content.name} · v0.1 (데이터 계층 · 판정 수 계산)</p>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            {['캐릭터', '스킬 판정', '평타 판정', '약확 버프', '실효 약확'].map((h) => (
              <th key={h} style={{ textAlign: 'left', borderBottom: '2px solid #888', padding: '6px 10px' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {content.lineup.map((id) => {
            const char = findChar(id);
            const user = findUser(id);
            if (!char || !user) return null;
            const weak = effectiveStats(user, content, characters).weakRate;
            return (
              <tr key={id}>
                <td style={cell}>{char.name}</td>
                <td style={cell}>{skillHits(char, content)}</td>
                <td style={cell}>{basicHits(content)}</td>
                <td style={cell}>{buffSums(id, content, characters).weakRate}</td>
                <td style={cell}>{weak.total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}

const cell: CSSProperties = {
  borderBottom: '1px solid #ddd',
  padding: '6px 10px',
};

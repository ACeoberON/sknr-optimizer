import { SAMPLE_GEARS } from '../data/gears';
import { pickBest, scoreGear } from '../engine/optimize';
import type { Weights } from '../gear/types';

const WEIGHTS: Weights = { atk: 1, def: 1, hp: 0.5 };

export function App() {
  const best = pickBest(SAMPLE_GEARS, WEIGHTS);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>sknr-optimizer</h1>
      <p>가중치 · ATK {WEIGHTS.atk} / DEF {WEIGHTS.def} / HP {WEIGHTS.hp}</p>
      <ul>
        {SAMPLE_GEARS.map((gear) => (
          <li key={gear.id}>
            {gear.name} — 점수 {scoreGear(gear, WEIGHTS)}
          </li>
        ))}
      </ul>
      <p>
        <strong>추천 장비:</strong> {best ? best.name : '없음'}
      </p>
    </main>
  );
}

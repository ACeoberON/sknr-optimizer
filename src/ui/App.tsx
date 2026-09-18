import { useState, type CSSProperties } from 'react';
import charactersJson from '../data/characters.json';
import siegeFriJson from '../data/contents/siege-fri.json';
import usersJson from '../data/users.json';
import type { Character, Content, UserCharacter } from '../data/types';
import { computeBasicCounts } from '../engine/simulate';
import { BEST1_Z, optimizedMembers } from '../gear/optimize';
import type { MainStat, RingCarve, CurrentSetup } from '../gear/types';
import { analyzeDealer, type DealerReport } from './analyze';

const characters = charactersJson as unknown as Character[];
const content = siegeFriJson as unknown as Content;
const users = usersJson as unknown as UserCharacter[];

const allySpeeds = Object.fromEntries(users.map((u) => [u.charId, u.speed]));
const basicCounts = computeBasicCounts(content, allySpeeds);
const OPTIMIZED = optimizedMembers(content); // 진형 순서, 최적화 대상만

const MAIN_OPTS: MainStat[] = ['crit', 'critDmg', 'weakRate'];
const RING_OPTS: RingCarve[] = ['crit', 'weak', 'siege', 'survival'];
const STAT_KO: Record<MainStat, string> = { crit: '치확', critDmg: '치피', weakRate: '약확' };
const RING_KO: Record<RingCarve, string> = {
  crit: '치확+10',
  weak: '약확+12',
  siege: '공성×1.04',
  survival: '생존(효과 없음)',
};

// 실제 현재 세팅 기본값
const DEFAULTS: Record<string, CurrentSetup> = {
  sieg: { charId: 'sieg', village: { crit: 99, critDmg: 270, weakRate: 5 }, weaponMains: ['crit', 'critDmg'], ringCarve: 'survival' },
  rachel: { charId: 'rachel', village: { crit: 93, critDmg: 246, weakRate: 45 }, weaponMains: ['crit', 'critDmg'], ringCarve: 'crit' },
  ryan: { charId: 'ryan', village: { crit: 100, critDmg: 258, weakRate: 20 }, weaponMains: ['crit', 'critDmg'], ringCarve: 'siege' },
  taka: { charId: 'taka', village: { crit: 99, critDmg: 270, weakRate: 20 }, weaponMains: ['crit', 'critDmg'], ringCarve: 'siege' },
};

const findChar = (id: string) => characters.find((c) => c.id === id)!;
const findUser = (id: string) => users.find((u) => u.charId === id)!;
const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

/** 팀 목적함수 J = Σμ + 1.163√(Σσ²). */
function teamObjective(means: number[], stds: number[]): number {
  const sumMean = means.reduce((a, b) => a + b, 0);
  const sumVar = stds.reduce((a, b) => a + b * b, 0);
  return sumMean + BEST1_Z * Math.sqrt(sumVar);
}

export function App() {
  const [setups, setSetups] = useState<Record<string, CurrentSetup>>(() => structuredClone(DEFAULTS));
  const [reports, setReports] = useState<DealerReport[] | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (id: string, patch: Partial<CurrentSetup>) =>
    setSetups((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
  const updateVillage = (id: string, key: keyof CurrentSetup['village'], v: number) =>
    setSetups((s) => ({ ...s, [id]: { ...s[id], village: { ...s[id].village, [key]: v } } }));

  const run = () => {
    setBusy(true);
    setTimeout(() => {
      const out = OPTIMIZED.map((id) =>
        analyzeDealer(setups[id], findChar(id), findUser(id), content, characters, basicCounts[id]),
      );
      setReports(out);
      setBusy(false);
    }, 20);
  };

  const teamCurrent = reports && teamObjective(reports.map((r) => r.currentMean), reports.map((r) => r.currentStd));
  const teamTarget = reports && teamObjective(reports.map((r) => r.target.mean), reports.map((r) => r.target.std));
  const teamDelta = teamCurrent && teamTarget ? ((teamTarget - teamCurrent) / teamCurrent) * 100 : 0;

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 860, margin: '0 auto' }}>
      <h1>sknr-optimizer</h1>
      <p>{content.name} · v0.3 세팅 최적화기 (현재 스탯 기준)</p>

      {content.lineup.map((id) => {
        const char = findChar(id);
        const optimized = content.optimize?.[id] !== false;
        if (!optimized) {
          return (
            <fieldset key={id} style={{ ...fs, background: '#f2f2f2', color: '#999' }} disabled>
              <legend style={{ fontWeight: 600, color: '#999' }}>{char.name}</legend>
              <span style={{ fontSize: 13 }}>생존 세팅 (최적화 제외)</span>
            </fieldset>
          );
        }
        const s = setups[id];
        return (
          <fieldset key={id} style={fs}>
            <legend style={{ fontWeight: 600 }}>{char.name}</legend>
            <div style={row}>
              {(['crit', 'critDmg', 'weakRate'] as const).map((k) => (
                <label key={k} style={lbl}>
                  마을 {STAT_KO[k]}
                  <input
                    type="number"
                    value={s.village[k]}
                    onChange={(e) => updateVillage(id, k, Number(e.target.value))}
                    style={inp}
                  />
                </label>
              ))}
              {[0, 1].map((i) => (
                <label key={i} style={lbl}>
                  무기 주옵{i + 1}
                  <select
                    value={s.weaponMains[i]}
                    onChange={(e) => {
                      const mains = [...s.weaponMains] as [MainStat, MainStat];
                      mains[i] = e.target.value as MainStat;
                      update(id, { weaponMains: mains });
                    }}
                    style={inp}
                  >
                    {MAIN_OPTS.map((m) => (
                      <option key={m} value={m}>{STAT_KO[m]}</option>
                    ))}
                  </select>
                </label>
              ))}
              <label style={lbl}>
                장신구 세공
                <select value={s.ringCarve} onChange={(e) => update(id, { ringCarve: e.target.value as RingCarve })} style={inp}>
                  {RING_OPTS.map((r) => (
                    <option key={r} value={r}>{RING_KO[r]}</option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>
        );
      })}

      <button onClick={run} disabled={busy} style={btn}>
        {busy ? '계산 중…' : '최적화 실행'}
      </button>

      {reports && (
        <div style={{ marginTop: 20 }}>
          <section style={{ ...card, background: '#f0f6ff' }}>
            <strong>팀 목적함수</strong>{' '}
            <span style={{ color: teamDelta >= 0 ? '#137333' : '#c5221f' }}>({pct(teamDelta)})</span>
            <span style={muted}> · J = Σμ + 1.163√Σσ² (최적화 대상 {reports.length}명, 지크 포함)</span>
          </section>

          {reports.map((r) => (
            <section key={r.charId} style={card}>
              <h2 style={{ margin: '0 0 8px' }}>
                {r.name}{' '}
                <span style={{ color: r.deltaPct >= 0 ? '#137333' : '#c5221f', fontSize: 15 }}>
                  (현재 대비 {pct(r.deltaPct)})
                </span>
              </h2>
              <p style={muted}>예산 B = {r.budget.units.toFixed(1)}단위 · 예상 베스트1 {fmt(r.targetBest1)} (상대값)</p>

              <table style={table}>
                <tbody>
                  <tr>
                    <td style={th}>목표 마을 스탯</td>
                    <td style={td}>
                      치확 {fmt(r.target.targetVillage.crit)} / 치피 {fmt(r.target.targetVillage.critDmg)} / 약확 {fmt(r.target.targetVillage.weakRate)}
                    </td>
                  </tr>
                  <tr>
                    <td style={th}>무기 주옵</td>
                    <td style={td}>{r.target.weaponMains.map((m) => STAT_KO[m]).join(' + ')}</td>
                  </tr>
                  <tr>
                    <td style={th}>장신구 세공</td>
                    <td style={td}>{RING_KO[r.target.ringCarve]}</td>
                  </tr>
                  <tr>
                    <td style={th}>줄당 가치</td>
                    <td style={td}>
                      치확 +4 → {pct(r.marginal.crit)} · 치피 +6 → {pct(r.marginal.critDmg)} · 약확 +5 → {pct(r.marginal.weakRate)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {(r.wasteCritUnits > 0.05 || r.wasteWeakUnits > 0.05) && (
                <p style={warn}>
                  ⚠ 상한 초과 낭비(장비로 감축 가능):
                  {r.wasteCritUnits > 0.05 && ` 치확 약 ${r.wasteCritUnits.toFixed(1)}줄`}
                  {r.wasteWeakUnits > 0.05 && ` 약확 약 ${r.wasteWeakUnits.toFixed(1)}줄`}
                </p>
              )}
            </section>
          ))}
          <p style={muted}>
            베스트1은 스케일 미보정 상대값 · 증감(%)·줄당 가치는 스케일 무관. 공성 세공(×1.04)은 미검증 가정.
          </p>
        </div>
      )}
    </main>
  );
}

const fs: CSSProperties = { border: '1px solid #ddd', borderRadius: 8, padding: '8px 14px 14px', marginBottom: 12 };
const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 12 };
const lbl: CSSProperties = { display: 'flex', flexDirection: 'column', fontSize: 12, color: '#444', gap: 4 };
const inp: CSSProperties = { padding: '4px 6px', width: 96, fontSize: 14 };
const btn: CSSProperties = { padding: '8px 18px', fontSize: 15, cursor: 'pointer', borderRadius: 6, border: '1px solid #888', background: '#f4f4f4' };
const card: CSSProperties = { border: '1px solid #e0e0e0', borderRadius: 8, padding: 14, marginBottom: 12 };
const table: CSSProperties = { borderCollapse: 'collapse', width: '100%' };
const th: CSSProperties = { textAlign: 'left', padding: '4px 10px 4px 0', color: '#666', width: 120, verticalAlign: 'top', whiteSpace: 'nowrap' };
const td: CSSProperties = { padding: '4px 0' };
const muted: CSSProperties = { color: '#666', fontSize: 13 };
const warn: CSSProperties = { color: '#8a6d00', background: '#fff8e1', padding: '6px 10px', borderRadius: 6, fontSize: 13, margin: '8px 0 0' };

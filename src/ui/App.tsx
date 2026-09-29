import { useState, type CSSProperties } from 'react';
import charactersJson from '../data/characters.json';
import siegeFriJson from '../data/contents/siege-fri.json';
import usersJson from '../data/users.json';
import type { Character, Content, UserCharacter } from '../data/types';
import { computeBasicCounts } from '../engine/simulate';
import { optimizedMembers } from '../gear/optimize';
import type { MainStat, RingCarve, CurrentSetup } from '../gear/types';
import { ENDGAME_MAX_U } from '../gear/grade';
import { analyzeBasic, teamObjective, type BasicReport } from './analyze';

const characters = charactersJson as unknown as Character[];
const content = siegeFriJson as unknown as Content;
const users = usersJson as unknown as UserCharacter[];

const allySpeeds = Object.fromEntries(users.map((u) => [u.charId, u.speed]));
const basicCounts = computeBasicCounts(content, allySpeeds);
const OPTIMIZED = optimizedMembers(content);

const MAIN_OPTS: MainStat[] = ['crit', 'critDmg', 'weakRate'];
const RING_OPTS: RingCarve[] = ['crit', 'weak', 'siege', 'survival'];
const STAT_KO: Record<MainStat, string> = { crit: '치확', critDmg: '치피', weakRate: '약확' };
const RING_KO: Record<RingCarve, string> = { crit: '치확+10', weak: '약확+12', siege: '공성×1.04', survival: '생존(효과 없음)' };
const MOGONG_OPTS = ['모름', '0', '1', '2', '3', '4'];

const DEFAULTS: Record<string, CurrentSetup> = {
  sieg: { charId: 'sieg', village: { crit: 99, critDmg: 270, weakRate: 5 }, weaponMains: ['crit', 'critDmg'], ringCarve: 'survival', mogongLines: null },
  rachel: { charId: 'rachel', village: { crit: 93, critDmg: 246, weakRate: 45 }, weaponMains: ['crit', 'critDmg'], ringCarve: 'crit', mogongLines: null },
  ryan: { charId: 'ryan', village: { crit: 100, critDmg: 258, weakRate: 20 }, weaponMains: ['crit', 'critDmg'], ringCarve: 'siege', mogongLines: null },
  taka: { charId: 'taka', village: { crit: 99, critDmg: 270, weakRate: 20 }, weaponMains: ['crit', 'critDmg'], ringCarve: 'siege', mogongLines: null },
};

const GRADE_COLOR: Record<string, string> = { S: '#6a1b9a', A: '#137333', B: '#8a6d00', C: '#c5221f' };

const findChar = (id: string) => characters.find((c) => c.id === id)!;
const findUser = (id: string) => users.find((u) => u.charId === id)!;
const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

/** 재배분 제안 문구 생성. */
function suggestions(r: BasicReport, setup: CurrentSetup, reallocGain: number): string[] {
  const out: string[] = [];
  const diffs: { stat: MainStat; d: number }[] = [
    { stat: 'crit', d: r.currentSplit.critUnits - r.bestAtU.critUnits },
    { stat: 'critDmg', d: r.currentSplit.critDmgUnits - r.bestAtU.critDmgUnits },
    { stat: 'weakRate', d: r.currentSplit.weakUnits - r.bestAtU.weakUnits },
  ];
  const over = diffs.slice().sort((a, b) => b.d - a.d)[0];
  const under = diffs.slice().sort((a, b) => a.d - b.d)[0];
  if (over.d > 0.3 && under.d < -0.3 && reallocGain > 0.05) {
    out.push(`${STAT_KO[over.stat]} ${over.d.toFixed(1)}줄 과다 → ${STAT_KO[under.stat]}로 옮기면 팀 ${pct(reallocGain)}`);
  }
  const curMains = [...setup.weaponMains].sort().join();
  const bestMains = [...r.bestAtU.weaponMains].sort().join();
  if (curMains !== bestMains) {
    out.push(`무기 주옵 → ${r.bestAtU.weaponMains.map((m) => STAT_KO[m]).join(' + ')} 추천`);
  }
  if (setup.ringCarve !== r.bestAtU.ringCarve) {
    out.push(`세공 ${RING_KO[setup.ringCarve]} → ${RING_KO[r.bestAtU.ringCarve]} 추천`);
  }
  if (!r.mogongKnown) out.push('모공 줄 여부 미반영');
  return out;
}

export function App() {
  const [tab, setTab] = useState<'basic' | 'standard'>('basic');
  const [setups, setSetups] = useState<Record<string, CurrentSetup>>(() => structuredClone(DEFAULTS));
  const [reports, setReports] = useState<BasicReport[] | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (id: string, patch: Partial<CurrentSetup>) => setSetups((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
  const updateVillage = (id: string, key: keyof CurrentSetup['village'], v: number) =>
    setSetups((s) => ({ ...s, [id]: { ...s[id], village: { ...s[id].village, [key]: v } } }));

  const run = () => {
    setBusy(true);
    setTimeout(() => {
      setReports(
        OPTIMIZED.map((id) => analyzeBasic(setups[id], findChar(id), findUser(id), content, characters, basicCounts[id])),
      );
      setBusy(false);
    }, 20);
  };

  // 팀 목적함수 계산
  let teamNow = 0;
  let teamDelta = 0;
  const perChar: { report: BasicReport; deltaC: number; reallocGain: number; priority: number }[] = [];
  if (reports) {
    const cMeans = reports.map((r) => r.currentMean);
    const cStds = reports.map((r) => r.currentStd);
    teamNow = teamObjective(cMeans, cStds);
    const teamWith = (i: number, mean: number, std: number) => {
      const m = [...cMeans];
      m[i] = mean;
      const s = [...cStds];
      s[i] = std;
      return teamObjective(m, s);
    };
    const teamTarget = teamObjective(reports.map((r) => r.target.mean), reports.map((r) => r.target.std));
    teamDelta = ((teamTarget - teamNow) / teamNow) * 100;
    reports.forEach((report, i) => {
      const deltaC = ((teamWith(i, report.target.mean, report.target.std) - teamNow) / teamNow) * 100;
      const reallocGain = ((teamWith(i, report.bestAtU.mean, report.bestAtU.std) - teamNow) / teamNow) * 100;
      const priority =
        ((teamWith(i, report.bestAtUPlus.mean, report.bestAtUPlus.std) - teamWith(i, report.bestAtU.mean, report.bestAtU.std)) /
          teamNow) *
        100;
      perChar.push({ report, deltaC, reallocGain, priority });
    });
  }
  const priorityOrder = [...perChar].sort((a, b) => b.priority - a.priority);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 860, margin: '0 auto' }}>
      <h1>sknr-optimizer</h1>
      <p>{content.name} · v0.4 장비 등급 판정</p>

      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #ddd', marginBottom: 16 }}>
        {(['basic', 'standard'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={tabBtn(tab === t)}>
            {t === 'basic' ? 'Basic' : 'Standard'}
          </button>
        ))}
      </div>

      {tab === 'standard' && <p style={muted}>Standard(장비 개별 입력) 모드는 준비 중입니다.</p>}

      {tab === 'basic' && (
        <>
          {content.lineup.map((id) => {
            const char = findChar(id);
            if (content.optimize?.[id] === false) {
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
                      <input type="number" value={s.village[k]} onChange={(e) => updateVillage(id, k, Number(e.target.value))} style={inp} />
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
                      {RING_OPTS.map((rc) => (
                        <option key={rc} value={rc}>{RING_KO[rc]}</option>
                      ))}
                    </select>
                  </label>
                  <label style={lbl}>
                    부옵 모공 줄
                    <select
                      value={s.mogongLines == null ? '모름' : String(s.mogongLines)}
                      onChange={(e) => update(id, { mogongLines: e.target.value === '모름' ? null : Number(e.target.value) })}
                      style={inp}
                    >
                      {MOGONG_OPTS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </fieldset>
            );
          })}

          <button onClick={run} disabled={busy} style={btn}>
            {busy ? '계산 중…' : '등급 판정'}
          </button>

          {reports && (
            <div style={{ marginTop: 20 }}>
              <section style={{ ...card, background: '#f0f6ff' }}>
                <strong>팀 요약</strong> · 현재 → 종결 목표 <span style={{ color: teamDelta >= 0 ? '#137333' : '#c5221f' }}>{pct(teamDelta)}</span>
                <div style={{ ...muted, marginTop: 6 }}>
                  장비 개선 우선순위 (유효 단위 +1당 팀 J):{' '}
                  {priorityOrder.map((p, i) => (
                    <span key={p.report.charId}>
                      {i > 0 && ' > '}
                      {p.report.name} {pct(p.priority)}
                    </span>
                  ))}
                </div>
              </section>

              {perChar.map(({ report: r, deltaC, reallocGain }) => (
                <section key={r.charId} style={card}>
                  <h2 style={{ margin: '0 0 6px', fontSize: 17 }}>
                    {r.name}{' '}
                    <span style={{ color: GRADE_COLOR[r.grade], fontWeight: 700 }}>장비 {r.grade}</span>{' '}
                    <span style={muted}>
                      ({r.uDisplay} / {ENDGAME_MAX_U}) · 배분 효율 {r.efficiency.toFixed(0)}%
                    </span>
                  </h2>
                  <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
                    {suggestions(r, setups[r.charId], reallocGain).map((line, i) => (
                      <li key={i} style={{ fontSize: 13, color: '#333' }}>{line}</li>
                    ))}
                  </ul>
                  <p style={{ ...muted, margin: '4px 0 0' }}>
                    종결 목표: 치확 {fmt(r.target.targetVillage.crit)} / 치피 {fmt(r.target.targetVillage.critDmg)} / 약확 {fmt(r.target.targetVillage.weakRate)}
                    {' · '}주옵 {r.target.weaponMains.map((m) => STAT_KO[m]).join('+')} · 세공 {RING_KO[r.target.ringCarve]}
                    {' · '}이 캐릭터만 종결 시 팀 {pct(deltaC)}
                  </p>
                </section>
              ))}
              <p style={muted}>배분 효율·줄당 가치는 스케일 무관. 공성 세공(×1.04)은 미검증 가정.</p>
            </div>
          )}
        </>
      )}
    </main>
  );
}

const tabBtn = (active: boolean): CSSProperties => ({
  padding: '8px 20px',
  fontSize: 15,
  cursor: 'pointer',
  border: 'none',
  borderBottom: active ? '3px solid #1a73e8' : '3px solid transparent',
  background: 'none',
  fontWeight: active ? 700 : 400,
  color: active ? '#1a73e8' : '#666',
});
const fs: CSSProperties = { border: '1px solid #ddd', borderRadius: 8, padding: '8px 14px 14px', marginBottom: 12 };
const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 12 };
const lbl: CSSProperties = { display: 'flex', flexDirection: 'column', fontSize: 12, color: '#444', gap: 4 };
const inp: CSSProperties = { padding: '4px 6px', width: 90, fontSize: 14 };
const btn: CSSProperties = { padding: '8px 18px', fontSize: 15, cursor: 'pointer', borderRadius: 6, border: '1px solid #888', background: '#f4f4f4' };
const card: CSSProperties = { border: '1px solid #e0e0e0', borderRadius: 8, padding: 14, marginBottom: 12 };
const muted: CSSProperties = { color: '#666', fontSize: 13 };

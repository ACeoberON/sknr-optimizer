/* 세나 리버스 세팅 판정기 — 동기화 서버 (Cloudflare Workers + D1)
   - 동기화 코드 = 개인 열쇠. 서버에는 SHA-256 해시만 저장
   - 길드 공개는 본인이 켠 경우만, 길드장은 읽기만
   - 계정주(OWNER_KEY 비밀값)만 길드를 만들 수 있음 */

const MAX_BYTES = 512 * 1024;       // 한 사람 데이터 상한
const MIN_GAP_MS = 2000;            // 같은 사람 저장 최소 간격
const NEW_PER_HOUR = 10;            // IP당 시간당 새 코드 발급
const BAD_PER_10MIN = 20;           // IP당 10분 동안 틀린 코드 시도 상한
let badReady = false;               // 틀린 시도 기록 표 — 처음 쓸 때 만든다(콘솔 작업 불필요)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Admin-Key,X-Owner-Key',
  'Access-Control-Max-Age': '86400'
};
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } });
const err = (status, code, msg) => json({ error: code, message: msg }, status);

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha = async s => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const same = (a, b) => {                         // 길이 같은 문자열 비교 (시간차 노출 줄이기)
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0;
};
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // 헷갈리는 0 O 1 I 제외
const newCode = () => {                          // 24자 = 120비트
  const r = crypto.getRandomValues(new Uint8Array(24));
  const s = [...r].map(b => ALPH[b % 32]).join('');
  return s.match(/.{4}/g).join('-');
};
const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const okCode = s => /^[A-Z2-9]{24}$/.test(s);
const cleanName = s => String(s || '').trim().slice(0, 20);

async function me(req, env){
  const h = req.headers.get('Authorization') || '';
  const code = cleanCode(h.replace(/^Bearer\s+/i, ''));
  const ip = req.headers.get('CF-Connecting-IP') || 'x', now = Date.now();
  if (!badReady){
    await env.DB.batch([
      env.DB.prepare('CREATE TABLE IF NOT EXISTS badlog (ip TEXT NOT NULL, ts INTEGER NOT NULL)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS badlog_ip ON badlog(ip, ts)')
    ]);
    badReady = true;
  }
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM badlog WHERE ip = ? AND ts > ?').bind(ip, now - 6e5).first();
  if ((n && n.n) >= BAD_PER_10MIN) throw Object.assign(new Error('잘못된 코드를 너무 많이 넣었습니다. 10분 뒤 다시 시도하세요.'), { status: 429 });
  const id = okCode(code) ? await sha('u:' + code) : null;
  const row = id ? await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first() : null;
  if (!row){
    await env.DB.batch([
      env.DB.prepare('DELETE FROM badlog WHERE ts < ?').bind(now - 864e5),
      env.DB.prepare('INSERT INTO badlog (ip, ts) VALUES (?, ?)').bind(ip, now)
    ]);
    return null;
  }
  return { id, row };
}

async function readBody(req){
  const t = await req.text();
  if (t.length > MAX_BYTES) throw Object.assign(new Error('too_large'), { status: 413 });
  try { return JSON.parse(t || '{}'); } catch { throw Object.assign(new Error('bad_json'), { status: 400 }); }
}

export default {
  async fetch(req, env){
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url), p = url.pathname.replace(/\/+$/, '');
    try {
      /* 새 동기화 코드 */
      if (p === '/v1/new' && req.method === 'POST'){
        const ip = req.headers.get('CF-Connecting-IP') || 'x', now = Date.now();
        await env.DB.prepare('DELETE FROM newlog WHERE ts < ?').bind(now - 864e5).run();
        const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM newlog WHERE ip = ? AND ts > ?').bind(ip, now - 36e5).first();
        if ((n && n.n) >= NEW_PER_HOUR) return err(429, 'rate_limited', '잠시 후 다시 시도하세요.');
        const code = newCode(), id = await sha('u:' + cleanCode(code));
        await env.DB.batch([
          env.DB.prepare('INSERT INTO users (id, data, ver, updated) VALUES (?, ?, 0, 0)').bind(id, '{}'),   // updated 0 → 첫 업로드는 바로 허용
          env.DB.prepare('INSERT INTO newlog (ip, ts) VALUES (?, ?)').bind(ip, now)
        ]);
        return json({ code });
      }

      /* 내 데이터 */
      if (p === '/v1/me'){
        const u = await me(req, env);
        if (!u) return err(401, 'bad_code', '동기화 코드가 맞지 않습니다.');
        const r = u.row;
        if (req.method === 'GET')
          return json({ data: JSON.parse(r.data), ver: r.ver, updated: r.updated, share: r.guild ? { guild: r.guild, nick: r.nick } : null });
        if (req.method === 'PUT'){
          const b = await readBody(req);
          if (typeof b.ver !== 'number' || !b.data || typeof b.data !== 'object') return err(400, 'bad_request', '형식 오류');
          if (b.ver !== r.ver) return json({ error: 'conflict', data: JSON.parse(r.data), ver: r.ver, updated: r.updated }, 409);
          const now = Date.now();
          if (now - r.updated < MIN_GAP_MS) return err(429, 'too_fast', '저장이 너무 잦습니다.');
          const s = JSON.stringify(b.data);
          if (s.length > MAX_BYTES) return err(413, 'too_large', '데이터가 너무 큽니다.');
          const res = await env.DB.prepare('UPDATE users SET data = ?, ver = ver + 1, updated = ? WHERE id = ? AND ver = ?').bind(s, now, u.id, r.ver).run();
          if (!res.meta.changes) return err(409, 'conflict', '다른 기기에서 먼저 저장했습니다.');
          return json({ ver: r.ver + 1, updated: now });
        }
        if (req.method === 'DELETE'){
          await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(u.id).run();
          return json({ ok: true });
        }
      }

      /* 길드 공개 켜기/끄기 — 본인만 */
      if (p === '/v1/share'){
        const u = await me(req, env);
        if (!u) return err(401, 'bad_code', '동기화 코드가 맞지 않습니다.');
        if (req.method === 'DELETE'){
          await env.DB.prepare('UPDATE users SET guild = NULL, nick = NULL WHERE id = ?').bind(u.id).run();
          return json({ ok: true });
        }
        if (req.method === 'PUT'){
          const b = await readBody(req), guild = cleanName(b.guild), nick = cleanName(b.nick);
          if (!guild || !nick) return err(400, 'bad_request', '길드 이름과 닉네임을 넣으세요.');
          const g = await env.DB.prepare('SELECT join_hash FROM guilds WHERE name = ?').bind(guild).first();
          if (!g || !same(g.join_hash, await sha('j:' + guild + ':' + String(b.pass || '')))) return err(403, 'bad_pass', '길드 이름이나 가입 암호가 맞지 않습니다.');
          await env.DB.prepare('UPDATE users SET guild = ?, nick = ? WHERE id = ?').bind(guild, nick, u.id).run();
          return json({ ok: true, share: { guild, nick } });
        }
      }

      /* 길드 현황 — 길드장 키, 읽기만 */
      const m = p.match(/^\/v1\/guild\/([^/]+)\/members$/);
      if (m && req.method === 'GET'){
        const guild = cleanName(decodeURIComponent(m[1]));
        const g = await env.DB.prepare('SELECT admin_hash FROM guilds WHERE name = ?').bind(guild).first();
        if (!g || !same(g.admin_hash, await sha('a:' + guild + ':' + (req.headers.get('X-Admin-Key') || '')))) return err(403, 'bad_key', '길드 이름이나 길드장 키가 맞지 않습니다.');
        const rows = await env.DB.prepare('SELECT nick, data, updated FROM users WHERE guild = ? ORDER BY nick').bind(guild).all();
        return json({ guild, members: rows.results.map(r => ({ nick: r.nick, updated: r.updated, data: JSON.parse(r.data) })) });
      }

      /* 길드 만들기·암호 바꾸기 — 계정주(OWNER_KEY)만 */
      if (p === '/v1/guild' && req.method === 'POST'){
        if (!env.OWNER_KEY || !same(req.headers.get('X-Owner-Key') || '', env.OWNER_KEY)) return err(403, 'not_owner', '권한 없음');
        const b = await readBody(req), name = cleanName(b.name);
        if (!name || String(b.pass || '').length < 4 || String(b.adminKey || '').length < 12) return err(400, 'bad_request', '길드 이름, 가입 암호(4자 이상), 길드장 키(12자 이상)가 필요합니다.');
        await env.DB.prepare('INSERT INTO guilds (name, join_hash, admin_hash, created) VALUES (?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET join_hash = excluded.join_hash, admin_hash = excluded.admin_hash')
          .bind(name, await sha('j:' + name + ':' + b.pass), await sha('a:' + name + ':' + b.adminKey), Date.now()).run();
        return json({ ok: true, guild: name });
      }

      return err(404, 'not_found', '없는 주소');
    } catch (e){
      return err(e.status || 500, e.status === 429 ? 'rate_limited' : (e.message || 'error'), e.status ? e.message : '서버 오류');
    }
  }
};

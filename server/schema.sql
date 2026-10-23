-- 사람마다 한 줄. id = 동기화 코드의 SHA-256 (코드 자체는 서버에 남기지 않음)
CREATE TABLE IF NOT EXISTS users (
  id      TEXT PRIMARY KEY,
  data    TEXT NOT NULL DEFAULT '{}',
  ver     INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  guild   TEXT,            -- 길드 공개를 켰을 때만
  nick    TEXT
);
CREATE INDEX IF NOT EXISTS users_guild ON users(guild);

-- 길드: 가입 암호·길드장 키는 해시만 저장
CREATE TABLE IF NOT EXISTS guilds (
  name       TEXT PRIMARY KEY,
  join_hash  TEXT NOT NULL,
  admin_hash TEXT NOT NULL,
  created    INTEGER NOT NULL
);

-- 새 코드 발급 기록 (IP당 발급 횟수 제한용, 하루 지나면 지움)
CREATE TABLE IF NOT EXISTS newlog (ip TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS newlog_ip ON newlog(ip, ts);

-- 틀린 코드 시도 기록 (IP당 10분 20회 제한). 서버가 처음 쓸 때 알아서 만듦
CREATE TABLE IF NOT EXISTS badlog (ip TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS badlog_ip ON badlog(ip, ts);

-- 장비 캡처 원본 (비교용, 장비 번호별 1장). 서버가 처음 쓸 때 알아서 만듦
CREATE TABLE IF NOT EXISTS imgs (uid TEXT NOT NULL, gid INTEGER NOT NULL, img TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (uid, gid));

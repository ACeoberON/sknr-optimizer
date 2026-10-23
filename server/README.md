# 동기화 서버 (Cloudflare Workers + D1)

판정기의 "기기 간 자동 동기화"·"길드 공개"·"길드 현황"이 쓰는 서버입니다. 무료 플랜으로 충분합니다.

- 사람마다 **동기화 코드**(24자)로 저장. 서버에는 코드의 해시만 남습니다.
- **길드 공개**는 본인이 켠 사람만, **길드장 키**로 보기만 가능.
- 길드를 만드는 건 **계정주(OWNER_KEY)**만.
- 계정주는 Cloudflare 대시보드(D1 → sknr-sync)에서 저장된 데이터를 직접 볼 수 있습니다.

## 처음 배포 (한 번만)

1. Cloudflare 가입: https://dash.cloudflare.com/sign-up (이메일 인증까지)
2. Node.js LTS 설치: https://nodejs.org
3. 이 저장소를 최신으로 받고 `server` 폴더에서 터미널(PowerShell)을 엽니다.
4. 로그인 — 브라우저가 열리면 허용
   ```
   npx wrangler login
   ```
5. 데이터베이스 만들기 — 출력의 `database_id` 값을 `wrangler.toml`의 `REPLACE_WITH_DATABASE_ID` 자리에 붙여넣기
   ```
   npx wrangler d1 create sknr-sync
   ```
6. 표 만들기
   ```
   npx wrangler d1 execute sknr-sync --remote --file schema.sql
   ```
7. 배포 — 마지막에 나오는 `https://sknr-sync.<이름>.workers.dev` 주소를 Claude에게 알려주기
   ```
   npx wrangler deploy
   ```
8. 계정주 키 등록 — 물어보면 아무도 못 맞힐 긴 문자열(20자 이상)을 입력하고 따로 보관
   ```
   npx wrangler secret put OWNER_KEY
   ```

## 길드 만들기 / 암호 바꾸기

PowerShell에서 (값은 바꿔서):
```
$h = @{ "X-Owner-Key" = "계정주키"; "Content-Type" = "application/json" }
$b = @{ name = "길드이름"; pass = "가입암호"; adminKey = "길드장키12자이상" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "https://sknr-sync.<이름>.workers.dev/v1/guild" -Headers $h -Body $b
```
- **가입 암호**: 길드원에게 공유 (길드 공개를 켤 때 입력)
- **길드장 키**: 길드장에게만 전달 (길드 현황 열람용)
- 같은 길드 이름으로 다시 보내면 암호·키가 바뀝니다 (키가 새었을 때)

## 무료 한도 (2026-10 기준)
Workers 하루 10만 요청 · D1 하루 쓰기 10만 행 / 읽기 500만 행 / 저장 5GB. 넘으면 그날만 저장이 막히고 데이터는 그대로이며, 판정기는 기기 안 저장으로 계속 동작합니다.

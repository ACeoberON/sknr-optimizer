# CLAUDE.md

- 이 저장소는 `index.html` 한 장짜리 정적 페이지다. 빌드·의존성 없음.
- **이 파일이 원본이다.** 직접 고친 뒤 두 곳에 같은 파일을 올린다:
  1. `main` push → `.github/workflows/deploy.yml`이 `index.html`을 그대로 GitHub Pages에 올림 (https://aceoberon.github.io/sknr-optimizer/)
  2. claude.ai 아티팩트 "세나 리버스 세팅 판정기"(공개)에 같은 파일로 새 버전 게시
- 사용자 장비·설정은 동기화 서버(Cloudflare Worker, `/v1/me`, `/v1/img/:id`)에 있다. 장비 추가 시 서버 데이터를 먼저 받아서 덧붙인 뒤 `ver`와 함께 PUT.
- 공략 갱신 방식: 새 고점 빌드 = `고점 ver`, 기존 검증 공략 = `안전 ver`로 둘 다 남기고, 요일 기본 선택은 안전 ver.
- 이전 Vite + React 버전은 커밋 `4361aff`.

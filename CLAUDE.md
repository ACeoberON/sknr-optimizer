# CLAUDE.md

- 이 저장소는 `index.html` 한 장짜리 정적 페이지다. 빌드·의존성 없음.
- 원본은 claude.ai 아티팩트 "세나 리버스 세팅 판정기"이며, 그쪽에서 고친 뒤 이 파일로 덮어써 배포한다.
- `main` push → `.github/workflows/deploy.yml`이 `index.html`을 그대로 Pages에 올린다.
- 이전 Vite + React 버전은 `legacy-vite` 태그.

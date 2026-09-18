# CLAUDE.md

## 프로젝트 개요

sknr-optimizer는 장비 조합을 스탯 가중치 기준으로 최적화하는 웹 애플리케이션이다.
Vite + React + TypeScript로 구성하며, 테스트는 Vitest를 사용한다.
`main` 브랜치에 push하면 GitHub Actions가 GitHub Pages로 자동 배포한다.

## 폴더 역할

- `src/data` — 장비/스탯 등 정적 데이터 정의
- `src/engine` — 최적화 계산 로직 (순수 함수)
- `src/gear` — 장비 도메인 타입과 모델
- `src/ui` — React 컴포넌트 (화면)
- `tests` — Vitest 테스트

## 규칙

(추후 추가 예정)

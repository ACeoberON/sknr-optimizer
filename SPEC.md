# sknr-optimizer 스펙 v0.1

세븐나이츠 리버스 PVE 콘텐츠에서 캐릭터별 치확·치피·약확 배분을 최적화하는 도구.
이 문서는 도메인 규칙, 데이터 스키마, 첫 콘텐츠(금요일 공성전) 데이터를 정의한다.

---

## 1. 도메인 규칙

### 1.1 턴 구조
- 전투 유닛 = 아군 5 + 적 N (공성전은 적 3 → 총 8)
- **1턴 = 평타 1회.** 모든 유닛이 속공 내림차순으로 1회씩 평타 → 한 바퀴 후 다시 처음부터 (라운드로빈)
- 주기: `평타 2회 → 적 스킬 → 평타 2회 → 아군 스킬` → 아군 스킬은 4턴 간격
- **스킬 사용은 턴을 소모하지 않는다.** 스킬 순서는 사용자가 입력한다
- 유닛당 평타 횟수 = 총 턴 수 ÷ 유닛 수 (소수 허용, 예: 68 ÷ 8 = 8.5)

### 1.2 딜 판정 (히트 단위, 모두 독립)
- 치명: 확률 = 실효 치확, 발동 시 배율 = 치피 / 100
- 약점 공격: 확률 = 실효 약확, 발동 시 배율 = 1.3
- 치명과 약공은 동시 발동 가능 (곱연산)
- 모든 스킬·평타는 치명·약공 판정 대상 (예외는 스킬에 `canCrit: false`로 표시)

### 1.3 실효 스탯
- 실효 스탯 = 기본 스탯(장비 미착용 마을값, 초월 반영) + 장비 + 전투 버프
- 치확·약확 상한 100. 초과분은 낭비
- 버프 지속은 버프 대상의 **자기 평타 턴** 기준으로 감소 (스킬 사용은 차감 안 함)
- 공략 로테이션은 버프가 전 스킬을 덮도록 짜이는 것이 기본 → 기본값 `uptime: "always"`

### 1.4 모델에서 제외하는 요소
배분 판단에 영향이 없거나 실측 지분에 흡수되므로 입력·계산하지 않는다.
- 공격력, 피해량 증가, 방어력 감소, 받는 피해 증가 (캐릭터별 상수)
- 쿨타임 감소, 속공 버프 (스킬 순서 입력에 반영됨)
- 스킬 고유 치피 보정 중 딜 비중이 작은 스킬의 것 (예: 타카 아랫스킬 +46, 영향 0.1% 미만)
- 치명·약공 판정을 받지 않는 도트딜
- 조건부 추가타 (공성전은 보스 체력이 스킬 1회 후 30% 미만 고정 → 항상 발동, 같은 히트로 취급)

### 1.5 부옵 규칙
- 부옵은 공% 대신 치피 우선 (연구 결과). 공격력은 변수에서 제외
- 단, 치확이 낮은 캐릭터에서는 재검토 대상

---

## 2. 데이터 스키마

데이터는 3계층으로 분리한다.

| 계층 | 내용 | 변경 주체 |
|---|---|---|
| 캐릭터 DB | 누구에게나 같은 정보 (스킬 타수, 치확·치피·약확 효과) | 관리자 |
| 콘텐츠 DB | 콘텐츠·편성마다 다른 정보 (편성, 스킬 순서, 버프 대상) | 관리자 |
| 사용자 데이터 | 사람마다 다른 정보 (기본 스탯, 장비, 프리셋) | 사용자 (브라우저 저장 + JSON 내보내기) |

```ts
type Stat = "crit" | "critDmg" | "weakRate";
type SkillSlot = "upper" | "lower" | "basic";

// ── 캐릭터 DB ──
type Character = {
  id: string;
  name: string;
  skills: Record<SkillSlot, Skill>;
  effects: Effect[];            // 치확·치피·약확 관련 효과만
  rawText?: string;             // 원문 (엔진 미사용)
};

type Skill = {
  kind: "damage" | "buff";
  targets: "all" | "single";    // all = 적 전체 (실제 수는 콘텐츠의 적 수)
  hitsPerTarget: number;        // "N회 피해"의 N. buff면 0
  canCrit?: boolean;            // 기본 true
};

type Effect = {
  id: string;
  source: "passive" | SkillSlot;
  stat: Stat;
  value: number;
  scope: "self" | "allAllies" | "selectedAllies";
  maxTargets?: number;          // selectedAllies일 때
  selectionRule?: string;       // 예: "공격력 상위" (실제 대상은 콘텐츠 DB가 지정)
  durationOwnTurns?: number;    // 버프 지속 (대상 자신의 평타 턴 기준)
};

// ── 콘텐츠 DB ──
type Content = {
  id: string;
  name: string;
  enemies: string[];            // 적 수 = length
  lineup: string[];             // 진형 순서 1~5 (결과 화면 행 순서 대조용)
  skillOrder: { char: string; skill: SkillSlot; turn: string }[];
  totalTurns: number;
  buffTargets: Record<string, string[]>;   // effect.id → 대상 캐릭터 id
  buffUptime?: Record<string, "always" | number>; // 기본 "always"
  scoring: { type: "bestOf"; runs: number };      // 공성전: 5판 중 베스트1
  mechanic: "standard";         // 추후: "missZero" | "multiHitWeighted" | "threshold"
};

// ── 사용자 데이터 ──
type UserCharacter = {
  charId: string;
  speed: number;
  baseStats: Record<Stat, number>;   // 장비 미착용 마을값 (초월 반영)
};
```

---

## 3. 금요일 공성전 데이터

### 3.1 캐릭터 DB
```json
[
  { "id": "taka", "name": "타카",
    "skills": {
      "upper": { "kind": "damage", "targets": "all",    "hitsPerTarget": 1 },
      "lower": { "kind": "damage", "targets": "all",    "hitsPerTarget": 1 },
      "basic": { "kind": "damage", "targets": "single", "hitsPerTarget": 1 } },
    "effects": [] },

  { "id": "ryan", "name": "라이언",
    "skills": {
      "upper": { "kind": "damage", "targets": "all",    "hitsPerTarget": 1 },
      "lower": { "kind": "damage", "targets": "all",    "hitsPerTarget": 1 },
      "basic": { "kind": "damage", "targets": "single", "hitsPerTarget": 1 } },
    "effects": [] },

  { "id": "rachel", "name": "레이첼",
    "skills": {
      "upper": { "kind": "damage", "targets": "all",    "hitsPerTarget": 1 },
      "lower": { "kind": "damage", "targets": "all",    "hitsPerTarget": 2 },
      "basic": { "kind": "damage", "targets": "single", "hitsPerTarget": 1 } },
    "effects": [
      { "id": "rachel_passive_weak", "source": "passive", "stat": "weakRate",
        "value": 27, "scope": "allAllies" } ] },

  { "id": "sieg", "name": "지크",
    "skills": {
      "upper": { "kind": "damage", "targets": "single", "hitsPerTarget": 1 },
      "lower": { "kind": "damage", "targets": "single", "hitsPerTarget": 1 },
      "basic": { "kind": "damage", "targets": "single", "hitsPerTarget": 1 } },
    "effects": [] },

  { "id": "biscuit", "name": "비스킷",
    "skills": {
      "upper": { "kind": "damage", "targets": "all",    "hitsPerTarget": 1 },
      "lower": { "kind": "buff",   "targets": "all",    "hitsPerTarget": 0 },
      "basic": { "kind": "damage", "targets": "single", "hitsPerTarget": 1 } },
    "effects": [
      { "id": "biscuit_lower_weak", "source": "lower", "stat": "weakRate",
        "value": 54, "scope": "selectedAllies", "maxTargets": 2,
        "selectionRule": "공격력 상위", "durationOwnTurns": 5 } ] }
]
```

### 3.2 콘텐츠 DB
```json
{
  "id": "siege-fri",
  "name": "공성전 금요일",
  "enemies": ["제이브", "룩", "챈슬러"],
  "lineup": ["sieg", "rachel", "biscuit", "ryan", "taka"],
  "skillOrder": [
    { "char": "biscuit", "skill": "lower", "turn": "R1" },
    { "char": "taka",    "skill": "lower", "turn": "R1(4)" },
    { "char": "rachel",  "skill": "lower", "turn": "R2" },
    { "char": "ryan",    "skill": "lower", "turn": "4" },
    { "char": "rachel",  "skill": "upper", "turn": "8" },
    { "char": "taka",    "skill": "upper", "turn": "12" },
    { "char": "ryan",    "skill": "upper", "turn": "16" },
    { "char": "taka",    "skill": "lower", "turn": "20" },
    { "char": "ryan",    "skill": "lower", "turn": "24" },
    { "char": "taka",    "skill": "upper", "turn": "28" },
    { "char": "biscuit", "skill": "lower", "turn": "32" },
    { "char": "rachel",  "skill": "upper", "turn": "36" },
    { "char": "ryan",    "skill": "upper", "turn": "40" },
    { "char": "taka",    "skill": "upper", "turn": "44" },
    { "char": "ryan",    "skill": "lower", "turn": "48" },
    { "char": "rachel",  "skill": "lower", "turn": "52" },
    { "char": "taka",    "skill": "lower", "turn": "56" },
    { "char": "taka",    "skill": "upper", "turn": "60" },
    { "char": "ryan",    "skill": "upper", "turn": "64" },
    { "char": "ryan",    "skill": "lower", "turn": "68" }
  ],
  "totalTurns": 68,
  "buffTargets": {
    "rachel_passive_weak": ["taka", "ryan", "rachel", "sieg", "biscuit"],
    "biscuit_lower_weak":  ["taka", "ryan"]
  },
  "scoring": { "type": "bestOf", "runs": 5 },
  "mechanic": "standard"
}
```
비고: 원 공략에는 "뒷라인 딜러 체력 상황에 따라 지크 윗스킬로 교체" 분기가 있음. v0.1에서는 무시.

### 3.3 사용자 데이터 (현재 계정, 전원 6초월)
```json
[
  { "charId": "taka",    "speed": 29, "baseStats": { "crit": 23, "critDmg": 150, "weakRate": 0  } },
  { "charId": "ryan",    "speed": 29, "baseStats": { "crit": 23, "critDmg": 150, "weakRate": 0  } },
  { "charId": "rachel",  "speed": 25, "baseStats": { "crit": 5,  "critDmg": 150, "weakRate": 20 } },
  { "charId": "sieg",    "speed": 25, "baseStats": { "crit": 23, "critDmg": 150, "weakRate": 0  } },
  { "charId": "biscuit", "speed": 19, "baseStats": { "crit": 5,  "critDmg": 150, "weakRate": 0  } }
]
```

---

## 4. 이번 작업 범위 (v0.1)

엔진은 아직 만들지 않는다. 데이터 계층과 판정 수 계산까지만 구현한다.

1. `src/data/types.ts`: 2장의 타입 정의
2. `src/data/characters.json`, `src/data/contents/siege-fri.json`: 3장 데이터
3. `src/engine/hits.ts`: 캐릭터별 판정 수 계산
   - 스킬 판정 = Σ(시전 횟수 × 대상 수 × hitsPerTarget), 대상 수는 all이면 적 수, single이면 1
   - 평타 판정 = totalTurns ÷ (아군 수 + 적 수)
4. `src/engine/effectiveStats.ts`: 버프 반영 전투 스탯 계산 (장비는 아직 0으로 둠)
   - 반환값에 상한 초과분(낭비량)도 포함
5. 테스트 (`tests/`): 아래 값이 나와야 통과

| 캐릭터 | 스킬 판정 | 평타 판정 | 전투 약확 버프 합 |
|---|---|---|---|
| 타카 | 21 | 8.5 | 81 |
| 라이언 | 21 | 8.5 | 81 |
| 레이첼 | 18 | 8.5 | 27 |
| 지크 | 0 | 8.5 | 27 |
| 비스킷 | 0 | 8.5 | 27 |

6. CLAUDE.md에 1장(도메인 규칙) 요약 추가

---

## 5. 미결 사항 (다음 단계)
- 몬테카를로 시뮬레이터: 히트별 기본 대미지 가중치(스킬 vs 평타)를 실측 지분으로 보정하는 방식 설계 필요
- 결과 캡처 → CSV 수집 형식
- 장비 인벤토리 스키마 (3단계)
- 메커니즘 모듈: 미스딜0(일요일), 다단히트 가중(강림), 문턱형(강림 1단계)

# 웨이브 2 — 적응형 얼굴 분석 설계

작성일: 2026-06-21

로드맵 그룹 C(기능 8). 모든 리쉐이프의 토대. 범위: **정밀 타겟팅 + 얼굴형 분류 → 추천 프리셋 자동적용(조절 가능) + KYC식 온보딩**.

## 배경
MediaPipe 468 랜드마크는 의미 인덱스가 일관되어 이미 per-face. 한계: ①리쉐이프가 실제 특징점이 아닌 "중심+넓은 필드"로 처리 ②얼굴형 무관 동일 강도. → 분석으로 정밀화 + 얼굴형별 추천.

## 컴포넌트

### 1. 분석 모듈 `src/vision/faceAnalysis.ts` (신규, 순수 함수)
- `FaceShape = "oval" | "round" | "square" | "long" | "heart"`
- `interface FaceProfile { shape: FaceShape; ratios: { whRatio: number; jawToCheek: number; foreheadToCheek: number; chinRatio: number }; recommended: Record<string, number>; }`
- `analyzeFace(frames: NormalizedLandmark[][]): FaceProfile` — 프레임별 주요 폭/높이 비율 계산 후 평균:
  - 광대폭=d(lm234,lm454), 턱폭=d(lm172,lm397), 이마폭=d(lm54,lm284), 얼굴높이=d(lm10,lm152).
  - `whRatio = 광대폭/높이`, `jawToCheek = 턱폭/광대폭`, `foreheadToCheek = 이마폭/광대폭`, `chinRatio` = 하관 길이/전체.
- `classifyShape(ratios): FaceShape` — 임계값 규칙(best-effort, 실기기 튜닝):
  - whRatio 높음(>0.95)+jawToCheek 높음 → round; whRatio 낮음(<0.78) → long; jawToCheek 높음(각진 턱) → square; foreheadToCheek 큼 & jaw 작음 → heart; 그 외 → oval.
- `recommendReshape(shape): Record<string, number>` — 얼굴형별 reshape params 시작값(예):
  - round → { slim: 30, cheekbone: 25, jaw: 20, faceSize: 15 }
  - long → { chinLength: 40, forehead: 20 } (chinLength 50=중립, <50 짧게)
  - square → { jaw: 35, slim: 15 }
  - heart → { cheekbone: 15, jaw: 10 }
  - oval → {} (거의 없음)
  - 미지정 키는 reshape 기본값 유지(부분 적용).

### 2. 정밀 타겟팅 (`src/pipeline/geometry/reshapeDeformers.ts` 개선)
- 광대: `[C[0], eyeY]` 단일 넓은 필드 → 좌우 광대 정점(lm 50, lm 280 부근)에 개별 deformer(안쪽 이동/축소).
- 턱 각도: 기존 lm172/397 유지하되 하악각에 맞게 반경 축소(더 국소적).
- 콧볼/입꼬리/눈꼬리: 기존 특징점 유지(이미 정밀).
- **얼굴형 강도 스케일**: `buildDeformers(lm, p, shape?)`에 선택적 shape 인자. shape별 배율(round: slim/cheekbone ×1.2, long: forehead/chin ×1.2 등)로 동일 슬라이더값이 얼굴형에 맞게. shape 없으면 1.0(하위호환).
- 라이브 per-frame 계산 유지(포즈 추적). 기존 18종 동작 보존, 앵커/반경만 정밀화.

### 3. KYC식 온보딩 (`src/app/main.ts` + 신규 `src/ui/onboarding.ts` + index.html 오버레이)
- 트리거: `store.get().faceProfile`가 없으면 **첫 실행 자동 시작**. 제어탭 **"얼굴 다시 분석"** 버튼으로 재실행.
- 플로우: 스테이지에 오버레이("얼굴을 정면으로" + 진행바) → 얼굴 감지된 안정 프레임 ~45개(약 1.5초) 수집 → `analyzeFace` → `setFaceProfile` + `applyRecommended`(활성 장면 reshape 레이어에 추천값 + reshape enable) → "분석 완료: {한글 얼굴형}" 토스트 → 오버레이 닫기.
- 캡처 중에는 보정 미적용(원본 패스스루)로 정확 분석.
- 얼굴 미감지가 길면 "얼굴이 안 보여요" 안내, 취소 가능.

### 4. 상태/통합 (`types.ts`, `defaults.ts`, `reducer.ts`)
- `AppState`에 `faceProfile?: FaceProfile` 추가. `mergeDefaults`는 optional이라 그대로 호환(없으면 undefined).
- reducer: `setFaceProfile(s, p)`, `applyRecommended(s, preset)` (활성 장면 reshape 레이어 params 병합 + enabled=true).
- main.ts: 매 프레임 reshape 시 `store.faceProfile?.shape`를 buildDeformers에 전달(파이프라인 경유). pipeline.render → reshape pass가 shape를 받도록 경로 추가(최소 변경: FxPass render에 이미 params/landmarks 있음 → shape는 reshape pass 생성 시 store 참조 or render 인자 확장).
  - 결정: pipeline에 `setFaceShape(shape)` 세터 추가, main이 프로필 변경 시 호출. reshape pass가 보관된 shape로 buildDeformers 호출.

### 5. 검증
- 단위테스트 `faceAnalysis.test.ts`: 합성 비율 → classifyShape 분기, recommendReshape 매핑.
- 실행 육안: 첫 실행 온보딩 캡처→추천 적용, "다시 분석", 얼굴형별 강도 차이.
- ⚠️ 임계값·추천값·강도배율은 best-effort, 실기기 튜닝 대상.

## 비범위
- 리쉐이프 기능 대량 추가(W4), 머리축소(W5), 시장조사(W3). 여기선 분석 토대 + 기존 18종 정밀화 + 추천까지.

## 병렬 분해(구현)
- 트랙 A: 분석 모듈 + 단위테스트(`faceAnalysis.ts`, `.test.ts`) — 독립.
- 트랙 B: 상태/리듀서/마이그레이션(`types/defaults/reducer`) — 독립.
- 트랙 C: 온보딩 UI + main 배선 + reshapeDeformers 정밀화 + pipeline shape 경로 — A·B 완료 후 통합(의존 있음).
- → A·B 병렬, 그 후 C.

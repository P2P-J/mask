# Phase 4 — 안전한 최적화 (시각 변화 없음) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** 시각 결과를 바꾸지 않는 안전한 성능 최적화만 적용한다. 위험/시각 변화 항목은 실기기 프로파일링 기반 후속으로 보류.

**검증:** `npm test`(30개) + `npm run build` + `node --check electron/main.cjs`. 동작 보존.

**보류(이번 비범위):** OH1(지오메트리 버퍼 사전할당 — buildFan 결과를 배열로 보유하는 호출부 때문에 단순 재사용 시 덮어쓰기 버그), OH3(블러 ½ 다운샘플 — 시각 변화), OH4(레이어 캐시), OM3(texSubImage2D — resize 시 위험), OL1(DOM 인플레이스). → 시각 튜닝 종료 후 프로파일링과 함께.

---

## Task 1: OH2 — Segmenter 출력 버퍼 재사용

`src/vision/segmenter.ts`: 매 프레임 `new Uint8Array(f.length)` 할당 제거. 소비자(main→pipeline.updateSegMask)가 즉시 texImage2D로 업로드하므로 재사용 안전.

- [ ] **Step 1:** `Segmenter`에 `private out: Uint8Array | null = null;` 필드 추가.
- [ ] **Step 2:** `segment()`에서 `const out = new Uint8Array(f.length);`를 아래로 교체:

```ts
    if (!this.out || this.out.length !== f.length) this.out = new Uint8Array(f.length);
    const out = this.out;
```
(이후 루프/리턴 동일.)

- [ ] **Step 3:** 빌드/테스트 통과.

## Task 2: OM5/OM6 — 진단 DOM 스로틀 + 입력값 캐시

`src/app/main.ts` + `src/ui/docks/dockControls.ts`.

- [ ] **Step 1 (OM6, dockControls):** `DockControls`가 fps/overlay 값을 매 호출 DOM에서 읽지 않도록 캐시. `fpsEl`/`overlay` 체크박스에 `change` 리스너를 달아 `private fpsValue:number`, `private overlayOn:boolean` 필드를 갱신하고, `get fps()`/`get overlayEnabled()`가 그 필드를 반환하도록 변경. (초기값은 생성 시 DOM에서 1회 읽기.) 동작 동일, 매프레임 DOM read만 제거.
- [ ] **Step 2 (OM5, main):** 루프에서 `controls.updateDiagnostics(...)` 호출을 ~250ms 간격으로 스로틀. `let lastDiagTime = 0;` 추가 후 `if (now - lastDiagTime >= 250) { lastDiagTime = now; controls.updateDiagnostics({...}); }`로 감싼다. (FPS 표시 갱신만 느려질 뿐 측정/렌더 영향 없음.)
- [ ] **Step 3:** 빌드/테스트 통과.

## Task 3: OL4 — localStorage 저장 디바운스

`src/entities/scene/store.ts`: `update()`가 매 변경마다 `serialize+localStorage.setItem`을 동기 호출하는 것을 ~400ms 디바운스.

- [ ] **Step 1:** Store에 `private persistTimer: ReturnType<typeof setTimeout> | null = null;` 추가. 즉시 저장 코드를 디바운스로 교체:

```ts
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      localStorage.setItem(KEY, serialize(this.state));
    }, 400);
```
(KEY/serialize는 기존 것 사용. 구독자 알림은 기존대로 즉시.)

- [ ] **Step 2:** 빌드/테스트 통과.

## Task 4: 최종 검증 + 커밋

- [ ] **Step 1:** `npm test`(30) + `npm run build` + `node --check electron/main.cjs`.
- [ ] **Step 2: 커밋**

```bash
git add -A
git commit -m "perf: 안전 최적화 — segmenter 버퍼 재사용/진단 스로틀/입력 캐시/persist 디바운스"
```

## Self-Review
- 전부 동작 보존(시각 무변화). OH2는 소비 즉시성으로 재사용 안전. 디바운스는 저장 타이밍만 지연(언마운트 없는 단일창이라 데이터 유실 위험 낮음; 필요시 beforeunload flush 후속).
- 위험: dockControls change 리스너 누락 시 값 고정 → 빌드/수동 확인.

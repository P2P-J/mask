# Phase 3 — FSD-영감 디렉터리 재배치 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** `src/`를 FSD-영감 레이어(app/entities/pipeline/vision/ui/shared)로 재배치하고, 모든 import를 갱신하며, 유일한 경계 위반(state→gl)을 `FILTER_PRESETS` 추출로 해소한다. **순수 이동/재배선 — 런타임 로직 불변.**

**Architecture:** 폴더 구조만 FSD화하고 **파일명은 기존 소문자 유지**(블라스트 반경·인지부담 최소화). `git mv`로 이력 보존. 검증은 `tsc --noEmit`(import 해소 전수 확인) + `vitest`(30개) + `vite build`.

**비범위:** 식별자 리네임(FxPass→EffectPass, a/b→rtA/rtB 등)·랜드마크 상수화는 별도 후속(이번엔 이동에 집중).

---

## 목표 구조

```
src/
  app/            main.ts, styles.css
  entities/scene/ types.ts, defaults.ts, reducer.ts(+test), store.ts, persist.ts(+test)
  vision/         tracker.ts, segmenter.ts
  pipeline/       pipeline.ts, passes.ts
    passes/       smoothing.ts, teeth.ts, eyeDetail.ts, makeup.ts, reshape.ts, filter.ts, background.ts
    geometry/     faceMaskGeometry.ts(+test), faceRegions.ts, reshapeDeformers.ts(+test)
  ui/
    docks/        dockControls.ts, scenes.ts, layers.ts, editor.ts
    overlay/      overlay.ts
    layout/       canvasFit.ts, resizable.ts
  shared/
    gl/           glUtils.ts, mapping.ts(+test)
    camera/       camera.ts
    metrics/      metrics.ts(+test)
    lib/          format.ts(+test), filterPresets.ts(신규)
  vite-env.d.ts   (루트 유지)
```

## 이동 매핑 (git mv, 파일명 유지)

| 현재 | 이동 후 |
|---|---|
| src/main.ts | src/app/main.ts |
| src/styles.css | src/app/styles.css |
| src/camera.ts | src/shared/camera/camera.ts |
| src/metrics.ts(+.test) | src/shared/metrics/metrics.ts(+.test) |
| src/tracker.ts | src/vision/tracker.ts |
| src/segmenter.ts | src/vision/segmenter.ts |
| src/state/{types,defaults,reducer(+test),store,persist(+test)}.ts | src/entities/scene/ 동일명 |
| src/gl/pipeline.ts | src/pipeline/pipeline.ts |
| src/gl/passes.ts | src/pipeline/passes.ts |
| src/gl/{smoothing,teeth,eyeDetail,makeup,reshape,filter,background}.ts | src/pipeline/passes/ 동일명 |
| src/gl/{faceMaskGeometry(+test),faceRegions,reshapeDeformers(+test)}.ts | src/pipeline/geometry/ 동일명 |
| src/gl/{glUtils,mapping(+test)}.ts | src/shared/gl/ 동일명 |
| src/ui/{dockControls,scenes,layers,editor}.ts | src/ui/docks/ 동일명 |
| src/ui/overlay.ts | src/ui/overlay/overlay.ts |
| src/ui/{canvasFit,resizable}.ts | src/ui/layout/ 동일명 |
| src/ui/format.ts(+test) | src/shared/lib/format.ts(+test) |

## Task 1: FILTER_PRESETS 추출 (경계 위반 해소)

- [ ] **Step 1:** 새 파일 `src/gl/filterPresets.ts`(이동 전 위치)에 `filter.ts`의 `export const FILTER_PRESETS = [...]`를 **그대로** 옮긴다. (이동 단계에서 shared/lib로 함께 감.)
- [ ] **Step 2:** `filter.ts`는 `FILTER_PRESETS`를 `./filterPresets`에서 import해 쓰던 자리 유지(외부에서 `filter.ts`의 FILTER_PRESETS를 import하던 곳이 있으면 그대로 동작하도록 `export { FILTER_PRESETS } from "./filterPresets"` 재노출). `defaults.ts`의 `import { FILTER_PRESETS } from "../gl/filter"`를 `../gl/filterPresets`로 변경.
- [ ] **Step 3:** `npm run build` 통과.

## Task 2: 디렉터리 이동 + import 재배선

- [ ] **Step 1:** 위 매핑대로 `git mv` 수행(대상 폴더 `mkdir -p`). test 파일은 대상과 같은 폴더로.
- [ ] **Step 2:** `index.html`의 `/src/main.ts`→`/src/app/main.ts`, `/src/styles.css`→`/src/app/styles.css` 갱신.
- [ ] **Step 3:** 모든 이동 파일의 상대 import 경로를 새 위치 기준으로 갱신. `npx tsc --noEmit`의 오류를 가이드 삼아 전부 해소될 때까지 반복.
- [ ] **Step 4:** `filterPresets.ts`도 shared/lib로 이동했으니 filter.ts/defaults.ts의 경로 재확인.

## Task 3: 검증 + 커밋

- [ ] **Step 1:** `npm test`(30개 통과) + `npm run build`(무에러) + `node --check electron/main.cjs`.
- [ ] **Step 2:** 구조 확인: `find src -name '*.ts' | sort` 가 목표 구조와 일치.
- [ ] **Step 3: 커밋**

```bash
git add -A
git commit -m "refactor: FSD-영감 디렉터리 재배치(app/entities/pipeline/vision/ui/shared) + FILTER_PRESETS 경계 분리"
```

## Self-Review
- 순수 이동이라 tsc 그린 + 테스트 그린 = 동작 보존 강한 신호(로직 미변경).
- 위험: import 경로 누락 → tsc가 전수 차단. styles.css/main.ts는 index.html에서만 참조.
- BASE_URL(tracker/segmenter)·electron dist 로딩·vite base는 파일 이동에 영향 없음(빌드시 HTML 루트 기준).

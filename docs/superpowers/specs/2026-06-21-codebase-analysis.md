# Mask 코드베이스 분석 (2026-06-21)

병렬 4개 에이전트(아키텍처/FSD, 클린코드/네이밍, 오류/정합성, 최적화/성능)가 `src/`(~2861줄, 30파일) 전수 분석한 결과를 종합한다. **빌드/테스트 현재 정상: 28/28 통과, `tsc --noEmit`·`vite build` 무에러.**

---

## A. 아키텍처 / FSD 적합성

**현 구조는 이미 깔끔하게 레이어링됨.** 단방향 의존, 순환참조 없음. 유일한 경계 위반:
- `src/state/defaults.ts:2` → `import { FILTER_PRESETS } from "../gl/filter"` (state 레이어가 gl 레이어를 위로 의존).

**FSD(정식) 적합성 = 낮음.** 이유: ①라우트/페이지 없음(단일 창), ②렌더가 hot loop(조합 가능한 feature 슬라이스 아님), ③30파일 규모(FSD는 100+ 파일에서 가치). → **FSD "정식"은 의식(ceremony)만 늘고 이득 적음.**

**권장: FSD-영감(inspired) 구조** — FSD의 좋은 점(명확한 레이어, 단방향 의존, `shared/`)만 채택:
```
src/
  app/        main.ts(조합 루트+rAF 루프), styles.css
  entities/scene/   types,defaults,reducer,store,persist (도메인 상태)
  pipeline/   Pipeline.ts, passes/(각 패스), geometry/(faceMaskGeometry,faceRegions,reshapeDeformers)
  vision/     Tracker.ts(tracker), Segmenter.ts(segmenter)
  ui/         docks/(controls,scenes,layers,editor), overlay/, layout/(canvasFit,resizable)
  shared/     gl/(glUtils,mapping), camera/, metrics/, lib/(format, filterPresets[신규])
```
- 최고 blast-radius(이동 시 영향 큰) 파일: `state/types.ts`(~9), `gl/glUtils.ts`(~8), `gl/passes.ts` FxPass(~8), `gl/faceMaskGeometry.ts`(~5).
- `import.meta.env.BASE_URL`(tracker/segmenter)·vite base·electron dist 로딩은 **파일 이동에 영향 없음**(빌드시 HTML 루트 기준). import 경로만 갱신하면 됨.
- 이동 시 `FILTER_PRESETS`를 `shared/lib/filterPresets.ts`로 추출해 경계위반 동시 해결.

---

## B. 클린코드 / 네이밍

**최대 문제 = gl 패스 간 셰이더/유틸 중복(DRY).** glUtils로 추출 시 ~200줄 감소:
- H1: `PASSTHROUGH_FS`(=PASS_FS) 동일본 ×5 — passes.ts:27, makeup.ts:20, teeth.ts:20, eyeDetail.ts:20, background.ts:10
- H2: `GEO_VS` 동일본 ×4 — smoothing.ts:14, makeup.ts:13, teeth.ts:13, eyeDetail.ts:16
- H3: `BLUR_FS`(Kawase) 동일본 ×2 — smoothing.ts:24, background.ts:17
- H4: 동적 지오메트리 VAO 셋업 7줄 ×4 — smoothing/makeup/teeth/eyeDetail
- H5: `blit()` 거의동일 ×5 — smoothing/makeup/teeth/eyeDetail/background

**네이밍:** `FxPass`→`EffectPass`(passes.ts:14), ping-pong `a/b`→`rtA/rtB`(pipeline.ts:17, background.ts:61), `BG_OFFSETS`→`KAWASE_BG_OFFSETS`, reshapeDeformers의 `uv/d2/mid/uni/bi`→`toUV/dist2D/midpoint/toUnit/toBipolar`, `mapping.ts`→내용은 colorUniforms뿐(파일명 부정확).

**죽은 코드/혼동:** `reducer.ts:76 removeScene`는 UI 미연결, `defaults.ts:78 CATEGORIES.enabled`는 아무도 안 읽음, `passes.ts:139` "Plan B Task3" 주석은 이미 교체돼 거짓.

**매직넘버:** 랜드마크 인덱스(33/133/159/386/145/374/116/345 등)가 4파일에 이름없이 산재 → `LM_*` 상수화. `main.ts:132` 1048576.

---

## C. 오류 / 정합성 (실제 버그)

### Critical
- **C1 셰이더 객체 누수** — `glUtils.ts:14` 링크 후 `detachShader`/`deleteShader` 안 함. 컨텍스트 손실/복원 시 누적.
- **C2 Tracker GPU delegate 폴백 없음** — `tracker.ts:17` `delegate:"GPU"` 하드코딩. GPU delegate 불가 PC(SW렌더/일부VM)에서 예외→`running` 영영 false→**앱 완전 사망.** (Segmenter는 실패해도 경고만.) → **친구 배포 중이라 가장 치명적.**

### High
- **H1 MediaPipe 타임스탬프 단조증가 위반** — `main.ts:92` `performance.now()` 해상도 한계로 동일값 가능→detectForVideo 예외→"추론 에러" 토스트 반복. 마지막 ts 추적해 `max(now, last+1)`.
- **H2 빈 레이어 씬 통과** — `persist.ts:13` `[].every()`=true라 `layers:[]` 로드→`getSelectedLayer`=undefined→EditorDock 크래시. `layers.length>0` 추가.
- **H3 makeup maskScratch 널가드 누락** — `makeup.ts:127` 가드가 maskScratch 미포함인데 renderMask는 `!` 단언.

### Medium
- M1 background.ts:80 `UNPACK_FLIP_Y_WEBGL`을 하드코딩 true로 "복원"(전역상태 가정).
- M2 faceMaskGeometry.ts:121 센트로이드가 삼각형 인덱스 중복으로 편향(고유정점으로 평균해야).
- M3 reducer.ts:4 ID 불일치 시 조용히 index0 폴백(잘못된 레이어 편집).
- M4 format.ts:1 parseResolution NaN 미검증.

### Low
- L1 glUtils `!` 단언(createProgram/createShader null 가능), L2 buildFan 비볼록(눈썹) 삼각화 깨짐, L3 main.cjs `will-navigate`/`setWindowOpenHandler` 가드 없음, L4 smoothing blit이 blurProg로 4탭 낭비, L5 Store unsubscribe 없음, L6 씬 이름 번호 count기반 중복.

---

## D. 최적화 / 성능 (hot loop)

**번들:** 단일 청크 183.8KB(gzip 55.3KB), 코드분할 없음.

### High
- **OH1 매프레임 Float32Array 할당 15~25개** — faceMaskGeometry(buildMeshVerts/buildFan), reshapeDeformers, makeup ellipseFan 등. ~15~25KB/프레임 GC압박(60fps시 0.6~1.2MB/s). → 클래스별 재사용 버퍼 사전할당.
- **OH2 segmenter 매프레임 64KB Uint8Array + 65,536회 루프** — `segmenter.ts:29` getAsFloat32Array→Uint8 변환. → 재사용 버퍼/R32F 직접.
- **OH3 풀해상도 블러 패스 6~11회/프레임** — smoothing 6 + background 5(둘 다 켜지면 11), 1080p+에서. → ½해상도 다운샘플 후 업샘플(시각차 미미, iGPU에 큰 이득). ※시각 변화 → 사용자 확인 필요.
- **OH4 activeLayers() 매프레임 Map+배열 3개 할당** — `main.ts:82`, store.get() 프레임당 2회. → 구독+캐시.
- **OH5 pipeline.ts:59 매프레임 filter 배열.**

### Medium
- OM1 buildFan 매프레임 atan2 정렬 ×10~12(정렬순서는 불변 → init 캐시). OM2 센트로이드 O(N_tri). OM3 video/mask `texImage2D`→`texSubImage2D`. OM4 makeup buildItems 매프레임 hexToRgb+할당. OM5 진단 DOM 매프레임 write(4Hz 스로틀). OM6 fps/overlay DOM 매프레임 read(캐시). OM7 asar:false→asarUnpack로 wasm/models만.

### Low
- OL1 UI 도크 매 상태변경 innerHTML 전체 재생성(슬라이더 드래그 thrash) → 인플레이스 갱신. OL2 buildFan number[] 중간배열. OL3 overlay 숨김시도 clearRect 매프레임. OL4 Store.update 매변경 JSON.stringify+localStorage(디바운스). OL5 단일청크 코드분할.

---

## 종합 권장 (단계 분리, 위험 최소화 순서)

1. **Phase 1 — 정합성/안정성 수정**(C2·C1·H1·H2·H3 등): 친구 배포 중이라 최우선. 작은 diff, 테스트 유지 상태에서.
2. **Phase 2 — DRY 클린코드 리팩토링**(H1~H5 셰이더/유틸 glUtils 추출, 죽은코드 제거, 네이밍): 파일 수 줄여 이후 재배치 수월.
3. **Phase 3 — FSD-영감 재배치**(파일 이동 + FILTER_PRESETS 추출): DRY 후라 더 깔끔.
4. **Phase 4 — 최적화**(매프레임 할당/세그버퍼/DOM 스로틀/다운샘플 블러): 시각·동작 변화 위험 최대 → 마지막, 사용자 확인 동반.

각 Phase는 개별 spec/plan로 진행(승인 후).

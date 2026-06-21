# 웨이브 1 — UX 정비 + 메이크업(속눈썹) 설계

작성일: 2026-06-21

기능 9종 로드맵(5웨이브) 중 **웨이브 1 = 그룹 A·B**. 작고 독립적인 UX 개선 + 속눈썹.

## 목표 (5개 + 토대 1)

1. **레이어 On/Off를 TDS 스위치로** — 행 우측에 스위치, 기존 `toggleLayer` 재사용.
2. **레이어 SVG 라인 아이콘** — 이름 앞, `currentColor`(켜짐=accent/꺼짐=muted).
3. **레이어 그룹 헤더 섹션** — 5그룹으로 시각 분류.
4. **메시 오버레이: 제어탭 이동 + 저장 + 기본 켜짐** — 사용자가 끄면 그 값 유지.
5. **속눈썹(eyelash) 메이크업** 추가.
6. **(토대) 파라미터 기본값 병합** — 로드 시 누락 키 채움(향후 웨이브 호환).

## 설계

### A. UI 렌더 (파일: `src/ui/docks/layers.ts`, 신규 `src/ui/docks/layerIcons.ts`, `src/app/styles.css`)
- **TDS 스위치**: 레이어 행을 `[아이콘][이름][스위치]`로. 스위치는 `<button class="tds-switch" role="switch" aria-checked>`; CSS로 트랙+노브(켜짐 accent/우측, 꺼짐 surface-3/좌측). 클릭 시 `e.stopPropagation()` 후 `toggleLayer`. 행 클릭은 기존 `selectLayer` 유지.
- **아이콘**: `layerIcons.ts`가 `LAYER_ICONS: Record<string,string>`(인라인 SVG 18px, `stroke="currentColor" fill="none"`) 제공. 키=레이어 id(smoothing/color/teeth/eyeDetail/makeup/reshape/filter/background). 아이콘 색은 행 텍스트색 상속(켜짐 accent).
- **그룹 헤더**: `layerIcons.ts`에 `LAYER_GROUPS: {title, ids[]}[]` 정의. 렌더 시 그룹별로 작은 대문자 muted 헤더 + 해당 레이어들. 그룹/순서:
  - 피부·톤: smoothing, color
  - 디테일: teeth, eyeDetail
  - 메이크업: makeup
  - 윤곽: reshape
  - 마무리: filter, background
- **스위치 CSS 클래스명 `tds-switch`는 B의 제어탭 오버레이 토글도 재사용**(클래스 계약).

### B. 상태/오버레이/속눈썹/마이그레이션 (파일: `types.ts`, `defaults.ts`, `reducer.ts`, `store.ts`, `persist.ts`, `pipeline/passes/makeup.ts`, `index.html`, `app/main.ts`)
- **overlayMesh**: `AppState`에 `overlayMesh: boolean` 추가. `defaultState()`에 `overlayMesh: true`. reducer에 `setOverlayMesh(s, on)`.
- **제어탭 이동**: `index.html` `#diagnostics`의 `<label><input id="overlay">…</label>` 제거. 제어 dock(`#dock-controls`)에 오버레이 토글 행 추가(`tds-switch` 사용, label "메시 오버레이"). `main.ts`는 `overlay.draw(faces, store.get().overlayMesh)`로 변경(기존 `controls.overlayEnabled` 의존 제거). 제어탭 토글은 store 구독으로 상태 반영 + 클릭 시 `setOverlayMesh`.
- **DockControls 정리**: 더 이상 쓰지 않는 `overlayEl`/`overlayEnabled` 제거(또는 미사용 정리). diag-toggle/진단 패널 자체는 유지.
- **속눈썹**: `makeup` 레이어 params에 `eyelash: 0`, colors에 `eyelash: "#1a1a1a"` 추가(defaults). `makeup.ts buildItems`에 `eyelash` 항목(윗 래시라인 따라 얇고 진한 ellipseFan, liner보다 약간 위/길게). 렌더 순서: liner 다음. 편집 패널은 params/colors 자동 렌더.
- **파라미터 병합 마이그레이션**: 상태 로드 시(`store` 초기화 또는 `persist.deserialize` 후) 각 레이어의 `params`/`colors`/`selects`에 `defaultLayers()` 동일 id의 누락 키를 채움. top-level `overlayMesh` 누락 시 `true`. 기존 사용자 값은 보존, 새 키만 추가. **persist KEY 버전은 유지(씬 보존)**.

## 병렬 처리
- 파일 충돌 없게 **2 트랙 병렬**: 트랙 A(UI 렌더 파일들) ‖ 트랙 B(상태/로직/HTML 파일들). 공유 계약은 CSS 클래스 `tds-switch` 이름뿐.

## 검증
- `npm test`(30개 유지/추가) + `npm run build` + `node --check electron/main.cjs`.
- 마이그레이션: 구버전 형태(eyelash/overlayMesh 없는) 상태 로드 시 기본값 채워지는지 단위테스트(persist 또는 store).
- 실행 육안: 스위치 토글·아이콘·그룹·제어탭 오버레이(껐다 키면 재시작 후 유지)·속눈썹.

## 비범위
- 적응형 얼굴 분석(W2), 리쉐이프 확장(W4), 머리축소(W5), 시장조사(W3). 식별자 리네임/성능 추가 최적화.

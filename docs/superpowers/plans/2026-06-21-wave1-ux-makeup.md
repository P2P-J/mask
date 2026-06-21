# 웨이브 1 — UX 정비 + 속눈썹 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 또는 executing-plans.

**Goal:** 레이어 토글을 TDS 스위치로, 아이콘·그룹 헤더 추가, 메시 오버레이를 제어탭으로 이동+저장(기본 on), 속눈썹 메이크업 추가, 파라미터 기본값 병합 토대 마련.

**Architecture:** 파일 충돌이 없도록 **2 트랙 병렬**. 트랙 A=UI 렌더(layers/아이콘/CSS), 트랙 B=상태·로직·HTML. 공유 계약은 CSS 클래스명 `tds-switch`뿐. 검증: `npm test`+`npm run build`+`node --check electron/main.cjs`.

**Tech Stack:** vanilla TS, WebGL2, Vite, Electron, Vitest.

---

# 트랙 A — UI 렌더 (파일: `src/ui/docks/layers.ts`, 신규 `src/ui/docks/layerIcons.ts`, `src/app/styles.css`)

## A1: layerIcons.ts (아이콘 + 그룹 정의)

- [ ] **Step 1:** 신규 `src/ui/docks/layerIcons.ts` 생성. 각 레이어 id별 18px 라인 SVG(문자열)와 그룹 정의:

```ts
// 18px 라인 아이콘(currentColor). 레이어 id → inline SVG.
export const LAYER_ICONS: Record<string, string> = {
  smoothing: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/><circle cx="18" cy="17" r="1.6"/></svg>`,
  color: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 010 16z" fill="currentColor" stroke="none"/></svg>`,
  teeth: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6h14v5c0 3-1 7-3 7s-2-3-4-3-2 3-4 3-3-4-3-7z"/></svg>`,
  eyeDetail: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
  makeup: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="7" rx="2"/><path d="M10 10v9a2 2 0 002 2 2 2 0 002-2v-9"/></svg>`,
  reshape: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c4 0 7 3 7 8 0 6-4 10-7 10S5 17 5 11c0-5 3-8 7-8z"/></svg>`,
  filter: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><circle cx="9" cy="7" r="2"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="15" cy="17" r="2"/></svg>`,
  background: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M5 17l5-4 4 3 2-2 3 3"/></svg>`,
};

// 레이어 그룹(렌더 순서). 각 그룹 안의 id 순서도 유지.
export const LAYER_GROUPS: { title: string; ids: string[] }[] = [
  { title: "피부·톤", ids: ["smoothing", "color"] },
  { title: "디테일", ids: ["teeth", "eyeDetail"] },
  { title: "메이크업", ids: ["makeup"] },
  { title: "윤곽", ids: ["reshape"] },
  { title: "마무리", ids: ["filter", "background"] },
];
```

- [ ] **Step 2:** `npm run build` 통과(미사용 export 허용).

## A2: layers.ts — 그룹 헤더 + 아이콘 + TDS 스위치 렌더

- [ ] **Step 1:** `src/ui/docks/layers.ts` 렌더를 그룹/아이콘/스위치로 교체. 현재 카테고리의 레이어를 id→layer 맵으로 만들고 `LAYER_GROUPS` 순서로 렌더. 각 그룹: muted 헤더 div + 레이어 행들. 행은 `[아이콘 span.lyr-icon][이름 span.name][스위치 button.tds-switch]`. 스위치 클릭은 `e.stopPropagation()` 후 `toggleLayer`, 행 클릭은 `selectLayer`. (해당 카테고리에 없는 그룹/레이어는 건너뜀.)

```ts
import { LAYER_ICONS, LAYER_GROUPS } from "./layerIcons";
// ... 클래스 내부 render():
render(): void {
  const s = this.store.get();
  const layers = getCategoryLayers(s, s.activeCategory);
  const byId = new Map(layers.map((l) => [l.id, l]));
  this.listEl.innerHTML = "";
  for (const group of LAYER_GROUPS) {
    const groupLayers = group.ids.map((id) => byId.get(id)).filter((l): l is NonNullable<typeof l> => !!l);
    if (groupLayers.length === 0) continue;
    const header = document.createElement("div");
    header.className = "lyr-group-header";
    header.textContent = group.title;
    this.listEl.appendChild(header);
    for (const layer of groupLayers) {
      const row = document.createElement("div");
      row.className = "row lyr-row" + (layer.id === s.selectedLayerId ? " sel" : "") + (layer.enabled ? "" : " layer-off");
      const icon = document.createElement("span");
      icon.className = "lyr-icon";
      icon.innerHTML = LAYER_ICONS[layer.id] ?? "";
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = layer.name;
      const sw = document.createElement("button");
      sw.className = "tds-switch";
      sw.type = "button";
      sw.setAttribute("role", "switch");
      sw.setAttribute("aria-checked", String(layer.enabled));
      sw.classList.toggle("on", layer.enabled);
      sw.addEventListener("click", (e) => {
        e.stopPropagation();
        this.store.update((st) => toggleLayer(st, layer.id));
      });
      row.append(icon, name, sw);
      row.addEventListener("click", () => this.store.update((st) => selectLayer(st, layer.id)));
      this.listEl.appendChild(row);
    }
  }
}
```
(기존 import에 `getCategoryLayers, toggleLayer, selectLayer`가 있는지 확인하고 유지.)

- [ ] **Step 2:** `npm run build` 통과.

## A3: styles.css — 스위치/아이콘/그룹 헤더 스타일

- [ ] **Step 1:** `src/app/styles.css`에 추가:

```css
/* 레이어 그룹 헤더 */
.lyr-group-header { font-size: 10px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--text-muted); padding: 10px 8px 4px; }
.lyr-row { gap: 8px; }
.lyr-icon { display: inline-flex; width: 18px; height: 18px; color: var(--text-muted); flex: 0 0 auto; }
.lyr-row .name { flex: 1; }
.row.sel .lyr-icon, .lyr-row:not(.layer-off) .lyr-icon { color: var(--accent); }
.lyr-row.layer-off .name { color: var(--text-muted); }

/* TDS 스위치 */
.tds-switch { flex: 0 0 auto; width: 34px; height: 20px; border-radius: 999px; border: none; background: var(--surface-3); position: relative; cursor: pointer; transition: background .15s; padding: 0; }
.tds-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .15s; box-shadow: 0 1px 2px rgba(0,0,0,.4); }
.tds-switch.on { background: var(--accent); }
.tds-switch.on::after { transform: translateX(14px); }
.tds-switch:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
```

- [ ] **Step 2:** `npm run build` 통과.

## A4: 트랙 A 커밋
```bash
git add src/ui/docks/layers.ts src/ui/docks/layerIcons.ts src/app/styles.css
git commit -m "feat(ui): 레이어 TDS 스위치·라인 아이콘·그룹 헤더 섹션"
```
(Co-Authored-By 금지.)

---

# 트랙 B — 상태/오버레이/속눈썹/마이그레이션

## B1: overlayMesh 상태 추가 (types/defaults/reducer)

- [ ] **Step 1:** `src/entities/scene/types.ts`의 `AppState`에 `overlayMesh: boolean;` 추가.
- [ ] **Step 2:** `src/entities/scene/defaults.ts`의 `defaultState()` 반환 객체에 `overlayMesh: true,` 추가.
- [ ] **Step 3:** `src/entities/scene/reducer.ts`에 추가:
```ts
export function setOverlayMesh(s: AppState, on: boolean): AppState {
  return { ...s, overlayMesh: on };
}
```
- [ ] **Step 4:** `npm run build` 통과.

## B2: 속눈썹 makeup (defaults + makeup.ts)

- [ ] **Step 1:** `defaults.ts`의 makeup 레이어 params에 `eyelash: 0` 추가, colors에 `eyelash: "#1a1a1a"` 추가.
- [ ] **Step 2:** `src/pipeline/passes/makeup.ts` `buildItems`의 liner 블록 **다음**에 eyelash 항목 추가(윗 래시라인 따라 얇고 진하게, liner보다 약간 위·길게):
```ts
    if (on("eyelash")) {
      const le = p(159);
      const re = p(386);
      items.push({
        key: "eyelash",
        color: hexToRgb(colors.eyelash ?? "#1a1a1a"),
        geoms: [
          ellipseFan(le[0], le[1] + ew * 0.14, ew * 0.95, ew * 0.10),
          ellipseFan(re[0], re[1] + ew * 0.14, ew * 0.95, ew * 0.10),
        ],
      });
    }
```
- [ ] **Step 3:** `npm run build` 통과.

## B3: 파라미터 기본값 병합 마이그레이션 (TDD)

- [ ] **Step 1:** 신규 테스트 `src/entities/scene/defaults.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mergeDefaults, defaultState } from "./defaults";

describe("mergeDefaults", () => {
  it("레이어의 누락된 params/colors와 top-level overlayMesh를 기본값으로 채움", () => {
    const s = defaultState();
    // 구버전 흉내: makeup에 eyelash 없음, overlayMesh 없음
    const makeup = s.scenes[0].layers.find((l) => l.id === "makeup")!;
    delete (makeup.params as Record<string, number>).eyelash;
    delete (makeup.colors as Record<string, string>).eyelash;
    delete (s as { overlayMesh?: boolean }).overlayMesh;
    const merged = mergeDefaults(s);
    const m2 = merged.scenes[0].layers.find((l) => l.id === "makeup")!;
    expect(m2.params.eyelash).toBe(0);
    expect(m2.colors!.eyelash).toBe("#1a1a1a");
    expect(merged.overlayMesh).toBe(true);
  });

  it("기존 사용자 값은 보존", () => {
    const s = defaultState();
    s.scenes[0].layers.find((l) => l.id === "smoothing")!.params.strength = 99;
    s.overlayMesh = false;
    const merged = mergeDefaults(s);
    expect(merged.scenes[0].layers.find((l) => l.id === "smoothing")!.params.strength).toBe(99);
    expect(merged.overlayMesh).toBe(false);
  });
});
```
- [ ] **Step 2:** 실패 확인: `npx vitest run src/entities/scene/defaults.test.ts` → FAIL(mergeDefaults 없음).
- [ ] **Step 3:** `defaults.ts`에 `mergeDefaults` 추가(defaultLayers를 id로 인덱싱해 누락 키 채움):
```ts
export function mergeDefaults(s: AppState): AppState {
  const defById = new Map(defaultLayers().map((l) => [l.id, l]));
  const scenes = s.scenes.map((sc) => ({
    ...sc,
    layers: sc.layers.map((l) => {
      const d = defById.get(l.id);
      if (!d) return l;
      return {
        ...l,
        params: { ...d.params, ...l.params },
        colors: d.colors || l.colors ? { ...(d.colors ?? {}), ...(l.colors ?? {}) } : l.colors,
        selects: d.selects || l.selects ? { ...(d.selects ?? {}), ...(l.selects ?? {}) } : l.selects,
      };
    }),
  }));
  return { ...s, scenes, overlayMesh: s.overlayMesh ?? true };
}
```
- [ ] **Step 4:** 통과 확인: `npx vitest run src/entities/scene/defaults.test.ts` → PASS.
- [ ] **Step 5:** `store.ts` 생성자에서 로드 후 병합 적용:
```ts
import { defaultState, mergeDefaults } from "./defaults";
// ...
    this.state = mergeDefaults((raw && deserialize(raw)) || defaultState());
```

## B4: 오버레이 제어탭 이동 + 배선 (index.html + main.ts + dockControls)

- [ ] **Step 1:** `index.html` `#diagnostics`에서 `<label><input type="checkbox" id="overlay" checked /> 메시 오버레이</label>` 줄 **삭제**.
- [ ] **Step 2:** `index.html` 제어 dock(`#dock-controls`의 `.dock-body` 안, `panic` 버튼 다음)에 오버레이 토글 행 추가:
```html
          <div class="ctl-switch-row"><span>메시 오버레이</span><button id="overlay-toggle" class="tds-switch" type="button" role="switch" aria-checked="true"></button></div>
```
- [ ] **Step 3:** `src/app/styles.css`가 아닌 **트랙 A 소관**이지만, 행 정렬용 최소 스타일은 트랙 B가 styles.css를 건드리지 않도록 인라인 대신 트랙 A의 `.tds-switch` 재사용 + 행은 기존 `.cta` 영역 흐름. 정렬은 다음 클래스로(트랙 A의 styles.css에 이미 없으면 트랙 B가 추가하지 말고, main.ts에서 인라인 style로 처리): `overlay-toggle` 행 컨테이너에 `style="display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--text);margin:5px 0;"`를 HTML에 직접 부여. (CSS 파일 충돌 회피.)
  → 즉 Step 2의 `<div class="ctl-switch-row" ...>`를 `<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--text);margin:5px 0;">`로 작성.
- [ ] **Step 4:** `src/app/main.ts`: 오버레이 토글 배선 + 오버레이 소스를 store로 변경.
  - `overlay.draw(faces, controls.overlayEnabled)` → `overlay.draw(faces, store.get().overlayMesh)`.
  - 토글 요소 배선 추가(파일 상단 초기화부, store/overlay 생성 이후):
```ts
const overlayToggle = document.getElementById("overlay-toggle") as HTMLButtonElement;
function syncOverlayToggle(): void {
  const on = store.get().overlayMesh;
  overlayToggle.classList.toggle("on", on);
  overlayToggle.setAttribute("aria-checked", String(on));
}
overlayToggle.addEventListener("click", () => store.update((st) => setOverlayMesh(st, !st.overlayMesh)));
store.subscribe(syncOverlayToggle);
syncOverlayToggle();
```
  - import에 `setOverlayMesh` 추가(`./entities/.../reducer`는 현재 `getActiveScene`만 import 중 → `import { getActiveScene, setOverlayMesh } from "../entities/scene/reducer";` 형태로 경로 확인).
- [ ] **Step 5:** `src/ui/docks/dockControls.ts`: 더 이상 쓰지 않는 `overlayEl`, `overlayOn`, `get overlayEnabled`, overlay change 리스너 제거. (진단 패널/diag-toggle 로직은 유지.) 만약 `overlayEnabled`를 참조하던 다른 곳이 있으면 store로 대체.
- [ ] **Step 6:** `npm run build` + `node --check electron/main.cjs` 통과.

## B5: 트랙 B 검증 + 커밋
- [ ] **Step 1:** `npm test`(신규 mergeDefaults 테스트 포함 통과) + `npm run build`.
- [ ] **Step 2:**
```bash
git add src/entities/ src/pipeline/passes/makeup.ts src/ui/docks/dockControls.ts index.html src/app/main.ts
git commit -m "feat: 메시오버레이 제어탭 이동·저장(기본 on) + 속눈썹 메이크업 + 파라미터 기본값 병합"
```

---

# 통합 검증 (두 트랙 머지 후)
- [ ] `npm test`(30+개) + `npm run build` + `node --check electron/main.cjs` 전부 통과.
- [ ] 실행 육안: 레이어 스위치 토글/아이콘/그룹, 제어탭 오버레이(끄고 재시작 시 유지), 메이크업 속눈썹 슬라이더.

## Self-Review
- 스펙 커버: 토글(A2/A3), 아이콘(A1/A2/A3), 그룹(A1/A2/A3), 오버레이 이동+저장+기본on(B1/B4), 속눈썹(B2), 마이그레이션(B3). 전부 매핑됨.
- 파일 충돌: 트랙 A={layers.ts, layerIcons.ts, styles.css}, 트랙 B={types,defaults(+test),reducer,store,makeup,dockControls,index.html,main.ts} — **겹침 없음.** 공유는 `.tds-switch` 클래스명(A 정의, B의 index.html이 사용; B는 정렬만 인라인 style로 처리해 styles.css 미접촉).
- 타입 일관성: `overlayMesh`(types/defaults/reducer/store/main), `setOverlayMesh`, `mergeDefaults`, `eyelash`(params+colors+makeup) 일치.

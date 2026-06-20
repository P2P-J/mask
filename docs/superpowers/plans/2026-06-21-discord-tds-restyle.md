# Discord + TDS 컴포넌트 재스타일링 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 화면 레이아웃·위치·DOM은 그대로 두고, `src/styles.css`만 교체하여 컴포넌트 비주얼을 Discord 다크 무드 + Toss blue(#3182F6) 강조 + TDS 컴포넌트 관례로 재스타일링한다.

**Architecture:** 전체 테마는 단일 파일 `src/styles.css`에 집중되어 있다. 구(舊) 토큰명(`--primary`, `--secondary`, `--rail`, `--panel`, `--primary-strong`)은 이 파일 내부에서만 참조되며(`.ts`의 hex는 메이크업 기능 색상으로 무관), 외부 의존이 없다. 따라서 파일을 **원자적으로 통째로 교체**하여 중간 깨짐 상태(정의 안 된 CSS 변수)를 방지한다. 그 후 실제 앱에서 4개 도크(장면/레이어/편집/제어)의 컴포넌트 상태를 육안 검증한다.

**Tech Stack:** Vite, TypeScript(빌드 검증용), 순수 CSS.

---

## File Structure

- **Modify (전면 교체):** `src/styles.css` — 디자인 토큰 + 모든 컴포넌트 규칙
- **변경 없음:** `index.html`, `src/ui/*.ts` (기존 클래스명 그대로 사용; grep로 외부 참조 없음 확인 완료)

검증 명령:
- 빌드: `npm run build` (tsc --noEmit + vite build)
- 실행(육안): `npm run dev` 후 브라우저 확인
- 잔존 구색 스캔: `grep -nE '#(ee9678|e8896b|f6b9a3|f7e3da|fffcfa|fdf1ec|f7e7e0|5e463d|8a7068|b9a79f|9c7d72)' src/styles.css`

---

## Task 1: styles.css 전면 교체 (다크 + TDS 테마)

**Files:**
- Modify (전체 덮어쓰기): `src/styles.css`

- [ ] **Step 1: `src/styles.css` 전체를 아래 내용으로 교체**

```css
:root {
  /* surfaces (Discord dark) */
  --bg: #1e1f22; --surface: #2b2d31; --surface-2: #313338; --surface-3: #383a40;
  /* accent (Toss blue) */
  --accent: #3182F6; --accent-hover: #1b64da; --accent-press: #1957c2;
  --accent-soft: rgba(49,130,246,.15);
  /* text */
  --text-strong: #f2f3f5; --text: #b5bac1; --text-muted: #80848e;
  /* lines */
  --border: #232428; --divider: #3f4147;
  /* radius / shadow */
  --radius-lg: 16px; --radius-md: 12px; --radius-sm: 8px;
  --shadow: 0 8px 24px rgba(0,0,0,.32);
  --track: var(--surface-3);
}
* { box-sizing: border-box; }
body {
  margin: 0; font-family: system-ui, -apple-system, "Segoe UI", "Malgun Gothic", sans-serif;
  background: var(--bg); color: var(--text);
  display: flex; flex-direction: column; height: 100vh; overflow: hidden;
}

/* 공통 포커스 링 (TDS) */
:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--accent-soft); }

#topbar { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; background: var(--surface); border-bottom: 1px solid var(--divider); }
.brand { display: flex; align-items: center; gap: 8px; font-weight: 700; color: var(--text-strong); font-size: 15px; }
.brand .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); }
#topbar .group { display: flex; gap: 8px; align-items: center; }
.tds-select {
  appearance: none; border: 1px solid transparent; background: var(--bg);
  border-radius: var(--radius-sm); padding: 7px 30px 7px 14px; font-size: 13px; color: var(--text-strong);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23b5bac1'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: right 12px center;
  cursor: pointer; transition: background-color .12s, box-shadow .12s;
}
.tds-select:hover { background-color: var(--surface-3); }
.tds-select option { background: var(--surface-2); color: var(--text-strong); }
.tds-toggle-btn { border: none; background: var(--surface-2); color: var(--text); border-radius: var(--radius-sm); padding: 7px 14px; font-size: 13px; cursor: pointer; transition: background .12s, color .12s; }
.tds-toggle-btn:hover { background: var(--surface-3); color: var(--text-strong); }

/* 상단 미리보기 */
#stage { flex: 1; min-height: 0; position: relative; display: flex; align-items: center; justify-content: center; padding: 14px; overflow: hidden; background: var(--bg); }
#gl-canvas, #overlay-canvas { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); border-radius: var(--radius-lg); }
#gl-canvas { background: #000; box-shadow: var(--shadow); }
#overlay-canvas { pointer-events: none; }
.live-badge { position: absolute; top: 24px; left: 24px; display: flex; align-items: center; gap: 6px; background: rgba(0,0,0,.55); border-radius: 999px; padding: 4px 12px; font-size: 12px; color: var(--text-strong); font-weight: 600; backdrop-filter: blur(4px); }
.live-badge .live-dot { width: 8px; height: 8px; border-radius: 50%; background: #f23f43; }
#error { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); color: #f23f43; font-size: 14px; text-align: center; }
#diagnostics { display: none; position: absolute; top: 24px; right: 24px; width: 210px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 12px; box-shadow: var(--shadow); }
#diagnostics.open { display: block; }
#stats { white-space: pre; font-family: ui-monospace, monospace; font-size: 12px; color: var(--text-strong); }
#diagnostics label { display: flex; align-items: center; gap: 6px; font-size: 12px; margin-top: 10px; color: var(--text); }

/* 도크 영역/미리보기 사이 가로 스플리터 */
.h-splitter { flex: 0 0 6px; background: var(--divider); cursor: row-resize; transition: background .12s; }
.h-splitter:hover { background: var(--accent); }

/* 하단 도크 */
#docks { display: flex; height: 220px; background: var(--surface); }
.dock { flex: 1 1 0; display: flex; flex-direction: column; min-width: 120px; overflow: hidden; }
/* 도크 사이 세로 스플리터 */
.v-splitter { flex: 0 0 6px; background: var(--divider); cursor: col-resize; transition: background .12s; }
.v-splitter:hover { background: var(--accent); }
.dock > header { background: var(--surface); padding: 9px 12px; font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--text-muted); display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--divider); }
.dock > header button { border: none; background: transparent; color: var(--accent); font-size: 14px; cursor: pointer; }
.dock-body { padding: 8px; overflow-y: auto; flex: 1; }

/* 장면/레이어 행 */
.row { position: relative; display: flex; align-items: center; gap: 8px; padding: 8px; border-radius: var(--radius-sm); cursor: pointer; font-size: 12px; color: var(--text); transition: background .12s, color .12s; }
.row:hover { background: var(--surface-3); color: var(--text-strong); }
.row.sel { background: var(--accent-soft); color: var(--text-strong); font-weight: 700; }
.row.sel::before, .scene-row.active::before { content: ""; position: absolute; left: 0; top: 6px; bottom: 6px; width: 3px; border-radius: 0 3px 3px 0; background: var(--accent); }
.row .eye { width: 16px; text-align: center; color: var(--accent); }
.row .eye.off { color: var(--text-muted); }
.row .name { flex: 1; }
.row.soon { opacity: .5; }
.scene-row.active { background: var(--accent-soft); color: var(--text-strong); font-weight: 700; }
.scene-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scene-edit { border: none; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 12px; padding: 0 2px; opacity: .55; }
.scene-row:hover .scene-edit { opacity: 1; }
.scene-edit:hover { color: var(--accent); }
.scene-rename { width: 100%; box-sizing: border-box; padding: 7px 8px; background: var(--bg); border: 1px solid var(--accent); border-radius: var(--radius-sm); font-size: 12px; color: var(--text-strong); outline: none; }

/* 편집 슬라이더 */
.slider-row { margin-bottom: 12px; }
.slider-row .label { display: flex; justify-content: space-between; font-size: 12px; color: var(--text); margin-bottom: 6px; }
.slider-row .label b { color: var(--accent); font-weight: 700; }
.editor-empty { color: var(--text-muted); font-size: 12px; padding: 8px; }
.color-row { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--text); margin-bottom: 12px; }
.color-row input[type="color"] { width: 42px; height: 24px; border: 1px solid var(--border); border-radius: 6px; padding: 0; background: none; cursor: pointer; }
input[type="range"] { -webkit-appearance: none; appearance: none; width: 100%; height: 9px; border-radius: 999px; background: var(--track); outline: none; accent-color: var(--accent); }
input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: var(--accent); box-shadow: 0 1px 4px rgba(0,0,0,.4); cursor: pointer; }
input[type="range"]::-moz-range-thumb { width: 18px; height: 18px; border: none; border-radius: 50%; background: var(--accent); cursor: pointer; }

/* 제어 */
.cta { display: block; width: 100%; margin: 5px 0; border-radius: var(--radius-md); padding: 10px; font-size: 13px; font-weight: 700; border: none; cursor: pointer; transition: background .12s, color .12s, transform .06s; }
.cta:active { transform: scale(.98); }
.cta.primary { background: var(--accent); color: #fff; }
.cta.primary:hover { background: var(--accent-hover); }
.cta.ghost { background: var(--surface-2); border: none; color: var(--text); font-weight: 600; }
.cta.ghost:hover { background: var(--surface-3); color: var(--text-strong); }
.cta.active { background: var(--accent-soft); color: var(--accent); }
.cta:disabled { opacity: .5; cursor: not-allowed; }
.cta:disabled:active { transform: none; }

#toast { position: fixed; left: 50%; bottom: 80px; transform: translateX(-50%); background: var(--surface-3); color: var(--text-strong); padding: 8px 16px; border-radius: 999px; font-size: 13px; box-shadow: var(--shadow); opacity: 0; transition: opacity .2s; pointer-events: none; }
#toast.show { opacity: .98; }
```

- [ ] **Step 2: 구(舊) 피치색 잔존 여부 확인**

Run: `grep -nE '#(ee9678|e8896b|f6b9a3|f7e3da|fffcfa|fdf1ec|f7e7e0|5e463d|8a7068|b9a79f|9c7d72)' src/styles.css`
Expected: 출력 없음 (exit code 1). 출력이 있으면 해당 줄을 새 토큰으로 교체.

- [ ] **Step 3: 구(舊) 토큰명 잔존 여부 확인**

Run: `grep -nE 'var\(--(primary|primary-strong|secondary|rail|panel)\)' src/styles.css`
Expected: 출력 없음 (exit code 1). 출력이 있으면 새 토큰으로 교체.

- [ ] **Step 4: 빌드 통과 확인**

Run: `npm run build`
Expected: PASS — tsc 에러 없음, `vite build` 성공(`dist/` 생성). CSS는 빌드를 깨지 않으므로, 실패 시 무관한 TS 문제이거나 자산 부트스트랩 문제.

- [ ] **Step 5: 커밋**

```bash
git add src/styles.css
git commit -m "style: Discord 다크 + Toss blue(TDS) 컴포넌트 재스타일링 — styles.css 전면 교체"
```

---

## Task 2: 실행 육안 검증 및 미세 보정

**Files:**
- Modify (필요 시): `src/styles.css`

- [ ] **Step 1: 개발 서버 실행**

Run: `npm run dev`
브라우저에서 표시되는 로컬 URL(예: `http://localhost:5173`)을 연다.

- [ ] **Step 2: 컴포넌트 상태 체크리스트 육안 확인**

다음을 모두 확인:
- 상단바: 다크 서피스 + 하단 디바이더, 브랜드 dot 블루, 셀렉트 3종/진단버튼이 다크 필드형이고 hover 시 한 톤 밝아짐, 키보드 Tab 포커스 시 블루 링.
- 스테이지: 배경 다크, 라이브 뱃지가 반투명 다크 pill + 레드 dot.
- 도크 헤더(장면/레이어/편집/제어): 대문자 muted 라벨, `＋` 블루.
- 레이어 행: hover 시 밝아짐, 선택 행은 블루 톤 배경 + 좌측 블루 바 + 눈 아이콘 블루.
- 장면 행: 활성 장면이 블루 톤 배경 + 좌측 블루 바. 이름변경 인풋 다크 + 블루 테두리.
- 편집 패널: 슬라이더 썸/필이 블루, 값 라벨 블루, 컬러 행 정상.
- 제어 패널: primary(가상캠) 비활성 시 흐림, ghost 버튼 다크 + hover 밝아짐, 클릭 시 살짝 축소.
- 토스트(동작 트리거 시): 다크 pill.

- [ ] **Step 3: 대비/가독성 문제 발견 시 보정**

문제 없으면 이 Step은 건너뛴다. 문제가 있을 때만 `src/styles.css`의 해당 토큰/규칙을 조정한다(예: 텍스트가 어두우면 `var(--text)` → `var(--text-strong)`). 레이아웃·위치는 변경하지 않는다.

- [ ] **Step 4: 보정 시 커밋**

Step 3에서 변경이 없었다면 건너뛴다. 변경이 있었다면:
```bash
git add src/styles.css
git commit -m "style: 재스타일링 대비/가독성 미세 보정"
```

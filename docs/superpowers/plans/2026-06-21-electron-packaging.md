# Electron 패키징 + GitHub Actions 자동 릴리스 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 Vite 웹앱을 Windows 설치형 .exe(NSIS)로 패키징하고, GitHub Actions(windows-latest)로 자동 빌드해 Releases에 업로드한다. 친구는 레포 없이 설치파일만 받아 테스트한다.

**Architecture:** 기존 웹앱(렌더러)에 얇은 Electron 메인 프로세스(`electron/main.cjs`)를 씌운다. 배포 시 `dist/index.html`을 `file://`로 로드하므로, 자산 경로를 상대경로로 고치고 Vite `base`를 프로덕션에서 `./`로 바꾼다. Windows .exe는 WSL에서 빌드 불가하므로 CI(windows-latest)에서 electron-builder로 빌드·게시한다.

**Tech Stack:** Electron, electron-builder, Vite, TypeScript, GitHub Actions, MediaPipe.

---

## File Structure

- **Modify:** `vite.config.ts` — 프로덕션 base 상대경로
- **Modify:** `src/tracker.ts` — wasm/model 경로 상대화
- **Modify:** `src/segmenter.ts` — wasm/model 경로 상대화
- **Create:** `electron/main.cjs` — Electron 메인 프로세스(창 생성, 카메라 권한 허용, 렌더러 로드)
- **Modify:** `package.json` — `main` 필드, devDeps, 스크립트
- **Create:** `electron-builder.yml` — 패키징 설정(win nsis, github publish, asar:false)
- **Create:** `.github/workflows/release.yml` — 태그 푸시 시 windows-latest 빌드·게시
- **Modify:** `README.md` — 친구 다운로드/설치 안내 섹션

검증 명령:
- 단위테스트: `npm test` (28개 통과 유지)
- 렌더러 빌드: `npm run build`
- 자산 상대경로 확인: `grep -oE '(src|href)="[^"]*"' dist/index.html`

---

## Task 1: 자산 경로 상대화 + Vite base

`file://`에서 `/wasm`·`/models` 절대경로가 깨지므로 상대경로로 바꾼다.

**Files:**
- Modify: `vite.config.ts`
- Modify: `src/tracker.ts:15-20`
- Modify: `src/segmenter.ts:14-17`

- [ ] **Step 1: `vite.config.ts`를 함수형으로 바꿔 프로덕션 base를 `./`로**

`vite.config.ts` 전체를 아래로 교체:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  // 배포(Electron file://)에서 자산을 상대경로로 해석해야 함. 개발은 절대경로 유지.
  base: mode === "production" ? "./" : "/",
  // WSL2에서 /mnt/d(Windows 드라이브)의 파일은 inotify 감시가 안 먹혀 HMR이 안 됨 → 폴링으로 강제
  server: {
    watch: { usePolling: true, interval: 200 },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
}));
```

- [ ] **Step 2: `src/tracker.ts`의 wasm/model 경로를 BASE_URL 기반으로**

`src/tracker.ts`에서:

```ts
    const fileset = await FilesetResolver.forVisionTasks("/wasm");
    this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: "/models/face_landmarker.task",
        delegate: "GPU",
      },
```

를 다음으로 변경(앞 두 줄만 수정):

```ts
    const fileset = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}wasm`);
    this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: `${import.meta.env.BASE_URL}models/face_landmarker.task`,
        delegate: "GPU",
      },
```

- [ ] **Step 3: `src/segmenter.ts`의 wasm/model 경로를 BASE_URL 기반으로**

`src/segmenter.ts`에서:

```ts
    const fileset = await FilesetResolver.forVisionTasks("/wasm");
    this.seg = await ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: "/models/selfie_segmenter.tflite", delegate: "GPU" },
```

를 다음으로 변경:

```ts
    const fileset = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}wasm`);
    this.seg = await ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}models/selfie_segmenter.tflite`, delegate: "GPU" },
```

- [ ] **Step 4: 단위테스트 통과 확인**

Run: `npm test`
Expected: PASS — 7 files, 28 tests passed.

- [ ] **Step 5: 빌드 후 자산 상대경로 확인**

Run: `npm run build && grep -oE '(src|href)="[^"]*"' dist/index.html`
Expected: 빌드 성공, 그리고 출력의 자산 경로가 `./assets/...` 처럼 `./`로 시작(절대 `/assets`가 아님). 또한 `ls dist/wasm dist/models` 로 두 폴더가 dist에 존재하는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add vite.config.ts src/tracker.ts src/segmenter.ts
git commit -m "fix: 배포용 자산 경로 상대화 — Vite base(./) + MediaPipe wasm/model BASE_URL"
```
(커밋 메시지에 Co-Authored-By 라인 금지.)

---

## Task 2: Electron 메인 프로세스 + package.json

**Files:**
- Create: `electron/main.cjs`
- Modify: `package.json`

- [ ] **Step 1: `electron/main.cjs` 생성**

```js
const { app, BrowserWindow, session } = require("electron");
const path = require("node:path");

const isDev = process.env.ELECTRON_DEV === "1";

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#1e1f22",
    title: "Mask",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  // 로컬 데스크톱 앱이므로 카메라/마이크 권한을 자동 허용.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media");
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
```

- [ ] **Step 2: Electron/빌더/개발 도구 설치**

Run: `npm install -D electron electron-builder concurrently wait-on cross-env`
Expected: 설치 성공. `package.json`의 devDependencies에 5개 패키지 추가됨.

- [ ] **Step 3: `package.json`에 `main` 필드와 스크립트 추가**

`package.json`에서 `"private": true,` 바로 아래에 다음 줄 추가:

```json
  "main": "electron/main.cjs",
```

그리고 `scripts` 블록을 다음으로 교체(기존 항목 유지 + 2개 추가):

```json
  "scripts": {
    "predev": "node scripts/bootstrap-assets.mjs",
    "dev": "vite",
    "prebuild": "node scripts/bootstrap-assets.mjs",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run --passWithNoTests",
    "electron:dev": "concurrently -k \"vite\" \"wait-on tcp:127.0.0.1:5173 && cross-env ELECTRON_DEV=1 electron .\"",
    "dist": "vite build && electron-builder --win nsis --publish never"
  },
```

- [ ] **Step 4: Electron 설치 확인**

Run: `npx electron --version`
Expected: `v` 로 시작하는 버전 문자열 출력(예 `v32.x.x`). (WSL에 디스플레이가 없어 창 실행은 생략 — 설치 무결성만 확인. 창 동작은 CI 산출물/사용자 PC에서 검증.)

- [ ] **Step 5: 빌드가 여전히 통과하는지 확인**

Run: `npm run build`
Expected: PASS (tsc --noEmit + vite build). `electron/main.cjs`는 순수 JS이며 tsconfig include(src) 밖이라 타입체크에 영향 없음.

- [ ] **Step 6: 커밋**

```bash
git add electron/main.cjs package.json package-lock.json
git commit -m "feat: Electron 메인 프로세스 + 패키징 스크립트/의존성"
```

---

## Task 3: electron-builder 설정

**Files:**
- Create: `electron-builder.yml`

- [ ] **Step 1: `electron-builder.yml` 생성**

```yaml
appId: com.mask.app
productName: Mask
directories:
  output: dist-electron
# asar 비활성화: MediaPipe가 wasm/모델을 file:// fetch로 읽으므로,
# asar 안에 묶지 않고 디스크에 그대로 둬서 로딩 문제를 원천 차단.
asar: false
files:
  - dist/**
  - electron/**
win:
  target:
    - nsis
  artifactName: Mask-Setup-${version}.${ext}
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
publish:
  provider: github
  owner: P2P-J
  repo: mask
```

- [ ] **Step 2: 설정 파싱 확인**

Run: `npx electron-builder --help`
Expected: electron-builder CLI 도움말이 에러 없이 출력(바이너리/설정 로드 정상). (실제 `--win` 빌드는 WSL에서 wine이 필요해 실패하므로 여기서 실행하지 않음 — Windows 빌드는 CI에서 수행.)

- [ ] **Step 3: 커밋**

```bash
git add electron-builder.yml
git commit -m "build: electron-builder Windows NSIS 설정(github publish, asar off)"
```

---

## Task 4: GitHub Actions 릴리스 워크플로

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: `.github/workflows/release.yml` 생성**

```yaml
name: Release

on:
  push:
    tags:
      - "v*"
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install deps
        run: npm ci

      - name: Build renderer
        run: npm run build

      - name: Package & publish Windows installer
        run: npx electron-builder --win nsis --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 2: 워크플로 YAML 유효성 확인**

Run: `npx --yes js-yaml .github/workflows/release.yml > /dev/null && echo "YAML OK"`
Expected: `YAML OK` 출력(파싱 에러 없음). js-yaml이 없으면 자동 설치되어 실행됨.

- [ ] **Step 3: 커밋**

```bash
git add .github/workflows/release.yml
git commit -m "ci: 태그 푸시 시 Windows .exe 자동 빌드·릴리스(GitHub Actions)"
```

---

## Task 5: 친구 다운로드 안내(README)

**Files:**
- Modify: `README.md`

- [ ] **Step 1: `README.md` 맨 끝에 다운로드 섹션 추가**

`README.md` 파일 끝에 다음 블록을 그대로 추가:

```markdown

## 다운로드 / 설치 (테스터용)

1. [Releases](https://github.com/P2P-J/mask/releases) 페이지에서 최신 `Mask-Setup-x.y.z.exe`를 받습니다.
2. 실행 시 "Windows의 PC를 보호했습니다" 경고가 뜨면 **추가 정보 → 실행**을 누릅니다.
   (코드 서명을 하지 않은 무료 빌드라 나오는 정상 경고입니다.)
3. 설치 후 실행하면 웹캠 미리보기와 보정 UI가 뜹니다. 카메라 접근을 허용해 주세요.
   - 카메라가 안 잡히면 Windows **설정 → 개인정보 보호 및 보안 → 카메라**에서 데스크톱 앱 접근을 켜세요.

> 현재 버전은 **독립 창 앱**입니다. OBS/치지직 등에 "Mask" 가상 카메라로 잡히는 기능은 다음 단계에서 추가됩니다.
> 써보고 문제가 있으면 [이슈](https://github.com/P2P-J/mask/issues)나 메신저로 알려주세요.
```

- [ ] **Step 2: 커밋**

```bash
git add README.md
git commit -m "docs: 테스터용 다운로드/설치 안내 추가"
```

---

## Task 6: 첫 릴리스 발행 및 검증 (end-to-end)

electron-builder의 GitHub publish는 `package.json` 버전으로 릴리스 태그(`v${version}`)를 만든다.
따라서 버전을 `0.1.0`으로 올리고 동일 태그를 푸시한다.

**Files:**
- Modify: `package.json` (version)

- [ ] **Step 1: 버전 0.1.0으로 변경**

`package.json`의 `"version": "0.0.0",` 를 `"version": "0.1.0",` 으로 수정.

- [ ] **Step 2: 커밋**

```bash
git add package.json
git commit -m "chore: v0.1.0"
```

- [ ] **Step 3: 현재 브랜치를 푸시하고 태그 발행**

```bash
git push
git tag v0.1.0
git push origin v0.1.0
```
Expected: 태그 푸시가 `release.yml`의 `push: tags: ["v*"]` 트리거를 발화.

- [ ] **Step 4: CI 실행 모니터링**

Run: `gh run watch $(gh run list --workflow=release.yml --limit 1 --json databaseId -q '.[0].databaseId') --exit-status`
Expected: 워크플로가 성공(녹색)으로 종료. 실패 시 `gh run view --log-failed`로 로그 확인 후 원인 수정.

- [ ] **Step 5: 릴리스 산출물 확인**

Run: `gh release view v0.1.0 --json assets -q '.assets[].name'`
Expected: `Mask-Setup-0.1.0.exe`(및 메타 파일)가 목록에 보임. 이 링크를 친구에게 공유하면 끝.

- [ ] **Step 6: (사용자 확인) 실제 설치 동작**

사용자가 본인 Windows PC에서 `Mask-Setup-0.1.0.exe`를 받아 설치·실행하여 웹캠 미리보기와 보정이
동작하는지 확인. (WSL에는 카메라/디스플레이가 없어 에이전트가 직접 확인 불가 — 이 스텝은 사용자 몫.)

---

## Self-Review 메모

- 스펙의 모든 항목 매핑: 자산경로/base(Task 1), Electron main+권한+스크립트(Task 2), electron-builder/NSIS/publish(Task 3), CI(Task 4), README 안내(Task 5), 첫 릴리스/검증(Task 6). 누락 없음.
- 비목표(가상캠/자동업데이트/서명)는 계획에 포함하지 않음 — 의도적.
- WSL 제약: 로컬에서 Windows .exe를 만들지 않음. 모든 .exe 빌드는 CI에서 수행하며, 로컬 검증은 `npm test`/`npm run build`/설정 파싱까지로 한정.

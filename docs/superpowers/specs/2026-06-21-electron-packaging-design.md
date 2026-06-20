# Electron 패키징 + GitHub Actions 자동 릴리스 설계

작성일: 2026-06-21

## 목표

현재 브라우저용 웹앱(Vite + TS + MediaPipe + WebGL)을 **Windows 설치형 .exe**로 패키징하고,
GitHub Actions로 자동 빌드·배포해서 친구들이 **레포 없이 설치파일만 받아** 테스트할 수 있게 한다.

배포 루프: 코드 수정 → 태그 푸시 → CI가 새 .exe 빌드 → GitHub Releases 업로드 → 친구는 새 링크 다운로드.

## 전제 / 범위

- **자체 가상캠은 이번 범위 밖.** 지금 .exe는 "독립 창 앱"으로, 친구가 자기 웹캠으로 보정 효과·UI를
  직접 써보고 피드백 주는 용도. OBS/치지직 가상캠 연동은 다음 마일스톤.
- 렌더러(기존 웹앱)는 **자산 경로 수정 외에는 변경 없음.**
- 코드 서명 안 함(PRD: 유료 인증서 미구매) → 미서명 .exe.

## 비목표

- 가상 카메라(MFCreateVirtualCamera) 구현
- macOS/Linux 빌드, Windows 10 지원
- 자동 업데이트(electron-updater) — 현 단계 불필요(친구가 새 링크 수동 다운로드)
- 코드 서명 / 공증

## 아키텍처

기존 웹앱에 얇은 Electron 껍데기를 씌운다.

```
electron/main.cjs   (메인 프로세스, 순수 CommonJS — 컴파일 불필요)
  └─ BrowserWindow 생성 → 렌더러 로드
       - 개발: http://localhost:5173 (Vite dev server)
       - 배포: dist/index.html (file://)
  └─ session.setPermissionRequestHandler → 'media'(카메라) 자동 허용
dist/**             (vite build 산출물 = 렌더러, 기존 앱 그대로)
```

- 렌더러는 Node API를 쓰지 않음 → `contextIsolation: true`(기본), `nodeIntegration: false`, preload 불필요.
- 단일 창. 창 크기 예: 1280×860, 최소 960×640.

## 핵심 수정 (file:// 에서 깨지지 않게)

1. **Vite base (프로덕션 상대경로)** — `vite.config.ts`를 함수형으로 바꿔
   `base: mode === "production" ? "./" : "/"`. 개발 동작은 그대로.

2. **MediaPipe 자산 경로 3곳을 `import.meta.env.BASE_URL` 기반 상대경로로**:
   - `src/tracker.ts`: `FilesetResolver.forVisionTasks("/wasm")`
     → `` FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}wasm`) ``
   - `src/tracker.ts`: `modelAssetPath: "/models/face_landmarker.task"`
     → `` modelAssetPath: `${import.meta.env.BASE_URL}models/face_landmarker.task` ``
   - `src/segmenter.ts`: `forVisionTasks("/wasm")` 및
     `modelAssetPath: "/models/selfie_segmenter.tflite"` 동일 방식.
   - 효과: 웹(base `/`)·Electron(base `./`) 양쪽에서 올바르게 해석.

## 패키징 (electron-builder)

`electron-builder.yml` (또는 package.json `build`):
- `appId: com.mask.app`, `productName: Mask`
- `directories.output: dist-electron` (이미 .gitignore에 있음)
- `files: ["dist/**", "electron/**"]`
- `win.target: nsis`, `win.arch: x64`
- `nsis: { oneClick: false, allowToChangeInstallationDirectory: true, perMachine: false }`
  (사용자별 설치 → 관리자 권한 불필요)
- `publish: { provider: github, owner: P2P-J, repo: mask }`
- 아이콘: 이번엔 electron-builder 기본 아이콘 사용(추후 `build/icon.ico` 교체).

## GitHub Actions (`.github/workflows/release.yml`)

- 트리거: `push: tags: ["v*"]` + `workflow_dispatch`(수동).
- `runs-on: windows-latest`
- 스텝: checkout → setup-node(20, npm 캐시) → `npm ci` →
  `npm run dist`(= prebuild로 bootstrap-assets 실행 → vite build → electron-builder).
- 환경변수 `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` → electron-builder가 Releases에 .exe 자동 업로드.
- `permissions: contents: write` (릴리스 생성용).
- 비고: `bootstrap-assets.mjs`가 CI에서 wasm 복사 + 모델 다운로드(네트워크) 수행.

## 신규 npm 스크립트 / 의존성

- devDependencies: `electron`, `electron-builder`, (개발 편의) `concurrently`, `wait-on`, `cross-env`.
- 스크립트:
  - `"electron:dev": "concurrently -k \"vite\" \"wait-on tcp:5173 && cross-env ELECTRON_DEV=1 electron electron/main.cjs\""`
  - `"dist": "vite build && electron-builder --win nsis --publish never"` (로컬 빌드용; CI는 `--publish always`)
  - 기존 `dev`/`build`/`test`는 유지.
- `package.json`에 `"main": "electron/main.cjs"` 추가.

## 친구 배포 안내 (README 섹션 추가)

- Releases 페이지에서 `Mask-Setup-x.y.z.exe` 다운로드 → 실행.
- 미서명이라 "Windows의 PC 보호" 경고 시 **추가 정보 → 실행**.
- Windows 설정 → 개인정보 → 카메라 접근 허용 필요 시 안내.

## 테스트 / 검증

- 단위테스트(28개) 영향 없음 — `npm test` 통과 유지.
- `npm run build` 성공 + `dist/index.html`의 자산 링크가 상대경로(`./assets`, `./wasm`, `./models`)인지 확인.
- CI: 태그 푸시 후 워크플로 그린 + Releases에 .exe 산출.
- 최종 동작(카메라·보정)은 사용자 Windows PC에서 설치파일 실행으로 확인(WSL엔 카메라 없음).

## 리스크 / 메모

- **미서명 SmartScreen 경고**: 친구 안내로 우회. 추후 서명 도입 시 별도 작업.
- **WSL 직접 빌드 불가**: 그래서 CI(windows-latest)로 빌드. 로컬 검증은 빌드 산출물/경로 정합성까지만.
- **GPU delegate**: MediaPipe `delegate: "GPU"`가 일부 PC에서 실패 가능 — 현재 코드의 에러 표시로 노출되며, 별도 폴백은 이번 범위 밖(피드백으로 수집).

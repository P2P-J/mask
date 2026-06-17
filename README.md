# Mask

> Windows 11 PC에서 웹캠 얼굴을 실시간으로 "티 안 나게" 보정해, OBS·치지직·SOOP·줌 어디에나 바로 물려 쓰는 **무료·100% 로컬·오픈소스** 데스크톱 보정 도구.

벤치마크는 **YYCam Pro**. 상용 뷰티 SDK 없이 **MediaPipe Face Landmarker + 자체 WebGL2 셰이더**로 자연스러운 보정을 재현하는 것을 목표로 합니다. 모든 처리는 온디바이스 — **얼굴 영상이 이 PC를 떠나지 않습니다.**

> ⚠️ **현재 단계:** 브라우저 기반 개발/검증 단계(Vite + 바닐라 TypeScript). 실시간 얼굴 추적·보정 파이프라인과 OBS식 UI가 동작합니다. 네이티브 가상카메라(`MFCreateVirtualCamera`)와 Electron 패키징은 후속 작업입니다.

---

## 주요 기능 (현재)

OBS식 레이아웃 — 상단 대형 미리보기 + 하단 4개 도크(장면 / 레이어 / 편집 / 제어), 도크 크기 조절 가능.

- **실시간 얼굴 추적** — MediaPipe Face Landmarker(GPU, 468 랜드마크), 100% 로컬 서빙
- **WebGL2 셰이더 파이프라인** — 비디오 텍스처 → 레이어별 셰이더 패스 → 표시 해상도(DPR) 렌더
- **레이어 시스템** (포토샵식, 켜기/끄기 + 편집):
  - **피부** — FabSoften식 스무딩(전체 얼굴 메시 마스크 + Kawase 블러 + 주파수 분리), 잡티/주름 완화, 피부톤 균일화, 얼굴 밝히기, 다크서클 완화
  - **색보정** — 밝기/대비/톤/화이트밸런스/채도/따뜻함
  - **치아 화이트닝** — 입 영역 + 밝기·채도 기반 치아 자동 탐지
  - **눈** — 눈 밝히기, 애교살
  - **윤곽/리쉐이프** — 얼굴 갸름·작은 얼굴·광대·V라인 턱·턱 길이·이마·눈 크기/간격/꼬리·동공·코(축소/콧대/코끝/코볼)·입(크기/도톰/미소)·눈썹 (이방성 비례 워프로 자연스럽게)
- **장면(Scene)** — 보정 프로필 저장/전환/이름변경, localStorage 영속
- **카메라/해상도(720p~UHD)/fps 선택**, 메시 오버레이 토글, 진단 패널(FPS/지연)

## 기술 스택

| 레이어 | 기술 |
|---|---|
| 언어/빌드 | TypeScript(strict) + Vite |
| 얼굴 추적 | `@mediapipe/tasks-vision` Face Landmarker (GPU, VIDEO 모드) |
| 렌더 | WebGL2 (자체 셰이더 파이프라인) |
| 테스트 | Vitest (순수 로직 단위테스트) |
| (예정) 가상캠 | `MFCreateVirtualCamera` (Win11), Electron 패키징 |

## 실행 방법

```bash
npm install
npm run dev -- --host
```
브라우저에서 **`http://localhost:5173/`** 접속(반드시 `localhost` — 웹캠 보안 컨텍스트). 카메라 권한 허용 후 프리뷰가 뜹니다.

> WSL2에서 개발 시: 코드는 WSL2에서 빌드, GPU/웹캠 측정은 Windows 브라우저에서. `/mnt/d` 경로는 HMR 폴링이 켜져 있습니다(`vite.config.ts`).

```bash
npm test        # 단위테스트
npm run build   # 타입체크 + 프로덕션 빌드
```

`predev`/`prebuild`가 MediaPipe WASM 복사 + 모델 다운로드(최초 1회)를 자동 수행합니다.

## 프로젝트 구조

```
src/
  camera.ts            웹캠 캡처
  tracker.ts           MediaPipe FaceLandmarker 래퍼
  metrics.ts           FPS/지연 측정
  main.ts              rAF 루프 오케스트레이션
  state/               보정 상태 모델(reducer/persist/store/defaults)
  gl/                  WebGL2 파이프라인 + 패스(smoothing/color/teeth/eyeDetail/reshape …)
  ui/                  OBS 도크 UI(scenes/layers/editor/controls/overlay/resizable/canvasFit)
docs/                  PRD, 설계/구현 계획(docs/superpowers)
```

## 로드맵

- ✅ 성능 PoC / OBS UI / WebGL2 파이프라인 / 피부·색·치아·눈·리쉐이프 보정 / 장면
- 🔜 메이크업(립/블러셔/아이브로우/아이섀도/라이너/컨투어), 필터(LUT) 프리셋, 배경 블러/교체
- 🔜 네이티브 가상카메라(MFCreateVirtualCamera) + Electron Win11 패키징
- 🔜 랜드마크 안정화(One Euro Filter), 적응형 품질

## 라이선스

MIT (LICENSE 참조). MediaPipe는 Apache 2.0.

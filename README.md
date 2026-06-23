<div align="center">

<img src="public/icon.png" alt="Mask" width="128" height="128" />

# Mask

**핸드폰으로 사진 뽀샵하듯, 웹캠 얼굴을 실시간으로 보정해주는 한국산 무료 · 오픈소스 데스크톱 앱**

줌 미팅 · 디스코드 게임 · 화상채팅에서 "오늘따라 내 얼굴이 좀…" 싶을 때.
상용 뷰티 SDK 없이 `MediaPipe Face Landmarker` + 자체 `WebGL2` 셰이더로, 100% 온디바이스 처리.
**얼굴 영상이 이 PC를 떠나지 않습니다.**

[![Release](https://img.shields.io/github/v/release/P2P-J/mask?style=flat-square&color=4f8cff)](https://github.com/P2P-J/mask/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%2011-4f8cff?style=flat-square)](https://github.com/P2P-J/mask/releases)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Rendering](https://img.shields.io/badge/render-WebGL2-990000?style=flat-square&logo=webgl&logoColor=white)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

</div>

---

## 한눈에

줌·디스코드·화상채팅에서 카메라를 켤 때마다 생각했습니다 — "사진은 폰으로 뽀샵하면서, 왜 실시간 영상은 안 될까?"
찾아보니 비슷한 도구로 중국의 **YYCam Pro**가 있었지만 **유료**였습니다. 그래서 **한국산 · 무료 · 오픈소스** 대안을 직접 만들었습니다.

OBS·치지직·SOOP·줌에 그대로 물려 쓰는 **Windows 11 전용** 실시간 얼굴 보정 도구이며,
라이선스가 묶인 상용 뷰티 SDK 없이 공개 모델(MediaPipe)과 **직접 작성한 WebGL2 셰이더**만으로 자연스러운 결과를 재현하는 것이 핵심 도전입니다.

핵심 원칙은 세 가지입니다.

| 원칙 | 의미 |
|---|---|
| **On-device** | 영상·랜드마크·보정 전 과정이 GPU에서 로컬 처리. 서버 전송·텔레메트리 없음. |
| **No black box** | 모든 보정 효과가 직접 작성한 셰이더 패스. 어떤 픽셀이 왜 바뀌는지 코드로 설명 가능. |
| **Natural by default** | "보정한 티"가 나지 않도록 — 메시 마스크·주파수 분리·이방성 비례 워프로 과하지 않게. |

> **현재 단계:** Electron Win11 패키징 + CI 자동 릴리스까지 완료된 **독립 데스크톱 앱**입니다.
> 실시간 추적·8단계 보정 파이프라인·OBS식 UI가 동작합니다. 남은 한 가지는 네이티브 가상카메라(아래 [로드맵](#로드맵)).

---

## 보정 파이프라인

매 프레임, 웹캠 텍스처가 **8개의 GPU 셰이더 패스**를 통과해 디스플레이 해상도(DPR 인식)로 렌더됩니다.
각 레이어는 포토샵식으로 **켜기/끄기 + 세부 편집**이 가능하며, 순서는 결정적(deterministic)입니다.

```
webcam ─▶ FaceLandmarker(468pt, GPU) ─▶ One Euro 안정화
                                            │
   ┌────────────────────────────────────────┘
   ▼
[1 피부]→[2 색보정]→[3 치아]→[4 눈]→[5 메이크업]→[6 윤곽]→[7 필터]→[8 배경] ─▶ Canvas
```

| # | 레이어 | 내용 |
|---|---|---|
| 1 | **피부** | FabSoften식 스무딩 — 얼굴 메시 마스크 + Kawase 블러 + **주파수 분리**로 질감 보존. 잡티·주름 완화, 톤 균일화, 얼굴 밝히기, 다크서클 완화 |
| 2 | **색보정** | 노출·하이라이트·그림자·감마·대비·화이트밸런스·생동감·색조 회전 + **스플릿 토닝** + **HSL 8밴드** |
| 3 | **치아** | 입 영역 검출 + 밝기·채도 기반 치아 자동 마스킹 → 화이트닝 |
| 4 | **눈** | 눈 밝히기, 애교살 강조 |
| 5 | **메이크업** | 립·블러셔·아이브로우·아이섀도·라이너·컨투어 |
| 6 | **윤곽/리쉐이프** | 갸름·소두·광대·V라인·턱 길이·이마·눈(크기/간격/꼬리)·동공·코(축소/콧대/코끝/코볼)·입(크기/도톰/미소)·눈썹 — **이방성 비례 워프**로 왜곡 최소화 |
| 7 | **필터** | LUT 기반 룩 프리셋 + 구조/페이드/비네트/필름 그레인 |
| 8 | **배경** | 세그멘테이션 기반 배경 블러/교체 |

**장면(Scene):** 보정 프로필을 통째로 저장·전환·이름변경하고 `localStorage`에 영속합니다.
스트리밍 ↔ 회의 등 상황별 프리셋을 즉시 전환할 수 있습니다.

---

## 아키텍처

관심사를 레이어로 분리해, **순수 로직과 GPU/IO를 격리**했습니다.
보정 상태·장면 모델·포맷 유틸 등 부수효과 없는 코어는 전부 단위테스트(Vitest)로 고정됩니다.

```
src/
├─ app/         rAF 루프 오케스트레이션 · Electron 부트스트랩
├─ vision/      FaceLandmarker 래퍼 · One Euro 랜드마크 안정화 · 적응형 얼굴 분석 · 세그멘테이션
├─ pipeline/    WebGL2 파이프라인 · 8개 셰이더 패스 · 기하 워프(geometry)
├─ entities/    보정 상태 모델 — reducer / persist / store / defaults (순수, 테스트 우선)
├─ ui/          OBS식 도크 UI — scenes · layers · editor · controls · overlay · 리사이즈/캔버스핏
└─ shared/      camera · gl 유틸 · metrics(FPS/지연) · 포맷·프리셋 라이브러리
```

| 결정 | 이유 |
|---|---|
| **상용 SDK 대신 자체 셰이더** | 라이선스·비용 0, 효과를 완전히 제어·설명 가능. 차별점이자 학습 목표. |
| **순수 로직 / 부수효과 분리** | reducer·persist·포맷은 GPU 없이 빠르게 테스트. 회귀 방지. |
| **결정적 패스 순서** | 같은 입력 → 같은 출력. 디버깅·튜닝이 재현 가능. |
| **DPR 인식 렌더** | 고해상도 디스플레이에서 선명도 손실 없이 1회 렌더. |
| **로컬 모델 서빙** | MediaPipe WASM/모델을 빌드 시 동봉 → 오프라인 동작, 외부 의존 0. |

**규모:** TypeScript(strict) 62개 파일 · 코어 ~4k LOC · 14개 단위테스트 스위트.

---

## 기술 스택

| 레이어 | 기술 |
|---|---|
| 언어 / 빌드 | TypeScript (strict) · Vite |
| 얼굴 추적 | `@mediapipe/tasks-vision` Face Landmarker (GPU · VIDEO 모드 · 468 랜드마크) |
| 안정화 | One Euro Filter (랜드마크 떨림 억제) |
| 렌더 | WebGL2 — 자체 셰이더 파이프라인 |
| 데스크톱 | Electron + electron-builder (NSIS 설치본) |
| 테스트 | Vitest (순수 로직 단위테스트) |
| CI/CD | GitHub Actions — 태그 푸시 시 Windows 설치본 자동 빌드·릴리스 |
| (예정) 가상캠 | `MFCreateVirtualCamera` (Win11 Media Foundation) |

---

## 다운로드 / 설치 (테스터용)

1. [**Releases**](https://github.com/P2P-J/mask/releases)에서 최신 `Mask-Setup-x.y.z.exe`를 받습니다.
2. "Windows의 PC를 보호했습니다" 경고 → **추가 정보 → 실행**.
   (코드 서명을 하지 않은 무료 빌드라 나오는 정상 경고입니다.)
3. 설치·실행 후 카메라 접근을 허용하면 보정 미리보기가 뜹니다.
   - 카메라가 안 잡히면 Windows **설정 → 개인정보 보호 및 보안 → 카메라**에서 데스크톱 앱 접근을 켜세요.

> 현재는 **독립 창 앱**입니다. OBS/치지직 등에 "Mask" 가상 카메라로 잡히는 기능은 다음 단계입니다.
> 문제가 있으면 [이슈](https://github.com/P2P-J/mask/issues)로 알려주세요.

---

## 개발

```bash
npm install
npm run dev -- --host      # 브라우저 개발 (http://localhost:5173, 웹캠 보안 컨텍스트)
npm run electron:dev       # Electron 창에서 개발
npm test                   # 단위테스트 (Vitest)
npm run build              # 타입체크 + 프로덕션 빌드
npm run dist               # Win11 설치본(.exe) 로컬 패키징
```

`predev`/`prebuild`가 MediaPipe WASM 복사 + 모델 다운로드(최초 1회)를 자동 수행합니다.

> **WSL2 개발 메모:** 코드는 WSL2에서 빌드하되 GPU/웹캠 측정은 Windows 브라우저에서 합니다.
> `/mnt/d` 경로는 HMR 폴링이 켜져 있습니다(`vite.config.ts`).

---

## 로드맵

- ✅ 성능 PoC · OBS식 UI · WebGL2 8단계 파이프라인(피부·색·치아·눈·메이크업·윤곽·필터·배경)
- ✅ One Euro 랜드마크 안정화 · 적응형 얼굴 분석 · 장면 프로필
- ✅ Electron Win11 패키징 · GitHub Actions 자동 릴리스
- 🔜 **네이티브 가상카메라**(`MFCreateVirtualCamera`) — OBS/치지직에 "Mask" 캠으로 노출
- 🔜 LUT 프리셋 확장 · 적응형 품질(저사양 대응)

---

## 라이선스

[MIT](LICENSE). MediaPipe는 Apache 2.0.

<div align="center"><sub>Made in Korea · 100% on-device · No data leaves your PC</sub></div>

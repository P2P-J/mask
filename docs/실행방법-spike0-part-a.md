# Spike 0 - 파트 A 실행 & 측정 방법

> 브라우저 성능 PoC를 띄우고, iGPU에서 MediaPipe 얼굴 추적 FPS를 측정하는 방법.
> 이 PoC의 목적: **"내장 GPU에서 1080p·30fps로 얼굴 추적 + 메시 오버레이가 도는가?"** 단 하나의 질문 검증.

---

## 사전 준비

- **Windows 11** + Chrome 또는 Edge (최신)
- 웹캠 1대
- (개발 측) Node.js — 이미 WSL2와 Windows 양쪽에 설치되어 있음

프로젝트 위치: `D:\aenproject\mask` (= WSL2의 `/mnt/d/aenproject/mask`, 양쪽 공유)

---

## 실행 방법 A — WSL2 dev 서버 + Windows 브라우저 (권장 ✅)

가장 간단하고, 이미 이 방식으로 서버가 떠 있다. **코드 빌드는 WSL2에서, 실제 GPU 측정은 Windows 브라우저에서** 일어난다(브라우저가 Windows GPU를 씀).

### 1) dev 서버 실행 (WSL2)
WSL2 터미널에서 프로젝트 폴더로 이동 후:
```bash
cd /mnt/d/aenproject/mask
npm run dev -- --host
```
출력에 `➜  Local:   http://localhost:5173/` 가 보이면 준비 완료.
(`predev`가 자동으로 wasm 복사 + 모델 존재 확인을 수행한다.)

### 2) Windows 브라우저로 접속
Chrome 또는 Edge에서 **반드시 이 주소**로 접속:
```
http://localhost:5173/
```

> ⚠️ **`localhost`만 써야 한다.** 네트워크 IP(`http://192.168...`)로 접속하면 카메라가 안 된다.
> 웹캠 API(`getUserMedia`)는 보안 컨텍스트를 요구하는데, http에서는 `localhost`만 예외로 허용된다.
> WSL2의 localhost 포워딩 덕분에 Windows 브라우저 → WSL2 서버 연결이 자동으로 된다.

### 3) 카메라 권한 허용
주소창 권한 팝업에서 **허용** → 얼굴 위에 회색 메시 오버레이 + 우측 통계 패널이 보이면 정상.

---

## 실행 방법 B — Windows 네이티브 (대안)

WSL2를 안 쓰고 Windows에서만 돌리고 싶을 때. 단, **node_modules를 Windows용으로 새로 설치해야 한다**(WSL2가 설치한 것은 Linux 바이너리라 Windows에서 안 돌아감 — 특히 esbuild).

PowerShell 또는 cmd에서:
```powershell
cd D:\aenproject\mask
npm install        # Windows 네이티브 바이너리로 재설치
npm run dev
```
그다음 `http://localhost:5173/` 접속(위와 동일).

> ⚠️ 같은 폴더의 node_modules를 Windows용으로 덮어쓰면 WSL2 dev 서버가 깨진다. 한 번에 한 방식만 쓰는 게 깔끔하다. 평소엔 **방법 A**를 권장.

---

## 🔑 측정 전 필수 확인 — GPU 가속 여부

브라우저에서 **F12 → Console** 탭을 열고 경고를 확인한다.

- `Created TensorFlow Lite XNNPACK delegate for **CPU**` 같은 메시지나 WebGL 관련 에러가 보이면 → **GPU 가속 실패, CPU로 폴백**된 상태. 이 경우 FPS가 폭락하며 측정값이 **무의미**하다(핵심 가설에 거짓 부정).
- GPU 폴백이 떴다면 그 메시지를 그대로 기록 → 별도 대응 필요.

---

## 측정 절차

1. **1080p**(기본값) 선택 후 **10초 안정화** 대기.
2. 통계 패널의 **FPS** 값을 읽는다.
3. 오버레이 토글(On/Off), 해상도/fps 셀렉터로 조합을 바꿔가며 아래 표를 채운다.

| 해상도 | fps | 오버레이 | 측정 FPS | 추론(ms) | 프레임(ms) |
|---|---|---|---|---|---|
| 720p  | 30 | ON  |   |   |   |
| 720p  | 30 | OFF |   |   |   |
| 1080p | 30 | ON  |   |   |   |
| 1080p | 30 | OFF |   |   |   |
| 1080p | 60 | ON  |   |   |   |

### 통계 패널 항목 의미
- **FPS** — 실제 렌더 루프 속도(rAF 기준, 지수이동평균). 이게 핵심 판정값.
- **추론** — 프레임당 MediaPipe 추론 시간(ms).
- **프레임** — 프레임당 동기 작업 시간(ms). *주의: GPU 완료까지는 포함 안 됨 = 렌더 비용의 하한선.*
- **요청 vs 실제** — 요청한 해상도와 카메라가 실제 준 해상도. **"실제"가 진짜 픽셀 부하**의 기준.
- **얼굴** — 검출 여부.
- **JS 힙** — JS 메모리(GPU 메모리는 브라우저에서 측정 불가).

---

## ✅ 합격 기준

**1080p · 오버레이 ON 에서 FPS ≥ 30** → 합격. Mask 전체가 기술적으로 성립.

- 미달 시: 오버레이 OFF / 720p 수치로 **병목 판별**(추론이 느린가, 렌더가 느린가) → "저해상도 추적(다운스케일)" 전략 필요 여부 결정.

---

## 측정 후 알려줄 것
1. 콘솔에 GPU→CPU 폴백 경고가 있었는지
2. 위 표 숫자
3. 메시 오버레이가 얼굴에 잘 붙는지(좌우 반전/위치 정상인지)

---

## 문제 해결(Troubleshooting)

| 증상 | 원인 / 대응 |
|---|---|
| 카메라 권한 팝업 안 뜸 / 검은 화면 | `localhost`로 접속했는지 확인(IP 접속은 카메라 차단). 브라우저 사이트 권한에서 카메라 허용 |
| "카메라 시작 실패" 에러 | 다른 앱이 카메라 점유 중일 수 있음. 줌/OBS 등 종료 후 재시도 |
| FPS가 비정상적으로 낮음(~5-10) | 콘솔에서 GPU→CPU 폴백 확인. 다른 GPU 점유 프로그램 종료 |
| 페이지가 안 열림 | WSL2에서 `npm run dev`가 떠 있는지 확인. `http://localhost:5173/` 정확히 입력 |
| 모델 다운로드 실패(최초 1회) | 네트워크 확인. `public/models/face_landmarker.task`(~3.7MB)가 생겼는지 확인 |

---

## 참고
- 설계: `docs/superpowers/specs/2026-06-10-spike0-part-a-browser-poc-design.md`
- 구현 계획: `docs/superpowers/plans/2026-06-10-spike0-part-a-browser-poc.md`
- 이 PoC에 **없는 것**: 피부 보정, 가상 카메라, One Euro 안정화, React, Electron (전부 후속 작업)

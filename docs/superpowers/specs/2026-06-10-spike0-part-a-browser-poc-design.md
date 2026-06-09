# Spike 0 - 파트 A: 브라우저 성능 PoC — 설계 문서

| 항목 | 내용 |
|---|---|
| 프로젝트 | Mask (실시간 방송 보정, Windows 11 전용) |
| 작업 단위 | Spike 0 / 파트 A (3개 스파이크 중 첫 번째, 단독 진행) |
| 작성일 | 2026-06-10 |
| 상태 | 승인됨 — 구현 계획(writing-plans) 대기 |
| 상위 문서 | `/PRD.md` (v0.3) §9 로드맵, `memory/glow-critical-tech-risks.md` |

---

## 1. 목적 (단 하나의 질문)

> **"일반 노트북 내장 GPU(iGPU)에서 MediaPipe 얼굴 추적 + 468 메시 오버레이가 1080p·30fps 이상으로 도는가?"**

이 PoC는 보정·가상캠·UI를 전부 배제하고 **오직 이 성능 가설만 검증**한다. 통과하면 Mask 전체가 기술적으로 성립하고, 미달하면 다운스케일 추적 전략으로 선회한다.

## 2. 범위

### 포함 (In Scope)
- 웹캠 장치 선택 + 실시간 캡처
- MediaPipe Face Landmarker(GPU delegate)로 468 랜드마크 추적
- canvas 2D 메시/테셀레이션 오버레이
- FPS·추론 지연·해상도 등 측정 HUD
- 720p/1080p·30/60fps 셀렉터, 오버레이 On/Off 토글

### 제외 (Out of Scope) — 명시
피부 스무딩, 스킨 마스크, 주파수 분리, 색보정, 자동노출, 네이티브 가상 카메라, One Euro 안정화, React, Electron 패키징. **전부 후속 작업 단위.** 이 PoC는 순수 측정 도구다.

## 3. 모듈 아키텍처

바닐라 TypeScript, 모듈 경계 명확(MVP·셰이더 파이프라인으로 그대로 승계). React는 슬라이더 UI가 필요한 MVP 단계에서 도입.

```
main.ts          오케스트레이션: requestAnimationFrame 루프, 모듈 배선, 생명주기
├─ camera.ts     장치 열거(enumerateDevices), getUserMedia, 해상도/fps 제약 적용, <video> 제공
├─ tracker.ts    @mediapipe/tasks-vision FaceLandmarker 래핑(GPU delegate),
│                detectForVideo 호출 + 추론 시간 측정
├─ renderer.ts   canvas 2D: drawImage(video) + 468 메시/테셀레이션 오버레이 렌더
├─ metrics.ts    순수 로직: FPS(지수이동평균), 지연 추적 — 단위테스트 대상
└─ hud.ts        측정값 오버레이 + 토글/셀렉터 UI 컨트롤
```

### 모듈별 책임·인터페이스·의존성

- **camera.ts** — 무엇: 카메라 장치 목록과 선택된 스트림을 제공. 사용법: `listDevices()`, `start(deviceId, {width, height, fps})` → `HTMLVideoElement`, `stop()`. 의존: 브라우저 MediaDevices API.
- **tracker.ts** — 무엇: 비디오 프레임에서 얼굴 랜드마크 추출. 사용법: `init()`(WASM+모델 로드), `detect(video, timestampMs)` → `{ landmarks, inferenceMs }`. 의존: `@mediapipe/tasks-vision`.
- **renderer.ts** — 무엇: 비디오 + 메시를 캔버스에 그림. 사용법: `draw(video, landmarks, {overlay: boolean})`. 의존: Canvas 2D 컨텍스트.
- **metrics.ts** — 무엇: 시간 측정 누적·평균. 사용법: `new FpsMeter()`, `tick()` / `value()`; `new LatencyMeter()`, `record(ms)` / `avg()`. 의존: 없음(순수).
- **hud.ts** — 무엇: 측정값 표시 + 컨트롤. 사용법: `update(snapshot)`, 콜백으로 셀렉터/토글 이벤트 전달. 의존: DOM.

## 4. 데이터 흐름

```
camera(MediaStream → <video>)
  → main의 rAF 루프 (매 프레임)
    → tracker.detect(video, performance.now())  →  { landmarks, inferenceMs }
    → renderer.draw(video, landmarks, {overlay})
    → metrics(tick/record) → hud.update(snapshot)
```

## 5. MediaPipe 구체 결정

- **runningMode = `VIDEO`**, `detectForVideo(video, performance.now())`를 rAF 루프에서 동기 호출.
  - *근거: PRD가 적은 "LIVE_STREAM"은 모바일 콜백 패턴이고, 웹 웹캠 루프의 정석이자 지연 측정이 쉬운 방식은 VIDEO 모드의 동기 호출이다. 이 편차를 의도적으로 채택.*
- 옵션: `delegate: "GPU"`, `numFaces: 1`, `outputFaceBlendshapes: false`, `outputFacialTransformationMatrixes: false` (성능 최우선).
- WASM fileset + `face_landmarker.task` 모델은 로컬 번들(서버 전송 0 원칙, 오프라인 동작).
- 추론 시간 = `detectForVideo` 호출을 `performance.now()` 전후로 감싸 측정.

## 6. HUD 측정 항목

- 렌더 FPS (rAF 루프 기준, EMA)
- 프레임당 추론 시간(ms)
- 종단 프레임 시간(ms)
- 요청 vs 실제 카메라 해상도/fps
- 얼굴 검출 여부(0/1)
- JS 힙 사용량 (`performance.memory`, 가능 시) — **GPU 메모리는 브라우저에서 직접 못 읽음(명시)**
- **오버레이 On/Off 토글** — 추론 비용 vs 렌더 비용 분리 측정
- **해상도/fps 셀렉터** — 720p/1080p · 30/60fps 비교

## 7. 검증 방법 (실하드웨어가 핵심)

1. Windows 11에서 `npm run dev` → Chrome/Edge로 localhost 접속(카메라 + GPU 접근).
2. 1080p 선택 → HUD의 FPS 관찰. **완료 기준: 메시 오버레이 포함 ≥ 30fps (사용자 iGPU 노트북).**
3. 오버레이 Off로 헤드룸 확인 → 추론 병목 vs 렌더 병목 판별.
4. 720p/30·60, 1080p/30·60 조합별 숫자 기록.
5. 30fps 미달 시 → "저해상도 추적(다운스케일)" 전략 필요 여부 결정.

## 8. 에러 처리 (PoC 수준)

- 카메라 권한 거부 → 사용자 메시지, 크래시 없음.
- 얼굴 미검출 → HUD "no face" 표시, 오버레이 스킵, 루프 지속.
- MediaPipe WASM/모델 로드 실패 → 명확한 에러 메시지.

## 9. 테스트

PoC의 1차 검증은 **Windows 실기기 수동 관찰**(실하드웨어 FPS가 목적이라 자동화 불가). 단, `metrics.ts`는 순수 로직이므로 FPS EMA·지연 평균 계산에 대한 작은 단위테스트를 둔다(회귀 안전망 + 모듈 경계 검증).

## 10. 후속 (이 PoC가 끝난 뒤)

- **파트 B:** 네이티브 가상캠(MFCreateVirtualCamera) 스파이크 — A와 독립, 병렬 가능.
- **파트 C:** One Euro 랜드마크 안정화 — A 위에 얹음.
- 이후 통합 검토 → MVP(Phase 1) 설계.

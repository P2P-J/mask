# 웨이브 4a — 워프 품질 토대 설계

작성일: 2026-06-21. W3 시장조사 결론(떨림=랜드마크 지터, 왜곡=과변위/하드컷)을 반영한 품질 토대. 동작 동일, 안정성만 향상. 이후 W4b 기능 추가의 기반.

## 1. 랜드마크 시간축 EMA (신규 `src/vision/landmarkSmoother.ts`)
- `class LandmarkSmoother { smooth(face: NormalizedLandmark[] | null): NormalizedLandmark[] | null; reset(): void }`
- per-landmark `x,y,z` 지수이동평균: `s = α*raw + (1-α)*prev`, α=0.35. 길이 다르거나 null이면 리셋 후 통과.
- 순수 로직 → 단위테스트(평활값이 raw·prev 사이, 첫 프레임=raw 통과).
- `main.ts`: `tracker.detect` 결과 `faces[0]`를 smooth → 그 결과(`face`)를 onboarding.feed·pipeline.render·overlay에 사용. 얼굴 소실 시 자연 리셋.

## 2. 변위 클램핑 (`src/pipeline/geometry/reshapeDeformers.ts`)
- `add()` 마지막에 `tx,ty`를 `±MAX_T`(화면 정규화 ~0.015), `sx,sy`를 `±MAX_S`(~0.4)로 클램프. 과한 슬라이더에도 "녹음" 방지.

## 3. 강도 램핑 (`src/pipeline/passes/reshape.ts`)
- `private ramp = 0`. render에서 landmarks 있으면 `ramp = min(1, ramp+0.15)`, 없으면 `ramp = max(0, ramp-0.2)`.
- defB(sx,sy,tx,ty) 업로드 전 `ramp` 곱 → 검출 시작/소실 시 깜빡임 제거.

## 검증
- 단위테스트: landmarkSmoother(평활/리셋). reshapeDeformers 클램프는 빌드+육안.
- 빌드/tsc/electron check. 실행 육안: 머리 움직일 때 떨림↓, 큰 슬라이더에도 안정.

## 비범위
- 신규 리쉐이프 기능(W4b), 소두/MLS(W5). 여기선 EMA+클램프+램프만.

# 웨이브 3 — 시장조사 종합 (리쉐이프/머리축소 기능 백로그)

작성일: 2026-06-21. 병렬 4개 리서치(YYCam Pro·SNOW/B612 등 아시아캠·스트리밍/SDK·머리축소 기술) 종합.

## 벤치마크 결론
- **기능 기준 = FaceUnity(相芯)·BytePlus**(TikTok/Douyin/Bilibili 라이브 뷰티 엔진, 가장 완전한 파라미터셋) + **YYCam Pro**(제품 벤치) + **SNOW/B612/Soda**(한국 사용자 기대치).
- 우리 스택(MediaPipe FaceLandmarker 468 + Selfie Segmentation + WebGL2 워프)으로 **대부분의 얼굴 리쉐이프는 구현 가능**. "머리통 축소/목/이중턱"만 세그멘테이션 필요.

## 현재 보유 (리쉐이프 18종)
얼굴슬림·작은얼굴·광대·턱V라인·턱길이·이마·눈크기·눈간격·눈꼬리(틸트)·동공·코축소·콧대·코끝·코볼·입크기·입술도톰·미소·눈썹높이.

## W4 백로그 — 랜드마크만으로 가능(저비용), 우선순위순

### 높음 (트렌드/한국수요/모든 벤치 보유)
1. **얼굴 길이(짧은 얼굴)** — 세로 압축. FaceUnity `cheek_short`, BytePlus, SNOW/B612. 동아시아 인기.
2. **눈꼬리 각도/캔탈틸트** — 외안각 올림("헌터/사슴눈" 트렌드). FaceUnity `eye_rotate`, BytePlus.
3. **턱폭(하관)** — V라인 끝과 별개의 하악 폭. YYCam/Meitu/FaceUnity `lower_jaw`.
4. **앞트임/뒤트임(내·외안각 오픈)** — 현재 "꼬리 틸트"만 있고 오픈은 없음. FaceUnity `canthus`.
5. **눈 높이(세로)·눈 위치(상하)** — 크기와 별개. Banuba/FaceUnity/BytePlus.

### 중간 (전문 완성도)
6. **인중 길이** — FaceUnity `philtrum`, BytePlus, Meitu.
7. **큐피드 보우(M자 입술)** + **입술 너비/높이 개별** — YouCam/B612/Meitu.
8. **입꼬리(미소와 별개, 좌우)** — Meitu/Evoto.
9. **볼살 축소 / 볼 꺼짐(sunken)** + **볼 리프팅** — Banuba `sunken_cheeks`, YouCam Cheek Lift.
10. **코뿌리(nasion)·코 길이** — YouCam 7종 코.
11. **눈썹 아치·간격·두께(지오메트리)** — YouCam/Banuba.
12. **관자놀이** — 얼굴폭 핵심. (세그 경계 확장 권장이지만 랜드마크 근사 가능)

### 낮음/특수
13. 얼굴 대칭 자동 보정, 얼굴 각도(틸트), 이마 볼륨(셰이딩).

> **메모:** 현재 `reshapeDeformers.ts`의 deformer 시스템(타원 영향영역+이방성 스케일/이동)으로 위 대부분을 슬라이더 추가로 구현 가능. MAX_DEFORMERS=32 한도 확인 필요(현 18종 → 추가 시 상향).

## W5 — 머리통 축소(소두) + 워프 품질

### 머리축소(소두) = 세그멘테이션 필요 (플래그십, 수요 높음)
- 얼굴 랜드마크는 머리카락/두상 외곽 미포함 → 랜드마크만 워프하면 "얼굴섬" 아티팩트.
- **권장 2-레이어(기술 리서치 결론):**
  - **A. 리퀴파이 필드 확장**: 얼굴 타원을 1.5× 확장한 가상 외곽 제어점(머리 외곽 추정)에 안쪽 변위 → 통합 RBF 변위맵. **Selfie Segmentation 마스크로 변위에 곱(페더링)** → 배경 안 찌그러짐.
  - **B. 세그 스케일**: 인물 레이어를 얼굴 중심으로 4~8% 축소 합성. **배경 흐림 켜질 때만** 노출(틈을 블러가 가림). 거의 0 비용.
  - SNOW/B612/Soda의 "Head Size + Background Lock", FaceUnity/BytePlus의 body-seg head reduction과 동일 원리.
- 3DMM/FLAME/딥러닝 = 실시간 비현실적, 배제.

### 워프 품질 업그레이드 (전 리쉐이프 공통, "떨림/왜곡" 해결)
- **랜드마크 시간축 EMA(α≈0.35)** — 가장 중요. 현재 떨림의 주원인. CPU에서 per-landmark 평활.
- **MLS(rigid) 턱/볼 워프** — 단순 가우시안 푸시보다 자연스러움(늘어짐↓).
- **변위 클램핑**(720p에서 ~12px) + **강도 램핑**(검출 시작/소실 시 수 프레임 페이드).
- 변위맵 공간 블러(경계 컷아웃 방지).

### 후순위(세그/난이도)
- 목 슬림(하악 아래 body-skin 세그 + 가로 워프), 이중턱(서브친 영역, 어려움), 헤어라인/관자놀이(hair seg 필요, 실시간 선례 적음 → 1st-mover 가능성).

## 다음 단계 제안
- **W4a(품질 토대 먼저)**: 시간축 EMA + 변위 클램핑 + 강도 램핑 — 기존 18종 즉시 자연스러워짐(저위험, 고효과).
- **W4b**: 위 "높음/중간" 리쉐이프 기능 추가(슬라이더 + deformer + 편집 UI + 그룹 분류).
- **W5**: 소두(필드확장+세그스케일) + MLS 턱워프.
- 기능 수가 많아 W4b는 사용자와 **몇 개를 어느 묶음으로** 넣을지 확정 후 진행.

## 출처
각 리서치 결과 원문에 URL 다수(YYCam·YouCam/PerfectCorp·SNOW/B612/Soda·Ulike·Meitu/BeautyCam·Banuba·FaceUnity·BytePlus·MediaPipe·MLS/TPS/RBF 논문·SNOW 특허 US20150221118A1 등). 핵심: FaceUnity/BytePlus 파라미터 문서, Banuba FaceMorph API, SNOW/B612 앱 스토어·체인지로그.

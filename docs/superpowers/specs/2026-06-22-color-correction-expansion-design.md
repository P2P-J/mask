# 색보정 확장 설계 — 8종 추가

작성일: 2026-06-22.

## 목표
색보정 레이어(현재 밝기·대비·톤·화이트밸런스·채도·따뜻함 6종)에 전문 색보정 도구 **8종**을 추가한다.
방송용 색감 보정의 완성도를 YYCam/전문 그레이딩 수준으로 끌어올린다.

## 추가 기능 (사용자 선택: 톤 디테일 + 색상 정밀 + 선명도)

### ① 톤 디테일 (4종, per-pixel)
- **노출 Exposure** — 곱연산 `c *= exp2(e)`, e∈[-1,1] → 0.5×~2× (±1스톱). 밝기(가산)와 구분.
- **하이라이트 Highlights** — 밝은 영역만 `smoothstep(0.5,1.0,l)` 가중 ±.
- **그림자 Shadows** — 어두운 영역만 `1-smoothstep(0.0,0.5,l)` 가중 ±.
- **감마 Gamma** — 중간톤 `pow(c, 1/exp2(g))`, g∈[-1,1] → 감마 0.5~2.

### ② 색상 정밀 (3종)
- **색조 Tint** — 녹↔마젠타 직교축. `c.g -= t*0.08; c.r += t*0.04; c.b += t*0.04`. 따뜻함(청↔호박)과 함께 2축 화이트밸런스 완성.
- **생동감 Vibrance** — 채도가 낮은 픽셀일수록 강하게 부스트 + 피부 hue(주황, r>g>b) 보호. 과채도 없이 생기.
- **색상 Hue** — 휘도축 기준 회전(Rodrigues 회전), ±π(±180°).

### ③ 선명도 (1종)
- **선명도 Sharpness** — 언샤프 마스크. 입력 4이웃 평균과 중심의 차(고주파)를 결과에 가산. 텍셀 크기 유니폼 `u_texel = (1/w, 1/h)` 필요. 기본 0(꺼짐).

## 슬라이더 규약
- 전부 0~100. 양방향(노출·하이라이트·그림자·감마·색조·생동감·색상)은 50=중립.
- 선명도는 0=꺼짐.
- editor가 params 키 순서대로 슬라이더 자동 렌더 → 키 추가 순서 = 표시 순서.

## 셰이더 적용 순서 (COLOR_FS)
1. 선명도 고주파 추출(입력 4이웃 기준) — `hf = c - avg(neighbors)`
2. 노출 `c *= exp2(exposure)`
3. 밝기(기존 가산)
4. 대비(기존)
5. 하이라이트/그림자(휘도 가중 ±)
6. 감마 `c = pow(max(c,0), 1/gamma)`
7. 화이트밸런스/톤/따뜻함/색조(채널 시프트)
8. 색상 회전(Hue)
9. 생동감(피부 보호 채도)
10. 채도(기존)
11. 고주파 가산 `c += hf * sharpness`
12. clamp(0,1)

## 매핑 (mapping.ts colorUniforms)
- exposure: (p.exposure-50)/50 → ±1
- highlights: (p.highlights-50)/50 → ±1
- shadows: (p.shadows-50)/50 → ±1
- gamma: exp2((p.gamma-50)/50) → 0.5~2 (중립 1)
- tint: (p.tint-50)/50 → ±1
- vibrance: (p.vibrance-50)/50 → ±1
- hue: (p.hue-50)/50*PI → ±π
- sharpness: (p.sharpness ?? 0)/100 → 0~1

모든 신규 키는 `?? 중립값`으로 안전 처리(기존 매핑과 동일 관례).

## 손대는 파일
- `src/pipeline/passes.ts` — COLOR_FS에 유니폼 8개 + `u_texel`, ColorPass.u 확장, render 바인딩, resize에서 texel 계산.
- `src/shared/gl/mapping.ts` — ColorUniforms에 8필드, colorUniforms 매핑.
- `src/entities/scene/defaults.ts` — color 레이어 params에 8키(exposure/highlights/shadows/gamma/tint/vibrance/hue=50, sharpness=0).
- `src/ui/docks/editor.ts` — LABELS 8개.

## 호환성
- `mergeDefaults`가 기존 저장 상태(localStorage)에 누락 키를 자동 병합 → 상태키 버전 상향 불필요.

## 테스트
- `mapping.test`(또는 동등 위치)에 colorUniforms 신규 필드 검증: 중립 50→neutral(노출 0, 감마 1, 색조 0 등), 양끝 범위, sharpness 0→0.

## 리스크
- 전부 best-effort 셰이더 상수 → 실기기 시각 튜닝 대상(특히 vibrance 피부보호 강도, sharpness 양, highlights/shadows 게이트 폭).
- 화면을 볼 수 없으므로 블라인드 미세조정 금지 — 사용자 피드백 받아 조정.

---

## 2차 확장 — 경쟁 앱(B612/Ulike/SODA) 갭 보완 (2026-06-22)

리서치로 확인한 조정 패널 갭: 구조·페이드·비네트·그레인·스플릿톤·HSL. 사용자 "전부" 선택.

### Tier 1 — 스칼라 4종 (순수 셰이더)
- **구조 Structure**(50중립, ±) — 입력 넓은 반경(≈3텍셀) 휘도 블러와의 차(중간주파 디테일)를 중간톤 가중으로 가산. 선명도(1텍셀)와 구분되는 로컬 대비.
- **페이드 Fade**(0=off) — 매트/필름톤. `c = mix(c, c*0.85+0.12, f)` 블랙 리프트+대비 압축.
- **비네트 Vignette**(0=off) — 화면 중심 거리(가로세로비 보정) 기반 가장자리 음영 곱.
- **그레인 Grain**(0=off) — 픽셀좌표 해시 노이즈 가산.

### Tier 2 — 스플릿 톤
- **스플릿톤 강도 splitTone**(0=off) + **밸런스 splitBalance**(50중립) + 컬러 2개(`splitShadow`/`splitHighlight`, colors 맵 → 컬러피커 자동 렌더).
- 휘도로 그림자/하이라이트 가중, 각 영역에 (색-0.5)*2 틴트 가산.

### Tier 3 — HSL (8밴드)
- 밴드: 빨강/주황/노랑/초록/청록/파랑/보라/자홍 (hue center 0,30,60,120,180,240,280,320°).
- 각 밴드 H/S/L → params `hslH0..7`/`hslS0..7`/`hslL0..7` (24키, 50중립). 활성 밴드 = `selects.hslBand`.
- 셰이더: rgb→hsv, 픽셀 hue의 밴드 가중(각거리 폴오프, 정규화) 합으로 `hueShift/satMul/lumAdd` → 적용 → hsv→rgb. 유니폼 배열 `u_hslH[8]/u_hslS[8]/u_hslL[8]`.
- **editor 변경:** `hsl[HSL]\d` 키와 `hslBand` 셀렉트는 일반 루프에서 제외하고, 전용 HSL 위젯(밴드 드롭다운 + 활성 밴드 3슬라이더)으로 렌더. 슬라이더 행 생성은 `makeSlider` 헬퍼로 추출해 재사용.

### 셰이더 최종 순서(갱신)
sharpness/structure 디테일 추출(입력) → 노출 → 밝기 → 대비 → 하이라이트/그림자 → 감마 → 화이트밸런스/톤/따뜻함/색조 → 색상회전 → **HSL** → **스플릿톤** → 생동감 → 채도 → **구조 가산** → 선명도 가산 → **페이드** → **그레인** → **비네트** → clamp

### 매핑(추가 스칼라)
structure ±1, fade/vignette/grain/splitTone 0~1, splitBalance ±1. HSL 배열·스플릿 컬러는 `ColorPass.render`에서 params/colors로 직접 구성.

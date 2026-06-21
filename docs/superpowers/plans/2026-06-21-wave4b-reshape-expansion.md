# 웨이브 4b — 리쉐이프 기능 대량 확장 Implementation Plan

> REQUIRED SUB-SKILL: executing-plans. W3 백로그(높음+중간) 구현. best-effort 앵커/강도 → 실기기 튜닝 대상(기존 18종과 동일 정책). W4a 클램핑이 과변형을 막아줌.

**Goal:** 리쉐이프에 15종 신규 컨트롤 추가(랜드마크 기반). 파일: `defaults.ts`(params), `editor.ts`(LABELS 한글), `reshapeDeformers.ts`(deformer), `reshapeDeformers.ts`의 `MAX_DEFORMERS` 32→48.

**검증:** tsc + 빌드 + 단위테스트 유지 + 실행 육안.

## 신규 컨트롤 (key → 한글, 기본값, 방향)
| key | 한글(LABELS) | 기본 | 종류 |
|---|---|---|---|
| faceLength | 얼굴 길이 | 50 | bi(>50 길게) |
| jawWidth | 턱폭(하관) | 0 | uni(축소) |
| temple | 관자놀이 | 0 | uni(축소) |
| cheekReduce | 볼살 축소 | 0 | uni |
| cheekLift | 볼 리프팅 | 0 | uni(위로) |
| innerCorner | 앞트임 | 0 | uni |
| outerCorner | 뒤트임 | 0 | uni |
| eyeHeight | 눈 높이 | 0 | uni(세로 확대) |
| eyePosY | 눈 위치(상하) | 50 | bi(>50 위로) |
| philtrum | 인중 길이 | 50 | bi(>50 길게) |
| lipWidth | 입술 너비 | 50 | bi(>50 넓게) |
| cupidBow | 큐피드 보우 | 0 | uni |
| noseRoot | 코뿌리 | 0 | uni(좁힘) |
| noseLength | 코 길이 | 50 | bi |
| browDist | 눈썹 간격 | 50 | bi(>50 넓게) |

## Task 1: MAX_DEFORMERS 32→48 (reshapeDeformers.ts)
## Task 2: defaults.ts reshape params에 위 15키 추가(기본값대로)
## Task 3: editor.ts LABELS에 15키 한글 추가
## Task 4: reshapeDeformers.ts buildDeformers에 deformer 추가(아래 공식, 적절 섹션)
- faceLength: `add(C, W*0.85, H*1.05, 0, bi(p,"faceLength")*0.16);`
- temple: `add(uv(lm,21), W*0.3,H*0.3, 0,0, +uni(p,"temple")*W*0.05,0); add(uv(lm,251), W*0.3,H*0.3, 0,0, -uni(p,"temple")*W*0.05,0);`
- cheekReduce: `add(uv(lm,205), W*0.3,H*0.3, 0,0, +uni(p,"cheekReduce")*W*0.045,0); add(uv(lm,425), W*0.3,H*0.3, 0,0, -uni(p,"cheekReduce")*W*0.045,0);`
- cheekLift: `add(uv(lm,205), W*0.35,H*0.3, 0,0,0,+uni(p,"cheekLift")*H*0.03); add(uv(lm,425), W*0.35,H*0.3, 0,0,0,+uni(p,"cheekLift")*H*0.03);`
- jawWidth(턱 블록): `add(uv(lm,172), W*0.4,H*0.4, 0,0, +uni(p,"jawWidth")*W*0.055,0); add(uv(lm,397), W*0.4,H*0.4, 0,0, -uni(p,"jawWidth")*W*0.055,0);`
- 눈 블록:
  - `add(leftEye, ew*1.5, ew*1.4, 0, uni(p,"eyeHeight")*0.3); add(rightEye, ew*1.5, ew*1.4, 0, uni(p,"eyeHeight")*0.3);`
  - `const eposy = bi(p,"eyePosY")*H*0.035; add(leftEye, ew*1.6,ew*1.6, 0,0,0, +eposy); add(rightEye, ew*1.6,ew*1.6, 0,0,0, +eposy);`
  - `const ic = uni(p,"innerCorner")*ew*0.12; add(uv(lm,133), ew*0.5,ew*0.5, 0,0, +ic,0); add(uv(lm,362), ew*0.5,ew*0.5, 0,0, -ic,0);`
  - `const oc = uni(p,"outerCorner")*ew*0.12; add(uv(lm,33), ew*0.5,ew*0.5, 0,0, -oc,0); add(uv(lm,263), ew*0.5,ew*0.5, 0,0, +oc,0);`
- 코 블록: `add(uv(lm,168), nw*0.7, H*0.18, -uni(p,"noseRoot")*0.22, 0); add(nt, nw*1.4, H*0.3, 0, bi(p,"noseLength")*0.16);`
- 입 블록: `add(uv(lm,0), mw*0.7, H*0.2, 0,0,0, -bi(p,"philtrum")*H*0.025); const lw=bi(p,"lipWidth")*mw*0.12; add(uv(lm,61), mw*0.5,mw*0.5, 0,0,-lw,0); add(uv(lm,291), mw*0.5,mw*0.5, 0,0,+lw,0); add(uv(lm,0), mw*0.35, mw*0.2, 0, uni(p,"cupidBow")*0.14);`
- 눈썹 블록: `const bd=bi(p,"browDist")*W*0.025; add(uv(lm,105), W*0.25,H*0.15, 0,0, -bd,0); add(uv(lm,334), W*0.25,H*0.15, 0,0, +bd,0);`

## Task 5: 검증 + 커밋
- `npx tsc --noEmit` + `npm test` + `npm run build` + `node --check electron/main.cjs`.
- 커밋: `feat(reshape): 리쉐이프 15종 확장(얼굴길이·턱폭·관자놀이·볼·앞뒤트임·눈높이/위치·인중·입술너비·큐피드보우·코뿌리/길이·눈썹간격)`

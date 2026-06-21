# Phase 2 — DRY 리팩토링 (셰이더/유틸 중복 제거) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. 체크박스로 추적.

**Goal:** gl 패스 전반에 복사된 동일 셰이더 문자열·VAO 셋업을 `glUtils.ts`로 추출해 ~150줄 중복을 제거한다. **순수 리팩토링 — 렌더 결과 불변.**

**Architecture:** 분석에서 바이트-동일 확인됨(PASSTHROUGH_FS ×5, GEO_VS ×4, BLUR_FS ×2, 동적 VAO 셋업 ×4). 동일 문자열을 옮기므로 동작 보존이 구성상 보장된다. 검증: `npm test`(30개) + `npm run build` 무에러.

**비범위(Phase 3로 이월):** blit()/destroyRenderTarget 추출, 네이밍 변경(FxPass→EffectPass 등), 랜드마크 상수화. removeScene/CATEGORIES는 스캐폴딩이라 유지.

---

## Task 1: glUtils에 공용 셰이더/유틸 추가

**Files:** Modify `src/gl/glUtils.ts`

- [ ] **Step 1: glUtils.ts 끝에 추가** — `passes.ts`의 `PASSTHROUGH_FS`, `smoothing.ts`의 `GEO_VS`·`BLUR_FS` 문자열을 **그 파일에서 그대로 복사**해 export 상수로 옮기고, 동적 VAO 헬퍼 추가:

```ts
// 패스스루 프래그먼트(텍스처 그대로 출력) — 여러 패스 공용
export const PASSTHROUGH_FS = `<passes.ts의 PASSTHROUGH_FS 내용 그대로>`;

// 랜드마크 팬/메시 래스터화용 정점 셰이더 — 여러 마스크 패스 공용
export const GEO_VS = `<smoothing.ts의 GEO_VS 내용 그대로>`;

// Kawase 4-tap 블러 — smoothing/background 공용
export const BLUR_FS = `<smoothing.ts의 BLUR_FS 내용 그대로>`;

// 동적 지오메트리(랜드마크 팬) VAO — attrib0=vec2, 매 프레임 bufferData로 갱신
export function createDynamicGeomVAO(gl: WebGL2RenderingContext): {
  vao: WebGLVertexArrayObject;
  buf: WebGLBuffer;
} {
  const vao = gl.createVertexArray();
  if (!vao) throw new Error("동적 VAO 생성 실패");
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  if (!buf) throw new Error("동적 버퍼 생성 실패");
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return { vao, buf };
}
```

- [ ] **Step 2:** `npm run build` 통과 확인(새 export만 추가, 아직 미사용 — `noUnusedLocals`는 export엔 무관).

---

## Task 2: 각 패스에서 중복 제거 후 glUtils 사용

각 파일에서 **로컬 셰이더 상수 선언 삭제 → glUtils import에 추가 → 참조명 정리**, VAO 셋업은 헬퍼 호출로 교체.

**Files:** `src/gl/passes.ts`, `smoothing.ts`, `makeup.ts`, `teeth.ts`, `eyeDetail.ts`, `background.ts`

- [ ] **Step 1: passes.ts** — 로컬 `PASSTHROUGH_FS` 선언 삭제, glUtils에서 import. (사용처 그대로 `PASSTHROUGH_FS`.)
- [ ] **Step 2: smoothing.ts** — 로컬 `GEO_VS`, `BLUR_FS` 선언 삭제, glUtils import에 `GEO_VS, BLUR_FS, createDynamicGeomVAO` 추가. 생성자 VAO 7줄(`createVertexArray…bindVertexArray(null)`)을 `const { vao, buf } = createDynamicGeomVAO(gl); this.geoVao = vao; this.geoBuf = buf;`로 교체. (`GEO_FS`는 smoothing 고유라 유지.)
- [ ] **Step 3: makeup.ts** — 로컬 `PASS_FS`·`GEO_VS` 삭제, glUtils에서 `PASSTHROUGH_FS, GEO_VS, createDynamicGeomVAO` import. 코드 내 `PASS_FS` 참조 → `PASSTHROUGH_FS`. VAO 7줄 → 헬퍼. (인라인 블러는 makeup 고유라 유지.)
- [ ] **Step 4: teeth.ts** — `PASS_FS`·`GEO_VS` 삭제 → import(`PASSTHROUGH_FS, GEO_VS, createDynamicGeomVAO`), `PASS_FS`참조→`PASSTHROUGH_FS`, VAO→헬퍼.
- [ ] **Step 5: eyeDetail.ts** — teeth.ts와 동일 패턴.
- [ ] **Step 6: background.ts** — 로컬 `PASS_FS`·`BLUR_FS` 삭제 → import(`PASSTHROUGH_FS, BLUR_FS`), `PASS_FS`참조→`PASSTHROUGH_FS`. (background는 동적 VAO 없음 — VAO 헬퍼 미사용.)
- [ ] **Step 7: 검증** — `npm run build && npm test` 통과. 그리고 **셰이더 동작 보존 확인**: 빌드 후 추출 문자열이 원본과 동일했음을 신뢰(사전 해시 검증 완료).

---

## Task 3: 죽은 주석 제거 + 최종 검증/커밋

- [ ] **Step 1:** `src/gl/passes.ts`의 `// Plan B Task 3에서 smoothing을 실제 SmoothingPass로 교체. 지금은 패스스루.` 줄 삭제(이미 교체됨, 거짓 주석).
- [ ] **Step 2:** `npm test && npm run build` 전체 통과.
- [ ] **Step 3: 커밋**

```bash
git add src/gl/
git commit -m "refactor(gl): 공용 셰이더(PASSTHROUGH_FS/GEO_VS/BLUR_FS)·동적 VAO를 glUtils로 추출(DRY) + 죽은 주석 제거"
```
(Co-Authored-By 금지.)

---

## Self-Review
- 동작 보존: 옮기는 문자열은 사전 해시로 바이트-동일 확인됨. VAO 셋업도 정규화 해시 동일.
- 위험: import 누락/참조명 오타 → 빌드가 즉시 잡음.
- 커밋은 gl/ 일괄 1건(상호 의존이라 분리 시 중간 빌드 깨짐).

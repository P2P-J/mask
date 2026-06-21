import {
  compileProgram,
  createFullscreenVAO,
  createRenderTarget,
  createDynamicGeomVAO,
  FULLSCREEN_VS,
  GEO_VS,
  BLUR_FS,
  type RenderTarget,
} from "../../shared/gl/glUtils";
import { buildFan, buildMeshVerts } from "../geometry/faceMaskGeometry";
import { FACE_TRIANGLES, HOLES } from "../geometry/faceRegions";
import type { FxPass } from "../passes";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// 마스크 지오메트리(랜드마크 윤곽 → 삼각형) 셰이더
const GEO_FS = `#version 300 es
precision highp float;
uniform float u_val;
out vec4 o;
void main(){ o = vec4(vec3(u_val), 1.0); }`;

// 합성: 마스크 영역에 저주파 스무딩 + 고주파 텍스처 복원, 약한 스킨톤 게이트
const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_orig;
uniform sampler2D u_blur;
uniform sampler2D u_mask;
uniform float u_strength;
uniform float u_texture;
uniform float u_clarity;    // 잡티/주름 완화
uniform float u_evenTone;   // 피부톤 균일화
uniform float u_brighten;   // 얼굴 밝히기
uniform float u_darkCircle; // 다크서클 완화
uniform vec2 u_eyeL;        // 좌 눈밑 중심(uv)
uniform vec2 u_eyeR;        // 우 눈밑 중심
uniform float u_eyeRad;     // 눈밑 영역 반경
out vec4 o;
const vec3 LUMA = vec3(0.299, 0.587, 0.114);
void main(){
  vec3 orig = texture(u_orig, v_uv).rgb;
  vec3 blur = texture(u_blur, v_uv).rgb;
  float m = texture(u_mask, v_uv).r;
  // 약한 스킨톤 게이트(윤곽 안 머리카락/수염 제외) — 부드럽게
  float Y  = dot(orig, LUMA);
  float Cb = (orig.b - Y)*0.564 + 0.5;
  float Cr = (orig.r - Y)*0.713 + 0.5;
  float skin = smoothstep(0.40,0.46,Cr) * (1.0 - smoothstep(0.62,0.68,Cr))
             * smoothstep(0.24,0.30,Cb) * (1.0 - smoothstep(0.50,0.56,Cb));
  float notDark = smoothstep(0.10, 0.20, Y);
  m *= mix(1.0, skin * notDark, 0.85);
  m = clamp(m, 0.0, 1.0);

  // 1) 스무딩 + 텍스처 복원
  vec3 hf = orig - blur;
  vec3 res = mix(orig, blur, u_strength) + u_texture * hf;
  // 2) 잡티/주름 완화: 주변보다 어두운 점/선을 블러로 더 밀어줌
  float spot = clamp((dot(blur, LUMA) - dot(res, LUMA)) * 4.0, 0.0, 1.0);
  res = mix(res, blur, u_clarity * spot);
  // 3) 피부톤 균일화: 색은 국소평균(blur), 밝기는 보존
  vec3 evened = blur + (dot(res, LUMA) - dot(blur, LUMA));
  res = mix(res, evened, u_evenTone);
  // 4) 얼굴 밝히기
  res += u_brighten * 0.16;

  vec3 outc = mix(orig, res, m);

  // 5) 다크서클 완화(눈밑 영역만 밝힘)
  float de = max(
    1.0 - smoothstep(0.0, u_eyeRad, length(v_uv - u_eyeL)),
    1.0 - smoothstep(0.0, u_eyeRad, length(v_uv - u_eyeR))
  );
  outc += u_darkCircle * 0.18 * de * m;

  o = vec4(clamp(outc, 0.0, 1.0), 1.0);
}`;

const KAWASE_OFFSETS = [0.0, 1.0, 2.0, 2.0];

export class SmoothingPass implements FxPass {
  id = "smoothing";
  private gl: WebGL2RenderingContext;
  private fsVao: WebGLVertexArrayObject;
  private geoVao: WebGLVertexArrayObject;
  private geoBuf: WebGLBuffer;
  private geoProg: WebGLProgram;
  private blurProg: WebGLProgram;
  private compProg: WebGLProgram;
  private maskGeom: RenderTarget | null = null;
  private maskBlur: RenderTarget | null = null;
  private blurA: RenderTarget | null = null;
  private blurB: RenderTarget | null = null;
  private w = 0;
  private h = 0;
  private uGeoVal: WebGLUniformLocation | null;
  private ub: Record<string, WebGLUniformLocation | null> = {};
  private uc: Record<string, WebGLUniformLocation | null> = {};

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.fsVao = createFullscreenVAO(gl);
    const { vao, buf } = createDynamicGeomVAO(gl);
    this.geoVao = vao;
    this.geoBuf = buf;

    this.geoProg = compileProgram(gl, GEO_VS, GEO_FS);
    this.blurProg = compileProgram(gl, FULLSCREEN_VS, BLUR_FS);
    this.compProg = compileProgram(gl, FULLSCREEN_VS, COMPOSITE_FS);
    this.uGeoVal = gl.getUniformLocation(this.geoProg, "u_val");
    for (const n of ["u_tex", "u_texel", "u_offset"]) this.ub[n] = gl.getUniformLocation(this.blurProg, n);
    for (const n of [
      "u_orig", "u_blur", "u_mask", "u_strength", "u_texture",
      "u_clarity", "u_evenTone", "u_brighten", "u_darkCircle", "u_eyeL", "u_eyeR", "u_eyeRad",
    ])
      this.uc[n] = gl.getUniformLocation(this.compProg, n);
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    const gl = this.gl;
    for (const rt of [this.maskGeom, this.maskBlur, this.blurA, this.blurB]) {
      if (rt) {
        gl.deleteFramebuffer(rt.fbo);
        gl.deleteTexture(rt.tex);
      }
    }
    this.maskGeom = createRenderTarget(gl, w, h);
    this.maskBlur = createRenderTarget(gl, w, h);
    this.blurA = createRenderTarget(gl, w, h);
    this.blurB = createRenderTarget(gl, w, h);
  }

  render(
    input: WebGLTexture,
    target: WebGLFramebuffer | null,
    params: Record<string, number>,
    landmarks: NormalizedLandmark[] | null
  ): void {
    const gl = this.gl;
    if (!this.maskGeom || !this.maskBlur || !this.blurA || !this.blurB || !landmarks) {
      this.blit(input, target);
      return;
    }
    gl.disable(gl.BLEND);

    // 1) 지오메트리 마스크: face 흰색 채우고 눈/눈썹/입 검정으로 도려냄
    gl.bindVertexArray(this.geoVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.geoBuf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskGeom.fbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.geoProg);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.drawMesh(landmarks, FACE_TRIANGLES, 1.0); // 전체 얼굴 메시 = 그 사람 얼굴 표면 그대로
    for (const hole of HOLES) this.drawFan(landmarks, hole, 0.0); // 눈/눈썹/입 도려냄

    // 2) 마스크 페더(2패스 블러) → maskBlur
    gl.bindVertexArray(this.fsVao);
    gl.useProgram(this.blurProg);
    gl.uniform2f(this.ub.u_texel, 1 / this.w, 1 / this.h);
    this.blurPass(this.maskGeom.tex, this.blurA.fbo, 1.0);
    this.blurPass(this.blurA.tex, this.maskBlur.fbo, 1.0);

    // 3) 비디오 Kawase 블러(input → blurA/blurB 핑퐁)
    let readTex = input;
    let writeRT = this.blurA;
    let otherRT = this.blurB;
    for (const off of KAWASE_OFFSETS) {
      this.blurPass(readTex, writeRT.fbo, off);
      readTex = writeRT.tex;
      [writeRT, otherRT] = [otherRT, writeRT];
    }
    const blurTex = readTex;

    // 4) 합성 → target
    gl.useProgram(this.compProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, this.w, this.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.uc.u_orig, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, blurTex);
    gl.uniform1i(this.uc.u_blur, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.maskBlur.tex);
    gl.uniform1i(this.uc.u_mask, 2);
    gl.uniform1f(this.uc.u_strength, (params.strength ?? 0) / 100);
    gl.uniform1f(this.uc.u_texture, (params.texture ?? 0) / 100);
    gl.uniform1f(this.uc.u_clarity, (params.clarity ?? 0) / 100);
    gl.uniform1f(this.uc.u_evenTone, (params.evenTone ?? 0) / 100);
    gl.uniform1f(this.uc.u_brighten, (params.brighten ?? 0) / 100);
    gl.uniform1f(this.uc.u_darkCircle, (params.darkCircle ?? 0) / 100);
    // 눈밑 영역(다크서클): 눈 중심에서 약간 아래(uv y는 위로 증가 → 아래=−)
    const p = (i: number): [number, number] => [landmarks[i].x, 1 - landmarks[i].y];
    const lc = p(159);
    const rc = p(386); // 각 눈 아래 눈꺼풀 근처
    const ew = Math.hypot(p(133)[0] - p(33)[0], p(133)[1] - p(33)[1]);
    gl.uniform2f(this.uc.u_eyeL, lc[0], lc[1] - ew * 0.4);
    gl.uniform2f(this.uc.u_eyeR, rc[0], rc[1] - ew * 0.4);
    gl.uniform1f(this.uc.u_eyeRad, ew * 0.85);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
  }

  // 전체 메시 삼각형을 동적 버퍼에 올려 그린다(geoVao/geoBuf 바인딩 상태에서 호출)
  private drawMesh(landmarks: NormalizedLandmark[], triangles: number[], val: number): void {
    const gl = this.gl;
    const verts = buildMeshVerts(landmarks, triangles, 1.08); // 8% 팽창 → 이마/헤어라인 쪽 커버 확장
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    gl.uniform1f(this.uGeoVal, val);
    gl.drawArrays(gl.TRIANGLES, 0, verts.length / 2);
  }

  // 영역 정점 팬을 동적 버퍼에 올려 그린다(geoVao/geoBuf가 바인딩된 상태에서 호출)
  private drawFan(landmarks: NormalizedLandmark[], indices: number[], val: number): void {
    const gl = this.gl;
    const verts = buildFan(landmarks, indices);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    gl.uniform1f(this.uGeoVal, val);
    gl.drawArrays(gl.TRIANGLES, 0, verts.length / 2);
  }

  // 풀스크린 블러 1패스(blurProg/texel이 설정된 상태에서 호출)
  private blurPass(srcTex: WebGLTexture, dstFbo: WebGLFramebuffer, offset: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1i(this.ub.u_tex, 0);
    gl.uniform1f(this.ub.u_offset, offset);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // 얼굴 미검출 시 원본 패스스루
  private blit(input: WebGLTexture, target: WebGLFramebuffer | null): void {
    const gl = this.gl;
    gl.bindVertexArray(this.fsVao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.blurProg);
    gl.uniform2f(this.ub.u_texel, 0, 0);
    gl.uniform1f(this.ub.u_offset, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.ub.u_tex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

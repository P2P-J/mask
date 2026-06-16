import {
  compileProgram,
  createFullscreenVAO,
  createRenderTarget,
  FULLSCREEN_VS,
  type RenderTarget,
} from "./glUtils";
import { buildFan } from "./faceMaskGeometry";
import { REGIONS } from "./faceRegions";
import type { FxPass } from "./passes";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// 마스크 지오메트리(랜드마크 윤곽 → 삼각형) 셰이더
const GEO_VS = `#version 300 es
layout(location=0) in vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`;
const GEO_FS = `#version 300 es
precision highp float;
uniform float u_val;
out vec4 o;
void main(){ o = vec4(vec3(u_val), 1.0); }`;

// Kawase 블러(4탭) — 비디오/마스크 페더 공용
const BLUR_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_offset;
out vec4 o;
void main(){
  vec2 t = u_texel * (u_offset + 0.5);
  vec4 s = texture(u_tex, v_uv + vec2( t.x,  t.y));
  s += texture(u_tex, v_uv + vec2(-t.x,  t.y));
  s += texture(u_tex, v_uv + vec2( t.x, -t.y));
  s += texture(u_tex, v_uv + vec2(-t.x, -t.y));
  o = s * 0.25;
}`;

// 합성: 마스크 영역에 저주파 스무딩 + 고주파 텍스처 복원, 약한 스킨톤 게이트
const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_orig;
uniform sampler2D u_blur;
uniform sampler2D u_mask;
uniform float u_strength;
uniform float u_texture;
out vec4 o;
void main(){
  vec3 orig = texture(u_orig, v_uv).rgb;
  vec3 blur = texture(u_blur, v_uv).rgb;
  float m = texture(u_mask, v_uv).r;
  // 약한 스킨톤 게이트(윤곽 안 머리카락/수염 제외) — 부드럽게
  float Y  = dot(orig, vec3(0.299,0.587,0.114));
  float Cb = (orig.b - Y)*0.564 + 0.5;
  float Cr = (orig.r - Y)*0.713 + 0.5;
  float skin = smoothstep(0.40,0.46,Cr) * (1.0 - smoothstep(0.62,0.68,Cr))
             * smoothstep(0.24,0.30,Cb) * (1.0 - smoothstep(0.50,0.56,Cb));
  m *= mix(1.0, skin, 0.6);
  m = clamp(m, 0.0, 1.0);
  vec3 hf = orig - blur;
  vec3 sm = mix(orig, blur, u_strength);
  vec3 result = sm + u_texture * hf;
  o = vec4(mix(orig, result, m), 1.0);
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
    // 동적 지오메트리 VAO(랜드마크 팬 정점, 매 프레임 갱신)
    this.geoVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.geoVao);
    this.geoBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.geoBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.geoProg = compileProgram(gl, GEO_VS, GEO_FS);
    this.blurProg = compileProgram(gl, FULLSCREEN_VS, BLUR_FS);
    this.compProg = compileProgram(gl, FULLSCREEN_VS, COMPOSITE_FS);
    this.uGeoVal = gl.getUniformLocation(this.geoProg, "u_val");
    for (const n of ["u_tex", "u_texel", "u_offset"]) this.ub[n] = gl.getUniformLocation(this.blurProg, n);
    for (const n of ["u_orig", "u_blur", "u_mask", "u_strength", "u_texture"])
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
    this.drawFan(landmarks, REGIONS.face, 1.0);
    for (const hole of REGIONS.holes) this.drawFan(landmarks, hole, 0.0);

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
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
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

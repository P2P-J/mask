import { compileProgram, createRenderTarget, FULLSCREEN_VS, type RenderTarget } from "./glUtils";
import { maskUniforms } from "./skinMaskMath";
import type { FxPass } from "./passes";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// 1) 스킨 마스크: YCbCr 스킨 ∩ 얼굴 타원 − 눈/입 제외
const MASK_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_faceC; uniform vec2 u_faceR;
uniform vec2 u_eyeL; uniform vec2 u_eyeR; uniform vec2 u_mouth;
uniform float u_featR;
out vec4 o;
float e(vec2 p, vec2 c, vec2 r){ vec2 d=(p-c)/max(r,vec2(1e-4)); return dot(d,d); }
void main(){
  vec3 c = texture(u_tex, v_uv).rgb;
  float Y  = dot(c, vec3(0.299,0.587,0.114));
  float Cb = (c.b - Y)*0.564 + 0.5;
  float Cr = (c.r - Y)*0.713 + 0.5;
  float skin = step(0.44,Cr)*step(Cr,0.63)*step(0.27,Cb)*step(Cb,0.51);
  float face = 1.0 - smoothstep(0.85, 1.15, e(v_uv,u_faceC,u_faceR));
  float ex = 0.0;
  ex = max(ex, 1.0 - smoothstep(0.5,1.0, e(v_uv,u_eyeL, vec2(u_featR))));
  ex = max(ex, 1.0 - smoothstep(0.5,1.0, e(v_uv,u_eyeR, vec2(u_featR))));
  ex = max(ex, 1.0 - smoothstep(0.5,1.0, e(v_uv,u_mouth, vec2(u_featR*1.4,u_featR))));
  o = vec4(vec3(clamp(skin*face*(1.0-ex),0.0,1.0)), 1.0);
}`;

// 2) Kawase 블러(4탭)
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

// 3) 주파수 분리 합성: 저주파 스무딩 + 고주파(텍스처) 복원, 스킨 마스크로 한정
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
  vec3 hf = orig - blur;
  vec3 sm = mix(orig, blur, u_strength);
  vec3 result = sm + u_texture * hf;
  o = vec4(mix(orig, result, m), 1.0);
}`;

const KAWASE_OFFSETS = [0.0, 1.0, 2.0, 2.0]; // 4패스

export class SmoothingPass implements FxPass {
  id = "smoothing";
  private gl: WebGL2RenderingContext;
  private maskProg: WebGLProgram;
  private blurProg: WebGLProgram;
  private compProg: WebGLProgram;
  private mask: RenderTarget | null = null;
  private blurA: RenderTarget | null = null;
  private blurB: RenderTarget | null = null;
  private w = 0;
  private h = 0;
  // 유니폼 위치 캐시
  private um: Record<string, WebGLUniformLocation | null> = {};
  private ub: Record<string, WebGLUniformLocation | null> = {};
  private uc: Record<string, WebGLUniformLocation | null> = {};

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.maskProg = compileProgram(gl, FULLSCREEN_VS, MASK_FS);
    this.blurProg = compileProgram(gl, FULLSCREEN_VS, BLUR_FS);
    this.compProg = compileProgram(gl, FULLSCREEN_VS, COMPOSITE_FS);
    const loc = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
    for (const n of ["u_tex", "u_faceC", "u_faceR", "u_eyeL", "u_eyeR", "u_mouth", "u_featR"])
      this.um[n] = loc(this.maskProg, n);
    for (const n of ["u_tex", "u_texel", "u_offset"]) this.ub[n] = loc(this.blurProg, n);
    for (const n of ["u_orig", "u_blur", "u_mask", "u_strength", "u_texture"])
      this.uc[n] = loc(this.compProg, n);
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    const gl = this.gl;
    for (const rt of [this.mask, this.blurA, this.blurB]) {
      if (rt) {
        gl.deleteFramebuffer(rt.fbo);
        gl.deleteTexture(rt.tex);
      }
    }
    this.mask = createRenderTarget(gl, w, h);
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
    if (!this.mask || !this.blurA || !this.blurB || !landmarks) {
      // 얼굴 없으면 원본 그대로 통과
      this.blit(input, target);
      return;
    }
    gl.viewport(0, 0, this.w, this.h);

    // 1) 마스크
    const u = maskUniforms(landmarks);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.mask.fbo);
    gl.useProgram(this.maskProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.um.u_tex, 0);
    gl.uniform2fv(this.um.u_faceC, u.faceC);
    gl.uniform2fv(this.um.u_faceR, u.faceR);
    gl.uniform2fv(this.um.u_eyeL, u.eyeL);
    gl.uniform2fv(this.um.u_eyeR, u.eyeR);
    gl.uniform2fv(this.um.u_mouth, u.mouth);
    gl.uniform1f(this.um.u_featR, u.featR);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2) Kawase 블러(input → blurA/B 핑퐁)
    gl.useProgram(this.blurProg);
    gl.uniform2f(this.ub.u_texel, 1 / this.w, 1 / this.h);
    let readTex = input;
    let writeRT = this.blurA;
    let otherRT = this.blurB;
    for (const off of KAWASE_OFFSETS) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, writeRT.fbo);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, readTex);
      gl.uniform1i(this.ub.u_tex, 0);
      gl.uniform1f(this.ub.u_offset, off);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      readTex = writeRT.tex;
      [writeRT, otherRT] = [otherRT, writeRT];
    }
    const blurTex = readTex;

    // 3) 합성 → target
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.compProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.uc.u_orig, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, blurTex);
    gl.uniform1i(this.uc.u_blur, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.mask.tex);
    gl.uniform1i(this.uc.u_mask, 2);
    gl.uniform1f(this.uc.u_strength, (params.strength ?? 0) / 100); // 0..1
    gl.uniform1f(this.uc.u_texture, (params.texture ?? 0) / 100); // 0..1
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0); // 텍스처 유닛 원복
  }

  // 패스스루(얼굴 없을 때)
  private blit(input: WebGLTexture, target: WebGLFramebuffer | null): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.blurProg);
    gl.uniform2f(this.ub.u_texel, 0, 0); // offset 무효화 → 사실상 원본 복사
    gl.uniform1f(this.ub.u_offset, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.ub.u_tex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

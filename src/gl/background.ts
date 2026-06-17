import {
  compileProgram,
  createRenderTarget,
  createTexture,
  FULLSCREEN_VS,
  type RenderTarget,
} from "./glUtils";
import type { FxPass } from "./passes";

const PASS_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
out vec4 o;
void main(){ o = texture(u_tex, v_uv); }`;

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

// 인물=선명, 배경=블러. 마스크는 세그멘테이션(top-down)이라 y 반전 샘플.
const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_orig;
uniform sampler2D u_blur;
uniform sampler2D u_mask;
uniform float u_amount;
out vec4 o;
void main(){
  vec3 orig = texture(u_orig, v_uv).rgb;
  vec3 blur = texture(u_blur, v_uv).rgb;
  float person = texture(u_mask, vec2(v_uv.x, 1.0 - v_uv.y)).r;
  float bg = (1.0 - person) * u_amount;
  o = vec4(mix(orig, blur, bg), 1.0);
}`;

const BG_OFFSETS = [0.0, 1.0, 2.0, 3.0, 3.0]; // 강한 배경 블러

export class BackgroundPass implements FxPass {
  id = "background";
  private gl: WebGL2RenderingContext;
  private passProg: WebGLProgram;
  private blurProg: WebGLProgram;
  private compProg: WebGLProgram;
  private maskTex: WebGLTexture;
  private hasMask = false;
  private a: RenderTarget | null = null;
  private b: RenderTarget | null = null;
  private w = 0;
  private h = 0;
  private uPassTex: WebGLUniformLocation | null;
  private ub: Record<string, WebGLUniformLocation | null> = {};
  private uc: Record<string, WebGLUniformLocation | null> = {};

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.passProg = compileProgram(gl, FULLSCREEN_VS, PASS_FS);
    this.blurProg = compileProgram(gl, FULLSCREEN_VS, BLUR_FS);
    this.compProg = compileProgram(gl, FULLSCREEN_VS, COMPOSITE_FS);
    this.maskTex = createTexture(gl);
    this.uPassTex = gl.getUniformLocation(this.passProg, "u_tex");
    for (const n of ["u_tex", "u_texel", "u_offset"]) this.ub[n] = gl.getUniformLocation(this.blurProg, n);
    for (const n of ["u_orig", "u_blur", "u_mask", "u_amount"]) this.uc[n] = gl.getUniformLocation(this.compProg, n);
  }

  // 세그멘테이션 마스크 업로드(파이프라인이 매 프레임 호출). FLIP_Y 끄고 올림(데이터=top-down).
  setMask(data: Uint8Array, mw: number, mh: number): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, mw, mh, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // 파이프라인 기본값 복원
    this.hasMask = true;
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    const gl = this.gl;
    if (this.a) {
      gl.deleteFramebuffer(this.a.fbo);
      gl.deleteTexture(this.a.tex);
    }
    if (this.b) {
      gl.deleteFramebuffer(this.b.fbo);
      gl.deleteTexture(this.b.tex);
    }
    this.a = createRenderTarget(gl, w, h);
    this.b = createRenderTarget(gl, w, h);
  }

  render(
    input: WebGLTexture,
    target: WebGLFramebuffer | null,
    params: Record<string, number>
  ): void {
    const gl = this.gl;
    if (!this.a || !this.b || !this.hasMask) {
      this.blit(input, target);
      return;
    }
    gl.disable(gl.BLEND);

    // 배경 블러용 Kawase
    gl.useProgram(this.blurProg);
    gl.uniform2f(this.ub.u_texel, 1 / this.w, 1 / this.h);
    let readTex = input;
    let write = this.a;
    let other = this.b;
    for (const off of BG_OFFSETS) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
      gl.viewport(0, 0, this.w, this.h);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, readTex);
      gl.uniform1i(this.ub.u_tex, 0);
      gl.uniform1f(this.ub.u_offset, off);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      readTex = write.tex;
      [write, other] = [other, write];
    }

    // 합성 → target
    gl.useProgram(this.compProg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, this.w, this.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.uc.u_orig, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, readTex);
    gl.uniform1i(this.uc.u_blur, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.uniform1i(this.uc.u_mask, 2);
    gl.uniform1f(this.uc.u_amount, (params.blur ?? 0) / 100);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
  }

  private blit(input: WebGLTexture, target: WebGLFramebuffer | null): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.passProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.uPassTex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

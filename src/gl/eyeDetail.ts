import {
  compileProgram,
  createFullscreenVAO,
  createRenderTarget,
  FULLSCREEN_VS,
  type RenderTarget,
} from "./glUtils";
import { buildFan } from "./faceMaskGeometry";
import { LEFT_EYE, RIGHT_EYE } from "./faceRegions";
import type { FxPass } from "./passes";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

const GEO_VS = `#version 300 es
layout(location=0) in vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`;
const GEO_FS = `#version 300 es
precision highp float;
out vec4 o;
void main(){ o = vec4(1.0); }`;
const PASS_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
out vec4 o;
void main(){ o = texture(u_tex, v_uv); }`;

// 눈 밝히기(눈 영역) + 애교살(눈밑 얇은 밴드 하이라이트)
const EYE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_orig;
uniform sampler2D u_eyeMask;
uniform float u_brighten;
uniform float u_aegyo;
uniform vec2 u_aegyoL;
uniform vec2 u_aegyoR;
uniform vec2 u_aegyoRad;
out vec4 o;
void main(){
  vec3 c = texture(u_orig, v_uv).rgb;
  float em = texture(u_eyeMask, v_uv).r;
  c += u_brighten * 0.20 * em; // 눈(흰자/홍채) 또렷하게
  float a = max(
    1.0 - smoothstep(0.0, 1.0, length((v_uv - u_aegyoL) / u_aegyoRad)),
    1.0 - smoothstep(0.0, 1.0, length((v_uv - u_aegyoR) / u_aegyoRad))
  );
  c += u_aegyo * 0.12 * a; // 애교살 하이라이트
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export class EyeDetailPass implements FxPass {
  id = "eyeDetail";
  private gl: WebGL2RenderingContext;
  private fsVao: WebGLVertexArrayObject;
  private geoVao: WebGLVertexArrayObject;
  private geoBuf: WebGLBuffer;
  private geoProg: WebGLProgram;
  private passProg: WebGLProgram;
  private compProg: WebGLProgram;
  private mask: RenderTarget | null = null;
  private w = 0;
  private h = 0;
  private uPassTex: WebGLUniformLocation | null;
  private uc: Record<string, WebGLUniformLocation | null> = {};

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.fsVao = createFullscreenVAO(gl);
    this.geoVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.geoVao);
    this.geoBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.geoBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.geoProg = compileProgram(gl, GEO_VS, GEO_FS);
    this.passProg = compileProgram(gl, FULLSCREEN_VS, PASS_FS);
    this.compProg = compileProgram(gl, FULLSCREEN_VS, EYE_FS);
    this.uPassTex = gl.getUniformLocation(this.passProg, "u_tex");
    for (const n of ["u_orig", "u_eyeMask", "u_brighten", "u_aegyo", "u_aegyoL", "u_aegyoR", "u_aegyoRad"])
      this.uc[n] = gl.getUniformLocation(this.compProg, n);
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    if (this.mask) {
      this.gl.deleteFramebuffer(this.mask.fbo);
      this.gl.deleteTexture(this.mask.tex);
    }
    this.mask = createRenderTarget(this.gl, w, h);
  }

  render(
    input: WebGLTexture,
    target: WebGLFramebuffer | null,
    params: Record<string, number>,
    landmarks: NormalizedLandmark[] | null
  ): void {
    const gl = this.gl;
    if (!this.mask || !landmarks) {
      this.blit(input, target);
      return;
    }
    gl.disable(gl.BLEND);

    // 눈 마스크(좌우 눈 윤곽 팬)
    gl.bindVertexArray(this.geoVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.geoBuf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.mask.fbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.geoProg);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    for (const region of [LEFT_EYE, RIGHT_EYE]) {
      const verts = buildFan(landmarks, region);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, verts.length / 2);
    }

    // 합성
    gl.bindVertexArray(this.fsVao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.compProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.uc.u_orig, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.mask.tex);
    gl.uniform1i(this.uc.u_eyeMask, 1);
    gl.uniform1f(this.uc.u_brighten, (params.eyeBrighten ?? 0) / 100);
    gl.uniform1f(this.uc.u_aegyo, (params.aegyo ?? 0) / 100);
    // 애교살 밴드(눈밑 lower-lid 아래) — uv y는 위로 증가 → 아래 = −
    const p = (i: number): [number, number] => [landmarks[i].x, 1 - landmarks[i].y];
    const ew = Math.hypot(p(133)[0] - p(33)[0], p(133)[1] - p(33)[1]);
    const lo = p(145);
    const ro = p(374);
    gl.uniform2f(this.uc.u_aegyoL, lo[0], lo[1] - ew * 0.22);
    gl.uniform2f(this.uc.u_aegyoR, ro[0], ro[1] - ew * 0.22);
    gl.uniform2f(this.uc.u_aegyoRad, ew * 0.7, ew * 0.28);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
  }

  private blit(input: WebGLTexture, target: WebGLFramebuffer | null): void {
    const gl = this.gl;
    gl.bindVertexArray(this.fsVao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.passProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.uPassTex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

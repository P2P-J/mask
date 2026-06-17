import {
  compileProgram,
  createFullscreenVAO,
  createRenderTarget,
  FULLSCREEN_VS,
  type RenderTarget,
} from "./glUtils";
import { buildFan } from "./faceMaskGeometry";
import { LIPS } from "./faceRegions";
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

// 입 영역(mask) 안에서 "밝고 저채도"인 화소만 치아로 탐지 → 화이트닝.
// 입술(빨강·고채도)·잇몸(분홍)은 자동 제외됨.
const TEETH_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_orig;
uniform sampler2D u_mask;
uniform float u_strength;
out vec4 o;
void main(){
  vec3 c = texture(u_orig, v_uv).rgb;
  float m = texture(u_mask, v_uv).r;
  float Y = dot(c, vec3(0.299, 0.587, 0.114));
  float mx = max(max(c.r, c.g), c.b);
  float mn = min(min(c.r, c.g), c.b);
  float sat = (mx - mn) / max(mx, 1e-4);
  float teeth = smoothstep(0.35, 0.50, Y) * (1.0 - smoothstep(0.25, 0.45, sat));
  float t = m * teeth * u_strength;
  vec3 w = c;
  w += 0.12 * t;        // 밝게
  w.b += 0.06 * t;      // 노랑 제거(파랑↑)
  float l = dot(w, vec3(0.299, 0.587, 0.114));
  w = mix(w, vec3(l), 0.30 * t); // 약간 탈채도
  o = vec4(clamp(w, 0.0, 1.0), 1.0);
}`;

export class TeethPass implements FxPass {
  id = "teeth";
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
    this.compProg = compileProgram(gl, FULLSCREEN_VS, TEETH_FS);
    this.uPassTex = gl.getUniformLocation(this.passProg, "u_tex");
    for (const n of ["u_orig", "u_mask", "u_strength"]) this.uc[n] = gl.getUniformLocation(this.compProg, n);
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

    // 1) 입 영역 마스크(입술 윤곽 팬)
    gl.bindVertexArray(this.geoVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.geoBuf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.mask.fbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.geoProg);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const verts = buildFan(landmarks, LIPS);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, verts.length / 2);

    // 2) 화이트닝 합성 → target
    gl.bindVertexArray(this.fsVao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.compProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.uc.u_orig, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.mask.tex);
    gl.uniform1i(this.uc.u_mask, 1);
    gl.uniform1f(this.uc.u_strength, (params.whiten ?? 0) / 100);
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

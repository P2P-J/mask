import { compileProgram, FULLSCREEN_VS } from "./glUtils";
import type { FxPass } from "./passes";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// 원탭 무드/톤 프리셋(파라메트릭 컬러그레이드). 강도(intensity)로 블렌드.
export const FILTER_PRESETS = ["없음", "화사", "쿨톤", "웜톤", "빈티지", "흑백", "필름"];

const FILTER_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform int u_preset;
uniform float u_amount;
out vec4 o;
const vec3 LUMA = vec3(0.299, 0.587, 0.114);
vec3 sat(vec3 c, float s){ return mix(vec3(dot(c, LUMA)), c, s); }
void main(){
  vec3 c = texture(u_tex, v_uv).rgb;
  vec3 g = c;
  if (u_preset == 1) {            // 화사
    g = sat(c, 1.18) + 0.05; g.r += 0.02;
  } else if (u_preset == 2) {     // 쿨톤
    g = sat(c, 1.05); g.b += 0.05; g.r -= 0.02; g = (g - 0.5) * 1.08 + 0.5;
  } else if (u_preset == 3) {     // 웜톤
    g = sat(c, 1.08); g.r += 0.05; g.b -= 0.04;
  } else if (u_preset == 4) {     // 빈티지
    g = sat(c, 0.7) * vec3(1.05, 1.0, 0.85) + vec3(0.03, 0.02, 0.0); g = (g - 0.5) * 0.92 + 0.52;
  } else if (u_preset == 5) {     // 흑백
    g = vec3(dot(c, LUMA)); g = (g - 0.5) * 1.1 + 0.5;
  } else if (u_preset == 6) {     // 필름
    g = (c - 0.5) * 1.12 + 0.5; g = sat(g, 0.95); g.g += 0.015; g.b += 0.01;
  }
  g = clamp(g, 0.0, 1.0);
  o = vec4(mix(c, g, u_amount), 1.0);
}`;

export class FilterPass implements FxPass {
  id = "filter";
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private w = 0;
  private h = 0;
  private u: Record<string, WebGLUniformLocation | null> = {};

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.prog = compileProgram(gl, FULLSCREEN_VS, FILTER_FS);
    for (const n of ["u_tex", "u_preset", "u_amount"]) this.u[n] = gl.getUniformLocation(this.prog, n);
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  render(
    input: WebGLTexture,
    target: WebGLFramebuffer | null,
    params: Record<string, number>,
    _landmarks: NormalizedLandmark[] | null,
    _colors?: Record<string, string>,
    selects?: Record<string, { value: string; options: string[] }>
  ): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.u.u_tex, 0);
    const sel = selects?.preset;
    const idx = sel ? Math.max(0, sel.options.indexOf(sel.value)) : 0;
    gl.uniform1i(this.u.u_preset, idx);
    gl.uniform1f(this.u.u_amount, (params.intensity ?? 100) / 100);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

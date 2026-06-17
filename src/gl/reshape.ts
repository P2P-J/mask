import { compileProgram, FULLSCREEN_VS } from "./glUtils";
import { faceCenterRadius } from "./faceMaskGeometry";
import type { FxPass } from "./passes";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// 얼굴 중심 기준 liquify 워프: 바깥쪽에서 샘플 → 얼굴 영역이 안으로 압축(슬림/축소).
// 단일 풀스크린 패스(파이프라인이 풀스크린 VAO를 바인딩해 둠).
const RESHAPE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_center;
uniform vec2 u_radius;
uniform float u_slim;  // 가로 압축량
uniform float u_size;  // 전체 축소량
out vec4 o;
void main(){
  vec2 d = (v_uv - u_center) / max(u_radius, vec2(1e-3));
  float r = length(d);
  float fall = smoothstep(1.6, 0.1, r); // 얼굴 안 →1, 밖 →0
  vec2 off = vec2(0.0);
  off.x += (v_uv.x - u_center.x) * u_slim * fall; // 가로 압축(갸름)
  off += (v_uv - u_center) * u_size * fall;        // 전체 축소
  o = texture(u_tex, v_uv + off);                  // 바깥쪽 샘플 → 안으로 압축
}`;

export class ReshapePass implements FxPass {
  id = "reshape";
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private w = 0;
  private h = 0;
  private u: Record<string, WebGLUniformLocation | null> = {};

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.prog = compileProgram(gl, FULLSCREEN_VS, RESHAPE_FS);
    for (const n of ["u_tex", "u_center", "u_radius", "u_slim", "u_size"])
      this.u[n] = gl.getUniformLocation(this.prog, n);
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  render(
    input: WebGLTexture,
    target: WebGLFramebuffer | null,
    params: Record<string, number>,
    landmarks: NormalizedLandmark[] | null
  ): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(this.u.u_tex, 0);
    if (landmarks) {
      const f = faceCenterRadius(landmarks);
      gl.uniform2f(this.u.u_center, f.cx, f.cy);
      gl.uniform2f(this.u.u_radius, f.rx, f.ry);
      gl.uniform1f(this.u.u_slim, ((params.slim ?? 0) / 100) * 0.3); // 최대 0.3
      gl.uniform1f(this.u.u_size, ((params.headSize ?? 0) / 100) * 0.22); // 최대 0.22
    } else {
      // 얼굴 없으면 워프 없음(원본)
      gl.uniform2f(this.u.u_center, 0.5, 0.5);
      gl.uniform2f(this.u.u_radius, 1, 1);
      gl.uniform1f(this.u.u_slim, 0);
      gl.uniform1f(this.u.u_size, 0);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

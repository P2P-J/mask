import { compileProgram, FULLSCREEN_VS } from "../../shared/gl/glUtils";
import { buildDeformers, MAX_DEFORMERS } from "../geometry/reshapeDeformers";
import type { FxPass } from "../passes";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { FaceShape } from "../../vision/faceAnalysis";

// 다중 deformer 역워프: 각 화소에서 영향 합산 후 입력을 v_uv - disp 위치에서 샘플.
const RESHAPE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform int u_count;
uniform vec4 u_defA[${MAX_DEFORMERS}]; // cx,cy,rx,ry
uniform vec4 u_defB[${MAX_DEFORMERS}]; // sx,sy,tx,ty
out vec4 o;
void main(){
  vec2 disp = vec2(0.0);
  for (int i = 0; i < ${MAX_DEFORMERS}; i++) {
    if (i >= u_count) break;
    vec2 c = u_defA[i].xy;
    vec2 rad = max(u_defA[i].zw, vec2(1e-4));
    vec2 sxy = u_defB[i].xy;
    vec2 tr = u_defB[i].zw;
    vec2 dv = v_uv - c;
    float w = 1.0 - smoothstep(0.0, 1.0, length(dv / rad)); // 타원 영역, 부드러운 falloff
    disp += w * (tr + dv * sxy);
  }
  o = texture(u_tex, v_uv - disp);
}`;

export class ReshapePass implements FxPass {
  id = "reshape";
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private w = 0;
  private h = 0;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private shape: FaceShape | undefined;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.prog = compileProgram(gl, FULLSCREEN_VS, RESHAPE_FS);
    for (const n of ["u_tex", "u_count", "u_defA", "u_defB"]) this.u[n] = gl.getUniformLocation(this.prog, n);
  }

  setShape(s: FaceShape | undefined): void {
    this.shape = s;
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
      const d = buildDeformers(landmarks, params, this.shape);
      gl.uniform1i(this.u.u_count, d.count);
      gl.uniform4fv(this.u.u_defA, d.defA);
      gl.uniform4fv(this.u.u_defB, d.defB);
    } else {
      gl.uniform1i(this.u.u_count, 0);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

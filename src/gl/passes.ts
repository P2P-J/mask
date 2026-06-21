import { compileProgram, FULLSCREEN_VS, PASSTHROUGH_FS } from "./glUtils";
import { colorUniforms } from "./mapping";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { SmoothingPass } from "./smoothing";
import { TeethPass } from "./teeth";
import { ReshapePass } from "./reshape";
import { EyeDetailPass } from "./eyeDetail";
import { MakeupPass } from "./makeup";
import { FilterPass } from "./filter";
import { BackgroundPass } from "./background";

// 패스: 입력 텍스처 → target(FBO 또는 null=캔버스)에 결과 렌더.
// 내부 FBO가 필요한 패스(스무딩)를 위해 resize/target/landmarks를 받는다.
export interface FxPass {
  id: string;
  resize(w: number, h: number): void;
  render(
    input: WebGLTexture,
    target: WebGLFramebuffer | null,
    params: Record<string, number>,
    landmarks: NormalizedLandmark[] | null,
    colors?: Record<string, string>,
    selects?: Record<string, { value: string; options: string[] }>
  ): void;
}

const COLOR_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_tone;
uniform float u_white;
uniform float u_saturation;
uniform float u_warmth;
out vec4 o;
void main(){
  vec3 c = texture(u_tex, v_uv).rgb;
  c += u_brightness;
  c = (c - 0.5) * u_contrast + 0.5;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, u_saturation);            // 채도
  c.r += u_warmth * 0.08; c.b -= u_warmth * 0.08; // 따뜻함
  c.r += u_tone * 0.06; c.b -= u_tone * 0.06;
  c.r += u_white * 0.04; c.b += u_white * 0.04;
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

// 풀스크린 패스 공통: target 바인딩 + 뷰포트 + 프로그램 + 입력 텍스처 바인딩
function beginPass(
  gl: WebGL2RenderingContext,
  prog: WebGLProgram,
  uTex: WebGLUniformLocation | null,
  input: WebGLTexture,
  target: WebGLFramebuffer | null,
  w: number,
  h: number
): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target);
  gl.viewport(0, 0, w, h);
  gl.useProgram(prog);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, input);
  gl.uniform1i(uTex, 0);
}

export class PassthroughPass implements FxPass {
  id = "passthrough";
  private prog: WebGLProgram;
  private uTex: WebGLUniformLocation | null;
  private w = 0;
  private h = 0;
  constructor(private gl: WebGL2RenderingContext) {
    this.prog = compileProgram(gl, FULLSCREEN_VS, PASSTHROUGH_FS);
    this.uTex = gl.getUniformLocation(this.prog, "u_tex");
  }
  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }
  render(input: WebGLTexture, target: WebGLFramebuffer | null): void {
    beginPass(this.gl, this.prog, this.uTex, input, target, this.w, this.h);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }
}

export class ColorPass implements FxPass {
  id = "color";
  private prog: WebGLProgram;
  private u: {
    tex: WebGLUniformLocation | null;
    brightness: WebGLUniformLocation | null;
    contrast: WebGLUniformLocation | null;
    tone: WebGLUniformLocation | null;
    white: WebGLUniformLocation | null;
    saturation: WebGLUniformLocation | null;
    warmth: WebGLUniformLocation | null;
  };
  private w = 0;
  private h = 0;
  constructor(private gl: WebGL2RenderingContext) {
    this.prog = compileProgram(gl, FULLSCREEN_VS, COLOR_FS);
    this.u = {
      tex: gl.getUniformLocation(this.prog, "u_tex"),
      brightness: gl.getUniformLocation(this.prog, "u_brightness"),
      contrast: gl.getUniformLocation(this.prog, "u_contrast"),
      tone: gl.getUniformLocation(this.prog, "u_tone"),
      white: gl.getUniformLocation(this.prog, "u_white"),
      saturation: gl.getUniformLocation(this.prog, "u_saturation"),
      warmth: gl.getUniformLocation(this.prog, "u_warmth"),
    };
  }
  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }
  render(input: WebGLTexture, target: WebGLFramebuffer | null, params: Record<string, number>): void {
    const gl = this.gl;
    beginPass(gl, this.prog, this.u.tex, input, target, this.w, this.h);
    const c = colorUniforms(params);
    gl.uniform1f(this.u.brightness, c.brightness);
    gl.uniform1f(this.u.contrast, c.contrast);
    gl.uniform1f(this.u.tone, c.tone);
    gl.uniform1f(this.u.white, c.white);
    gl.uniform1f(this.u.saturation, c.saturation);
    gl.uniform1f(this.u.warmth, c.warmth);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

export function createPasses(gl: WebGL2RenderingContext): Record<string, FxPass> {
  return {
    passthrough: new PassthroughPass(gl),
    smoothing: new SmoothingPass(gl),
    color: new ColorPass(gl),
    teeth: new TeethPass(gl),
    eyeDetail: new EyeDetailPass(gl),
    makeup: new MakeupPass(gl),
    reshape: new ReshapePass(gl),
    filter: new FilterPass(gl),
    background: new BackgroundPass(gl),
  };
}

import { compileProgram, FULLSCREEN_VS, PASSTHROUGH_FS } from "../shared/gl/glUtils";
import { colorUniforms } from "../shared/gl/mapping";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { SmoothingPass } from "./passes/smoothing";
import { TeethPass } from "./passes/teeth";
import { ReshapePass } from "./passes/reshape";
import { EyeDetailPass } from "./passes/eyeDetail";
import { MakeupPass } from "./passes/makeup";
import { FilterPass } from "./passes/filter";
import { BackgroundPass } from "./passes/background";

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
uniform float u_exposure;   // -1..1 (exp2 → 0.5..2배)
uniform float u_highlights; // -1..1
uniform float u_shadows;    // -1..1
uniform float u_gamma;      // 0.5..2 (1=중립)
uniform float u_tint;       // -1..1 (녹↔마젠타)
uniform float u_vibrance;   // -1..1
uniform float u_hue;        // -π..π
uniform float u_sharpness;  // 0..1
uniform vec2  u_texel;      // (1/w, 1/h)
out vec4 o;

const vec3 LUMA = vec3(0.299, 0.587, 0.114);

// 휘도(grey)축 기준 색상 회전 — Rodrigues 회전
vec3 hueRotate(vec3 col, float a){
  const vec3 k = vec3(0.57735026); // normalize(1,1,1)
  float c = cos(a), s = sin(a);
  return col * c + cross(k, col) * s + k * dot(k, col) * (1.0 - c);
}

void main(){
  vec3 c = texture(u_tex, v_uv).rgb;

  // 선명도: 입력 4이웃 평균과의 차(고주파)를 마지막에 가산
  vec3 hf = vec3(0.0);
  if (u_sharpness > 0.0) {
    vec3 blur = (
      texture(u_tex, v_uv + vec2(u_texel.x, 0.0)).rgb +
      texture(u_tex, v_uv - vec2(u_texel.x, 0.0)).rgb +
      texture(u_tex, v_uv + vec2(0.0, u_texel.y)).rgb +
      texture(u_tex, v_uv - vec2(0.0, u_texel.y)).rgb
    ) * 0.25;
    hf = c - blur;
  }

  c *= exp2(u_exposure);                          // 노출(곱)
  c += u_brightness;                              // 밝기(가산)
  c = (c - 0.5) * u_contrast + 0.5;               // 대비

  float l = dot(c, LUMA);
  c += u_highlights * 0.5 * smoothstep(0.5, 1.0, l);        // 하이라이트
  c += u_shadows    * 0.5 * (1.0 - smoothstep(0.0, 0.5, l)); // 그림자

  c = pow(max(c, 0.0), vec3(1.0 / u_gamma));      // 감마(중간톤)

  c.r += u_warmth * 0.08; c.b -= u_warmth * 0.08; // 따뜻함(청↔호박)
  c.r += u_tone * 0.06;  c.b -= u_tone * 0.06;    // 톤
  c.r += u_white * 0.04; c.b += u_white * 0.04;   // 화이트밸런스
  c.g -= u_tint * 0.08;  c.r += u_tint * 0.04; c.b += u_tint * 0.04; // 색조(녹↔마젠타)

  if (abs(u_hue) > 0.0001) c = hueRotate(c, u_hue); // 색상 회전

  // 생동감: 낮은 채도일수록 강하게 + 피부(주황 r>g>b) 보호
  if (abs(u_vibrance) > 0.0001) {
    float lv = dot(c, LUMA);
    float mx = max(c.r, max(c.g, c.b));
    float mn = min(c.r, min(c.g, c.b));
    float sat = mx - mn;
    float skin = clamp((c.r - c.b) * 2.0, 0.0, 1.0); // 주황 계열 보호 가중
    float amt = u_vibrance * (1.0 - sat) * (1.0 - 0.6 * skin);
    c = mix(vec3(lv), c, 1.0 + amt);
  }

  float l2 = dot(c, LUMA);
  c = mix(vec3(l2), c, u_saturation);             // 채도

  c += hf * u_sharpness * 1.5;                    // 선명도 가산

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
    exposure: WebGLUniformLocation | null;
    highlights: WebGLUniformLocation | null;
    shadows: WebGLUniformLocation | null;
    gamma: WebGLUniformLocation | null;
    tint: WebGLUniformLocation | null;
    vibrance: WebGLUniformLocation | null;
    hue: WebGLUniformLocation | null;
    sharpness: WebGLUniformLocation | null;
    texel: WebGLUniformLocation | null;
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
      exposure: gl.getUniformLocation(this.prog, "u_exposure"),
      highlights: gl.getUniformLocation(this.prog, "u_highlights"),
      shadows: gl.getUniformLocation(this.prog, "u_shadows"),
      gamma: gl.getUniformLocation(this.prog, "u_gamma"),
      tint: gl.getUniformLocation(this.prog, "u_tint"),
      vibrance: gl.getUniformLocation(this.prog, "u_vibrance"),
      hue: gl.getUniformLocation(this.prog, "u_hue"),
      sharpness: gl.getUniformLocation(this.prog, "u_sharpness"),
      texel: gl.getUniformLocation(this.prog, "u_texel"),
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
    gl.uniform1f(this.u.exposure, c.exposure);
    gl.uniform1f(this.u.highlights, c.highlights);
    gl.uniform1f(this.u.shadows, c.shadows);
    gl.uniform1f(this.u.gamma, c.gamma);
    gl.uniform1f(this.u.tint, c.tint);
    gl.uniform1f(this.u.vibrance, c.vibrance);
    gl.uniform1f(this.u.hue, c.hue);
    gl.uniform1f(this.u.sharpness, c.sharpness);
    gl.uniform2f(this.u.texel, this.w > 0 ? 1 / this.w : 0, this.h > 0 ? 1 / this.h : 0);
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

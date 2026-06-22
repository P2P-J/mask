import { compileProgram, FULLSCREEN_VS, PASSTHROUGH_FS } from "../shared/gl/glUtils";
import { colorUniforms, hslArrays, hexToRgb } from "../shared/gl/mapping";
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
// 2차 확장
uniform float u_structure;  // -1..1
uniform float u_fade;       // 0..1
uniform float u_vignette;   // 0..1
uniform float u_grain;      // 0..1
uniform float u_splitTone;  // 0..1
uniform float u_splitBalance; // -1..1
uniform vec3  u_splitShadow;  // 0..1 (틴트 색, 0.5=중립)
uniform vec3  u_splitHi;      // 0..1
uniform float u_hslH[8];    // -1..1
uniform float u_hslS[8];    // -1..1
uniform float u_hslL[8];    // -1..1
out vec4 o;

const vec3 LUMA = vec3(0.299, 0.587, 0.114);
const float HSL_CENTERS[8] = float[8](0.0, 30.0/360.0, 60.0/360.0, 120.0/360.0, 180.0/360.0, 240.0/360.0, 280.0/360.0, 320.0/360.0);

// 휘도(grey)축 기준 색상 회전 — Rodrigues 회전
vec3 hueRotate(vec3 col, float a){
  const vec3 k = vec3(0.57735026); // normalize(1,1,1)
  float c = cos(a), s = sin(a);
  return col * c + cross(k, col) * s + k * dot(k, col) * (1.0 - c);
}

vec3 rgb2hsv(vec3 c){
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c){
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main(){
  vec3 c = texture(u_tex, v_uv).rgb;

  // 선명도(반경1)·구조(반경3): 입력 이웃 평균과의 차를 추출
  vec3 hf = vec3(0.0), midf = vec3(0.0);
  if (u_sharpness > 0.0) {
    vec3 blur = (
      texture(u_tex, v_uv + vec2(u_texel.x, 0.0)).rgb +
      texture(u_tex, v_uv - vec2(u_texel.x, 0.0)).rgb +
      texture(u_tex, v_uv + vec2(0.0, u_texel.y)).rgb +
      texture(u_tex, v_uv - vec2(0.0, u_texel.y)).rgb) * 0.25;
    hf = c - blur;
  }
  if (abs(u_structure) > 0.0001) {
    vec2 r = u_texel * 3.0;
    vec3 wide = (
      texture(u_tex, v_uv + vec2(r.x, 0.0)).rgb +
      texture(u_tex, v_uv - vec2(r.x, 0.0)).rgb +
      texture(u_tex, v_uv + vec2(0.0, r.y)).rgb +
      texture(u_tex, v_uv - vec2(0.0, r.y)).rgb) * 0.25;
    midf = c - wide;
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

  // HSL: 픽셀 hue의 밴드 가중 합으로 H/S/L 조정
  {
    vec3 hsv = rgb2hsv(clamp(c, 0.0, 1.0));
    float wsum = 0.0, hShift = 0.0, sMul = 0.0, lAdd = 0.0;
    for (int i = 0; i < 8; i++) {
      float d = abs(fract(hsv.x - HSL_CENTERS[i] + 0.5) - 0.5); // 0..0.5 wrap 거리
      float w = max(0.0, 1.0 - d / 0.18);
      wsum += w;
      hShift += w * u_hslH[i];
      sMul   += w * u_hslS[i];
      lAdd   += w * u_hslL[i];
    }
    if (wsum > 0.0001 && hsv.y > 0.02) {
      float inv = 1.0 / wsum;
      hsv.x = fract(hsv.x + hShift * inv * (30.0/360.0)); // ±30°
      hsv.y = clamp(hsv.y * (1.0 + sMul * inv), 0.0, 1.0);
      hsv.z = clamp(hsv.z + lAdd * inv * 0.4, 0.0, 1.0);
      c = hsv2rgb(hsv);
    }
  }

  // 스플릿 톤: 휘도로 그림자/하이라이트 영역에 색조 가산
  if (u_splitTone > 0.0) {
    float ls = dot(clamp(c,0.0,1.0), LUMA);
    float mid = 0.5 + u_splitBalance * 0.4;
    float shW = 1.0 - smoothstep(0.0, mid, ls);
    float hiW = smoothstep(mid, 1.0, ls);
    c += (u_splitShadow - 0.5) * 2.0 * shW * u_splitTone * 0.3;
    c += (u_splitHi     - 0.5) * 2.0 * hiW * u_splitTone * 0.3;
  }

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

  // 구조(중간톤 가중 로컬 대비) + 선명도 가산
  float mw = 1.0 - abs(dot(clamp(c,0.0,1.0), LUMA) - 0.5) * 2.0; // 중간톤 1, 양끝 0
  c += midf * u_structure * 1.2 * mw;
  c += hf * u_sharpness * 1.5;

  // 페이드(매트): 블랙 리프트 + 대비 압축
  if (u_fade > 0.0) c = mix(c, c * 0.85 + 0.12, u_fade);

  // 그레인(필름 입자)
  if (u_grain > 0.0) {
    float n = hash21(v_uv / u_texel) - 0.5;
    c += n * u_grain * 0.12;
  }

  // 비네트(가장자리 음영, 가로세로비 보정)
  if (u_vignette > 0.0) {
    vec2 vd = v_uv - 0.5;
    vd.x *= u_texel.y / u_texel.x; // *= w/h
    float r = length(vd);
    c *= 1.0 - u_vignette * smoothstep(0.35, 0.85, r);
  }

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
    structure: WebGLUniformLocation | null;
    fade: WebGLUniformLocation | null;
    vignette: WebGLUniformLocation | null;
    grain: WebGLUniformLocation | null;
    splitTone: WebGLUniformLocation | null;
    splitBalance: WebGLUniformLocation | null;
    splitShadow: WebGLUniformLocation | null;
    splitHi: WebGLUniformLocation | null;
    hslH: WebGLUniformLocation | null;
    hslS: WebGLUniformLocation | null;
    hslL: WebGLUniformLocation | null;
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
      structure: gl.getUniformLocation(this.prog, "u_structure"),
      fade: gl.getUniformLocation(this.prog, "u_fade"),
      vignette: gl.getUniformLocation(this.prog, "u_vignette"),
      grain: gl.getUniformLocation(this.prog, "u_grain"),
      splitTone: gl.getUniformLocation(this.prog, "u_splitTone"),
      splitBalance: gl.getUniformLocation(this.prog, "u_splitBalance"),
      splitShadow: gl.getUniformLocation(this.prog, "u_splitShadow"),
      splitHi: gl.getUniformLocation(this.prog, "u_splitHi"),
      hslH: gl.getUniformLocation(this.prog, "u_hslH[0]"),
      hslS: gl.getUniformLocation(this.prog, "u_hslS[0]"),
      hslL: gl.getUniformLocation(this.prog, "u_hslL[0]"),
    };
  }
  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }
  render(
    input: WebGLTexture,
    target: WebGLFramebuffer | null,
    params: Record<string, number>,
    _landmarks?: NormalizedLandmark[] | null,
    colors?: Record<string, string>
  ): void {
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
    // 2차 확장
    gl.uniform1f(this.u.structure, c.structure);
    gl.uniform1f(this.u.fade, c.fade);
    gl.uniform1f(this.u.vignette, c.vignette);
    gl.uniform1f(this.u.grain, c.grain);
    gl.uniform1f(this.u.splitTone, c.splitTone);
    gl.uniform1f(this.u.splitBalance, c.splitBalance);
    const sh = hexToRgb(colors?.splitShadow);
    const hi = hexToRgb(colors?.splitHighlight);
    gl.uniform3f(this.u.splitShadow, sh[0], sh[1], sh[2]);
    gl.uniform3f(this.u.splitHi, hi[0], hi[1], hi[2]);
    const hsl = hslArrays(params);
    gl.uniform1fv(this.u.hslH, hsl.h);
    gl.uniform1fv(this.u.hslS, hsl.s);
    gl.uniform1fv(this.u.hslL, hsl.l);
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

import {
  compileProgram,
  createFullscreenVAO,
  createRenderTarget,
  createDynamicGeomVAO,
  FULLSCREEN_VS,
  PASSTHROUGH_FS,
  GEO_VS,
  type RenderTarget,
} from "./glUtils";
import { buildFan, ellipseFan } from "./faceMaskGeometry";
import { LIPS, LEFT_BROW, RIGHT_BROW } from "./faceRegions";
import type { FxPass } from "./passes";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

const GEO_FS = `#version 300 es
precision highp float;
out vec4 o;
void main(){ o = vec4(1.0); }`;

// 부위 마스크 영역에 색을 멀티플라이 블렌드로 입힘(질감 보존, 강도 조절).
const TINT_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
uniform sampler2D u_mask;
uniform vec3 u_color;
uniform float u_amount;
out vec4 o;
void main(){
  vec3 src = texture(u_src, v_uv).rgb;
  float m = texture(u_mask, v_uv).r;
  vec3 tinted = clamp(src * u_color * 2.0, 0.0, 1.0); // 멀티플라이 오버레이
  o = vec4(mix(src, tinted, u_amount * m), 1.0);
}`;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

interface Item {
  key: string;
  color: [number, number, number];
  geoms: Float32Array[];
}

export class MakeupPass implements FxPass {
  id = "makeup";
  private gl: WebGL2RenderingContext;
  private fsVao: WebGLVertexArrayObject;
  private geoVao: WebGLVertexArrayObject;
  private geoBuf: WebGLBuffer;
  private geoProg: WebGLProgram;
  private passProg: WebGLProgram;
  private blurProg: WebGLProgram;
  private tintProg: WebGLProgram;
  private maskGeom: RenderTarget | null = null;
  private maskBlur: RenderTarget | null = null;
  private maskScratch: RenderTarget | null = null; // 페더 전용(아이템 핑퐁과 분리)
  private workA: RenderTarget | null = null;
  private workB: RenderTarget | null = null;
  private w = 0;
  private h = 0;
  private uPassTex: WebGLUniformLocation | null;
  private ub: Record<string, WebGLUniformLocation | null> = {};
  private ut: Record<string, WebGLUniformLocation | null> = {};

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.fsVao = createFullscreenVAO(gl);
    const { vao, buf } = createDynamicGeomVAO(gl);
    this.geoVao = vao;
    this.geoBuf = buf;
    this.geoProg = compileProgram(gl, GEO_VS, GEO_FS);
    this.passProg = compileProgram(gl, FULLSCREEN_VS, PASSTHROUGH_FS);
    this.blurProg = compileProgram(
      gl,
      FULLSCREEN_VS,
      `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_tex; uniform vec2 u_texel; out vec4 o;
void main(){ vec2 t=u_texel*1.5; vec4 s=texture(u_tex,v_uv+vec2(t.x,t.y))+texture(u_tex,v_uv+vec2(-t.x,t.y))+texture(u_tex,v_uv+vec2(t.x,-t.y))+texture(u_tex,v_uv+vec2(-t.x,-t.y)); o=s*0.25; }`
    );
    this.tintProg = compileProgram(gl, FULLSCREEN_VS, TINT_FS);
    this.uPassTex = gl.getUniformLocation(this.passProg, "u_tex");
    for (const n of ["u_tex", "u_texel"]) this.ub[n] = gl.getUniformLocation(this.blurProg, n);
    for (const n of ["u_src", "u_mask", "u_color", "u_amount"]) this.ut[n] = gl.getUniformLocation(this.tintProg, n);
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    const gl = this.gl;
    for (const rt of [this.maskGeom, this.maskBlur, this.maskScratch, this.workA, this.workB]) {
      if (rt) {
        gl.deleteFramebuffer(rt.fbo);
        gl.deleteTexture(rt.tex);
      }
    }
    this.maskGeom = createRenderTarget(gl, w, h);
    this.maskBlur = createRenderTarget(gl, w, h);
    this.maskScratch = createRenderTarget(gl, w, h);
    this.workA = createRenderTarget(gl, w, h);
    this.workB = createRenderTarget(gl, w, h);
  }

  render(
    input: WebGLTexture,
    target: WebGLFramebuffer | null,
    params: Record<string, number>,
    landmarks: NormalizedLandmark[] | null,
    colors?: Record<string, string>
  ): void {
    const gl = this.gl;
    if (!this.maskGeom || !this.maskBlur || !this.workA || !this.workB || !this.maskScratch || !landmarks) {
      this.blit(input, target);
      return;
    }
    const items = this.buildItems(landmarks, params, colors ?? {});
    if (items.length === 0) {
      this.blit(input, target);
      return;
    }
    gl.disable(gl.BLEND);

    let srcTex = input;
    let write = this.workA;
    let other = this.workB;
    items.forEach((item, i) => {
      const last = i === items.length - 1;
      this.renderMask(item.geoms);
      const dst = last ? target : write.fbo;
      this.composite(srcTex, dst, item.color, (params[item.key] ?? 0) / 100);
      if (!last) {
        srcTex = write.tex;
        [write, other] = [other, write];
      }
    });
  }

  private buildItems(lm: NormalizedLandmark[], params: Record<string, number>, colors: Record<string, string>): Item[] {
    const p = (i: number): [number, number] => [lm[i].x, 1 - lm[i].y];
    const ew = Math.hypot(p(133)[0] - p(33)[0], p(133)[1] - p(33)[1]);
    const items: Item[] = [];
    const on = (k: string): boolean => (params[k] ?? 0) > 0;

    if (on("lipstick")) {
      items.push({ key: "lipstick", color: hexToRgb(colors.lipstick ?? "#c85a64"), geoms: [buildFan(lm, LIPS)] });
    }
    if (on("eyebrow")) {
      items.push({
        key: "eyebrow",
        color: hexToRgb(colors.eyebrow ?? "#5a4636"),
        geoms: [buildFan(lm, LEFT_BROW), buildFan(lm, RIGHT_BROW)],
      });
    }
    if (on("blush")) {
      const lc = p(116);
      const rc = p(345);
      items.push({
        key: "blush",
        color: hexToRgb(colors.blush ?? "#e8918c"),
        geoms: [ellipseFan(lc[0], lc[1], ew * 0.7, ew * 0.55), ellipseFan(rc[0], rc[1], ew * 0.7, ew * 0.55)],
      });
    }
    if (on("eyeshadow")) {
      const le = p(159);
      const re = p(386); // 위 눈꺼풀 근처
      items.push({
        key: "eyeshadow",
        color: hexToRgb(colors.eyeshadow ?? "#a87a6e"),
        geoms: [
          ellipseFan(le[0], le[1] + ew * 0.25, ew * 0.9, ew * 0.45),
          ellipseFan(re[0], re[1] + ew * 0.25, ew * 0.9, ew * 0.45),
        ],
      });
    }
    if (on("liner")) {
      const le = p(159);
      const re = p(386); // 위 눈꺼풀
      items.push({
        key: "liner",
        color: hexToRgb(colors.liner ?? "#3a3030"),
        geoms: [
          ellipseFan(le[0], le[1] + ew * 0.08, ew * 0.78, ew * 0.12),
          ellipseFan(re[0], re[1] + ew * 0.08, ew * 0.78, ew * 0.12),
        ],
      });
    }
    if (on("contour")) {
      const lc = p(234);
      const rc = p(454); // 얼굴 양 옆(광대 아래 음영)
      items.push({
        key: "contour",
        color: hexToRgb(colors.contour ?? "#7a5a48"),
        geoms: [
          ellipseFan(lc[0] + ew * 0.2, lc[1], ew * 0.4, ew * 1.3),
          ellipseFan(rc[0] - ew * 0.2, rc[1], ew * 0.4, ew * 1.3),
        ],
      });
    }
    return items;
  }

  private renderMask(geoms: Float32Array[]): void {
    const gl = this.gl;
    gl.bindVertexArray(this.geoVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.geoBuf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskGeom!.fbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.geoProg);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    for (const verts of geoms) {
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, verts.length / 2);
    }
    // 페더(부드러운 경계)
    gl.bindVertexArray(this.fsVao);
    gl.useProgram(this.blurProg);
    gl.uniform2f(this.ub.u_texel, 1 / this.w, 1 / this.h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskScratch!.fbo);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.maskGeom!.tex);
    gl.uniform1i(this.ub.u_tex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskBlur!.fbo);
    gl.bindTexture(gl.TEXTURE_2D, this.maskScratch!.tex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private composite(srcTex: WebGLTexture, target: WebGLFramebuffer | null, color: [number, number, number], amount: number): void {
    const gl = this.gl;
    gl.bindVertexArray(this.fsVao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.tintProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1i(this.ut.u_src, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskBlur!.tex);
    gl.uniform1i(this.ut.u_mask, 1);
    gl.uniform3f(this.ut.u_color, color[0], color[1], color[2]);
    gl.uniform1f(this.ut.u_amount, amount);
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

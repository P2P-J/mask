import {
  createFullscreenVAO,
  createTexture,
  createRenderTarget,
  type RenderTarget,
} from "../shared/gl/glUtils";
import { createPasses, type FxPass } from "./passes";
import { BackgroundPass } from "./passes/background";
import type { Layer } from "../entities/scene/types";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

export class Pipeline {
  private gl: WebGL2RenderingContext;
  private vao: WebGLVertexArrayObject;
  private videoTex: WebGLTexture;
  private passes: Record<string, FxPass>;
  private a: RenderTarget | null = null;
  private b: RenderTarget | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: false });
    if (!gl) throw new Error("WebGL2를 사용할 수 없습니다");
    this.gl = gl;
    this.vao = createFullscreenVAO(gl);
    this.videoTex = createTexture(gl);
    this.passes = createPasses(gl);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  }

  // 세그멘테이션 마스크 전달(배경 패스가 사용)
  updateSegMask(data: Uint8Array, mw: number, mh: number): void {
    const bg = this.passes.background;
    if (bg instanceof BackgroundPass) bg.setMask(data, mw, mh);
  }

  resize(w: number, h: number): void {
    this.gl.canvas.width = w;
    this.gl.canvas.height = h;
    if (this.a) {
      this.gl.deleteFramebuffer(this.a.fbo);
      this.gl.deleteTexture(this.a.tex);
    }
    if (this.b) {
      this.gl.deleteFramebuffer(this.b.fbo);
      this.gl.deleteTexture(this.b.tex);
    }
    this.a = createRenderTarget(this.gl, w, h);
    this.b = createRenderTarget(this.gl, w, h);
    for (const p of Object.values(this.passes)) p.resize(w, h);
  }

  render(video: HTMLVideoElement, layers: Layer[], landmarks: NormalizedLandmark[] | null): void {
    const gl = this.gl;
    if (!this.a || !this.b) return;
    gl.activeTexture(gl.TEXTURE0); // 예외로 텍스처 유닛이 어긋나도 비디오 업로드는 항상 0번에
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    const enabled = layers.filter((l) => l.enabled && this.passes[l.id]);
    if (enabled.length === 0) {
      gl.bindVertexArray(this.vao);
      this.passes.passthrough.render(this.videoTex, null, {}, landmarks);
      gl.bindVertexArray(null);
      return;
    }

    let input = this.videoTex;
    let src = this.a;
    let dst = this.b;
    enabled.forEach((layer, i) => {
      const last = i === enabled.length - 1;
      gl.bindVertexArray(this.vao); // 각 패스 전 풀스크린 VAO 보장(스무딩이 내부 VAO를 바꿔도 안전)
      this.passes[layer.id].render(input, last ? null : dst.fbo, layer.params, landmarks, layer.colors, layer.selects);
      if (!last) {
        input = dst.tex;
        [src, dst] = [dst, src];
      }
    });
    gl.bindVertexArray(null);
  }
}

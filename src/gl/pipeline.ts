import {
  createFullscreenVAO,
  createTexture,
  createRenderTarget,
  type RenderTarget,
} from "./glUtils";
import { createPasses, type FxPass } from "./passes";
import type { Layer } from "../state/types";
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
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    gl.bindVertexArray(this.vao);

    const enabled = layers.filter((l) => l.enabled && this.passes[l.id]);
    if (enabled.length === 0) {
      this.passes.passthrough.render(this.videoTex, null, {}, landmarks);
      gl.bindVertexArray(null);
      return;
    }

    let input = this.videoTex;
    let src = this.a;
    let dst = this.b;
    enabled.forEach((layer, i) => {
      const last = i === enabled.length - 1;
      this.passes[layer.id].render(input, last ? null : dst.fbo, layer.params, landmarks);
      if (!last) {
        input = dst.tex;
        [src, dst] = [dst, src];
      }
    });
    gl.bindVertexArray(null);
  }
}

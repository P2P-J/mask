import {
  createFullscreenVAO,
  createTexture,
  createRenderTarget,
  type RenderTarget,
} from "./glUtils";
import { createPasses, type Pass } from "./passes";
import type { Layer } from "../state/types";

export class Pipeline {
  private gl: WebGL2RenderingContext;
  private vao: WebGLVertexArrayObject;
  private videoTex: WebGLTexture;
  private passes: Record<string, Pass>;
  private a: RenderTarget | null = null;
  private b: RenderTarget | null = null;
  private w = 0;
  private h = 0;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: false });
    if (!gl) throw new Error("WebGL2를 사용할 수 없습니다");
    this.gl = gl;
    this.vao = createFullscreenVAO(gl);
    this.videoTex = createTexture(gl);
    this.passes = createPasses(gl);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // 비디오 상하 반전 보정
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.gl.canvas.width = w;
    this.gl.canvas.height = h;
    this.a = createRenderTarget(this.gl, w, h);
    this.b = createRenderTarget(this.gl, w, h);
  }

  // 활성 enabled 레이어(고정 순서 정렬된 배열)를 순서대로 적용
  render(video: HTMLVideoElement, layers: Layer[]): void {
    const gl = this.gl;
    if (!this.a || !this.b) return;
    // 1) 비디오 → videoTex
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, this.w, this.h);

    const enabled = layers.filter((l) => l.enabled && this.passes[l.id]);
    if (enabled.length === 0) {
      // 보정 없음: 비디오 그대로 캔버스로
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.blitPassthrough(this.videoTex);
      gl.bindVertexArray(null);
      return;
    }

    let input = this.videoTex;
    let src = this.a;
    let dst = this.b;
    enabled.forEach((layer, i) => {
      const last = i === enabled.length - 1;
      gl.bindFramebuffer(gl.FRAMEBUFFER, last ? null : dst.fbo);
      this.passes[layer.id].use(gl, input, layer.params);
      if (!last) {
        input = dst.tex;
        [src, dst] = [dst, src];
      }
    });
    gl.bindVertexArray(null);
  }

  private blitPassthrough(tex: WebGLTexture): void {
    // passes.smoothing가 패스스루 프로그램을 들고 있으므로 재사용
    this.passes.smoothing.use(this.gl, tex, {});
  }
}

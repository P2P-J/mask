import { compileProgram, FULLSCREEN_VS } from "./glUtils";
import { colorUniforms } from "./mapping";

// 각 패스: 입력 텍스처 + params로 현재 바인딩된 FBO에 풀스크린 렌더
export interface Pass {
  id: string;
  use(gl: WebGL2RenderingContext, inputTex: WebGLTexture, params: Record<string, number>): void;
}

const PASSTHROUGH_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
out vec4 o;
void main(){ o = texture(u_tex, v_uv); }`;

const COLOR_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_tone;
uniform float u_white;
out vec4 o;
void main(){
  vec3 c = texture(u_tex, v_uv).rgb;
  c += u_brightness;
  c = (c - 0.5) * u_contrast + 0.5;
  c.r += u_tone * 0.06; c.b -= u_tone * 0.06;
  c.r += u_white * 0.04; c.b += u_white * 0.04;
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export function createPasses(gl: WebGL2RenderingContext): Record<string, Pass> {
  const passthroughProg = compileProgram(gl, FULLSCREEN_VS, PASSTHROUGH_FS);
  const colorProg = compileProgram(gl, FULLSCREEN_VS, COLOR_FS);

  // 유니폼 위치는 프로그램 생성 시 1회만 조회(매 프레임 조회 방지)
  const uPassTex = gl.getUniformLocation(passthroughProg, "u_tex");
  const uColor = {
    tex: gl.getUniformLocation(colorProg, "u_tex"),
    brightness: gl.getUniformLocation(colorProg, "u_brightness"),
    contrast: gl.getUniformLocation(colorProg, "u_contrast"),
    tone: gl.getUniformLocation(colorProg, "u_tone"),
    white: gl.getUniformLocation(colorProg, "u_white"),
  };

  const drawPassthrough = (tex: WebGLTexture): void => {
    gl.useProgram(passthroughProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(uPassTex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  return {
    // 보정 없음/스무딩 자리표시 공용 패스스루
    passthrough: { id: "passthrough", use: (_g, tex) => drawPassthrough(tex) },
    // 스무딩: Plan A에서는 패스스루(자리표시), Plan B에서 FabSoften으로 교체
    smoothing: { id: "smoothing", use: (_g, tex) => drawPassthrough(tex) },
    color: {
      id: "color",
      use(_g, tex, params) {
        gl.useProgram(colorProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(uColor.tex, 0);
        const u = colorUniforms(params);
        gl.uniform1f(uColor.brightness, u.brightness);
        gl.uniform1f(uColor.contrast, u.contrast);
        gl.uniform1f(uColor.tone, u.tone);
        gl.uniform1f(uColor.white, u.white);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    },
  };
}

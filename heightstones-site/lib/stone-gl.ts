// Procedural stone renderer.
// Pass 1 bakes albedo + relief height into a texture whenever the stone,
// finish or size changes. Pass 2 runs every frame and only does lighting,
// so a moving "raking lamp" stays cheap even on full-screen canvases.

import type { Finish, StoneKind } from "./data";

const KIND_INDEX: Record<StoneKind, number> = {
  marble: 0,
  granite: 1,
  sandstone: 2,
  limestone: 3,
  slate: 4,
  quartzite: 5,
  travertine: 6,
  onyx: 7,
};

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const BAKE = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uSeed;
uniform float uScale;
uniform int uKind;
uniform vec3 uC0, uC1, uC2;
uniform float uGrain, uBrush, uCleft, uSaw;
out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21) + uSeed * 0.137);
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 6; i++) { v += a * noise(p); p = r * p * 2.03 + 0.17; a *= 0.5; }
  return v;
}
vec3 voro(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d = 8.0; vec2 id = vec2(0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(x, y);
    vec2 o = vec2(hash(i + g), hash(i + g + 19.19));
    vec2 r = g + o - f;
    float dd = dot(r, r);
    if (dd < d) { d = dd; id = i + g; }
  }
  return vec3(sqrt(d), hash(id), hash(id + 7.7));
}

vec3 albedo(vec2 p) {
  vec3 col;
  if (uKind == 0) { // marble: long veins with a finer secondary network
    vec2 q = vec2(fbm(p * 0.8), fbm(p * 0.8 + vec2(5.2, 1.3)));
    float turb = fbm(p * 1.2 + q * 1.8);
    float t = (p.x * 0.55 + p.y * 0.85) * 2.4 + turb * 6.0;
    float v = abs(sin(t));
    float vein = 1.0 - smoothstep(0.0, 0.05 + 0.1 * fbm(p * 3.0), v);
    vein *= 0.55 + 0.45 * smoothstep(0.3, 0.7, fbm(p * 0.7 + 3.0));
    float halo = 1.0 - smoothstep(0.0, 0.45, v);
    float t2 = (p.x * 0.9 - p.y * 0.4) * 5.0 + fbm(p * 2.3 + q * 3.0) * 9.0;
    float fine = 1.0 - smoothstep(0.0, 0.03, abs(sin(t2)));
    fine *= smoothstep(0.45, 0.7, fbm(p * 1.5 + 7.0));
    col = mix(uC0, uC0 * 0.95, fbm(p * 2.0));
    col = mix(col, mix(uC0, uC1, 0.22), halo * 0.4);
    col = mix(col, mix(uC0, uC1, 0.4), smoothstep(0.55, 0.78, fbm(p * 0.9 + q)) * 0.3);
    col = mix(col, uC1 * 0.85, vein * 0.85);
    col = mix(col, uC1, fine * 0.4);
    col = mix(col, uC2, vein * smoothstep(0.5, 0.8, turb) * 0.55);
  } else if (uKind == 1) { // granite: fine crystal mosaic
    vec3 a = voro(p * 52.0);
    vec3 b = voro(p * 96.0 + 3.0);
    col = uC0 * (0.75 + 0.45 * a.y);
    col = mix(col, uC1, step(0.8, a.z) * (0.6 + 0.4 * b.y));
    col = mix(col, uC2, step(0.86, b.z) * 0.8);
    col = mix(col, uC1 * 1.2, step(0.94, b.y));
    col *= (0.9 + 0.2 * noise(p * 120.0)) * (0.9 + 0.2 * fbm(p * 2.0));
  } else if (uKind == 2) { // sandstone: warm laminations
    float w = fbm(p * 0.7);
    float t = p.y * 2.6 + w * 2.8 + fbm(p * 3.0) * 0.35;
    float band = 0.5 + 0.5 * sin(t * 2.0);
    float band2 = 0.5 + 0.5 * sin(t * 7.3 + 1.0);
    col = mix(uC0, uC1, smoothstep(0.25, 0.95, band) * 0.75);
    col = mix(col, uC2, smoothstep(0.7, 1.0, band2) * 0.45);
    col = mix(col, uC1 * 0.75, smoothstep(0.72, 0.9, fbm(p * 1.4 + 11.0)) * 0.5);
    col *= 0.92 + 0.16 * noise(p * 70.0);
  } else if (uKind == 3) { // limestone: chalky cloud, fossil flecks
    float f = fbm(p * 1.3);
    col = mix(uC0, uC1, smoothstep(0.3, 0.75, f));
    col = mix(col, uC2, smoothstep(0.55, 0.8, fbm(p * 0.6 + 4.0)) * 0.35);
    vec3 v = voro(p * 60.0);
    col = mix(col, uC1 * 0.7, step(0.95, v.y) * (1.0 - smoothstep(0.08, 0.2, v.x)) * 0.7);
    col *= 0.95 + 0.1 * noise(p * 80.0);
  } else if (uKind == 4) { // slate: laminar cleavage, rust blooms
    float t = p.y * 11.0 + fbm(vec2(p.x * 0.5, p.y * 4.0)) * 3.5;
    float lam = 0.5 + 0.5 * sin(t);
    col = mix(uC0, uC1, lam * 0.6 + noise(vec2(p.x * 3.0, p.y * 40.0)) * 0.25);
    col = mix(col, uC2, smoothstep(0.6, 0.8, fbm(p * 1.1 + 9.0)) * 0.7);
  } else if (uKind == 5) { // quartzite: streaked, mica sparkle
    float s = fbm(vec2(p.x * 0.35, p.y * 5.0) + fbm(p) * 0.6);
    col = mix(uC0, uC1, smoothstep(0.35, 0.7, s));
    col = mix(col, uC2, smoothstep(0.62, 0.78, fbm(vec2(p.x * 0.6, p.y * 3.0) + 5.0)) * 0.5);
    col += vec3(step(0.996, hash(floor(p * 260.0)))) * 0.55;
  } else if (uKind == 6) { // travertine: bands and pores
    float t = p.y * 4.5 + fbm(p * 0.9) * 1.6;
    col = mix(uC0, uC1, smoothstep(0.3, 0.9, 0.5 + 0.5 * sin(t * 2.0)) * 0.6);
    col = mix(col, uC1 * 0.95, noise(vec2(p.x * 1.0, p.y * 18.0)) * 0.3);
    float pore = smoothstep(0.78, 0.84, noise(vec2(p.x * 40.0, p.y * 150.0)) * (0.6 + 0.6 * fbm(p * 2.0)));
    col = mix(col, uC2 * 0.8, pore * 0.6);
  } else { // onyx: translucent concentric bands
    vec2 c = p - vec2(0.4 * uScale, -0.3 * uScale);
    float d = length(c * vec2(1.0, 1.6)) + fbm(p * 1.1) * 0.9;
    float bands = 0.5 + 0.5 * sin(d * 13.0);
    float fine = 0.5 + 0.5 * sin(d * 47.0 + fbm(p * 3.0) * 4.0);
    col = mix(uC0, uC1, smoothstep(0.35, 0.95, bands) * 0.75);
    col = mix(col, uC2, smoothstep(0.75, 1.0, fine) * 0.4);
    col += uC2 * 0.18 * fbm(p * 1.5 + 3.0);
  }
  return clamp(col, 0.0, 1.2);
}

float relief(vec2 p) {
  float h = 0.0;
  h += uGrain * (noise(p * 150.0) * 0.6 + noise(p * 60.0) * 0.4) * 0.6;
  h += uBrush * (noise(vec2(p.x * 2.5, p.y * 220.0)) * 0.55 + fbm(p * 3.0) * 0.25);
  h += uCleft * (fbm(p * 1.8) * 1.6 + noise(p * 22.0) * 0.25);
  h += uSaw * (0.5 + 0.5 * sin(p.y * 110.0 + noise(p * 2.0) * 3.0)) * 0.12;
  return h;
}

void main() {
  vec2 p = gl_FragCoord.xy / max(uRes.x, uRes.y) * uScale + vec2(uSeed * 3.1, uSeed * 1.7);
  outColor = vec4(albedo(p), clamp(relief(p) * 0.5, 0.0, 1.0));
}`;

const LIGHT = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform vec2 uLight;
uniform float uLightOn;
uniform float uGloss, uGrain, uTranslucent;
uniform float uHeightScale;
out vec4 outColor;

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 px = 1.0 / uRes;
  vec4 t = texture(uTex, uv);
  float hx = texture(uTex, uv + vec2(px.x, 0)).a - texture(uTex, uv - vec2(px.x, 0)).a;
  float hy = texture(uTex, uv + vec2(0, px.y)).a - texture(uTex, uv - vec2(0, px.y)).a;
  vec3 n = normalize(vec3(-hx * uHeightScale, -hy * uHeightScale, 1.0));

  vec3 alb = t.rgb;
  float lum = dot(alb, vec3(0.299, 0.587, 0.114));
  // Finish changes how the stone reads: polish deepens, blasting bleaches.
  alb = mix(vec3(lum), alb, mix(0.8, 1.18, uGloss));
  alb *= mix(1.05, 0.9, uGloss);
  alb = mix(alb, vec3(lum) * 1.08 + 0.035, uGrain * 0.28);

  float aspect = uRes.x / uRes.y;
  vec3 pos = vec3(uv * vec2(aspect, 1.0), 0.0);
  vec3 L = vec3(uLight * vec2(aspect, 1.0), mix(0.22, 0.55, uGloss));
  vec3 ldir = normalize(L - pos);
  float dist = length(L.xy - pos.xy);
  float att = 1.0 / (1.0 + dist * dist * 1.4);
  float sheenAmt = 1.0;
  if (uLightOn < 0.5) {
    ldir = normalize(vec3(-0.55, 0.65, 0.55));
    att = 0.9;
    sheenAmt = 0.0;
  }
  vec3 V = vec3(0.0, 0.0, 1.0);
  float diff = max(dot(n, ldir), 0.0);
  vec3 H = normalize(ldir + V);
  float shin = mix(10.0, 260.0, uGloss);
  float spec = pow(max(dot(n, H), 0.0), shin) * mix(0.05, 1.4, uGloss);
  float sheen = uGloss * 0.32 * exp(-dist * dist * 5.0) * sheenAmt;

  vec3 lamp = vec3(1.0, 0.95, 0.86);
  vec3 col = alb * (0.72 + 0.42 * diff * att);
  col += lamp * (spec * att + sheen);
  // Onyx glows where the lamp passes behind it.
  col += alb * uTranslucent * 0.55 * exp(-dist * dist * 3.0) * sheenAmt;

  float d = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (d - 0.5) / 255.0;
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export type StoneParams = {
  kind: StoneKind;
  palette: [string, string, string];
  scale: number;
  seed: number;
  finish: Finish;
};

function hex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const prog = gl.createProgram()!;
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(sh) ?? "shader compile failed");
    }
    gl.attachShader(prog, sh);
  }
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) ?? "program link failed");
  }
  return prog;
}

export class StoneRenderer {
  private gl: WebGL2RenderingContext;
  private bake: WebGLProgram;
  private light: WebGLProgram;
  private tex: WebGLTexture;
  private fbo: WebGLFramebuffer;
  private floatTex: boolean;
  private params: StoneParams | null = null;
  private dirty = true;
  readonly canvas: HTMLCanvasElement;

  static create(canvas: HTMLCanvasElement, preserve = false): StoneRenderer | null {
    const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: preserve, alpha: false });
    if (!gl) return null;
    try {
      return new StoneRenderer(canvas, gl);
    } catch {
      return null;
    }
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    this.floatTex = !!gl.getExtension("EXT_color_buffer_float");
    this.bake = compile(gl, VERT, BAKE);
    this.light = compile(gl, VERT, LIGHT);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.tex = gl.createTexture()!;
    this.fbo = gl.createFramebuffer()!;
  }

  setParams(p: StoneParams) {
    this.params = p;
    this.dirty = true;
  }

  resize(w: number, h: number) {
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.dirty = true;
    }
  }

  private rebake() {
    const { gl, params: p } = this;
    if (!p) return;
    const w = this.canvas.width, h = this.canvas.height;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    if (this.floatTex) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);

    gl.viewport(0, 0, w, h);
    gl.useProgram(this.bake);
    const u = (n: string) => gl.getUniformLocation(this.bake, n);
    gl.uniform2f(u("uRes"), w, h);
    gl.uniform1f(u("uSeed"), p.seed);
    gl.uniform1f(u("uScale"), p.scale);
    gl.uniform1i(u("uKind"), KIND_INDEX[p.kind]);
    gl.uniform3fv(u("uC0"), hex(p.palette[0]));
    gl.uniform3fv(u("uC1"), hex(p.palette[1]));
    gl.uniform3fv(u("uC2"), hex(p.palette[2]));
    // 8-bit height can't hold smooth cleft slopes, so flatten relief a touch.
    const k = this.floatTex ? 1 : 0.6;
    gl.uniform1f(u("uGrain"), p.finish.grain * k);
    gl.uniform1f(u("uBrush"), p.finish.brush * k);
    gl.uniform1f(u("uCleft"), p.finish.cleft * k);
    gl.uniform1f(u("uSaw"), p.finish.saw * k);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.dirty = false;
  }

  /** Light position in 0..1 with y pointing up; `on` false gives even studio light. */
  render(lx: number, ly: number, on: boolean) {
    const { gl, params: p } = this;
    if (!p) return;
    if (this.dirty) this.rebake();
    const w = this.canvas.width, h = this.canvas.height;
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.light);
    const u = (n: string) => gl.getUniformLocation(this.light, n);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(u("uTex"), 0);
    gl.uniform2f(u("uRes"), w, h);
    gl.uniform2f(u("uLight"), lx, ly);
    gl.uniform1f(u("uLightOn"), on ? 1 : 0);
    gl.uniform1f(u("uGloss"), p.finish.gloss);
    gl.uniform1f(u("uGrain"), p.finish.grain);
    gl.uniform1f(u("uTranslucent"), p.kind === "onyx" ? 0.4 : 0);
    gl.uniform1f(u("uHeightScale"), Math.min(w, h) * 0.024);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  destroy() {
    const { gl } = this;
    gl.deleteTexture(this.tex);
    gl.deleteFramebuffer(this.fbo);
    gl.deleteProgram(this.bake);
    gl.deleteProgram(this.light);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}

// One hidden renderer shared by every static swatch on the page, so a page
// full of stone never runs into the browser's WebGL context limit.
let shared: StoneRenderer | null | undefined;
const cache = new Map<string, string>();

export function snapshotStone(p: StoneParams, w: number, h: number): string | null {
  const key = `${p.kind}|${p.palette.join()}|${p.scale}|${p.seed}|${p.finish.key}|${w}x${h}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (shared === undefined) shared = StoneRenderer.create(document.createElement("canvas"), true);
  if (!shared) return null;
  shared.resize(w, h);
  shared.setParams(p);
  shared.render(0.3, 0.75, false);
  const url = shared.canvas.toDataURL("image/jpeg", 0.86);
  cache.set(key, url);
  return url;
}

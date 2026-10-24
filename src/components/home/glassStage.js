/* 홈 표지: 포켓몬 벽과 유리 YPL을 WebGL 한 장으로 (13차, 2026-10-24. 실험판 docs/redesign-glass/lab/home-gl-lab.html의 G).
   끊김의 구조적 해결: 예전 표지(glassCover.js)는 벽 그림 약 440장의 DOM, 흑백 필터, 글자 마스크, SVG 굴절 backdrop-filter가
   벽이 움직이는 매 프레임 다시 합성됐다. 여기서는 그림을 텍스처 한 장(아틀라스)에 모아 한 번에 그리고 유리는 셰이더에서 합성한다.
   - 글자 모양: 워드마크 벡터 경로에서 정확한 부호 거리를 계산한다(일꾼에서, 기기 픽셀만큼 촘촘히, 16비트).
   - 뒤 비침: 글자 안에는 제 색의 벽, 그 밑으로 흑백 벽과 베일. 가우스 서리 2px, 테두리 띠의 굴절(refraction.js lensOffset과 같은 곡선,
     띠 24px, 글자 굵기의 40%까지, 휨은 띠의 1.1배에 1.4를 곱함), 채도 170%, 밝기 --glass-bright.
   - 몸체: 상단 바 .glass 처방을 토큰 값 그대로(--glass, --caustic, --sheen, --spec, 안쪽 그림자 --edge, 1px 테두리 --rim-*, 바깥 그림자 --shadow-near/far).
   - 두께: 테두리 띠를 볼록한 경사로 보고 무대의 빛(화면 바로 위)으로 비춘다. 위를 향한 경사는 밝게, 아래는 어둡게, 가는 반사광.
   - 누르면 그 자리에서 충격파가 무대를 지나간다(동작 줄이기에서는 없음).
   startGlassStage(layer, slot, { enter, follow, onShown }): glassCover.js와 같은 약속. WebGL2가 없으면 null(부르는 쪽이 glassCover.js로).
   테마가 바뀌는 동안(.theme-fade) 토큰을 매 프레임 다시 읽어 색이 제자리에서 바뀐다. 표지가 화면 밖이거나 탭이 숨으면 그리지 않는다. */
import { WORDMARK_PATH } from "../layout/SiteHeader.jsx";
import { ROSTER } from "./glassCover.js";

const PAD = 80;          // 거리 텍스처의 여백(CSS px): --shadow-far(24px 아래, 52px 흐림)가 번질 자리
const RANGE = 96;        // 거리를 이 안에서만 쓴다
const FROST = 2, BEND = 1.4, BEVEL = .6;
const EASE = x => 1 - (1 - x) ** 3;
const sprite = n => `${import.meta.env?.BASE_URL ?? "/"}sprites/cover/${n}.webp`;

const VS_SPRITE = `#version 300 es
layout(location=0) in vec2 a_c;
layout(location=1) in vec4 a_i;
layout(location=2) in float a_a;
uniform vec2 u_res; uniform vec2 u_grid;
out vec2 v_uv; out float v_a;
void main() {
  vec2 p = a_i.xy + (a_c - .5) * a_i.z;
  vec2 c = vec2(mod(a_i.w, u_grid.x), floor(a_i.w / u_grid.x));
  v_uv = (c + a_c) / u_grid; v_a = a_a;
  vec2 n = p / u_res * 2. - 1.;
  gl_Position = vec4(n.x, -n.y, 0., 1.);
}`;
const FS_SPRITE = `#version 300 es
precision highp float;
uniform sampler2D u_atlas;
in vec2 v_uv; in float v_a;
out vec4 o;
void main() { o = texture(u_atlas, v_uv) * v_a; }`;
const VS_FULL = `#version 300 es
void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2. - 1., 0., 1.); }`;

/* 합성 단계가 함께 쓰는 것: 화면 좌표(CSS px, 위가 0), 텍스처 읽기, 흑백 벽과 베일 */
const COMMON = `#version 300 es
precision highp float;
uniform vec2 u_res; uniform float u_scale; uniform vec2 u_tex;
uniform sampler2D u_scene;
uniform vec3 u_stage; uniform float u_grey;
vec2 pxOf() { return vec2(gl_FragCoord.x, u_tex.y - gl_FragCoord.y) / u_scale; }
vec4 tex(sampler2D t, vec2 px) { return texture(t, vec2(px.x / u_res.x, 1. - px.y / u_res.y)); }
/* 흑백 벽(.hx-wall: grayscale(1) contrast(1.1), 불투명도 .3, 밝은 테마 .24) 위에 베일(.hx-veil: 가운데 타원과 아래로 무대색, 불투명도 .7) */
vec4 wall(vec2 px) {
  vec4 s = tex(u_scene, px);
  vec3 c = s.a > 0. ? s.rgb / s.a : vec3(0.);
  float g = clamp((dot(c, vec3(.2126, .7152, .0722)) - .5) * 1.1 + .5, 0., 1.), a = s.a * u_grey;
  vec4 w = vec4(vec3(g) * a, a);
  vec2 e = (px - vec2(.5, .44) * u_res) / (vec2(.6, .46) * u_res);
  float ar = clamp(1. - length(e), 0., 1.), al = clamp((px.y / u_res.y - .55) / .45, 0., 1.);
  float av = (ar + al * (1. - ar)) * .7;
  return vec4(w.rgb * (1. - av) + u_stage * av, w.a * (1. - av) + av);
}
`;
/* 유리 뒤에 비치는 것(반 해상도): 제 색의 벽 위, 그 밑에 흑백 벽과 베일, 맨 밑에 무대색. 불투명. */
const FS_BACK = COMMON + `
out vec4 o;
void main() {
  vec2 px = pxOf();
  vec4 s = tex(u_scene, px), w = wall(px);
  o = vec4(s.rgb + (w.rgb + u_stage * (1. - w.a)) * (1. - s.a), 1.);
}`;
/* 분리 가우스 흐림(σ는 텍셀 단위) */
const FS_BLUR = `#version 300 es
precision highp float;
uniform sampler2D u_src; uniform vec2 u_dir; uniform float u_sigma; uniform vec2 u_size;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / u_size;
  int r = int(ceil(u_sigma * 3.));
  vec4 acc = vec4(0.); float ws = 0.;
  for (int i = -24; i <= 24; i++) {
    if (i < -r || i > r) continue;
    float w = exp(-float(i * i) / (2. * u_sigma * u_sigma));
    acc += texture(u_src, uv + u_dir * float(i) / u_size) * w; ws += w;
  }
  o = acc / ws;
}`;
const FS_COMP = COMMON + `
uniform sampler2D u_blur, u_sdf;
uniform vec4 u_box, u_shape;
uniform float u_glass, u_band, u_bend, u_bright, u_sat, u_time, u_bevel, u_dark, u_solid;
uniform vec4 u_glassc, u_solidc, u_spec, u_sheen, u_caustic, u_rimT, u_rimM, u_rimB;
uniform vec4 u_sh[8]; uniform vec4 u_shc[8]; uniform float u_shi[8]; uniform int u_shn;
uniform vec4 u_rip[4];
out vec4 o;
/* 등장: 유리는 14px 위에서 1.04배로, 12px 흐림을 벗으며 내려앉는다 */
vec2 toShape(vec2 px) { vec2 c = u_shape.xy + u_shape.zw * .5; float s = 1. + .04 * (1. - u_glass); return (px - c - vec2(0., -14. * (1. - u_glass))) / s + c; }
float sdf(vec2 px) {
  vec2 q = (toShape(px) - u_box.xy) / u_box.zw;
  if (q.x < 0. || q.y < 0. || q.x > 1. || q.y > 1.) return -${RANGE}.;
  return texture(u_sdf, q).r * (1. + .04 * (1. - u_glass));
}
/* 가우스 누적 분포(σ가 0이면 기기 픽셀 반 개의 부드러운 계단) */
float Phi(float v, float sg) { float x = v / max(sg, .5 / u_scale); return .5 * (1. + tanh(.7978845608 * (x + .044715 * x * x * x))); }
vec4 over(vec4 a, vec4 b) { return a + b * (1. - a.a); }
vec3 saturateCss(vec3 c, float s) {
  return vec3(dot(c, vec3(.213 + .787 * s, .715 - .715 * s, .072 - .072 * s)),
              dot(c, vec3(.213 - .213 * s, .715 + .285 * s, .072 - .072 * s)),
              dot(c, vec3(.213 - .213 * s, .715 - .715 * s, .072 + .928 * s)));
}
/* CSS radial-gradient(rx ry at cx cy, color, transparent stop): 상자 비율 좌표에서 */
float radial(vec2 q, vec2 c, vec2 r, float stop) { return clamp(1. - length((q - c) / r) / stop, 0., 1.); }
void main() {
  vec2 px = pxOf();
  vec2 off = vec2(0.);
  for (int i = 0; i < 4; i++) {
    vec4 r = u_rip[i]; float age = u_time - r.z;
    if (r.z <= 0. || age < 0. || age > 2.2) continue;
    vec2 d = px - r.xy; float L = length(d), R = age * 720.;
    off += d / max(L, 1.) * exp(-pow((L - R) / 48., 2.)) * exp(-age * 1.7) * 24.;
  }
  vec2 sp = px + off;
  vec4 res = wall(sp);
  float sd = sdf(px);
  if (sd <= -${RANGE}. + 1. || u_glass <= 0.) { o = res; return; }
  float cov = Phi(sd, 12. * (1. - u_glass));
  for (int i = 7; i >= 0; i--) {
    if (i >= u_shn || u_shi[i] > .5) continue;
    vec4 S = u_sh[i];
    res = over(u_shc[i] * Phi(sdf(px - S.xy) + S.w, S.z) * (1. - cov) * u_glass, res);
  }
  if (cov < .002) { o = res; return; }
  float h = .6;
  vec2 g = vec2(sdf(px + vec2(h, 0.)) - sdf(px - vec2(h, 0.)), sdf(px + vec2(0., h)) - sdf(px - vec2(0., h)));
  vec2 n = g / max(length(g), 1e-5);
  float t = 1. - clamp(sd / u_band, 0., 1.);
  vec3 B = tex(u_blur, sp + n * t * t * u_bend).rgb;
  B = mix(clamp(saturateCss(B, u_sat) * u_bright, 0., 1.), u_solidc.rgb, u_solid);
  vec4 col = vec4(B, 1.);
  vec2 q = (toShape(px) - u_shape.xy) / u_shape.zw;
  if (u_solid < .5) col = over(u_glassc, col);
  col = over(u_caustic * radial(q, vec2(.5, 1.25), vec2(.9, .7), .7), col);
  col = over(u_sheen * clamp(1. - q.y / .55, 0., 1.), col);
  col = over(u_spec * radial(q, vec2(.5, -.2), vec2(1.5, 1.2), .58), col);
  for (int i = 7; i >= 0; i--) {
    if (i >= u_shn || u_shi[i] < .5) continue;
    vec4 S = u_sh[i];
    col = over(u_shc[i] * (1. - Phi(sdf(px - S.xy) - S.w, S.z)), col);
  }
  float s = clamp(sd / u_band, 0., 1.), slope = 2. * (1. - s) * u_bevel;
  vec3 N = normalize(vec3(-n * slope, 1.)), Lt = normalize(vec3(0., -.75, 1.)), Hh = normalize(Lt + vec3(0., 0., 1.));
  float lit = dot(N, Lt) - Lt.z;
  col.rgb = mix(col.rgb, vec3(1.), max(lit, 0.) * mix(.22, .26, u_dark));
  col.rgb *= 1. + min(lit, 0.) * mix(.25, .55, u_dark);
  col.rgb += max(pow(max(dot(N, Hh), 0.), 140.) - pow(Hh.z, 140.), 0.) * mix(.35, .42, u_dark);
  vec4 rc = u_rimM;
  rc = over(u_rimB * radial(q, vec2(.5, 1.), vec2(1.1, 1.5), .52), rc);
  rc = over(u_rimT * radial(q, vec2(.5, 0.), vec2(1.5, 1.7), .58), rc);
  col = over(rc * max(cov - Phi(sd - 1., 0.), 0.), col);
  float a = cov * u_glass;
  o = col * a + res * (1. - a);
}`;

/* ---------- 글자 모양: 워드마크 경로(skewX(-12) translate(21 0), viewBox 310x100)의 선분들 ---------- */
function markSegments(w, h) {
  const tk = WORDMARK_PATH.match(/[MHVLAZ]|-?[\d.]+/g), T = Math.tan(12 * Math.PI / 180), sx = w / 310, sy = h / 100;
  const P = (x, y) => [((x + 21) - T * y) * sx, y * sy];
  const segs = [];
  let i = 0, cx = 0, cy = 0, x0 = 0, y0 = 0;
  const line = (x, y) => { segs.push([...P(cx, cy), ...P(x, y)]); cx = x; cy = y; };
  const num = () => parseFloat(tk[i++]);
  while (i < tk.length) {
    const c = tk[i++];
    if (c === "M") { cx = x0 = num(); cy = y0 = num(); }
    else if (c === "H") line(num(), cy);
    else if (c === "V") line(cx, num());
    else if (c === "L") line(num(), num());
    else if (c === "Z") line(x0, y0);
    else if (c === "A") {
      // SVG 호(회전 0)를 중심 매개변수로 바꿔 잘게 나눈다(기울인 뒤에도 오차 0.05px 아래)
      let rx = num(), ry = num(); num(); const fa = num(), fs = num(), x2 = num(), y2 = num();
      const dx = (cx - x2) / 2, dy = (cy - y2) / 2, L = dx * dx / (rx * rx) + dy * dy / (ry * ry);
      if (L > 1) { rx *= Math.sqrt(L); ry *= Math.sqrt(L); }
      const nu = rx * rx * ry * ry - rx * rx * dy * dy - ry * ry * dx * dx, de = rx * rx * dy * dy + ry * ry * dx * dx;
      const co = Math.sqrt(Math.max(0, nu / de)) * (fa === fs ? -1 : 1), cxp = co * rx * dy / ry, cyp = -co * ry * dx / rx;
      const ccx = cxp + (cx + x2) / 2, ccy = cyp + (cy + y2) / 2, ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      const t1 = ang(1, 0, (dx - cxp) / rx, (dy - cyp) / ry);
      let dt = ang((dx - cxp) / rx, (dy - cyp) / ry, (-dx - cxp) / rx, (-dy - cyp) / ry);
      if (!fs && dt > 0) dt -= 2 * Math.PI;
      if (fs && dt < 0) dt += 2 * Math.PI;
      const n = Math.max(8, Math.ceil(Math.abs(dt) / (Math.PI / 2) * 24));
      for (let k = 1; k <= n; k++) line(ccx + rx * Math.cos(t1 + dt * k / n), ccy + ry * Math.sin(t1 + dt * k / n));
      cx = x2; cy = y2;
    }
  }
  return segs;
}
/* 정확한 부호 거리(CSS px, 안쪽 +): 모든 선분까지의 최소 거리, 안팎은 짝홀 규칙(경로의 evenodd). 일꾼에서 돈다. */
function sdfWork({ segs, W, H, k, PAD, RANGE }) {
  const out = new Float32Array(W * H), S = segs.length;
  let max = 0;
  for (let j = 0; j < H; j++) {
    const py = (j + .5) / k - PAD;
    for (let i = 0; i < W; i++) {
      const px = (i + .5) / k - PAD;
      let d2 = 1e18, inside = false;
      for (let s = 0; s < S; s++) {
        const g = segs[s], ax = g[0], ay = g[1], bx = g[2], by = g[3], ex = bx - ax, ey = by - ay, wx = px - ax, wy = py - ay;
        const l2 = ex * ex + ey * ey, t = l2 > 0 ? Math.max(0, Math.min(1, (wx * ex + wy * ey) / l2)) : 0;
        const qx = wx - ex * t, qy = wy - ey * t, q2 = qx * qx + qy * qy;
        if (q2 < d2) d2 = q2;
        if ((ay > py) !== (by > py) && px < ax + (py - ay) / (by - ay) * ex) inside = !inside;
      }
      const v = Math.max(-RANGE, Math.min(RANGE, inside ? Math.sqrt(d2) : -Math.sqrt(d2)));
      out[j * W + i] = v; if (v > max) max = v;
    }
  }
  postMessage({ out, max }, [out.buffer]);
}
let workerURL = "";
const sdfCache = new Map();
/* 그린 거리는 크기와 배율마다 세션 동안 다시 쓴다(홈에 다시 오면 바로) */
function buildSDF(w, h, dpr) {
  const k = Math.min(2, Math.max(1, dpr)), W = Math.round((w + PAD * 2) * k), H = Math.round((h + PAD * 2) * k), key = `${w}x${h}@${k}`;
  if (sdfCache.has(key)) return sdfCache.get(key);
  workerURL ||= URL.createObjectURL(new Blob([`onmessage = e => (${sdfWork})(e.data);`], { type: "text/javascript" }));
  const p = new Promise((res, rej) => {
    const wk = new Worker(workerURL);
    wk.onmessage = e => { wk.terminate(); res({ ...e.data, W, H }); };
    wk.onerror = e => { wk.terminate(); sdfCache.delete(key); rej(e); };
    wk.postMessage({ segs: markSegments(w, h), W, H, k, PAD, RANGE });
  });
  sdfCache.set(key, p);
  if (sdfCache.size > 6) sdfCache.delete(sdfCache.keys().next().value);
  return p;
}
/* 아틀라스는 한 번만 받는다(그림이 같다) */
let atlasPixels = null;
const COLS = 10, CELL = 256, ROWS = Math.ceil(ROSTER.length / COLS);
function atlasCanvas() {
  atlasPixels ||= Promise.all(ROSTER.map(n => fetch(sprite(n)).then(r => r.blob()).then(b => createImageBitmap(b)).catch(() => null))).then(bm => {
    const c = document.createElement("canvas"); c.width = COLS * CELL; c.height = ROWS * CELL;
    const g = c.getContext("2d"); g.imageSmoothingQuality = "high";
    bm.forEach((b, i) => b && g.drawImage(b, (i % COLS) * CELL + CELL / 16, Math.floor(i / COLS) * CELL + CELL / 16, CELL * 7 / 8, CELL * 7 / 8));
    return c;
  });
  return atlasPixels;
}

/* ---------- 토큰 읽기 ---------- */
const rgba = s => { const m = s.match(/[\d.]+/g).map(Number); const a = m[3] ?? 1; return [m[0] / 255 * a, m[1] / 255 * a, m[2] / 255 * a, a]; };
const shadowsOf = s => s.split(/,(?![^(]*\))/).filter(x => x.trim() && x.trim() !== "none").map(x => {
  const color = x.match(/rgba?\([^)]*\)/)[0];
  const [ox, oy, b = 0, sp = 0] = x.replace(color, "").replace("inset", "").trim().split(/\s+/).map(parseFloat);
  return { inset: /inset/.test(x), ox, oy, sigma: b / 2, sp, c: rgba(color) };
});

export function startGlassStage(layer, slot, { enter = false, follow = null, onShown = () => {} } = {}) {
  const canvas = document.createElement("canvas");
  canvas.className = "hx-gl";
  /* 페이지 전환의 복제본(motion.js)이 마지막 그림을 옮겨 그릴 수 있게 버퍼를 남긴다 */
  const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, antialias: false, alpha: true, preserveDrawingBuffer: true });
  if (!gl) return null;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches, solid = matchMedia("(prefers-reduced-transparency: reduce)").matches;
  const prog = (vs, fs) => {
    const p = gl.createProgram();
    for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) { const nm = gl.getActiveUniform(p, i).name.replace("[0]", ""); u[nm] = gl.getUniformLocation(p, nm); }
    return { p, u };
  };
  let SP, BP, XP, CP;
  try { SP = prog(VS_SPRITE, FS_SPRITE); BP = prog(VS_FULL, FS_BACK); XP = prog(VS_FULL, FS_BLUR); CP = prog(VS_FULL, FS_COMP); }
  catch (e) { console.warn("표지 무대를 켜지 못했습니다.", e); return null; }
  layer.replaceChildren(canvas);

  /* 인스턴스: x, y, 크기(CSS px), 칸, 알파 */
  const MAX = 1536, STRIDE = 5, buf = new Float32Array(MAX * STRIDE);
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ib); gl.bufferData(gl.ARRAY_BUFFER, buf.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, STRIDE * 4, 0); gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, STRIDE * 4, 16); gl.vertexAttribDivisor(2, 1);
  gl.bindVertexArray(null);

  let alive = true, wallAt = 0, shapeReady = false;
  const atlas = gl.createTexture();
  atlasCanvas().then(c => {
    if (!alive) return;
    gl.bindTexture(gl.TEXTURE_2D, atlas);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    const an = gl.getExtension("EXT_texture_filter_anisotropic");
    if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, 4);
    wallAt = performance.now();
  });

  /* 유리 모양: 슬롯 크기마다 거리 텍스처를 한 번 */
  const sdfTex = gl.createTexture();
  let box = [0, 0, 1, 1], rect = [0, 0, 1, 1], band = 24, built = "";
  function measure() {
    const r = slot.getBoundingClientRect(), c = canvas.getBoundingClientRect();
    rect = [r.left - c.left, r.top - c.top, r.width, r.height];
    box = [rect[0] - PAD, rect[1] - PAD, rect[2] + PAD * 2, rect[3] + PAD * 2];
    const w = Math.round(r.width), h = Math.round(r.height), key = `${w}x${h}@${dpr}`;
    if (key === built || w < 2) return;
    built = key;
    buildSDF(w, h, dpr).then(s => {
      if (built !== key || !alive) return;
      band = Math.min(24, s.max * .8);
      gl.bindTexture(gl.TEXTURE_2D, sdfTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, s.W, s.H, 0, gl.RED, gl.FLOAT, s.out);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      shapeReady = true;
    }, e => console.warn("표지 유리를 그리지 못했습니다.", e));
  }

  /* 화면 밖 버퍼: 장면(기기 해상도), 뒤 비침과 그 흐림(반 해상도) */
  const target = (w, h) => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { t, f, w, h };
  };
  let scene = null, back = null, tmp = null, blur = null, W = 0, H = 0, dpr = 1;
  function resize() {
    if (!alive) return;
    dpr = Math.min(3, window.devicePixelRatio || 1);
    W = layer.clientWidth || innerWidth; H = layer.clientHeight || innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    for (const x of [scene, back, tmp, blur]) if (x) { gl.deleteTexture(x.t); gl.deleteFramebuffer(x.f); }
    const hw = Math.ceil(canvas.width / 2), hh = Math.ceil(canvas.height / 2);
    scene = target(canvas.width, canvas.height); back = target(hw, hh); tmp = target(hw, hh); blur = target(hw, hh);
    measure();
  }

  /* 테마: 무대색, 벽의 옅기, 유리의 값은 모두 토큰에서 */
  let theme = null;
  const probe = layer.appendChild(document.createElement("i"));
  probe.className = "hx-probe";
  const readTheme = () => {
    const root = document.documentElement, v = getComputedStyle(root).getPropertyValue("--glass-bright").trim();
    const col = n => { probe.style.background = `var(${n})`; return rgba(getComputedStyle(probe).backgroundColor); };
    probe.style.boxShadow = "var(--edge)"; const edge = shadowsOf(getComputedStyle(probe).boxShadow);
    probe.style.boxShadow = "var(--shadow-near), var(--shadow-far)"; const outer = shadowsOf(getComputedStyle(probe).boxShadow).filter(s => !s.inset);
    theme = {
      stage: col("--stage").slice(0, 3), dark: root.dataset.theme !== "light",
      glass: col("--glass"), solid: col("--glass-solid"), spec: col("--spec"), sheen: col("--sheen"), caustic: col("--caustic"),
      rimT: col("--rim-top"), rimM: col("--rim-mid"), rimB: col("--rim-bottom"),
      bright: parseFloat(v) || 1.1, shadows: [...edge, ...outer].slice(0, 8),
    };
  };
  readTheme();
  let fading = 0;
  const mo = new MutationObserver(() => { fading = performance.now() + 700; readTheme(); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });

  /* 벽: 화면을 채우는 줄, 줄마다 반대로 천천히(예전 표지와 같은 칸, 같은 간격, 같은 속도). 첫 등장은 가운데 줄부터 켜진다. */
  const rips = new Float32Array(16); let ri = 0;
  function wallFrame(t, now) {
    const cell = Math.min(104, Math.max(64, W * .09)), gapY = cell * 1.14, step = cell * 1.18;
    const n = Math.ceil(H * 1.1 / gapY) + 1, per = Math.ceil(W / step) + 2, rowW = per * step, mid = (n - 1) / 2, y0 = H / 2 - mid * gapY;
    const since = (now - wallAt) / 1000;
    let count = 0;
    for (let r = 0; r < n; r++) {
      const e = !enter || still ? Math.min(1, since / .42) : EASE(Math.min(1, Math.max(0, (since - .1 - Math.abs(r - mid) * .11) / .9)));
      if (e <= 0) continue;
      const off = still ? 0 : (t * rowW / (70 + (r % 3) * 18)) % rowW, x0 = r % 2 ? -rowW + off - cell * .5 : -off;
      for (let i = 0; i < per * 2 && count < MAX; i++, count++) buf.set([x0 + i * step + cell / 2, y0 + r * gapY, cell, (r * 11 + (i % per) * 3) % ROSTER.length, e], count * STRIDE);
    }
    return count;
  }
  /* 유리: 모양과 벽이 다 준비된 때부터 센다. 첫 방문은 그보다 0.5초 늦지 않게, 1.1초에 걸쳐 내려앉고 이름과 글이 뒤따른다. */
  const t0 = performance.now();
  let shownAt = 0;
  function glassOf(now) {
    if (!shapeReady || !wallAt) return 0;
    if (!shownAt) {
      const big = enter && !still, wait = enter ? Math.max(0, 500 - (now - t0)) : 0;
      shownAt = now + wait;
      if (follow) { follow.style.opacity = ""; follow.animate(big ? [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }] : [{ opacity: 0 }, { opacity: 1 }], { duration: big ? 700 : 420, delay: wait + (big ? 450 : 0), easing: "cubic-bezier(.22,1,.36,1)", fill: "backwards" }); }
      onShown(wait + (big ? 800 : 0));
    }
    return EASE(Math.min(1, Math.max(0, (now - shownAt) / (enter && !still ? 1100 : 420))));
  }

  const common = (pp, tw, th) => {
    gl.uniform2f(pp.u.u_res, W, H); gl.uniform1f(pp.u.u_scale, tw / W); gl.uniform2f(pp.u.u_tex, tw, th);
    gl.uniform3f(pp.u.u_stage, ...theme.stage); gl.uniform1f(pp.u.u_grey, theme.dark ? .3 : .24);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, scene.t); gl.uniform1i(pp.u.u_scene, 0);
  };
  /* 유리 상자(그림자 여백 포함)만 다시 그린다 */
  const scissorBox = (tw, th, extra) => {
    const s = tw / W, x = Math.floor((box[0] - extra) * s), y = Math.floor(th - (box[1] + box[3] + extra) * s);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(Math.max(0, x), Math.max(0, y), Math.ceil((box[2] + extra * 2) * s), Math.ceil((box[3] + extra * 2) * s));
  };
  let raf = 0, visible = true;
  function frame(now) {
    raf = 0;
    if (!alive || !visible || document.hidden) return;
    if (now < fading || document.documentElement.classList.contains("theme-fade")) readTheme();
    const t = (now - t0) / 1000, g = glassOf(now);
    const count = wallAt ? wallFrame(t, now) : 0;
    // 1. 장면: 벽
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindFramebuffer(gl.FRAMEBUFFER, scene.f); gl.viewport(0, 0, scene.w, scene.h);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (count) {
      gl.useProgram(SP.p);
      gl.uniform2f(SP.u.u_res, W, H); gl.uniform2f(SP.u.u_grid, COLS, ROWS);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlas); gl.uniform1i(SP.u.u_atlas, 0);
      gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, ib);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf, 0, count * STRIDE);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
      gl.bindVertexArray(null);
    }
    gl.disable(gl.BLEND);
    if (g > 0) {
      // 2. 유리 뒤에 비치는 것(반 해상도, 유리 상자만), 3. 가우스 서리
      gl.bindFramebuffer(gl.FRAMEBUFFER, back.f); gl.viewport(0, 0, back.w, back.h);
      scissorBox(back.w, back.h, FROST * 3 + 40);
      gl.useProgram(BP.p); common(BP, back.w, back.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.useProgram(XP.p);
      for (const [src, dst, dir] of [[back, tmp, [1, 0]], [tmp, blur, [0, 1]]]) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.f); gl.viewport(0, 0, dst.w, dst.h);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.t); gl.uniform1i(XP.u.u_src, 0);
        gl.uniform2f(XP.u.u_dir, ...dir); gl.uniform1f(XP.u.u_sigma, Math.min(8, FROST * back.w / W)); gl.uniform2f(XP.u.u_size, dst.w, dst.h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.SCISSOR_TEST);
    }
    // 4. 합성
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(CP.p); common(CP, canvas.width, canvas.height);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, blur.t); gl.uniform1i(CP.u.u_blur, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, sdfTex); gl.uniform1i(CP.u.u_sdf, 2);
    gl.uniform4f(CP.u.u_box, ...box); gl.uniform4f(CP.u.u_shape, ...rect);
    gl.uniform1f(CP.u.u_glass, g); gl.uniform1f(CP.u.u_band, Math.max(1, band));
    gl.uniform1f(CP.u.u_bend, band * 1.1 * .498 * BEND); gl.uniform1f(CP.u.u_bright, theme.bright); gl.uniform1f(CP.u.u_sat, 1.7);
    gl.uniform1f(CP.u.u_time, t); gl.uniform1f(CP.u.u_bevel, BEVEL); gl.uniform1f(CP.u.u_dark, theme.dark ? 1 : 0); gl.uniform1f(CP.u.u_solid, solid ? 1 : 0);
    for (const [u, k] of [["u_glassc", "glass"], ["u_solidc", "solid"], ["u_spec", "spec"], ["u_sheen", "sheen"], ["u_caustic", "caustic"], ["u_rimT", "rimT"], ["u_rimM", "rimM"], ["u_rimB", "rimB"]]) gl.uniform4f(CP.u[u], ...theme[k]);
    const sh = theme.shadows, A = new Float32Array(32), C = new Float32Array(32), I = new Float32Array(8);
    sh.forEach((s, i) => { A.set([s.ox, s.oy, s.sigma, s.sp], i * 4); C.set(s.c, i * 4); I[i] = s.inset ? 1 : 0; });
    gl.uniform4fv(CP.u.u_sh, A); gl.uniform4fv(CP.u.u_shc, C); gl.uniform1fv(CP.u.u_shi, I); gl.uniform1i(CP.u.u_shn, sh.length);
    gl.uniform4fv(CP.u.u_rip, rips);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(frame);
  }
  const wake = () => { if (alive && !raf && visible && !document.hidden) raf = requestAnimationFrame(frame); };
  const io = new IntersectionObserver(es => { visible = es.at(-1).isIntersecting; wake(); });
  io.observe(layer);
  const ro = new ResizeObserver(() => resize());
  ro.observe(layer);
  let timer = 0;
  const onResize = () => { measure(); clearTimeout(timer); timer = setTimeout(resize, 120); };
  addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", wake);
  /* 누르면 그 자리에서 충격파(버튼과 글은 그대로 누른다) */
  const cover = layer.parentElement;
  const onDown = e => {
    if (still || e.target.closest("button, a")) return;
    const c = canvas.getBoundingClientRect();
    rips.set([e.clientX - c.left, e.clientY - c.top, (performance.now() - t0) / 1000, 0], (ri++ % 4) * 4);
  };
  cover?.addEventListener("pointerdown", onDown);
  if (follow) follow.style.opacity = "0";
  resize();
  wake();
  return {
    stop() {
      alive = false; cancelAnimationFrame(raf); clearTimeout(timer);
      io.disconnect(); ro.disconnect(); mo.disconnect();
      removeEventListener("resize", onResize); document.removeEventListener("visibilitychange", wake);
      cover?.removeEventListener("pointerdown", onDown);
      if (follow) follow.style.opacity = "";
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

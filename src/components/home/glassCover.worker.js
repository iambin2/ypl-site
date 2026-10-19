/* 표지 유리 YPL의 픽셀 계산(glassCover.js가 부른다). 거리 변환과 픽셀마다 도는 셈이 메인 스레드를 막지 않게 따로 돈다.
   받는 것: 흐리게 그린 글자의 RGBA(a), 크기(W, H, 안쪽 w, h, 여백 P), 배율 k, 흐림 soft, 그림자의 모양 값, 굴절을 그릴지(refract).
   돌려주는 것: 덮임(cov), 1px 테두리(ring), 그림자마다의 모양(masks)은 W x H의 알파, 굴절 지도(disp)는 w x h의 RGBA. */

/* 정확한 거리 변환(Felzenszwalb): on 인 픽셀까지의 거리 */
function edt1(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -1e30; z[1] = 1e30;
  for (let q = 1; q < n; q++) {
    let t;
    for (;;) { t = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); if (t <= z[k] && k > 0) { k--; continue; } break; }
    k++; v[k] = q; z[k] = t; z[k + 1] = 1e30;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
}
function edt(on, W, H) {
  const out = new Float64Array(W * H), N = Math.max(W, H), f = new Float64Array(N), d = new Float64Array(N), v = new Int32Array(N), z = new Float64Array(N + 1);
  for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) f[y] = on[y * W + x] ? 0 : 1e12; edt1(f, H, d, v, z); for (let y = 0; y < H; y++) out[y * W + x] = d[y]; }
  for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) f[x] = out[y * W + x]; edt1(f, W, d, v, z); for (let x = 0; x < W; x++) out[y * W + x] = Math.sqrt(d[x]); }
  return out;
}
const clamp = v => (v < 0 ? 0 : v > 1 ? 1 : v);

onmessage = ({ data: { a, W, H, w, h, P, k, soft, shadows, refract } }) => {
  const n = W * H, inside = new Uint8Array(n), outside = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const v = a[i * 4 + 3] >= 128; inside[i] = v ? 1 : 0; outside[i] = v ? 0 : 1; }
  const dIn = edt(outside, W, H), dOut = edt(inside, W, H), SD = new Float32Array(n);
  let maxSd = 0;
  /* 가장자리 두어 픽셀은 정수 거리 대신 그린 글자의 부드러운 알파로 잰다(계단이 생기지 않게).
     흐림 s의 경계에서 알파의 기울기는 1/(√(2π)s)이므로 거리 ≈ (알파 - .5) × 2.5s. */
  for (let i = 0; i < n; i++) {
    let v = inside[i] ? dIn[i] - .5 : -(dOut[i] - .5);
    if (v > -2 && v < 2) v = Math.max(-2, Math.min(2, (a[i * 4 + 3] / 255 - .5) * 2.5 * soft));
    SD[i] = v; if (v > maxSd) maxSd = v;
  }
  const sd = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? -1e3 : SD[y * W + x]);
  const alpha = f => { const o = new Uint8ClampedArray(n * 4); for (let i = 0; i < n; i++) o[i * 4 + 3] = f(i) * 255; return o; };
  const cov = alpha(i => clamp(SD[i] + .5));
  /* 1px 테두리: 모양 안쪽 가장자리 한 줄(.glass::before의 1px 띠와 같은 자리) */
  const ring = alpha(i => clamp(SD[i] + .5) - clamp(SD[i] - k + .5));
  /* 상자 그림자 하나를 글자 모양으로: 안쪽은 어긋나고 줄어든 모양의 바깥, 바깥 그림자는 어긋나고 커진 모양 */
  const masks = shadows.map(sh => {
    const o = new Uint8ClampedArray(n * 4), ox = Math.round(sh.ox * k), oy = Math.round(sh.oy * k), sp = sh.sp * k;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = sd(x - ox, y - oy);
      o[(y * W + x) * 4 + 3] = (sh.inset ? 1 - clamp(v - sp + .5) : clamp(v + sp + .5)) * 255;
    }
    return o;
  });
  let disp = null, band = 0;
  if (refract) {
    /* 굴절: lensOffset과 같은 곡선. 띠는 24px, 단 글자 굵기의 40%를 넘지 않는다(사이트: 짧은 변의 40%). */
    band = Math.min(24 * k, maxSd * 2 * .4); disp = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const X = x + P, Y = y + P, v = sd(X, Y), o = (y * w + x) * 4;
      let dx = 0, dy = 0;
      if (v > 0 && v < band) {
        const gx = sd(X + 1, Y) - sd(X - 1, Y), gy = sd(X, Y + 1) - sd(X, Y - 1), l = Math.hypot(gx, gy) || 1, t = 1 - v / band, m = t * t;
        dx = gx / l * m; dy = gy / l * m;
      }
      disp[o] = 128 + dx * 127; disp[o + 1] = 128 + dy * 127; disp[o + 2] = 128; disp[o + 3] = 255;
    }
  }
  postMessage({ cov, ring, masks, disp, band }, [cov.buffer, ring.buffer, ...masks.map(m => m.buffer), ...(disp ? [disp.buffer] : [])]);
};

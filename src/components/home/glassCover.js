/* 홈 표지: 모든 포켓몬의 벽 위에 유리로 된 YPL 하나 (2026-10-19, DECISIONS 11차, 실험판 lab/home-drafts-lab.html의 B안).
   - 벽: 포켓몬 그림이 줄마다 반대로 천천히 흐르고, 흑백으로 옅게 깔린다. 장식이라 읽을 것이 없다(aria-hidden).
   - 유리 YPL: 상단 바의 .glass와 같은 처방을 워드마크 모양에 그대로 옮긴다. 글자 안으로는 같은 벽이 제 색으로 비친다.
     몸체(--glass 위의 --spec, --sheen, --caustic)와 흐림 4px, 테두리 띠의 굴절(refraction.js의 lensOffset과 같은 곡선),
     1px 테두리(.glass::before와 같은 빛), 안쪽 그림자(--edge)와 바깥 그림자(--shadow-near, --shadow-far).
     상자 그림자와 굴절 지도는 상자 대신 글자 모양으로 계산한다(정확한 부호 거리, 화면 배율만큼 촘촘히). 값은 토큰에서 읽는다.
   startGlassCover(layer, slot): layer 는 표지에 붙은 빈 층(.hx-glass), slot 은 유리 YPL이 설 자리(그 크기와 위치를 읽는다).
   크기, 화면 배율, 테마가 바뀌면 다시 그린다. 돌려주는 stop()이 모든 것을 치운다. */
import { WORDMARK_PATH } from "../layout/SiteHeader.jsx";

const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 310 100"><path transform="skewX(-12) translate(21 0)" fill-rule="evenodd" d="${WORDMARK_PATH}"/></svg>`;
const MARK_URL = "data:image/svg+xml," + encodeURIComponent(MARK_SVG);
/* 벽에 서는 포켓몬: 대전에서 자주 보는 얼굴들(public/sprites/pokemon) */
const ROSTER = ("pikachu charizard blastoise venusaur gengar dragonite tyranitar metagross salamence garchomp lucario greninja incineroar rillaboom "
  + "cinderace primarina decidueye mimikyu dragapult corviknight toxapex ferrothorn landorus-therian tornadus thundurus kingambit gholdengo fluttermane "
  + "ironhands amoonguss urshifu urshifu-rapidstrike rotom-wash rotom-heat whimsicott grimmsnarl indeedee-f hatterene torkoal pelipper archaludon "
  + "sneasler basculegion farigiraf ursaluna chienpao chiyu tinglu wochien gardevoir sylveon umbreon espeon milotic gyarados kingdra scizor aegislash "
  + "hydreigon volcarona talonflame zacian zamazenta calyrex-shadow calyrex-ice koraidon miraidon ogerpon ragingbolt ironvaliant maushold palafin "
  + "dondozo tatsugiri annihilape ceruledge armarouge baxcalibur glimmora sinistcha arcanine snorlax lapras mew mewtwo rayquaza lugia").split(" ");
const sprite = n => `${import.meta.env?.BASE_URL ?? "/"}sprites/pokemon/${n}.webp`;
const PAD = 80;          // 바깥 그림자가 번질 자리(--shadow-far: 24px 아래로 52px 흐림)
const MAP_PX = 2.4e6;    // 그리는 해상도 예산(기기 픽셀). 넓은 화면에서도 한 번에 끝나는 크기
const EASE = "cubic-bezier(.22,1,.36,1)";

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
/* 계산된 box-shadow 값을 그림자 하나씩으로 */
const shadowsOf = el => getComputedStyle(el).boxShadow.split(/,(?![^(]*\))/).filter(x => x.trim() && x.trim() !== "none").map(x => {
  const color = x.match(/rgba?\([^)]*\)/)[0], c = color.match(/[\d.]+/g).map(Number);
  const [ox, oy, b = 0, sp = 0] = x.replace(color, "").replace("inset", "").trim().split(/\s+/).map(parseFloat);
  return { inset: /inset/.test(x), ox, oy, b, sp, color: `rgb(${c[0]} ${c[1]} ${c[2]} / ${c[3] ?? 1})` };
});
const canvas = (W, H) => { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; };
const clamp = v => (v < 0 ? 0 : v > 1 ? 1 : v);
let seq = 0;

export function startGlassCover(layer, slot, { enter = false } = {}) {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const chromium = /Chrome\/|Chromium\/|Edg\//.test(navigator.userAgent) && !/iPhone|iPad|iPod/.test(navigator.userAgent)
    && !matchMedia("(prefers-reduced-transparency: reduce)").matches;
  const fid = "ypl-gm-" + ++seq;
  layer.innerHTML = `<div class="hx-wall"></div><i class="hx-veil"></i><i class="hx-gdrop"></i><div class="hx-wall win"></div>
    <i class="glass-mark"></i><i class="hx-gedge"></i><i class="hx-grim"></i>
    <i class="hx-probe" style="box-shadow:var(--edge)"></i><i class="hx-probe" style="box-shadow:var(--shadow-near), var(--shadow-far)"></i>`;
  const q = s => layer.querySelector(s);
  const base = q(".hx-wall"), win = q(".hx-wall.win"), body = q(".glass-mark"), edge = q(".hx-gedge"), rim = q(".hx-grim"), drop = q(".hx-gdrop");
  const [probeIn, probeOut] = layer.querySelectorAll(".hx-probe");
  for (const x of [win, body]) x.style.setProperty("--mk", `url("${MARK_URL}")`);

  /* 벽: 화면을 채우는 줄 수. 줄마다 두 벌을 이어 붙여 반 바퀴 흐르면 제자리(끊김 없음). 두 벽은 같은 줄, 같은 속도라 함께 흐른다. */
  let rows = 0;
  function build() {
    const cell = parseFloat(getComputedStyle(layer).getPropertyValue("--cell")) || 80;
    const n = Math.ceil(innerHeight * 1.1 / (cell * 1.14)) + 1;
    if (n === rows) return;
    rows = n;
    const per = Math.ceil(innerWidth / (cell * 1.18)) + 2;
    const html = Array.from({ length: n }, (_, r) => {
      const imgs = Array.from({ length: per }, (_, i) => `<img src="${sprite(ROSTER[(r * 11 + i * 3) % ROSTER.length])}" alt="" decoding="async">`).join("");
      return `<div class="hx-row" style="--dur:${70 + (r % 3) * 18}s">${imgs}${imgs}</div>`;
    }).join("");
    base.innerHTML = win.innerHTML = html;
  }

  const mark = new Image();
  mark.src = MARK_URL;
  let key = "", alive = true, timer = 0;

  function draw(cw, ch) {
    /* 화면 배율만큼 촘촘히(예산 안에서). 모든 길이는 기기 픽셀(k배). */
    const k = Math.max(1, Math.min(3, window.devicePixelRatio || 1, Math.sqrt(MAP_PX / ((cw + PAD * 2) * (ch + PAD * 2)))));
    const w = Math.round(cw * k), h = Math.round(ch * k), P = Math.round(PAD * k), W = w + P * 2, H = h + P * 2, n = W * H;
    const sc = canvas(W, H), sg = sc.getContext("2d", { willReadFrequently: true });
    const soft = Math.max(.6 * k, h * .006);
    sg.filter = `blur(${soft}px)`; sg.drawImage(mark, P, P, w, h); sg.filter = "none";
    const a = sg.getImageData(0, 0, W, H).data, inside = new Uint8Array(n), outside = new Uint8Array(n);
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
    const cov = sg.createImageData(W, H);
    for (let i = 0; i < n; i++) cov.data[i * 4 + 3] = clamp(SD[i] + .5) * 255;
    sg.clearRect(0, 0, W, H); sg.putImageData(cov, 0, 0);
    /* 상자 그림자 하나를 글자 모양으로: 안쪽은 어긋나고 줄어든 모양의 바깥, 바깥 그림자는 어긋나고 커진 모양. 흐림은 CSS처럼 반지름의 절반. */
    function layerOf(sh) {
      const t1 = canvas(W, H), g1 = t1.getContext("2d"), img = g1.createImageData(W, H), ox = Math.round(sh.ox * k), oy = Math.round(sh.oy * k), sp = sh.sp * k;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const v = sd(x - ox, y - oy);
        img.data[(y * W + x) * 4 + 3] = (sh.inset ? 1 - clamp(v - sp + .5) : clamp(v + sp + .5)) * 255;
      }
      g1.putImageData(img, 0, 0);
      const t2 = canvas(W, H), g2 = t2.getContext("2d");
      g2.fillStyle = sh.color; g2.fillRect(0, 0, W, H);
      g2.globalCompositeOperation = "destination-in";
      if (sh.b > 0) g2.filter = `blur(${sh.b * k / 2}px)`;
      g2.drawImage(t1, 0, 0); g2.filter = "none";
      g2.globalCompositeOperation = sh.inset ? "destination-in" : "destination-out";
      g2.drawImage(sc, 0, 0);
      return t2;
    }
    const paint = list => { const o = canvas(W, H), g = o.getContext("2d"); for (const sh of list.slice().reverse()) g.drawImage(layerOf(sh), 0, 0); return o; };
    const crop = c => { const o = canvas(w, h); o.getContext("2d").drawImage(c, -P, -P); return `url("${o.toDataURL()}")`; };
    /* 1px 테두리: 모양 안쪽 가장자리 한 줄(.glass::before의 1px 띠와 같은 자리) */
    const ring = canvas(W, H), rg = ring.getContext("2d"), ri = rg.createImageData(W, H);
    for (let i = 0; i < n; i++) ri.data[i * 4 + 3] = (clamp(SD[i] + .5) - clamp(SD[i] - k + .5)) * 255;
    rg.putImageData(ri, 0, 0);
    const shape = crop(sc);
    for (const x of [win, body]) x.style.setProperty("--mk", shape);
    rim.style.setProperty("--ring-mask", crop(ring));
    edge.style.setProperty("--edge-img", crop(paint(shadowsOf(probeIn))));
    drop.style.setProperty("--drop-img", `url("${paint(shadowsOf(probeOut).filter(x => !x.inset)).toDataURL()}")`);
    if (!chromium) return;
    /* 굴절: lensOffset과 같은 곡선. 띠는 24px, 단 글자 굵기의 40%를 넘지 않는다(사이트: 짧은 변의 40%). 뒤에 0.6px 흐림(refraction.js와 같음). */
    const band = Math.min(24 * k, maxSd * 2 * .4), dm = canvas(w, h), dg = dm.getContext("2d"), di = dg.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const X = x + P, Y = y + P, v = sd(X, Y), o = (y * w + x) * 4;
      let dx = 0, dy = 0;
      if (v > 0 && v < band) {
        const gx = sd(X + 1, Y) - sd(X - 1, Y), gy = sd(X, Y + 1) - sd(X, Y - 1), l = Math.hypot(gx, gy) || 1, t = 1 - v / band, m = t * t;
        dx = gx / l * m; dy = gy / l * m;
      }
      di.data[o] = 128 + dx * 127; di.data[o + 1] = 128 + dy * 127; di.data[o + 2] = 128; di.data[o + 3] = 255;
    }
    dg.putImageData(di, 0, 0);
    let f = document.getElementById(fid);
    if (!f) {
      document.body.insertAdjacentHTML("beforeend", `<svg width="0" height="0" style="position:absolute" aria-hidden="true" data-glass-cover><filter id="${fid}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB" x="0" y="0"><feImage result="map" preserveAspectRatio="none" x="0" y="0"/><feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation=".6" edgeMode="duplicate"/></filter></svg>`);
      f = document.getElementById(fid);
    }
    const im = f.querySelector("feImage");
    for (const node of [f, im]) { node.setAttribute("width", cw); node.setAttribute("height", ch); }
    f.querySelector("feDisplacementMap").setAttribute("scale", band / k * 1.1);
    im.setAttribute("href", dm.toDataURL());
    body.style.setProperty("--glass-filter", `blur(4px) url(#${fid}) saturate(170%) brightness(var(--glass-bright))`);
  }

  /* 자리 잡기: 창, 몸체, 테두리는 slot 과 같은 자리, 그림자는 그보다 PAD 만큼 넓게. 층은 표지(화면에 붙은 무대)를 덮는다. */
  let shown = false;
  function place() {
    if (!alive) return;
    const r = slot.getBoundingClientRect(), L = layer.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x = r.left - L.left, y = r.top - L.top;
    win.style.setProperty("--mx", x - win.offsetLeft + "px"); win.style.setProperty("--my", y - win.offsetTop + "px");
    win.style.setProperty("--mw", r.width + "px"); win.style.setProperty("--mh", r.height + "px");
    for (const el of [body, rim, edge]) Object.assign(el.style, { left: x + "px", top: y + "px", width: r.width + "px", height: r.height + "px" });
    Object.assign(drop.style, { left: x - PAD + "px", top: y - PAD + "px", width: r.width + PAD * 2 + "px", height: r.height + PAD * 2 + "px" });
    const next = [Math.round(r.width), Math.round(r.height), window.devicePixelRatio || 1, document.documentElement.dataset.theme].join("|");
    if (next === key || !mark.complete) return;
    key = next;
    draw(Math.round(r.width), Math.round(r.height));
    if (!shown) {
      shown = true;
      // 처음 그려지는 순간: 유리 YPL이 흐림을 벗으며 내려앉고, 그 안으로 색이 든다
      const kf = still || !enter ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: "translateY(-14px) scale(1.04)", filter: "blur(12px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }];
      for (const el of [win, body, rim, edge, drop]) el.animate(kf, { duration: enter && !still ? 1100 : 420, delay: enter ? 500 : 0, easing: EASE, fill: "backwards" });
    }
  }
  const later = () => { clearTimeout(timer); timer = setTimeout(() => { rows = 0; build(); place(); }, 120); };

  build();
  if (enter && !still) {
    // 첫 등장: 벽은 가운데 줄부터 바깥으로 켜진다
    const rs = [...base.children], mid = (rs.length - 1) / 2;
    rs.forEach((r, i) => r.animate([{ opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0)" }], { duration: 900, delay: 100 + Math.abs(i - mid) * 110, easing: EASE, fill: "backwards" }));
  }
  for (const el of [win, body, rim, edge, drop]) el.style.opacity = "0";
  mark.decode().catch(() => {}).then(() => requestAnimationFrame(() => {
    if (!alive) return;
    for (const el of [win, body, rim, edge, drop]) el.style.opacity = "";
    place();
  }));
  addEventListener("resize", later);
  // 테마가 바뀌면 그림자 색(토큰)이 바뀌므로 다시 그린다(색이 다 바뀐 뒤)
  const mo = new MutationObserver(() => { key = ""; clearTimeout(timer); timer = setTimeout(place, 60); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  return {
    stop() {
      alive = false;
      clearTimeout(timer);
      removeEventListener("resize", later);
      mo.disconnect();
      document.getElementById(fid)?.closest("svg")?.remove();
    },
  };
}

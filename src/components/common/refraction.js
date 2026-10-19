/* C2 (5차 검토): whatever floats bends what is behind it at its rim, like a thick convex lens.
   Chromium can run an SVG filter on an element's backdrop (backdrop-filter: url()). For every floating glass piece
   (.glass bars and dock, .glass-l3 sheets, menus and toasts) a displacement map is drawn for its exact rounded shape:
   inside a band along the edge every pixel points inward, strongest at the rim and fading to nothing at the band's
   inner edge, so the backdrop is sampled from further in and squeezes toward the rim. The middle is left alone.
   Other browsers, and anyone who asked for reduced transparency, keep the frosted glass from the CSS.
   Reference build: docs/redesign-glass/lab/refraction-lab.html. Nothing here touches the DOM at import time. */

const BAND = 24;      // rim band in px, at most 40% of the short side
const SHARE = 1.1;    // bend as a share of the band: past 1 a thin mirrored edge appears, which reads as thickness
const FROST = { glass: 4, l3: 16 }; // blur under the bend: bars stay clear, sheets and menus keep enough frost to read over
const MAP_PX = 120000; // map resolution budget, so a tall sheet costs no more than the top bar
const SMOOTH = 0.6;    // blur after the bend in px: removes the streaks of nearest-pixel sampling without frosting the glass

/* The inward offset at a point, as a vector in [-1, 1]. (px, py) is measured from the centre of a w x h box whose
   corners are rounded by radii [top-left, top-right, bottom-right, bottom-left]. */
export function lensOffset(px, py, w, h, radii, band) {
  const hw = w / 2, hh = h / 2;
  const r = Math.min(px < 0 ? (py < 0 ? radii[0] : radii[3]) : (py < 0 ? radii[1] : radii[2]), hw, hh);
  const qx = Math.abs(px) - (hw - r), qy = Math.abs(py) - (hh - r);
  const depth = -(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r);
  if (!(depth > 0 && depth < band)) return [0, 0];
  let nx, ny;
  if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy) || 1; nx = qx / l; ny = qy / l; }
  else if (qx > qy) { nx = 1; ny = 0; } else { nx = 0; ny = 1; }
  const t = 1 - depth / band, m = t * t; // a convex profile, steepest at the rim
  return [-(Math.sign(px) || 1) * nx * m, -(Math.sign(py) || 1) * ny * m];
}

const SEL = ".glass, .glass-l3";
const SKIP = ".theme-flip, #ypl-ghosts, .fly"; // still copies during a page or theme change keep the original's filter
const NS = "http://www.w3.org/2000/svg";
const pieces = new WeakMap();
let defs = null, seq = 0, started = false;

function drawMap(w, h, radii, band) {
  const res = Math.min(Math.min(2, window.devicePixelRatio || 1), Math.sqrt(MAP_PX / (w * h)));
  const W = Math.max(1, Math.round(w * res)), H = Math.max(1, Math.round(h * res));
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d"), img = g.createImageData(W, H), d = img.data;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const [dx, dy] = lensOffset(((i + 0.5) * w) / W - w / 2, ((j + 0.5) * h) / H - h / 2, w, h, radii, band);
    const k = (j * W + i) * 4;
    d[k] = 128 + dx * 127; d[k + 1] = 128 + dy * 127; d[k + 2] = 128; d[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return new Promise(done => c.toBlob(b => done(b ? URL.createObjectURL(b) : c.toDataURL()), "image/png"));
}

function filterFor(p) {
  if (!defs) {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("aria-hidden", "true"); svg.setAttribute("width", "0"); svg.setAttribute("height", "0");
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    defs = document.createElementNS(NS, "defs"); svg.append(defs); document.body.append(svg);
  }
  if (!p.filter) {
    const f = document.createElementNS(NS, "filter");
    f.id = p.id;
    for (const [a, v] of [["filterUnits", "userSpaceOnUse"], ["primitiveUnits", "userSpaceOnUse"], ["color-interpolation-filters", "sRGB"], ["x", 0], ["y", 0]]) f.setAttribute(a, v);
    // the displacement samples the nearest pixel, so the steep rim streaks; a half-pixel blur after it smooths the bend
    f.innerHTML = `<feImage result="map" preserveAspectRatio="none" x="0" y="0"/><feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="${SMOOTH}" edgeMode="duplicate"/>`;
    defs.append(f);
    p.filter = f;
  }
  return p.filter;
}

async function refract(el) {
  if (!el.isConnected || el.closest(SKIP)) return;
  const w = el.offsetWidth, h = el.offsetHeight;
  if (!w || !h) return;
  const st = getComputedStyle(el);
  const radii = [st.borderTopLeftRadius, st.borderTopRightRadius, st.borderBottomRightRadius, st.borderBottomLeftRadius].map(v => parseFloat(v) || 0);
  const band = Math.min(BAND, Math.min(w, h) * 0.4), key = [w, h, ...radii, band].join(",");
  let p = pieces.get(el);
  if (!p) { p = { id: "ypl-rf-" + ++seq }; pieces.set(el, p); }
  if (p.key === key) return;
  p.key = key;
  const f = filterFor(p), im = f.querySelector("feImage");
  // the new size takes the region at once (the old map stretches for a frame), the new map follows when it is drawn
  for (const node of [f, im]) { node.setAttribute("width", w); node.setAttribute("height", h); }
  f.querySelector("feDisplacementMap").setAttribute("scale", band * SHARE);
  const url = await drawMap(w, h, radii, band);
  if (p.key !== key) { if (url.startsWith("blob:")) URL.revokeObjectURL(url); return; }
  // decode first, so the filter never runs on an empty map (which would shift the whole backdrop)
  try { const probe = new Image(); probe.src = url; await probe.decode(); } catch { /* the filter still loads it */ }
  if (p.key !== key) { if (url.startsWith("blob:")) URL.revokeObjectURL(url); return; }
  const old = p.url;
  im.setAttribute("href", url); p.url = url;
  if (old?.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(old), 1000);
  // sheets hold text over whatever is behind; full saturation turned artwork behind them into coloured blotches
  const l3 = el.classList.contains("glass-l3");
  el.style.backdropFilter = `blur(${l3 ? FROST.l3 : FROST.glass}px) url(#${p.id}) saturate(${l3 ? 100 : 170}%) brightness(var(--glass-bright))`;
}

function forget(el) {
  const p = pieces.get(el);
  if (!p) return;
  p.filter?.remove();
  if (p.url?.startsWith("blob:")) URL.revokeObjectURL(p.url);
  pieces.delete(el);
  el.style.backdropFilter = "";
}

export function startRefraction() {
  if (started || typeof window === "undefined") return;
  started = true;
  const ua = navigator.userAgent;
  const chromium = /Chrome\/|Chromium\/|Edg\//.test(ua) && !/iPhone|iPad|iPod/.test(ua);
  if (!chromium || typeof ResizeObserver !== "function" || window.matchMedia?.("(prefers-reduced-transparency: reduce)").matches) return;

  const due = new Set();
  let frame = 0;
  const schedule = el => { due.add(el); frame ||= requestAnimationFrame(() => { frame = 0; const all = [...due]; due.clear(); all.forEach(e => { refract(e); }); }); };
  const ro = new ResizeObserver(entries => entries.forEach(e => schedule(e.target)));
  const watched = new Set();
  const track = el => { if (el.closest(SKIP)) return; if (!watched.has(el)) { watched.add(el); ro.observe(el); } schedule(el); };
  const scan = node => { if (node.nodeType !== 1) return; if (node.matches(SEL)) track(node); node.querySelectorAll(SEL).forEach(track); };
  // a closing sheet is put back for its exit animation, so a removed piece is dropped only if it stays out
  const drop = node => {
    if (node.nodeType !== 1) return;
    [...(node.matches(SEL) ? [node] : []), ...node.querySelectorAll(SEL)].forEach(el => setTimeout(() => {
      if (el.isConnected) return;
      ro.unobserve(el); watched.delete(el); forget(el);
    }, 1500));
  };
  new MutationObserver(list => list.forEach(m => { m.removedNodes.forEach(drop); m.addedNodes.forEach(scan); }))
    .observe(document.body, { childList: true, subtree: true });
  scan(document.body);
}

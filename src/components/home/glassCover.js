/* 홈 표지: 모든 포켓몬의 벽 위에 유리로 된 YPL 하나 (2026-10-19, DECISIONS 11차, 실험판 lab/home-drafts-lab.html의 B안).
   - 벽: 포켓몬 그림이 줄마다 반대로 천천히 흐르고, 흑백으로 옅게 깔린다. 장식이라 읽을 것이 없다(aria-hidden).
   - 유리 YPL: 상단 바의 .glass와 같은 처방을 워드마크 모양에 그대로 옮긴다. 글자 안으로는 같은 벽이 제 색으로 비친다.
     몸체(--glass 위의 --spec, --sheen, --caustic)와 흐림 4px, 테두리 띠의 굴절(refraction.js의 lensOffset과 같은 곡선),
     1px 테두리(.glass::before와 같은 빛), 안쪽 그림자(--edge)와 바깥 그림자(--shadow-near, --shadow-far).
     상자 그림자와 굴절 지도는 상자 대신 글자 모양으로 계산한다(정확한 부호 거리, 화면 배율만큼 촘촘히, glassCover.worker.js에서). 값은 토큰에서 읽는다.
   startGlassCover(layer, slot, { enter, follow, onShown }): layer 는 표지에 붙은 빈 층(.hx-glass), slot 은 유리 YPL이 설 자리(그 크기와 위치를 읽는다).
   follow 는 유리를 따라 나오는 것(아래의 한 줄 이름), onShown(시각)은 유리가 나오기 시작할 때 글이 나올 시각을 알린다.
   크기, 화면 배율, 테마가 바뀌면 다시 그린다. 새 그림은 다 풀린 뒤에 한 번에 바꿔 끼운다(풀리기 전에 끼우면 마스크가 한 프레임 비어
   확대할 때마다 글자가 깜빡인다). 돌려주는 stop()이 모든 것을 치운다. */
import { WORDMARK_PATH } from "../layout/SiteHeader.jsx";
import GlassWorker from "./glassCover.worker.js?worker&inline";

const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 310 100"><path transform="skewX(-12) translate(21 0)" fill-rule="evenodd" d="${WORDMARK_PATH}"/></svg>`;
const MARK_URL = "data:image/svg+xml," + encodeURIComponent(MARK_SVG);
/* 벽에 서는 포켓몬: 대전에서 자주 보는 얼굴들(public/sprites/pokemon) */
const ROSTER = ("pikachu charizard blastoise venusaur gengar dragonite tyranitar metagross salamence garchomp lucario greninja incineroar rillaboom "
  + "cinderace primarina decidueye mimikyu dragapult corviknight toxapex ferrothorn landorus-therian tornadus thundurus kingambit gholdengo fluttermane "
  + "ironhands amoonguss urshifu urshifu-rapidstrike rotom-wash rotom-heat whimsicott grimmsnarl indeedee-f hatterene torkoal pelipper archaludon "
  + "sneasler basculegion farigiraf ursaluna chienpao chiyu tinglu wochien gardevoir sylveon umbreon espeon milotic gyarados kingdra scizor aegislash "
  + "hydreigon volcarona talonflame zacian zamazenta calyrex-shadow calyrex-ice koraidon miraidon ogerpon ragingbolt ironvaliant maushold palafin "
  + "dondozo tatsugiri annihilape ceruledge armarouge baxcalibur glimmora sinistcha arcanine snorlax lapras mew mewtwo rayquaza lugia").split(" ");
/* 벽 그림은 표지 크기로 줄인 판(public/sprites/cover, scripts/build-cover-sprites.py). 칸이 가장 커도(104px, 배율 2) 208px이면 모자라지 않다. */
const sprite = n => `${import.meta.env?.BASE_URL ?? "/"}sprites/cover/${n}.webp`;
const PAD = 80;          // 바깥 그림자가 번질 자리(--shadow-far: 24px 아래로 52px 흐림)
const MAP_PX = 2.4e6;    // 그리는 해상도 예산(기기 픽셀). 넓은 화면에서도 한 번에 끝나는 크기
const EASE = "cubic-bezier(.22,1,.36,1)";

/* 계산된 box-shadow 값을 그림자 하나씩으로 */
const shadowsOf = el => getComputedStyle(el).boxShadow.split(/,(?![^(]*\))/).filter(x => x.trim() && x.trim() !== "none").map(x => {
  const color = x.match(/rgba?\([^)]*\)/)[0], c = color.match(/[\d.]+/g).map(Number);
  const [ox, oy, b = 0, sp = 0] = x.replace(color, "").replace("inset", "").trim().split(/\s+/).map(parseFloat);
  return { inset: /inset/.test(x), ox, oy, b, sp, color: `rgb(${c[0]} ${c[1]} ${c[2]} / ${c[3] ?? 1})` };
});
const canvas = (W, H) => { const c = document.createElement("canvas"); c.width = W; c.height = H; return c; };
/* 그림 주소: 한 장씩 따로 된 작업으로(한 번에 하나만 메인 스레드를 잡는다). toBlob은 폰에서 그림 받기와 겹쳐 몇 배 늦다. */
const dataUrl = c => new Promise(r => setTimeout(() => r(c.toDataURL())));
/* 그린 유리는 크기, 화면 배율, 테마마다 한 번만 그린다(홈에 다시 오거나 테마를 되돌리면 그대로 쓴다). 최근 것 몇 벌만 둔다. */
const drawn = new Map();
const keep = (key, r) => { drawn.delete(key); drawn.set(key, r); if (drawn.size > 6) drawn.delete(drawn.keys().next().value); };
/* 픽셀 계산은 일꾼(glassCover.worker.js)에서, 그림마다 하나를 띄우고 끝나면 닫는다. 일꾼은 번들에 들어 있다(따로 받으면 벽 그림 뒤에 줄을 선다). */
const work = (msg, transfer) => new Promise((res, rej) => {
  const wk = new GlassWorker();
  wk.onmessage = e => { wk.terminate(); res(e.data); };
  wk.onerror = e => { wk.terminate(); rej(e); };
  wk.postMessage(msg, transfer);
});
/* 그림 주소들을 미리 풀어 둔다(바꿔 끼우는 프레임에 바로 그려지게) */
const decoded = d => Promise.all([d.shape, d.ring, d.edge, d.drop, d.disp].filter(Boolean).map(u => { const i = new Image(); i.src = u; return i.decode().catch(() => {}); }));
let seq = 0;

export function startGlassCover(layer, slot, { enter = false, follow = null, onShown = () => {} } = {}) {
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
  const warm = layer.appendChild(document.createElement("i"));
  warm.style.cssText = "position:absolute;left:0;top:0;width:2px;height:2px;opacity:.01;pointer-events:none";
  for (const x of [win, body]) x.style.setProperty("--mk", `url("${MARK_URL}")`);

  /* 벽: 화면을 채우는 줄 수. 줄마다 두 벌을 이어 붙여 반 바퀴 흐르면 제자리(끊김 없음). 두 벽은 같은 줄, 같은 속도라 함께 흐른다.
     벽은 늘어야 할 때만 다시 쌓는다(화면이 줄면 남는 그림은 밖에서 잘린다). 다시 쌓으면 그림이 새로 풀리며 벽과 글자 안이 깜빡인다. */
  let rows = 0, cols = 0, gen = 0;
  function build() {
    const cell = parseFloat(getComputedStyle(layer).getPropertyValue("--cell")) || 80;
    const n = Math.ceil(innerHeight * 1.1 / (cell * 1.14)) + 1, per = Math.ceil(innerWidth / (cell * 1.18)) + 2;
    if (n <= rows && per <= cols) return;
    rows = Math.max(n, rows); cols = Math.max(per, cols);
    const html = Array.from({ length: rows }, (_, r) => {
      const imgs = Array.from({ length: cols }, (_, i) => `<img data-src="${sprite(ROSTER[(r * 11 + i * 3) % ROSTER.length])}" alt="" decoding="async">`).join("");
      return `<div class="hx-row" style="--dur:${70 + (r % 3) * 18}s">${imgs}${imgs}</div>`;
    }).join("");
    base.innerHTML = win.innerHTML = html;
    fill(++gen);
  }
  /* 그림은 가운데 줄부터 바깥으로 한 겹씩 받는다(벽이 켜지는 차례와 같다). 한꺼번에 받으면 느린 망에서 모두가 함께 늦게 선다. */
  async function fill(g) {
    const rs = [...base.children], ws = [...win.children], mid = (rs.length - 1) / 2;
    for (let d = 0; d <= mid && g === gen && alive; d++) {
      const imgs = rs.flatMap((r, i) => (Math.floor(Math.abs(i - mid)) === d ? [...r.children, ...ws[i].children] : []));
      for (const im of imgs) im.src = im.dataset.src;
      await Promise.all(imgs.map(im => im.decode().catch(() => {})));
    }
  }

  const mark = new Image();
  mark.src = MARK_URL;
  let key = "", alive = true, timer = 0;

  /* 유리 YPL을 그린다: 글자를 흐리게 그려 일꾼에 넘기고, 돌아온 모양으로 그림자를 입혀 그림 주소로 만든다 */
  async function draw(cw, ch) {
    /* 화면 배율만큼 촘촘히(예산 안에서). 모든 길이는 기기 픽셀(k배). */
    const k = Math.max(1, Math.min(3, window.devicePixelRatio || 1, Math.sqrt(MAP_PX / ((cw + PAD * 2) * (ch + PAD * 2)))));
    const w = Math.round(cw * k), h = Math.round(ch * k), P = Math.round(PAD * k), W = w + P * 2, H = h + P * 2;
    const sc = canvas(W, H), sg = sc.getContext("2d", { willReadFrequently: true });
    const soft = Math.max(.6 * k, h * .006);
    sg.filter = `blur(${soft}px)`; sg.drawImage(mark, P, P, w, h); sg.filter = "none";
    const a = sg.getImageData(0, 0, W, H).data;
    const inner = shadowsOf(probeIn), outer = shadowsOf(probeOut).filter(x => !x.inset), list = [...inner, ...outer];
    const r = await work({ a, W, H, w, h, P, k, soft, shadows: list, refract: chromium }, [a.buffer]);
    const put = (c, px) => c.getContext("2d").putImageData(new ImageData(px, c.width, c.height), 0, 0);
    sg.clearRect(0, 0, W, H); put(sc, r.cov);
    /* 상자 그림자 하나를 글자 모양으로(모양은 일꾼이 셈). 흐림은 CSS처럼 반지름의 절반. */
    function layerOf(sh) {
      const t1 = canvas(W, H); put(t1, r.masks[list.indexOf(sh)]);
      const t2 = canvas(W, H), g2 = t2.getContext("2d");
      g2.fillStyle = sh.color; g2.fillRect(0, 0, W, H);
      g2.globalCompositeOperation = "destination-in";
      if (sh.b > 0) g2.filter = `blur(${sh.b * k / 2}px)`;
      g2.drawImage(t1, 0, 0); g2.filter = "none";
      g2.globalCompositeOperation = sh.inset ? "destination-in" : "destination-out";
      g2.drawImage(sc, 0, 0);
      return t2;
    }
    const paint = shs => { const o = canvas(W, H), g = o.getContext("2d"); for (const sh of shs.slice().reverse()) g.drawImage(layerOf(sh), 0, 0); return o; };
    const crop = c => { const o = canvas(w, h); o.getContext("2d").drawImage(c, -P, -P); return o; };
    const ring = canvas(W, H); put(ring, r.ring);
    let dm = null;
    if (r.disp) { dm = canvas(w, h); put(dm, r.disp); }
    const out = [];
    for (const c of [crop(sc), crop(ring), crop(paint(inner)), paint(outer), dm]) out.push(c && await dataUrl(c));
    const [shape, rim, edge, drop, disp] = out;
    return { cw, ch, k, band: r.band, shape, ring: rim, edge, drop, disp };
  }
  /* 새 그림으로 바꿔 끼운다. 보이는 유리를 바꿀 때는 먼저 안 보이는 점 하나(warm)에 같은 그림과 새 필터를 걸어 받아 두고,
     그다음 한 번에 바꾼다. 굴절 필터는 그림마다 새로 만들고 옛 것은 바꾼 뒤에 치운다(같은 필터의 지도를 갈아 끼우면 지도가
     받아지는 동안 글자 안이 한 프레임 비틀려 보인다). 그 사이 크기가 또 바뀌었으면 false. */
  let fn = 0;
  async function apply(d, next, hidden) {
    const id = `${fid}-${++fn}`;
    /* 굴절 지도를 거는 필터. 뒤에 0.6px 흐림(refraction.js와 같음). */
    if (d.disp) document.body.insertAdjacentHTML("beforeend", `<svg width="0" height="0" style="position:absolute" aria-hidden="true" data-glass-cover="${fid}"><filter id="${id}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB" x="0" y="0" width="${d.cw}" height="${d.ch}"><feImage result="map" preserveAspectRatio="none" x="0" y="0" width="${d.cw}" height="${d.ch}" href="${d.disp}"/><feDisplacementMap in="SourceGraphic" in2="map" scale="${d.band / d.k * 1.1}" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation=".6" edgeMode="duplicate"/></filter></svg>`);
    if (!hidden) {
      warm.style.backgroundImage = [d.shape, d.ring, d.edge, d.drop].map(u => `url("${u}")`).join(",");
      warm.style.filter = d.disp ? `url(#${id})` : "";
      await new Promise(r => setTimeout(r, 100));
      if (!alive || key !== next) { document.getElementById(id)?.closest("svg")?.remove(); return false; }
    }
    for (const x of [win, body]) x.style.setProperty("--mk", `url("${d.shape}")`);
    rim.style.setProperty("--ring-mask", `url("${d.ring}")`);
    edge.style.setProperty("--edge-img", `url("${d.edge}")`);
    drop.style.setProperty("--drop-img", `url("${d.drop}")`);
    if (d.disp) body.style.setProperty("--glass-filter", `blur(4px) url(#${id}) saturate(170%) brightness(var(--glass-bright))`);
    warm.style.filter = "";
    document.querySelectorAll(`[data-glass-cover="${fid}"]`).forEach(s => { if (!d.disp || !s.querySelector(`#${id}`)) s.remove(); });
    return true;
  }

  /* 자리 잡기: 창, 몸체, 테두리는 slot 과 같은 자리, 그림자는 그보다 PAD 만큼 넓게. 층은 표지(화면에 붙은 무대)를 덮는다.
     크기가 바뀌면 자리는 그 프레임에 바로 옮긴다(다시 그리기만 기다린다). 기다렸다 옮기면 확대할 때마다 유리가 옛 크기로
     남아 있다가 툭 바뀌어 깜빡이는 것처럼 보인다. 그동안은 옛 그림이 새 크기로 늘어나 선다. */
  let shown = false;
  function position() {
    const r = slot.getBoundingClientRect(), L = layer.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const x = r.left - L.left, y = r.top - L.top;
    win.style.setProperty("--mx", x - win.offsetLeft + "px"); win.style.setProperty("--my", y - win.offsetTop + "px");
    win.style.setProperty("--mw", r.width + "px"); win.style.setProperty("--mh", r.height + "px");
    for (const el of [body, rim, edge]) Object.assign(el.style, { left: x + "px", top: y + "px", width: r.width + "px", height: r.height + "px" });
    Object.assign(drop.style, { left: x - PAD + "px", top: y - PAD + "px", width: r.width + PAD * 2 + "px", height: r.height + PAD * 2 + "px" });
    return r;
  }
  function place() {
    if (!alive) return;
    const r = position();
    if (!r) return;
    const next = [Math.round(r.width), Math.round(r.height), window.devicePixelRatio || 1, document.documentElement.dataset.theme].join("|");
    if (next === key || !mark.complete) return;
    key = next;
    const ready = drawn.get(next);
    (ready ? Promise.resolve(ready) : draw(Math.round(r.width), Math.round(r.height))).then(async d => {
      keep(next, d);
      await decoded(d);
      if (!alive || key !== next || !(await apply(d, next, !shown)) || shown) return;
      shown = true;
      /* 처음 그려지는 순간: 유리 YPL이 흐림을 벗으며 내려앉고 그 안으로 색이 들고, 아래 이름이 따라 서고, 글이 이어서 나온다.
         첫 방문의 차례는 정해진 시각이 아니라 유리가 실제로 준비된 때부터 센다(느린 폰에서도 이름만 먼저 뜨거나 글이 앞서지 않게). */
      const big = enter && !still, wait = enter ? Math.max(0, 500 - (performance.now() - t0)) : 0;
      const kf = big ? [{ opacity: 0, transform: "translateY(-14px) scale(1.04)", filter: "blur(12px)" }, { opacity: 1, transform: "none", filter: "blur(0)" }] : [{ opacity: 0 }, { opacity: 1 }];
      for (const el of [win, body, rim, edge, drop]) { el.style.opacity = ""; el.animate(kf, { duration: big ? 1100 : 420, delay: wait, easing: EASE, fill: "backwards" }); }
      if (follow) { follow.style.opacity = ""; follow.animate(big ? [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }] : [{ opacity: 0 }, { opacity: 1 }], { duration: big ? 700 : 420, delay: wait + (big ? 450 : 0), easing: EASE, fill: "backwards" }); }
      onShown(wait + (big ? 800 : 0));
    }, e => { console.warn("표지 유리를 그리지 못했습니다.", e); if (follow) follow.style.opacity = ""; onShown(0); });
  }
  const later = () => { if (alive) position(); clearTimeout(timer); timer = setTimeout(() => { build(); place(); }, 120); };
  const t0 = performance.now();

  build();
  if (enter && !still) {
    // 첫 등장: 벽은 가운데 줄부터 바깥으로 켜진다
    const rs = [...base.children], mid = (rs.length - 1) / 2;
    rs.forEach((r, i) => r.animate([{ opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0)" }], { duration: 900, delay: 100 + Math.abs(i - mid) * 110, easing: EASE, fill: "backwards" }));
  }
  for (const el of follow ? [win, body, rim, edge, drop, follow] : [win, body, rim, edge, drop]) el.style.opacity = "0";
  mark.decode().catch(() => {}).then(() => requestAnimationFrame(place));
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
      if (follow) follow.style.opacity = "";
      document.querySelectorAll(`[data-glass-cover="${fid}"]`).forEach(s => s.remove());
    },
  };
}

/* 홈 무대: 대진 (DECISIONS 9차, 실험판 lab/home-battle-lab.html의 C안).
   화면 전체에 16강 대진표가 새겨져 있고, 장이 바뀔 때마다 한 라운드가 끝난다. 빛은 이긴 쪽 선만 타고 오르고 진 쪽 선은 꺼진다.
   표지 16강 전, 모든 배틀 16강, 모든 기록 8강, 모든 챔피언 4강과 결승. 결승점이 밝아진 뒤 그 빛이 숫자 뒤에 남는다.
   표지에는 리그의 이름(YONSEI POKEMON LEAGUE, 워드마크의 글자로 그린다: brandTitle.js), 세 장에는 큰 숫자가 대진표 위에 선다. 캔버스는 투명해서 바탕은 사이트의 무대(L0) 빛이 그대로 비친다.
   대진표는 장식이다. 이름이나 결과를 담지 않고, 이기는 쪽은 고정된 씨앗으로 정한다.

   부드러움을 위한 약속(8차에서 이어짐):
   - 스크롤은 장을 고르기만 한다. 글은 화면에 붙어 있어(fixed) 스크롤에 끌려 미끄러지지 않고, 스크롤이 시작되면 사라졌다가
     전환이 끝난 뒤에 나온다. 전환은 스크롤 위치가 아니라 시간으로 돈다. 전환 중에 또 넘기면 끝난 뒤 이어서 돈다.
   - 캔버스는 가장 큰 화면 높이(lvh)로 한 번 잡는다. 폰 주소창이 접히고 펴져도 다시 만들지 않는다.
   캔버스는 페이지 바깥(.ypl)에 둔다. 페이지 전환은 main 에 transform 을 걸어서 그 안의 fixed 는 화면에 붙지 않는다. */
import { titleBlock, SLANT } from "./brandTitle.js";

/* 장마다 끝난 라운드 수(0 16강, 1 8강, 2 4강, 3 결승). 라운드 하나가 RD, 되돌아갈 때는 RDB. */
const RES = [0, 1, 2, 4];
const RD = 660, RDB = 380, FLARE = 620, INTRO = 2200;
/* 상단 바 아래부터 그림이 선다(바 높이 56 + 바깥 여백). 노치가 있는 폰은 안전 영역만큼 더 내려간다(size 의 top). */
const TOP = 84;
const FIG = '"YPL Figures", "SUIT Variable", sans-serif';
/* 글자 크기당 대문자 높이(YPL 숫자체와 SUIT 모두 .722, scripts/build-figures.py), 남는 높이를 나누는 황금비(위 .618 : 아래 .382) */
const CAP = .722, GOLD = 2 / (1 + Math.sqrt(5));
const paths = new Map(), pathOf = d => paths.get(d) || paths.set(d, new Path2D(d)).get(d);

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const eOut = t => 1 - (1 - t) ** 3;
const eInOut = t => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const smooth = (a, b, t) => { t = clamp((t - a) / (b - a)); return t * t * (3 - 2 * t); };
const wa = a => `rgba(255,255,255,${a})`, ka = a => `rgba(0,0,0,${a})`;
function rng(seed) {
  return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

let GLOW = null;
function glowSprite() {
  if (GLOW) return GLOW;
  GLOW = document.createElement("canvas"); GLOW.width = GLOW.height = 128;
  const g = GLOW.getContext("2d"), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, wa(1)); r.addColorStop(.22, wa(.42)); r.addColorStop(.6, wa(.08)); r.addColorStop(1, wa(0));
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return GLOW;
}

/* 대진표 한 벌. 세로 화면은 위아래에서, 가로 화면은 좌우에서 8명씩 모여 F(챔피언 장의 숫자 가운데)에서 결승이 난다.
   선은 대진표의 꺾인 연결선(아이에서 가운데까지, 옆으로, 부모까지). 이긴 쪽은 씨앗으로 고정된다. */
function buildBracket(vw, F, yTop, yBot) {
  const r = rng(11), tall = yBot - yTop > vw * .95;
  const fs = tall ? F.x : F.y, fd = tall ? F.y : F.x;
  const pt = (s, d) => (tall ? { x: s, y: d } : { x: d, y: s });
  const elbow = (c, p) => {
    const dm = (c.d + p.d) / 2, pts = [pt(c.s, c.d), pt(c.s, dm), pt(p.s, dm), pt(p.s, p.d)], lens = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    return { pts, lens, len: lens[lens.length - 1] };
  };
  const edges = [], leaves = [], winSide = r() < .5 ? 0 : 1;
  for (const side of [0, 1]) {
    // 가로 화면은 화면 높이를 다 쓰고, 결승으로 가는 마지막 선이 숫자 높이로 꺾여 들어간다
    const spread = tall ? [vw * .06, vw * .94] : [yTop, yBot];
    const d0 = tall ? (side ? yBot : yTop) : (side ? vw * .97 : vw * .03);
    let lv = Array.from({ length: 8 }, (_, i) => ({ s: spread[0] + (spread[1] - spread[0]) * (i + .5) / 8, d: d0 }));
    leaves.push(...lv);
    for (let L = 0; L < 3; L++) {
      const next = [];
      for (let j = 0; j < lv.length; j += 2) {
        const p = { s: (lv[j].s + lv[j + 1].s) / 2, d: d0 + (fd - d0) * (L + 1) / 4 }, w = r() < .5 ? 0 : 1, stg = r() * 160;
        [lv[j], lv[j + 1]].forEach((c, q) => { const e = { round: L, win: q === w, stg, ph: r(), ...elbow(c, p) }; edges.push(e); if (!L) c.edge = e; });
        next.push(p);
      }
      lv = next;
    }
    edges.push({ round: 3, win: side === winSide, stg: 0, ph: r(), ...elbow(lv[0], { s: fs, d: fd }) });
  }
  const slot = Math.min(30, (tall ? vw * .88 : yBot - yTop) / 16);
  return { edges, leaves: leaves.map(n => ({ ...pt(n.s, n.d), edge: n.edge })), F, slot, tall };
}
/* 연결선의 앞에서부터 f 만큼을 path 에 더하고 그 끝점을 돌려준다. */
function along(e, f, path) {
  const P = e.pts, target = e.len * f;
  path.moveTo(P[0].x, P[0].y);
  for (let i = 1; i < P.length; i++) {
    if (e.lens[i] <= target) { path.lineTo(P[i].x, P[i].y); continue; }
    const k = (target - e.lens[i - 1]) / Math.max(1e-6, e.lens[i] - e.lens[i - 1]);
    const x = P[i - 1].x + (P[i].x - P[i - 1].x) * k, y = P[i - 1].y + (P[i].y - P[i - 1].y) * k;
    path.lineTo(x, y);
    return { x, y };
  }
  return P[P.length - 1];
}

/* 큰 그림의 크기와 자리. 크기는 사이트 제목 크기에서 황금비로 오른 단계(cap: 글자 크기, tokens.css --display-l/xl)이고
   상자가 그보다 작을 때만 상자에 맞춘다. 자리는 상자의 남는 높이를 황금비로 나눈 선이다(위 여백 : 아래 여백 = φ : 1).
   그래서 그림은 제 글과 행동에 가깝다. 숫자는 글꼴의 실제 잉크 경계로, 이름(mark)은 그린 글자의 경계로 잰다. */
function fit(g, f, b, cap) {
  if (!f || !f.lines?.length) return null;
  let w, hu, ink;
  if (f.kind === "mark") {
    ink = titleBlock(f.lines);
    w = (ink.right - ink.left) * CAP / 100; hu = ink.h * CAP / 100;
  } else {
    g.save(); g.font = `800 100px ${FIG}`;
    const ms = f.lines.map(l => g.measureText(l));
    g.restore();
    const left = Math.max(...ms.map(m => m.actualBoundingBoxLeft)), right = Math.max(...ms.map(m => m.actualBoundingBoxRight));
    const asc = ms[0].actualBoundingBoxAscent / 100;
    w = (left + right) / 100; hu = asc + ms[ms.length - 1].actualBoundingBoxDescent / 100 + (f.lines.length - 1);
    ink = { left, right, asc };
  }
  const size = Math.min(b.w / w, b.h * .94 / hu, cap);
  const cx = b.x + b.w / 2, top = b.y + (b.h - hu * size) * GOLD, cy = top + hu * size / 2;
  if (f.kind === "mark") { const k = size * CAP / 100; return { mark: ink, k, x: cx - w * size / 2 - ink.left * k, y: top, cx, cy }; }
  return { lines: f.lines, font: `800 ${size}px ${FIG}`, size, x: cx - (ink.right - ink.left) / 200 * size, y: top + ink.asc * size, cx, cy };
}

/* root 안의 .hx-act(표지와 세 장, 스크롤이 붙는 한 화면짜리 자리)와 그 안의 .hx-pin(화면에 붙은 무대), .hx-txt(글과 카드)를 읽는다.
   figures: 장마다 { kind, lines, step }(kind "mark" 그린 이름, "fig" 숫자. step "l" 이름, 없으면 "xl" 큰 숫자). intro: 첫 방문이면 대진표가 그려지며 표지가 드러난다. 캔버스를 못 쓰면 null(홈은 평면 배치로).
   cover: 표지에 따로 선 무대(유리 YPL과 포켓몬 벽, glassCover.js). 주면 표지에는 대진표가 없고, 첫 장으로 넘어갈 때 표지가 물러나며 대진표가 들어온다.
   hold: 글이 나오기까지 기다릴 시간(표지의 첫 등장이 끝난 뒤에 글이 나오게). */
export function startStage(root, figures, { intro = false, cover = [], hold = 520 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.className = "hx-stage"; canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // 무대(L0)와 같은 층(z-index -1)에서 그 바로 뒤에 두어 무대 위에 그린다
  document.querySelectorAll(".hx-stage").forEach(old => old !== canvas && old.remove());
  const stageEl = document.getElementById("ypl-stage");
  if (stageEl) stageEl.after(canvas); else (document.querySelector(".ypl") || document.body).prepend(canvas);
  // 표지 무대가 따로 있으면 캔버스의 투명도는 표지가 정한다(이 등장이 덮어쓰면 표지 위에 대진표가 비친다)
  if (!cover.length) canvas.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 480, easing: "cubic-bezier(.22,1,.36,1)" });
  else canvas.style.opacity = "0";

  // 주소창과 무관한 높이: 가장 큰 화면(lvh, 캔버스)과 가장 작은 화면(svh, 글의 무대)
  const probe = h => { const d = document.createElement("div"); d.setAttribute("aria-hidden", "true"); d.style.cssText = `position:fixed;left:0;top:0;width:0;height:${h};visibility:hidden;pointer-events:none`; document.body.append(d); return d; };
  const pLvh = probe("100lvh"), pSvh = probe("100svh"), pSafe = probe("env(safe-area-inset-top, 0px)"),
    pL = probe("var(--display-l)"), pXL = probe("var(--display-xl)");

  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const acts = [...root.querySelectorAll(".hx-act")], pins = acts.map(a => a.querySelector(".hx-pin")), txts = acts.map(a => a.querySelector(".hx-txt"));
  const lastAct = acts.length - 1, champ = Math.min(lastAct, RES.length - 1);
  const resOf = k => RES[Math.min(k, RES.length - 1)];
  const shown = new Set(), op = acts.map(() => 0), fits = new Map();
  let wanted = figures, fontsAt = 0, raf = 0, prev = 0, dpr = 1, vw = 0, lvh = 0, svh = 0, top = TOP, steps = { l: 64, xl: 104 }, BR = null, brKey = "";

  function size(force) {
    const w = innerWidth, l = pLvh.offsetHeight || innerHeight, s = pSvh.offsetHeight || innerHeight, t = TOP + pSafe.offsetHeight;
    if (!force && w === vw && l === lvh && s === svh && t === top) return;
    vw = w; lvh = l; svh = s; top = t;
    steps = { l: pL.getBoundingClientRect().height || steps.l, xl: pXL.getBoundingClientRect().height || steps.xl };
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(lvh * dpr);
  }
  const onResize = () => size(false);
  addEventListener("resize", onResize);
  // 한 번 스크롤하면 한 장: 장마다 한 화면이고 문서가 장의 머리에 붙는다(scroll-snap, pages.css)
  document.documentElement.classList.add("hx-snap");
  // 키보드로 다른 장의 버튼에 닿으면 그 장으로 넘어간다(글은 겹쳐 있어 지금 장만 보인다)
  const onFocus = e => { const i = txts.findIndex(t => t?.contains(e.target)); if (i >= 0 && i !== cur) acts[i].scrollIntoView({ block: "start" }); };
  root.addEventListener("focusin", onFocus);

  /* 지금 화면에 가장 가까이 붙은 장과 장마다의 위치. */
  function where() {
    let best = 0, d = Infinity;
    const tops = acts.map(a => a.getBoundingClientRect().top);
    tops.forEach((t, k) => { if (Math.abs(t) < d) { d = Math.abs(t); best = k; } });
    return { target: best, tops };
  }

  /* 전환 하나: 지금 장에서 다음 장 사이의 라운드를 차례로 끝낸다(되돌아가면 거꾸로 빛을 거둔다).
     옛 그림은 바로 물러나고 새 그림은 빛이 도착할 때 선다. 챔피언 장으로 가면 결승점이 밝아진다. */
  let cur = null, tr = null;
  function plan(from, to, now) {
    const fwd = to > from, a = resOf(from), b = resOf(to), rounds = [];
    if (fwd) for (let i = a; i < b; i++) rounds.push(i); else for (let i = a - 1; i >= b; i--) rounds.push(i);
    const span = rounds.length * (fwd ? RD : RDB), final = fwd && b >= 4, flareAt = span - 60;
    return { from, to, t0: now, fwd, rounds, flareAt, final, figAt: fwd ? (final ? flareAt : span - 200) : span * .5,
      total: span + (final ? FLARE : 0) + 180 };
  }
  function step(now, target) {
    if (cur === null) cur = target;
    if (tr && now - tr.t0 >= tr.total) { cur = tr.to; tr = null; }
    if (!tr && target !== cur) { if (still.matches) cur = target; else tr = plan(cur, target, now); }
  }
  function roundU(e, now) {
    const base = resOf(cur) > e.round ? 1 : 0;
    const k = tr ? tr.rounds.indexOf(e.round) : -1;
    if (k < 0) return base;
    const rd = tr.fwd ? RD : RDB, st = tr.fwd ? 1 : .4;
    const u = clamp((now - tr.t0 - k * rd - e.stg * st) / (rd - 160 * st));
    return tr.fwd ? eInOut(u) : 1 - eInOut(u);
  }
  function flareOf(now) {
    if (!tr) return resOf(cur) >= 4 ? 1 : 0;
    if (tr.final) return clamp((now - tr.t0 - tr.flareAt) / FLARE);
    if (resOf(tr.from) >= 4) return 1 - clamp((now - tr.t0) / 320);
    return resOf(cur) >= 4 ? 1 : 0;
  }

  /* 장 k 의 그림이 설 자리: 상단 바 아래부터 이 장의 글 위까지(글의 무대는 svh 높이로 화면 위에 붙어 있다). */
  const padOf = k => parseFloat(getComputedStyle(pins[k]).paddingBottom) || 0;
  function boxOf(k) {
    const el = txts[k], bottom = el ? svh - padOf(k) - el.offsetHeight : svh;
    const w = Math.min(vw - 32, vw * .92, 1200);
    return { x: (vw - w) / 2, y: top, w, h: Math.max(40, bottom - 16 - top) };
  }
  function figOf(k) {
    const f = wanted[k];
    if (!f) return null;
    const b = boxOf(k), key = [k, vw, Math.round(b.h), f.kind, f.lines.join("\n"), fontsAt].join("|");
    if (!fits.has(key)) { if (fits.size > 24) fits.clear(); fits.set(key, fit(ctx, f, b, steps[f.step || "xl"])); }
    return fits.get(key);
  }
  function drawFig(f, ink, a = 1, s = 1) {
    if (!f || a <= .002) return;
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = ink;
    if (s !== 1) { ctx.translate(f.cx, f.cy); ctx.scale(s, s); ctx.translate(-f.cx, -f.cy); }
    if (f.mark) {   // 그린 이름: 위로 선 글자들에 12도 기울기 하나
      ctx.translate(f.x, f.y); ctx.scale(f.k, f.k); ctx.transform(1, 0, -SLANT, 1, 0, 0);
      for (const gl of f.mark.glyphs) { ctx.save(); ctx.translate(gl.x, gl.y); ctx.fill(pathOf(gl.d), "evenodd"); ctx.restore(); }
    } else {
      ctx.font = f.font; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
      f.lines.forEach((l, i) => ctx.fillText(l, f.x, f.y + i * f.size));
    }
    ctx.restore();
  }
  function glow(x, y, r, a, light) {
    if (a <= .003 || r <= 0) return;
    ctx.save(); ctx.globalAlpha = Math.min(1, a); if (!light) ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(glowSprite(), x - r, y - r, r * 2, r * 2); ctx.restore();
  }

  function bracket(now, time, light, ink, drawn) {
    const g = ctx, base = new Path2D(), lit = new Path2D(), heads = [], losers = [], nodes = [], full = [], tips = [];
    for (const e of BR.edges) {
      const d = drawn < 1 ? clamp(drawn * 5 - e.round - e.stg / 500) : 1;   // 첫 등장: 바깥 라운드부터 그려진다
      if (d <= 0) continue;
      if (d < 1) { tips.push([along(e, eOut(d), base), d]); continue; }
      const u = roundU(e, now);
      if (!e.win && u > 0) { losers.push([e, u]); continue; }
      along(e, 1, base);
      if (e.win && u > 0) { const h = along(e, u, lit); if (u < 1) heads.push([h, u]); else { nodes.push(e.pts[e.pts.length - 1]); full.push(e); } }
    }
    g.save(); g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = 1.2;
    g.strokeStyle = light ? ka(.18) : wa(.15); g.stroke(base);
    // 첫 등장: 그려지는 선 끝마다 작은 빛이 앞장선다(결승으로 오르는 빛과 같은 빛)
    for (const [h, d] of tips) glow(h.x, h.y, 14, (light ? .6 : .4) * (1 - d), light);
    for (const [e, u] of losers) { const p = new Path2D(); along(e, 1, p); g.strokeStyle = light ? ka(.18 - .12 * u) : wa(.15 - .1 * u); g.stroke(p); }
    g.save(); if (!light) g.globalCompositeOperation = "lighter";
    g.strokeStyle = wa(light ? .5 : .045); g.lineWidth = 18; g.stroke(lit);
    g.strokeStyle = wa(light ? .8 : .11); g.lineWidth = 6; g.stroke(lit);
    g.restore();
    g.strokeStyle = ink; g.lineWidth = 1.6; g.stroke(lit);
    for (const [h, u] of heads) { glow(h.x, h.y, 34 + 46 * smooth(.8, 1, u), light ? 1 : .95, light); g.fillStyle = ink; g.beginPath(); g.arc(h.x, h.y, 2.6, 0, 6.283); g.fill(); }
    g.fillStyle = ink; for (const n of nodes) { g.beginPath(); g.arc(n.x, n.y, 2.8, 0, 6.283); g.fill(); }
    // 쉬는 동안 이긴 길 위로 작은 빛이 천천히 흐른다
    if (!tr) for (const e of full) { const h = along(e, (time / 2.6 + e.ph) % 1, new Path2D()); glow(h.x, h.y, 16, light ? .7 : .35, light); }
    // 참가자 자리(16). 진 자리는 흐려진다.
    const s = BR.slot, w = BR.tall ? s : 4, h = BR.tall ? 4 : s;
    g.globalAlpha = drawn < 1 ? smooth(0, .2, drawn) : 1;
    for (const n of BR.leaves) {
      const out = n.edge && !n.edge.win ? roundU(n.edge, now) : 0;
      g.fillStyle = light ? ka(.5 - .36 * out) : wa(.55 - .42 * out);
      g.beginPath(); g.roundRect ? g.roundRect(n.x - w / 2, n.y - h / 2, w, h, 2) : g.rect(n.x - w / 2, n.y - h / 2, w, h); g.fill();
    }
    g.restore();
  }

  /* 한 장면. lean 은 손가락이 지금 장을 끌고 간 정도: 그림이 조금 물러나고 흐려져 손에 반응한다(전환은 아니다). */
  function draw(now, light, lift, lean) {
    const time = still.matches ? 0 : (now - t0) / 1000, ink = getComputedStyle(document.documentElement).getPropertyValue("--fg").trim();
    // 위아래 참가자 자리는 바에서 20px: 위는 상단 바 아래, 아래는 탭 바 위(글의 무대 아래 여백, pages.css .hx-pin)
    // 결승점은 챔피언 장의 숫자 가운데(숫자가 없으면 그 자리의 가운데)
    const fc = figOf(champ), b = boxOf(champ), Fp = fc ? { x: fc.cx, y: fc.cy } : { x: b.x + b.w / 2, y: b.y + b.h / 2 }, yTop = top + 4, yBot = svh - padOf(0) + 24;
    const key = [vw, Math.round(Fp.x), Math.round(Fp.y), yTop, yBot].join("|");
    if (key !== brKey) { brKey = key; BR = buildBracket(vw, Fp, yTop, yBot); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, vw, lvh);
    ctx.translate(0, lift);
    const fl = flareOf(now), drawn = intro && !still.matches ? clamp((now - t0) / (INTRO - 300)) : 1;
    if (fl > 0) glow(Fp.x, Fp.y, Math.min(vw, svh) * (.32 + .26 * eOut(fl)) * (1 + .04 * Math.sin(time / 1.7)), (light ? .95 : .3) * eOut(fl), light);
    bracket(now, time, light, ink, drawn);
    if (tr?.final) {   // 결승이 끝나는 순간의 빛
      const u = (now - tr.t0 - tr.flareAt) / 760;
      if (u > 0 && u < 1) {
        glow(Fp.x, Fp.y, 30 + 220 * eOut(u), (1 - u) ** 2, light);
        ctx.beginPath(); ctx.arc(Fp.x, Fp.y, eOut(u) * Math.hypot(vw, svh) * .6, 0, 6.283);
        ctx.strokeStyle = light ? ka(.3 * (1 - u)) : wa(.45 * (1 - u)); ctx.lineWidth = .8 + 2.5 * (1 - u); ctx.stroke();
      }
    }
    const ls = 1 - .05 * lean, la = 1 - .3 * lean;
    if (tr) {
      const e = now - tr.t0, out = clamp(e / 220), inU = eOut(clamp((e - tr.figAt) / 440));
      drawFig(figOf(tr.from), ink, 1 - out, 1 - .03 * out);
      drawFig(figOf(tr.to), ink, inU, 1 + .05 * (1 - inU));
    } else {
      const a = intro && !still.matches ? smooth(.5, 1, (now - t0) / INTRO) : 1;
      drawFig(figOf(cur), ink, a * la, (1 + .04 * (1 - a)) * ls);
    }
  }

  let lift = 0, lastY = scrollY, movedAt = 0;
  const t0 = performance.now(), readyAt = t0 + (intro && !still.matches ? INTRO - 260 : hold); // 페이지 전환(480ms)이 끝난 뒤 글이 나온다
  /* 표지 무대가 따로 있으면: 표지에서는 그것만, 장으로 넘어가면 그것이 먼저 물러나고(260ms) 대진표가 라운드와 함께 들어온다.
     표지로 돌아올 때는 대진표의 빛이 거둬지는 동안 표지가 다시 선다. */
  function coverShown(now) {
    if (!tr) return cur === 0 ? 1 : 0;
    const e = now - tr.t0;
    if (tr.from === 0) return 1 - clamp(e / 260);
    if (tr.to === 0) return eOut(clamp((e - tr.total * .35) / 420));
    return 0;
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = prev ? clamp(now - prev, 0, 50) : 16; prev = now;
    const { target, tops } = where();
    step(now, target);
    const k = cur, drift = Math.abs(tops[k]) / (svh || 1);
    // 바닥글로 내려가면 마지막 장은 글과 그림이 함께 올라간다. 스크롤을 한 프레임씩 쫓으면 늦게 따라와 덜컹이므로
    // 다른 장처럼 시간으로 돈다: 글은 움직이는 동안 사라지고, 무대는 멈출 자리로 미끄러진 뒤 글이 다시 나온다.
    const leavingNow = k === lastAct && tops[k] < 0;
    if (scrollY !== lastY) { lastY = scrollY; movedAt = now; }
    lift = still.matches ? (leavingNow ? tops[k] : 0) : lift + ((leavingNow ? tops[k] : 0) - lift) * (1 - Math.exp(-dt / 140));
    if (Math.abs(lift) < .05) lift = 0;
    // 글: 전환이 끝난 뒤 이 장의 글만 나오고, 손가락이 끌기 시작하면 바로 사라진다(나올 때 120ms, 사라질 때 50ms 상수)
    const settled = !tr && now > readyAt, hold = 1 - smooth(.015, .09, drift), quiet = now - movedAt > 160;
    txts.forEach((t, i) => {
      if (!t) return;
      const leaving = i === lastAct && i === k && tops[i] < 0;
      const want = i === k && settled ? (leaving && quiet ? 1 : hold) : 0;
      op[i] = still.matches ? want : op[i] + (want - op[i]) * (1 - Math.exp(-dt / (want > op[i] ? 120 : 50)));
      const v = op[i] < .002 ? 0 : op[i];
      t.style.opacity = v.toFixed(3);
      const y = (1 - v) * 12 + (i === lastAct ? lift : 0);
      t.style.transform = Math.abs(y) < .05 ? "" : `translateY(${y.toFixed(1)}px)`;
      t.style.pointerEvents = v < .05 ? "none" : "";
      if (v > .6 && !shown.has(i)) { shown.add(i); t.classList.add("shown"); }
    });
    const light = document.documentElement.dataset.theme === "light", lean = leavingNow ? 0 : smooth(0, .5, drift);
    if (cover.length) {
      const c = still.matches ? (cur === 0 ? 1 : 0) : coverShown(now), v = c < .002 ? "0" : c > .998 ? "" : c.toFixed(3);
      for (const el of cover) { el.style.opacity = v; el.style.visibility = c < .002 ? "hidden" : ""; }
      canvas.style.opacity = (1 - c).toFixed(3);
    }
    draw(now, light, lift, lean);
  }

  size(true);
  // 글꼴이 늦게 오면 대체 글꼴로 먼저 그리고, 오면 다시 맞춘다.
  Promise.resolve(document.fonts?.load('800 100px "YPL Figures"', "0123456789D-"))
    .then(() => { fontsAt = performance.now(); }, () => {});
  raf = requestAnimationFrame(frame);

  return {
    setFigures(list) { wanted = list; },
    stop() {
      cancelAnimationFrame(raf); raf = 0;
      document.documentElement.classList.remove("hx-snap");
      removeEventListener("resize", onResize);
      root.removeEventListener("focusin", onFocus);
      [pLvh, pSvh, pSafe, pL, pXL].forEach(d => d.remove());
      txts.forEach(t => { if (t) { t.style.opacity = ""; t.style.transform = ""; t.style.pointerEvents = ""; } });
      cover.forEach(el => { el.style.opacity = ""; el.style.visibility = ""; });
      let done = false;
      const gone = () => { if (done) return; done = true; canvas.remove(); };
      setTimeout(gone, 320); // 탭이 숨어 애니메이션이 멈춰 있어도 치운다
      const a = canvas.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" });
      if (a) a.finished.then(gone, gone); else gone();
    },
  };
}

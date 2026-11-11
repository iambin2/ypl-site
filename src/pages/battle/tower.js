/* 도전의 탑's tower (DESIGN.md "Battle", 도전의 탑, The tower). Redrawn 2026-11-11 (the user: "지금 너무 단순한 네모의 연속이라 하나도
   안 예뻐. 일반 배틀 초기화면처럼 네모를 고집하지 않아도 홈페이지 컬러 톤 앤 매너만 맞추면 돼. 틀에 박히지 말고 자유롭게 상상해.
   진입 애니메이션도 새로 짜고"; before it the tower was rows of flat cells, one floor a step smaller than the one under it).

   The picture is a round tower at night seen from its foot, drawn in SVG from the board's tones (redrawn three more times the same
   day as the owner judged it: "너무 닌텐도 64 탑 모델 같아. 진짜 탑처럼, 동시에 엄청나게 아름다워 보이도록", "탑의 나선과 창문이 안
   맞는 부분이 많아", "문에 불이 켜지는 게 너무 어색해 ... 계단? 발판도 너무 어색하고. 수문장의 문도 너무 어색하고 특별해 보이지
   않아"):
   - the tower is a tapering drum of floors, each floor the one under it a step smaller about the point it would close on (R), lit
     across by one light with a rim of moonlight on its lit edge and a cornice with its shade on each floor's foot;
   - a stair winds up it, standing out of the wall: on each floor it crosses the front from the left edge to the right in flights of
     steps between landings and goes on behind; the five games are doors cut in the wall's own curve, each on its landing: a stone
     arch round a deep doorway whose jamb shows on the side toward the tower's middle, the room behind dark, or lit from within
     (warm for a game won, amber for the game gone into), brightest at the floor, throwing its light on the landing. The gatekeeper's
     is a great double door turned toward us: columns, two arches, the keystone, and the gate's own lamp over it;
   - the stair's nosing is lit as far as the run has come;
   - behind it a sky deepening up from the horizon, a crescent moon and a few stars, nothing else; in front the plaza (above the first
     floor the floor's wide terrace), the tower's shade at its foot, and on the tab the run's own party standing on it, each on its
     feet with its shadow, while the month's other climbers hang their names at their floors.
   Going into a game is a scene on this picture, never a cut:
     1. between games the tower switches on over the stage, foot first;
     2. the game just won lights and a spark of the lamp runs along the path to the next lamp, which turns amber; after a gatekeeper
        the gate lights, the spark goes on round behind the tower, the tower comes down a floor (one similarity about the point it
        closes on: the lift's rise) and the spark comes round onto the new floor's first lamp;
     3. when the game is made and read, the view goes in through the amber lamp until it fills the stage: two doors shut on a seam;
     4. the shut doors outlive the screen, carry themselves to the next screen's stage, a chime, and they part on the team preview.
   Until the doors stand shut the scene is inside the stage it was called on, so it scrolls with its page. Only light moves on the
   picture; the camera's moves are transforms of a picture already drawn. Reduced motion: the tower stands, then a cut. */
import { DUR, EASE_IN, EASE_OUT, STAGGER, reduced } from "../../components/common/motion.js";
import { spriteUrl } from "../../services/teamBuilderCore.js";
import { standInk } from "../../components/common/inkCentre.js";
import { floorType } from "../../services/streak.js";
import { sfx } from "./sfx.js";

const R = 0.854;            // a floor to the one under it: three floors are one phi step
const E = 0.2;              // how round a ring is seen from the foot: its depth to its width
const SHUT = 560, MOVE = 420, BEAT = 260, READ = 420, RISE = 680, DIVE = 620, RUN = 520;
const INOUT = "cubic-bezier(.65,0,.35,1)";
const pause = n => new Promise(resolve => setTimeout(resolve, n));
const settled = anim => anim.finished.catch(() => {});
let scene = null;           // the tower called on a stage: { el, own, master } (own: made for the call, not the tab's hall)
let car = null;             // the shut doors, fixed over the window: { el }
let left = [];              // the going out of the screen the doors shut on, let go when the next one stands
const letGo = () => { left.forEach(a => a.cancel()); left = []; };
const f1 = n => n.toFixed(1);

/* ---------- the picture ---------- */
let uid = 0;
/* the tower in a box: the floor stood on has its foot ring at base, radius r0 and height h0; floor k is that floor scaled R^k about the
   apex. With the party in front (the tab) the tower stands higher, so they stand on the ground before it, under its doors. The tower
   stands a little left of the middle, the moon balancing it at the right (2026-11-11, the sixth pass: dead centre it read as a
   specimen, not a scene) */
function measure(W, H, hall, party = false) {
  const phone = W < 520;
  const r0 = Math.min(W * (phone ? .3 : .21), H * .29);
  const h0 = r0 * (phone ? .84 : .8);
  const base = H * (hall && party ? .58 : .74);
  return { W, H, r0, h0, base, ax: W * (phone ? .47 : .45), ay: base - h0 / (1 - R), hall, phone, horizon: base - r0 * E * 1.4, id: ++uid };
}
const sc = k => R ** k;
const footY = (m, k) => m.ay + (m.base - m.ay) * sc(k);
const radius = (m, k) => m.r0 * sc(k);
const RAD = Math.PI / 180;
/* a point on floor k's surface at angle th (degrees, 0 the front) and height f of the floor (0 its foot ring, 1 the next floor's); out:
   how far it stands out of the wall (a ledge's edge), as a share of the radius */
function at(m, k, th, f = 0, out = 1) {
  const r = radius(m, k) * (1 - f * (1 - R)) * out;
  return [m.ax + r * Math.sin(th * RAD), footY(m, k) - m.h0 * sc(k) * f + r * E * Math.cos(th * RAD)];
}
const arc = (m, k, f, a, b, n = 18, out = 1) => Array.from({ length: n + 1 }, (_, i) => at(m, k, a + (b - a) * i / n, f, out));
const pts = list => list.map(([x, y]) => `${f1(x)},${f1(y)}`).join(" ");

/* The floor's plan (2026-11-11, fifth pass, the user: "현재 탑 디자인을 처음 보는 디자인 전문가라고 가정하고 처음부터 끝까지 완벽하게
   아름답고 결점 없도록 ... 지금 뒤틀린 부분이 너무 많아"). A floor is a level gallery round its foot, standing out of the wall on its
   corbels with its rail, and its five doors on it; the tower is climbed inside, through the gatekeeper's gate (a stair on the
   outside, seen at the drum's edge where everything turns away, could only read as a ladder). The doors stand within the front's
   middle (no door past 55 degrees), so none is squeezed to a sliver at the drum's edge; the gatekeeper's gate, wider and taller,
   stands last, turned toward us */
/* the gatekeeper's gate is the floor's middle, and the four games' doors stand two on each side of it, in the order they are played
   (2026-11-11 seventh pass: last at the right it was narrow and pressed against the fourth door) */
const DOORS = [-55, -32, 32, 55, 0];             // the games' angles across the front; the fifth is the gatekeeper's gate
const HALF = [7.5, 7.5, 7.5, 7.5, 15];           // each door's half width, in degrees of the drum
const TALL = [.34, .34, .34, .34, .36];           // its height to the spring of its arch, as a share of the floor
const GF = .06;                                  // the gallery's floor, over the floor's foot (share of the floor's height)
const GAL = 1.13, SLAB = .055;                   // how far the gallery stands out, and its face
const NODE_U = DOORS.map(th => (th + 90) / 180);
// the run's path on floor k at u (0 the left edge, 1 the right edge): along the gallery, half out from the wall
const pathAt = (m, k, u) => at(m, k, -90 + 180 * u, GF, (1 + GAL) / 2);
// a floor's light by its place: the one stood on and under it whole, each floor over it dimmer into the night
const lightOf = k => (k <= 0 ? 1 : Math.max(.16, R ** (k * 1.7)));
/* an arched opening cut in the drum of floor k round angle th: its sides the surface at th ± hw, its foot at fb, its arch springing at ft
   and rising as a round arch as wide as it is, all following the drum's curve */
function archAt(m, k, th, hw, fb, ft, n = 16) {
  const ah = (radius(m, k) * Math.sin(hw * RAD)) / (m.h0 * sc(k));
  const top = Array.from({ length: n + 1 }, (_, i) => { const t = -1 + 2 * i / n; return at(m, k, th + hw * t, ft + ah * Math.sqrt(Math.max(0, 1 - t * t))); });
  return { points: [at(m, k, th - hw, fb), ...top, at(m, k, th + hw, fb), ...arc(m, k, fb, th + hw, th - hw, 6)], crown: ft + ah };
}
// a door's box (foot centre, width, height) for the scene's moves
function doorShape(m, k, game) {
  const th = DOORS[game - 1], hw = HALF[game - 1], fb = GF, { crown } = archAt(m, k, th, hw, fb, fb + TALL[game - 1]);
  const [x, y] = at(m, k, th, fb), [x1] = at(m, k, th - hw, fb), [x2] = at(m, k, th + hw, fb);
  return { x, y, w: x2 - x1, h: (crown - fb) * m.h0 * sc(k) };
}
const windowOf = doorShape;
// where a game's light stands (the spark runs between them, the dive goes in through it): the middle of its door
const lampAt = (m, k, game) => { const d = doorShape(m, k, game); return [d.x, d.y - d.h * .45]; };
// the floor's type as the class that gives its colour (team-builder.css .type-*)
const typeClass = f => `type-${String(floorType(f)).toLowerCase()}`;

/* a game's door (2026-11-11, seventh pass, the user: "일반 배틀 경기장은 아주 깔끔하고 좋은데 탑이 유독 조잡하네. 특히 문 부분이.
   수문장의 문이 너무 좁고 바로 옆 문에 낑겨 보여서 더 그래. 네가 말한 타입과 수문장 문양도 잘 안 보이고"): as the arena is, few
   shapes and each a clear one. A door is one stone frame of even width round a deep doorway; inside, the jamb on the side toward the
   tower's middle, and the room behind: dark, or lit from within, brightest at the floor (warm for a game won, amber for the game gone
   into), throwing its light on the gallery.
   The gatekeeper's gate is the floor's middle, wide and tall, the four doors two on each side of it. Its two leaves are painted in the
   floor's type colour, so the floor is known from across the room; over it hangs the floor's medallion, a disc in that colour in a
   stone ring with the gate's lamp at its heart (amber while its game is played, lit once beaten). Beaten, the gate stands open on its
   lit hall. */
function doorSVG(m, k, g, state, s, type) {
  const th = DOORS[g - 1], hw = HALF[g - 1], fb = GF, ft = fb + TALL[g - 1], gate = g === 5;
  const out = [];
  out.push(`<polygon class="stone" points="${pts(archAt(m, k, th, hw * (gate ? 1.16 : 1.26), fb, ft + (gate ? .035 : .028)).points)}"/>`);
  const hole = archAt(m, k, th, hw, fb, ft);
  out.push(`<polygon class="jamb${th > 0 ? " l" : ""}" points="${pts(hole.points)}"/>`);
  // the room seen through the opening: the opening less its jamb, the jamb's width as the wall turns from us
  const jw = hw * .4 * Math.abs(Math.sin(th * RAD)), lo = th < 0 ? th - hw : th - hw + jw, hi = th < 0 ? th + hw - jw : th + hw;
  const mid = (lo + hi) / 2, room = archAt(m, k, mid, (hi - lo) / 2, fb, ft);
  const fill = (cls, ref, p = room.points) => `<polygon class="${cls}" fill="url(#${ref}-${m.id})" points="${pts(p)}"/>`;
  out.push(fill("room", "tw-in"), fill("glow warm", "tw-warm"), fill("glow amber", "tw-amber"));
  if (gate) {
    /* the two leaves stand to the arch's spring, in the floor's colour with a seam of shade between them; over them the lunette, the
       arch's own half-round, holds the floor's medallion: a disc in that colour in its stone ring, the gate's lamp at its heart (over
       the arch it was cut by the gallery above, 2026-11-11). Beaten, leaves and lunette open on the lit hall */
    const spring = at(m, k, mid, ft)[1], top = room.points.slice(1, 18);
    const leafL = [at(m, k, lo, fb), at(m, k, lo, ft), ...arc(m, k, ft, lo, mid, 6).slice(1), at(m, k, mid, fb)];
    const leafR = [at(m, k, mid, fb), ...arc(m, k, ft, mid, hi, 6), at(m, k, hi, fb)];
    const lunette = [...top, ...arc(m, k, ft, hi, lo, 8)];
    const archH = spring - at(m, k, mid, room.crown)[1], half = (at(m, k, hi, ft)[0] - at(m, k, lo, ft)[0]) / 2;
    const rr = Math.min(archH * .36, half * .42), [cx] = at(m, k, mid, ft), cy = spring - archH * .44, z = Math.max(3, rr * .5);
    out.push(`<g class="leaves ${type}"><polygon points="${pts(leafL)}"/><polygon points="${pts(leafR)}"/>`
      + `<polyline class="seam" points="${pts([at(m, k, mid, fb), at(m, k, mid, ft)])}" stroke-width="${f1(Math.max(1, 2 * s))}"/>`
      + `<polygon class="lunette" points="${pts(lunette)}"/>`
      + `<polyline class="transom" points="${pts(arc(m, k, ft, lo, hi, 8))}" stroke-width="${f1(Math.max(1, 2.2 * s))}"/></g>`);
    out.push(`<g class="medallion ${type}"><circle class="ring" cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(rr * 1.24)}"/>`
      + `<circle class="disc" cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(rr)}"/>`
      + `<rect class="gate-lamp" x="${f1(cx - z / 2)}" y="${f1(cy - z / 2)}" width="${f1(z)}" height="${f1(z)}"/></g>`);
  }
  // the threshold, and the light a lit door throws out on the gallery
  out.push(`<polyline class="sill" points="${pts(arc(m, k, fb, th - hw, th + hw, 6))}" stroke-width="${f1(Math.max(.6, 1.2 * s))}"/>`);
  out.push(`<polygon class="spill" points="${pts([at(m, k, th - hw, fb), at(m, k, th + hw, fb), at(m, k, th + hw * 1.5, fb, GAL - .02), at(m, k, th - hw * 1.5, fb, GAL - .02)])}"/>`);
  return `<g class="tw-win${gate ? " gate" : ""}${state ? ` ${state}` : ""}" data-g="${k === 0 ? g : ""}">${out.join("")}</g>`;
}

/* the night behind the tower: the sky deepening up from the horizon (and deeper the higher the run has climbed), the crescent moon at the
   right (the scene's light: the tower is lit from its side), stars (more the higher), and the horizon: on the first floor low hills
   and the plaza the tower stands on, higher up a sea of cloud far below that rises with every floor */
// the crescent moon at the right (the scene's light) or, in the day, the sun: drawn over the night laid on the tower's top
function moonSVG(m) {
  const mx = m.W * (m.phone ? .84 : .86), my = m.H * .12, mr = Math.max(8, m.W * (m.phone ? .034 : .02));
  return `<mask id="tw-moon-${m.id}"><circle cx="${f1(mx)}" cy="${f1(my)}" r="${f1(mr)}" fill="white"/><circle cx="${f1(mx + mr * .42)}" cy="${f1(my - mr * .3)}" r="${f1(mr * .86)}" fill="black"/></mask>`
    + `<circle class="tw-moon" cx="${f1(mx)}" cy="${f1(my)}" r="${f1(mr)}" mask="url(#tw-moon-${m.id})"/><circle class="tw-sun" cx="${f1(mx)}" cy="${f1(my)}" r="${f1(mr * 1.1)}"/>`;
}
function night(m, floor) {
  let a = 7;
  const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  const sky = `tw-sky-${m.id}`, ground = `tw-ground-${m.id}`;
  const many = Math.min(2, 1 + (floor - 1) * .1);
  const stars = Array.from({ length: Math.round(m.W * m.H / 9000 * many) }, () => {
    const s = rnd() < .12 ? 2 : 1;
    return `<rect class="tw-star" x="${f1(rnd() * m.W)}" y="${f1(rnd() * m.horizon * .8)}" width="${s}" height="${s}" opacity="${(.12 + rnd() * .4).toFixed(2)}"/>`;
  }).join("");
  const out = [`<defs><linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="s0"/><stop offset="1" class="s1"/></linearGradient>`
    + `<linearGradient id="${ground}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="g0"/><stop offset="1" class="g1"/></linearGradient></defs>`,
    `<rect width="${m.W}" height="${f1(m.horizon + 1)}" fill="url(#${sky})"/>`,
    `<rect class="tw-alt" width="${m.W}" height="${f1(m.horizon + 1)}" opacity="${Math.min(.42, (floor - 1) * .05).toFixed(3)}"/>`,
    `<g class="tw-stars">${stars}</g>`];
  const wave = (amp, base, f1a, f2a, ph) => Array.from({ length: 41 }, (_, i) => {
    const x = m.W * i / 40;
    return [x, base - amp * (.55 + .3 * Math.sin(x / m.W * f1a + ph) + .15 * Math.sin(x / m.W * f2a + ph * 2))];
  });
  if (floor === 1) {
    out.push(`<polygon class="tw-hills" points="${pts([[0, m.horizon + 1], ...wave(m.H * .05, m.horizon + 1, 5.5, 17, 1.3), [m.W, m.horizon + 1]])}"/>`);
    out.push(`<rect fill="url(#${ground})" y="${f1(m.horizon)}" width="${m.W}" height="${f1(m.H - m.horizon)}"/>`);
  } else {
    // the sea of cloud far under the terrace: higher with every floor climbed
    const amp = Math.min(m.H * .075, m.H * .014 * floor);
    out.push(`<polygon class="tw-sea" points="${pts([[0, m.horizon + 1], ...wave(amp, m.horizon + 1, 9, 23, .4), [m.W, m.horizon + 1]])}"/>`);
  }
  return out.join("");
}

/* where the tower goes: its upper floors dissolve into the night, the sky's own colour laid over them and deepening up, so it has no
   top in sight and the climb has somewhere to go; the moon over it. (Banks and streaks of cloud were tried the same day: as puffs they
   read as dark slabs, as streaks as flying discs.) */
function cloudsHTML(m) {
  const fade = `tw-fade-${m.id}`;
  const body = `<defs><linearGradient id="${fade}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="f0"/><stop offset=".5" class="f1"/><stop offset="1" class="f2"/></linearGradient></defs>`
    + `<rect width="${m.W}" height="${f1(m.H * .32)}" fill="url(#${fade})"/>` + moonSVG(m);
  return `<div class="tw-clouds"><svg width="${m.W}" height="${m.H}" viewBox="0 0 ${m.W} ${m.H}" aria-hidden="true">${body}</svg></div>`;
}
// a few stars that twinkle (spans, so their light is the compositor's), placed by the same fixed draw each time
function twinkleHTML(m) {
  let a = 29;
  const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  return `<div class="tw-twinkle" aria-hidden="true">${Array.from({ length: 7 }, (_, i) => `<i style="left:${f1(rnd() * m.W)}px;top:${f1(rnd() * m.horizon * .7)}px;animation-delay:${(i * 1.3).toFixed(1)}s"></i>`).join("")}</div>`;
}

/* the gallery round a floor's foot: its shade on the wall under it, its floor (the lightest stone, between the wall and its edge), and
   its face; then, after the doors, its parapet: a low solid wall along its edge with its coping lit and a band of the floor's type
   colour along it, one clear shape where a rail of balusters and corbels under it read as clutter (2026-11-11 seventh pass) */
function gallerySVG(m, k) {
  return `<polygon class="tw-ramp-shade" points="${pts([...arc(m, k, GF - SLAB * .4, -90, 90, 36), ...arc(m, k, GF - SLAB * 2.6, 90, -90, 36)])}"/>`
    + `<polygon class="tread" points="${pts([...arc(m, k, GF, -90, 90, 36), ...arc(m, k, GF, 90, -90, 36, GAL)])}"/>`
    + `<polygon fill="url(#tw-ramp-${m.id})" points="${pts([...arc(m, k, GF, -90, 90, 36, GAL), ...arc(m, k, GF - SLAB, 90, -90, 36, GAL)])}"/>`;
}
function parapetSVG(m, k, s, type) {
  const h = .075, o = GAL - .006;
  return `<polygon fill="url(#tw-ramp-${m.id})" points="${pts([...arc(m, k, GF, -90, 90, 36, o), ...arc(m, k, GF + h, 90, -90, 36, o)])}"/>`
    + `<polyline class="band ${type}" points="${pts(arc(m, k, GF + h * .42, -89, 89, 36, o))}" stroke-width="${f1(Math.max(1.2, 2.6 * s))}"/>`
    + `<polyline class="tw-rail" points="${pts(arc(m, k, GF + h, -89.5, 89.5, 36, o))}" stroke-width="${f1(Math.max(1, 2 * s))}"/>`;
}
/* the first floor stands on a stepped base, three rings of stone, each wider and lower, their treads lit as the gallery's floor and
   their faces as its face: where the tower begins */
function plinthSVG(m, k) {
  const out = [];
  for (let j = 2; j >= 0; j--) {
    const top = -j * .036, bot = top - .036, w = 1.18 + .065 * j;
    out.push(`<polygon class="tread" points="${pts([...arc(m, k, top, -90, 90, 36, w - .065), ...arc(m, k, top, 90, -90, 36, w)])}"/>`);
    out.push(`<polygon fill="url(#tw-ramp-${m.id})" points="${pts([...arc(m, k, top, -90, 90, 36, w), ...arc(m, k, bot, 90, -90, 36, w)])}"/>`);
  }
  return `<g class="plinth">${out.join("")}</g>`;
}
// the shading of the drum, the gallery's face, and the rooms behind the doors (dark, lit warm, lit amber: brightest at the floor). Lit
// from the right, where the moon is
const shadeDefs = m => `<defs><linearGradient id="tw-shade-${m.id}" x1="1" y1="0" x2="0" y2="0">${["a", "b", "c", "d", "e"].map((t, i) => `<stop offset="${[0, .22, .46, .74, 1][i]}" class="${t}"/>`).join("")}</linearGradient>`
  + `<linearGradient id="tw-ramp-${m.id}" x1="1" y1="0" x2="0" y2="0"><stop offset="0" class="ra"/><stop offset=".3" class="rb"/><stop offset="1" class="rc"/></linearGradient>`
  + ["in", "warm", "amber"].map(t => `<linearGradient id="tw-${t}-${m.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="${t}0"/><stop offset=".62" class="${t}1"/><stop offset="1" class="${t}2"/></linearGradient>`).join("")
  + `</defs>`;
function floorSVG(m, k, st) {
  const f = st.floor + k, s = sc(k);
  if (f < 1) return "";
  const out = [], type = typeClass(f);
  if (f === 1) out.push(plinthSVG(m, k));
  // the drum between the floor's foot ring and the next floor's, lit across from the moon's side, its rim of moonlight on that edge
  out.push(`<polygon fill="url(#tw-shade-${m.id})" points="${pts([...arc(m, k, 0, -90, 90, 36), ...arc(m, k, 1, 90, -90, 36)])}"/>`);
  out.push(`<polyline class="tw-rim" points="${pts([at(m, k, 89, GF), at(m, k, 89, 1)])}" stroke-width="${f1(Math.max(1, 1.4 * s))}"/>`);
  out.push(gallerySVG(m, k));
  for (let g = 1; g <= 5; g++) {
    const state = f < st.floor || (f === st.floor && g < st.at) ? "won" : f === st.floor && g === st.at ? (st.live ? "now" : "next") : "";
    out.push(doorSVG(m, k, g, state, s, type));
  }
  out.push(parapetSVG(m, k, s, type));
  // laid over the floor and what stands out of it: a floor up is dimmer into the night
  const dim = 1 - lightOf(k);
  if (dim > 0) out.push(`<polygon class="tw-night" opacity="${dim.toFixed(3)}" points="${pts([at(m, k, -90, GF - SLAB - .09, GAL), ...arc(m, k, GF - SLAB - .09, -90, 90, 36, GAL), at(m, k, 90, GF + .09, GAL), ...arc(m, k, 1, 90, -90, 36), at(m, k, -90, GF + .09, GAL)])}"/>`);
  return `<g data-k="${k}">${out.join("")}</g>`;
}

/* above the first floor the floor stood on has its terrace, as wide as the view: its floor runs from the tower's foot to the horizon, its
   parapet along the far edge with the sea of cloud beyond it, so the floors under it are out of sight and the party stands on it as on
   the plaza. Drawn after the floor under it and before the floor itself, so the drum stands on it */
function terraceSVG(m) {
  const posts = [];
  for (let x = 4; x < m.W; x += m.phone ? 10 : 14) posts.push(`M${f1(x)},${f1(m.horizon)}V${f1(m.horizon - (m.phone ? 7 : 9))}`);
  return `<g class="tw-terrace"><rect fill="url(#tw-ground-${m.id})" class="top" x="${f1(-m.W)}" y="${f1(m.horizon)}" width="${f1(m.W * 3)}" height="${f1(m.H * 3)}"/>`
    + `<path class="post" d="${posts.join("")}"/><rect class="rail" x="${f1(-m.W)}" y="${f1(m.horizon - (m.phone ? 8 : 10))}" width="${f1(m.W * 3)}" height="2"/>`
    + `<ellipse class="tw-foot" cx="${f1(m.ax)}" cy="${f1(m.base + m.r0 * E * .5)}" rx="${f1(m.r0 * 1.5)}" ry="${f1(m.r0 * E * 1.6)}"/></g>`;
}

// the floors drawn: one under the floor stood on, and up to where the tower leaves the window
function floorsOf(m) {
  const ks = [-1];
  for (let k = 0; k < 30; k++) { ks.push(k); if (footY(m, k + 1) < -m.h0 || sc(k) < .05) break; }
  return ks;
}

/* the other climbers of the month at their floors (on the tab): a small plaque hung from the right end of the gallery of the floor they
   reached, a pennant on it (amber for a run being played), the name and the streak. Only the floors in sight and clear of the clouds;
   plaques that would touch give way */
function climbersHTML(m, st) {
  const tags = [];
  let last = Infinity;
  for (const c of (st.climbers || []).slice().sort((a, b) => b.wins - a.wins)) {
    const f = Math.floor(c.wins / 5) + 1, k = f - st.floor;
    if (k < 0 || f < 1) continue;
    const [x, y] = at(m, k, 86, GF + .075, GAL);
    if (y < m.H * .22 || y > m.base || Math.abs(last - y) < 22) continue;
    last = y;
    tags.push(`<span class="tw-tag${k > 0 ? " up" : ""}" style="left:${f1(x + 4)}px;top:${f1(y)}px"><i class="flag${c.live ? " live" : ""}"></i>${escapeHTML(c.name)}<b>${c.wins}</b></span>`);
    if (tags.length >= 4) break;
  }
  return tags.join("");
}
const escapeHTML = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

/* the run's party before the tower (the tab only), on the ground in a shallow arc a step out from the tower's foot: the lead in the
   middle, a little larger and nearest, the others to either side in turn, each farther one a little smaller and higher; each on its
   feet (inkCentre.js standInk) with its shadow under it, in the scene's light (rows in depth put them over the tower's base and
   scattered them, 2026-11-11) */
const ORDER = [0, -1, 1, -2, 2, -3];
function partyHTML(m, st) {
  if (!m.hall || !st.party?.length) return "";
  const n = Math.min(6, st.party.length), size = m.phone ? 54 : 78, rx = Math.min(m.r0 * 1.95, m.W * .42), ry = rx * E * 1.3;
  const slots = ORDER.slice(0, n), span = Math.max(1, ...slots.map(Math.abs));
  const spots = st.party.slice(0, n).map((species, i) => {
    const t = (slots[i] / (span + .4)) * 1.15, z = size * (i === 0 ? 1.08 : .86 + .14 * Math.cos(t));
    return { species, x: m.ax + rx * Math.sin(t), y: m.base + m.r0 * E * 2.2 + ry * Math.cos(t), z };
  }).sort((a, b) => a.y - b.y);
  const shade = spots.map(p => `<ellipse cx="${f1(p.x)}" cy="${f1(p.y)}" rx="${f1(p.z * .3)}" ry="${f1(p.z * .07)}"/>`).join("");
  return `<div class="tw-front"><svg class="tw-feet" width="${m.W}" height="${m.H}" viewBox="0 0 ${m.W} ${m.H}" aria-hidden="true">${shade}</svg>`
    + spots.map(p => `<span class="tw-mon" style="left:${f1(p.x - p.z / 2)}px;top:${f1(p.y - p.z)}px;width:${f1(p.z)}px;height:${f1(p.z)}px"><img src="${spriteUrl(p.species)}" alt="" draggable="false"></span>`).join("") + `</div>`;
}

/* the tower drawn in el (the tab's hall, or the scene laid over a stage). floor: the floor stood on; at: its game (1 to 5, 6 the floor
   won whole); live: a game is gone into or played (its window amber) or the run rests (lit dim). The tab adds party (the run's six)
   and climbers ({ name, wins, live }) */
export function drawTower(el, st) {
  const W = el.clientWidth, H = el.clientHeight;
  if (!W || !H) return false;
  const m = measure(W, H, el.classList.contains("tw-hall"), Boolean(st.party?.length));
  const svg = (cls, body) => `<svg class="${cls}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${body}</svg>`;
  const body = floorsOf(m).map(k => (k === 0 && st.floor > 1 ? terraceSVG(m) : "") + floorSVG(m, k, st)).join("");
  el.innerHTML = svg("tw-sky", night(m, st.floor)) + twinkleHTML(m)
    + `<div class="tw-cam">${svg("tw-body", shadeDefs(m) + `<defs><linearGradient id="tw-ground-${m.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="g0"/><stop offset="1" class="g1"/></linearGradient></defs>` + body)}${m.hall ? climbersHTML(m, st) : ""}</div>`
    + cloudsHTML(m) + partyHTML(m, st);
  for (const img of el.querySelectorAll(".tw-mon > img")) {
    img.addEventListener("error", () => { img.style.visibility = "hidden"; }, { once: true });
    if (img.complete) standInk(img); else img.addEventListener("load", () => standInk(img), { once: true });
  }
  el.tower = { m, st: { ...st } };
  return true;
}
const sameState = (a, b) => a.floor === b.floor && a.at === b.at && a.live === b.live
  && String(a.party || "") === String(b.party || "") && JSON.stringify(a.climbers || []) === JSON.stringify(b.climbers || []);
// the tab's hall draws itself and lights foot first the first time; a resize or a new state draws it again where it stands
export function standTower(el, st) {
  const was = el.tower;
  if (was && was.m.W === el.clientWidth && was.m.H === el.clientHeight && sameState(was.st, st)) return;
  if (drawTower(el, st) && !was) lightUp(el);
}
/* switching on: the night first, then the floors from the foot up a row's step apart, then the party on the balcony, each rising
   into its light as anything that arrives does */
function lightUp(el, hold = 0) {
  if (reduced()) return Promise.resolve();
  const floors = [...el.querySelectorAll(".tw-body > g")];
  const all = [
    // the night, the moon and the night over the tower's top together, first
    ...[...el.querySelectorAll(".tw-sky, .tw-clouds")].map(x => settled(x.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.light, delay: hold, easing: EASE_OUT, fill: "backwards" }))),
    ...floors.map((g, i) => settled(g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.light, delay: hold + i * STAGGER.display, easing: EASE_OUT, fill: "backwards" }))),
    ...[...el.querySelectorAll(".tw-mon, .tw-tag")].map((x, i) => settled(x.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }],
      { duration: DUR.light, delay: hold + floors.length * STAGGER.display + i * STAGGER.row, easing: EASE_OUT, fill: "backwards" }))),
  ];
  return Promise.all(all);
}
const lamp = (el, g) => el.querySelector(`.tw-win[data-g="${g}"]`);

/* ---------- the scene ---------- */
/* the spark: the lamp's light running along the path of the floor stood on from u0 to u1 (a transform of an 8 square, keyframes along
   the path, so it is the compositor's) */
function spark(el, u0, u1, { fadeIn = false, fadeOut = false } = {}) {
  const { m } = el.tower;
  const cam = el.querySelector(".tw-cam");
  const dot = Object.assign(document.createElement("i"), { className: "lamp sig tw-spark" });
  cam.appendChild(dot);
  const n = 16, frames = Array.from({ length: n + 1 }, (_, i) => {
    const [x, y] = pathAt(m, 0, u0 + (u1 - u0) * i / n);
    return { transform: `translate(${f1(x - 3)}px,${f1(y - 3)}px)`, opacity: (fadeIn && i === 0) || (fadeOut && i === n) ? 0 : 1 };
  });
  return settled(dot.animate(frames, { duration: RUN, easing: INOUT, fill: "forwards" })).then(() => dot.remove());
}
// the game just won lights and the spark runs to the next lamp, which turns amber
async function step(el, game) {
  const st = { ...el.tower.st, at: game, live: true };
  await pause(BEAT);
  lamp(el, game - 1)?.classList.add("won");
  sfx("select");
  await spark(el, NODE_U[game - 2], NODE_U[game - 1]);
  drawTower(el, st);
  sfx("turn");
  once(lamp(el, game));
  await pause(DUR.tone);
}
/* the lift rises a floor: the gate lights, the spark goes on round behind the tower, the tower comes down a floor (one similarity about
   the point it closes on, so the floor climbed sinks to the foot and the next one stands where it stood), and the spark comes round
   onto the new floor's first lamp */
async function rise(el, floor) {
  const { m, st } = el.tower;
  await pause(BEAT);
  drawTower(el, { ...st, at: 6 });
  sfx("select");
  once(lamp(el, 5));
  // the light goes in through the gate: the tower is climbed inside
  await spark(el, NODE_U[4], NODE_U[4] + .001, { fadeOut: true });
  const cam = el.querySelector(".tw-cam");
  cam.style.transformOrigin = `${f1(m.ax)}px ${f1(m.ay)}px`;
  sfx("swoosh", { sec: .6 });
  const sky = el.querySelector(".tw-sky");
  // the night is far: it moves a little with the rise, so the tower is seen to climb past it
  sky?.animate([{ transform: "none" }, { transform: `translateY(${f1(m.H * .04)}px)` }], { duration: RISE, easing: INOUT });
  await settled(cam.animate([{ transform: "scale(1)" }, { transform: `scale(${(1 / R).toFixed(4)})` }], { duration: RISE, easing: INOUT, fill: "forwards" }));
  drawTower(el, { ...st, floor, at: 0, live: true });
  await spark(el, 0, NODE_U[0], { fadeIn: true });
  drawTower(el, { ...st, floor, at: 1, live: true });
  sfx("turn");
  once(lamp(el, 1));
  await pause(DUR.tone);
}
const once = (x, from = 0) => x?.animate?.([{ opacity: from }, { opacity: 1 }], { duration: DUR.tone, easing: EASE_OUT });

/* 1 and 2: the tower is shown on target for the game gone into (floor, at). hall: the tab's hall, where it already stands; otherwise
   it switches on over the stage. climbing: the floor's first game after a gatekeeper. again: a lost game gone into again (the three
   lamps), where no lamp was won and the amber lamp stands where it stood. Resolves once it has been read */
export async function towerShow(target, { floor, at: game, master = false, climbing = false, again = false }) {
  towerDrop(true);
  if (!target) return;
  const hall = target.classList.contains("tw-hall");
  const el = hall ? target : Object.assign(document.createElement("div"), { className: "tw over" });
  if (!hall) { el.setAttribute("aria-hidden", "true"); target.appendChild(el); }
  scene = { el, own: !hall, master };
  const keep = hall ? { party: el.tower?.st.party, climbers: el.tower?.st.climbers } : {};
  const now = { ...keep, floor, at: game, live: true };
  // the picture before the step the scene plays: the game just won still the lamp's, or the floor left with its gate still to light
  const before = hall || again ? now : climbing ? { floor: floor - 1, at: 5, live: true } : game > 1 ? { floor, at: game - 1, live: true } : now;
  if (reduced()) { drawTower(el, now); await pause(READ * 2); return; }
  if (hall) {
    // the hall already stands on the game gone into, at the run's rest: its lamp turns amber where it stands (no redraw, so the hall's
    // own switching on goes on under it)
    const was = el.tower?.st, l = lamp(el, game);
    if (was && l && was.floor === floor && was.at === game) { l.classList.remove("next"); l.classList.add("now"); el.tower.st = { ...was, live: true }; }
    else drawTower(el, now);
    sfx("turn");
    once(lamp(el, game), .382);
  } else {
    drawTower(el, before);
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.tone, easing: EASE_OUT });
    void lightUp(el, DUR.tone);
    await pause(DUR.tone + DUR.light);
  }
  const mine = () => scene?.el === el;
  if (mine() && before.floor !== floor) await rise(el, floor);
  else if (mine() && before.at !== game) await step(el, game);
  if (mine()) await pause(READ);
}

/* 3: the view goes in through the amber lamp until it fills the stage as two doors shut on a seam, while the rest of the screen goes
   out (so the screen is left by the time the doors stand, and nothing waits on a second fade); then the doors leave the page for the
   window (fixed), to outlive the screen. Resolves with the doors shut */
export async function towerDive() {
  if (!scene) return;
  const { el, own, master } = scene;
  scene = null;
  if (!reduced()) {
    // everything of the page that does not hold the scene
    const main = document.getElementById("ypl-main"), rest = [];
    for (let x = el; x && x !== main && x.parentElement; x = x.parentElement) rest.push(...[...x.parentElement.children].filter(y => y !== x && !y.classList.contains("tw")));
    left = rest.map(x => x.animate([{ opacity: getComputedStyle(x).opacity }, { opacity: 0 }], { duration: DUR.leave, delay: DIVE - DUR.leave, easing: EASE_IN, fill: "both" }));
  }
  const { m, st } = el.tower || {};
  const box = el.getBoundingClientRect();
  const doors = Object.assign(document.createElement("div"), { className: "lift in" + (master ? " inv" : "") });
  doors.setAttribute("aria-hidden", "true");
  doors.innerHTML = `<span class="lift-door l"></span><span class="lift-door r"></span><i class="lamp sig lift-lamp"></i>`;
  el.appendChild(doors);
  if (m && !reduced()) {
    // the lamp gone into, and a door's shape about it (a floor's height, golden), from which the doors open out to the stage
    // the window gone into, from which the doors open out to the stage
    const win = windowOf(m, 0, Math.min(Math.max(st.at, 1), 5)), x = win.x, y = win.y - win.h / 2;
    const h = Math.max(win.h, 24), w = Math.max(win.w, h / 1.618), F = Math.max(m.W / w, m.H / h) * 1.2;
    const cam = el.querySelector(".tw-cam");
    cam.getAnimations().forEach(a => a.cancel());
    cam.style.transformOrigin = `${f1(x)}px ${f1(y)}px`;
    sfx("swoosh", { sec: .5 });
    cam.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 }, { opacity: 0, offset: .786 },
      { transform: `translate(${f1(m.W / 2 - x)}px,${f1(m.H / 2 - y)}px) scale(${F.toFixed(3)})`, opacity: 0 }], { duration: DIVE, easing: INOUT, fill: "forwards" });
    for (const x2 of el.querySelectorAll(".tw-sky, .tw-front, .tw-clouds, .tw-twinkle")) x2.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DIVE * .618, easing: EASE_IN, fill: "forwards" });
    await settled(doors.animate([{ transform: `translate(${f1(x - w / 2)}px,${f1(y - h / 2)}px) scale(${(w / m.W).toFixed(4)},${(h / m.H).toFixed(4)})` }, { transform: "none" }],
      { duration: DIVE, easing: INOUT, fill: "backwards" }));
  }
  // the doors stand shut: from here they are the window's (fixed over where the stage stands, cut to the window)
  const top = Math.max(0, box.top), bottom = Math.min(innerHeight, box.bottom);
  doors.classList.remove("in");
  Object.assign(doors.style, { left: `${box.left}px`, top: `${top}px`, width: `${box.width}px`, height: `${Math.max(0, bottom - top)}px` });
  (document.querySelector(".ypl") || document.body).appendChild(doors);
  if (own) el.remove();
  car = { el: doors };
}

// where a stage stands, cut to the window; a team preview is still drawing its cards when the doors arrive and runs past the foot
// once drawn, so its box goes down to the window's foot, less the page's own bottom space
const boxOf = el => {
  const r = el.getBoundingClientRect(), top = Math.max(0, r.top);
  const foot = parseFloat(getComputedStyle(el.closest(".page") || document.body).paddingBottom) || 0;
  return { left: r.left, top, width: r.width, height: Math.max(0, innerHeight - foot - top) };
};
const slide = (door, from, to) => settled(door.animate([{ transform: `translateX(${from * 101}%)` }, { transform: `translateX(${to * 101}%)` }], { duration: SHUT, easing: INOUT, fill: "forwards" }));
const part = async el => {
  const lampEl = el.querySelector(".lift-lamp");
  if (lampEl) lampEl.style.opacity = "0";
  sfx("swoosh", { sec: .5 });
  const doors = el.querySelectorAll(".lift-door");
  await Promise.all([slide(doors[0], 0, -1), slide(doors[1], 0, 1)]);
  el.remove();
};

/* 4: the next screen has mounted; the doors go to its stage (target) and part. Returns the time until they start to part, so that
   screen's arrival can wait for it, or null when no doors wait */
export function liftArrive(target) {
  letGo();
  if (!car || !target) return null;
  const { el } = car;
  car = null;
  if (reduced()) { el.remove(); return 0; }
  const was = el.getBoundingClientRect(), to = boxOf(target);
  const moved = Math.abs(to.left - was.left) + Math.abs(to.top - was.top) + Math.abs(to.width - was.width) + Math.abs(to.height - was.height) > 4;
  const px = b => ({ left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
  (async () => {
    if (moved) {
      await settled(el.animate([px(was), px(to)], { duration: MOVE, easing: INOUT, fill: "forwards" }));
      Object.assign(el.style, px(to));
    }
    // arrived: the chime, and the doors part (carrying themselves was the beat; standing where they shut they wait one)
    sfx("turn");
    if (!moved) await pause(BEAT);
    await part(el);
  })();
  return moved ? MOVE : BEAT;
}

// a refusal (the game could not be made): the scene goes, or the doors part where they shut, and the screen stands again
export function towerDrop(now = false) {
  const s = scene, c = car;
  scene = null; car = null;
  letGo();
  if (s?.own) {
    if (now || reduced()) s.el.remove();
    else settled(s.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.leave, fill: "forwards" })).then(() => s.el.remove());
  }
  if (s && !s.own && s.el.tower) drawTower(s.el, { ...s.el.tower.st, live: false });
  if (c) { if (now || reduced()) c.el.remove(); else void part(c.el); }
}

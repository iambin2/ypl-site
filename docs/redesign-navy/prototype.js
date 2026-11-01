import { arenaField } from "/ypl-site/src/components/home/arenaField.js";
import { reduced, desktop, EASE_OUT, EASE_IN, EASE_IN_OUT, DUR, springs, placePill, themeFade } from "/ypl-site/src/components/common/motion.js";

const root = document.documentElement, $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
if (new URLSearchParams(location.search).get("theme") === "dark") root.dataset.theme = "dark";
const move = !reduced();

const rise = (el, delay = 0, y = 16) => el.animate([{ opacity: 0, transform: `translateY(${y}px)` }, { opacity: 1, transform: "none" }], { duration: 480, delay, easing: EASE_OUT, fill: "backwards" });

/* 실제 명예의 전당의 여섯 챔피언. 슬랩은 우승 엔트리의 첫 포켓몬을 세우고, 누르면 여섯 마리가 나온다 */
const champions = {
  6: ["김현민", "YPL 시즌 2 우승", ["garchomp", "dragonite-mega", "hydreigon", "aegislash", "metagross-mega", "primarina"]],
  5: ["정두호", "YPL 시즌 1 우승", ["alomomola", "grimmsnarl", "ursaluna", "sinistcha", "manectric-mega", "maushold"]],
  4: ["이제빈", "클래식 시즌 4 우승", ["abomasnow", "baxcalibur", "arcanine", "lucario-mega", "corviknight", "ogerpon-wellspring"]],
  3: ["허진욱", "클래식 시즌 3 우승", ["torkoal", "gougingfire", "ragingbolt", "walkingwake", "lilligant-hisui", "shaymin-sky"]],
  2: ["이종우", "클래식 시즌 2 우승", ["blaziken-mega", "dracovish", "gholdengo", "shedinja", "cyclizar", "klefki"]],
  1: ["정두호", "클래식 시즌 1 우승", ["lopunny-mega", "clefable", "blissey", "ursaluna-bloodmoon", "skarmory", "toxapex"]],
};
const sprite = mon => `/ypl-site/sprites/pokemon/${mon}.webp`;

/* ---------- 슬랩 띠 ---------- */
const order = [3, 2, 1, 6, 5, 4, 3, 2, 1], CENTER = 3, FLOW = .5, track = $("#track");
track.innerHTML = order.map(gen => {
  const [name, line, party] = champions[gen];
  return `<button type="button" class="slab${gen === 6 ? " cur" : ""}" data-gen="${gen}" aria-label="${gen}대 챔피언 ${name}, ${line}">
    <span class="label"><span><b>${name}</b><span>${line}</span></span><strong>${gen}<small>대</small></strong></span>
    <span class="win"><i class="sweep"></i><img src="${sprite(party[0])}" alt=""></span>
  </button>`;
}).join("");
const slabs = [...track.children];
let step = 0, base = 0, active = CENTER;
const measure = () => { step = slabs[1].offsetLeft - slabs[0].offsetLeft; base = track.parentElement.clientWidth / 2 - (slabs[CENTER].offsetLeft + slabs[CENTER].offsetWidth / 2); };
/* 빛의 띠: 경계가 또렷한 사선 면 하나가 포켓몬 뒤를 지나간다 */
const sweep = slab => { if (move) slab?.querySelector(".sweep").animate([{ transform: "translateX(-140%) skewX(-14deg)" }, { transform: "translateX(340%) skewX(-14deg)" }], { duration: 900, easing: EASE_IN_OUT }); };
const placeBelt = () => {
  const run = move ? scrollY * FLOW : 0;
  track.style.transform = `translate3d(${(base - run).toFixed(1)}px,0,0)`;
  const now = CENTER + Math.round(run / step);
  if (now !== active) { active = now; sweep(slabs[now]); }
};
measure(); placeBelt();

/* ---------- 바: 내리면 비키고 올리면 돌아온다 ---------- */
const bar = $(".bar");
let lastY = scrollY, ticking = false;
addEventListener("scroll", () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    placeBelt();
    const y = scrollY;
    if (Math.abs(y - lastY) < 4) return;
    bar.classList.toggle("away", y > lastY && y > 120);
    lastY = y;
  });
}, { passive: true });

/* ---------- 렌즈 ---------- */
const pills = [$(".links"), $(".tabs")];
const placePills = animate => pills.forEach(box => placePill(box, animate));
for (const box of pills) box.addEventListener("click", e => {
  const a = e.target.closest("a");
  if (!a) return;
  box.querySelectorAll("a").forEach(x => x.removeAttribute("aria-current"));
  a.setAttribute("aria-current", "page");
  placePill(box, true);
});
document.addEventListener("click", e => { if (e.target.closest('a[href="#"]')) e.preventDefault(); });
placePills(false);

/* ---------- 테마 ---------- */
$("#theme").addEventListener("click", () => themeFade(() => { root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark"; }));

/* ---------- 첫 등장, 1초 ---------- */
if (move) {
  $$(".hero .ln").forEach((el, i) => rise(el, 60 + i * 90));
  rise($(".next"), 240);
  rise($(".hero .actions"), 320);
  slabs.forEach((s, i) => s.animate(
    [{ opacity: 0, transform: "translateY(64px) scale(.96)" }, { opacity: 1, offset: .35 }, { opacity: 1, transform: "none" }],
    { duration: DUR.soft, delay: 360 + Math.abs(i - CENTER) * 70, easing: springs().soft, fill: "backwards" }));
  setTimeout(() => sweep(slabs[CENTER]), 900);
}

/* ---------- 숫자와 나타남: 화면 밖의 것만 처음 들어올 때 한 번 솟는다 ---------- */
const count = $("#count");
$$("[data-roll]").forEach(el => {
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = [...el.dataset.roll].map((d, i) => `<span class="rd" style="--d:${d};--i:${i}"><span class="gh">${d}</span><span class="rs">${[..."0123456789"].map(x => `<i>${x}</i>`).join("")}</span></span>`).join("");
});
const reveals = [count, ...$$(".routes > a, .notices h2, .list > *, .info h2, .info .actions")];
if (!move) count.classList.add("go");
else {
  const seen = new IntersectionObserver(entries => entries.forEach(({ isIntersecting, target: el }) => {
    if (!isIntersecting) return;
    seen.unobserve(el);
    el.classList.remove("pre");
    rise(el, [...el.parentElement.children].indexOf(el) * 60, 24);
    if (el === count) count.classList.add("go");
  }), { threshold: .15 });
  reveals.forEach(el => { if (el.getBoundingClientRect().top > innerHeight * .9) el.classList.add("pre"); else if (el === count) count.classList.add("go"); seen.observe(el); });
}

/* ---------- 아레나 ---------- */
const close = $("#close"), arena = $("#arena"), hole = $("#hole"), wave = $("#wave"), mark = $("#mark"), band = $("#band");
const WORD = $("#word path");
const mask = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 310 100'><path fill-rule='evenodd' transform='${WORD.getAttribute("transform")}' d='${WORD.getAttribute("d")}'/></svg>`)}") center / 100% 100% no-repeat`;
$("#shine").style.webkitMask = mask; $("#shine").style.mask = mask;

let rest = [0, 0], waveAt = "none";
const placeHole = (x, y) => { hole.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`; };
function drawArena() {
  const w = close.clientWidth, phone = w < 860, h = phone ? 620 : 840, floorY = Math.round(h * (phone ? .42 : .4));
  const { rect, line, ring, knob, face } = arenaField(w, h, floorY);
  const svg = (cls, d) => `<svg class="field ${cls}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path fill-rule="evenodd" d="${d}"/></svg>`;
  $("#lit").innerHTML = svg("lit", rect + line + ring + knob + face);
  $("#dim").innerHTML = svg("a-rect", rect) + svg("a-line", line) + svg("a-ring", ring) + svg("a-ball", knob + face);
  $("#dim").style.setProperty("--floor", floorY + "px");
  arena.style.height = h + "px";
  arena.style.setProperty("--hole", Math.min(w * .36, 320) + "px");
  const paths = $$("#dim path"), ringBox = paths[2].getBBox(), knobBox = box(knob);
  /* YPL은 단추의 먼 끝에 선다. 단추가 글자 사이로 비치지 않게 */
  mark.style.top = Math.round(knobBox.y) - 8 + "px";
  close.style.paddingTop = Math.ceil(ringBox.y + ringBox.height + 56) + "px";
  rest = [w / 2, knobBox.y + knobBox.height / 2];
  placeHole(...rest);
  const ww = ringBox.width * 3.2, wh = ringBox.height * 3.2;
  wave.style.width = ww + "px"; wave.style.height = wh + "px";
  waveAt = `translate(${rest[0] - ww / 2}px,${rest[1] - wh / 2}px)`;
}
const box = d => { const host = $("#dim svg"), s = document.createElementNS("http://www.w3.org/2000/svg", "path"); s.setAttribute("d", d); host.appendChild(s); const b = s.getBBox(); s.remove(); return b; };
drawArena();

/* 파동은 몬스터볼에서 나가는 또렷한 원 하나다 */
const fireWave = () => { if (move) wave.animate([{ transform: `${waveAt} scale(.05)`, opacity: .9 }, { transform: `${waveAt} scale(1)`, opacity: 0 }], { duration: 1500, easing: EASE_OUT }); };
close.addEventListener("click", e => { if (!e.target.closest("a, button")) fireWave(); });

const playArena = () => {
  const play = (s, kf, o) => arena.querySelectorAll(s).forEach(el => el.animate(kf, { easing: EASE_OUT, fill: "backwards", ...o }));
  const fade = [{ opacity: 0 }, { opacity: 1 }];
  play(".a-line", [{ transform: "scaleX(0)" }, { transform: "none" }], { duration: 420, delay: 120 });
  play(".a-rect", [{ opacity: 0, transform: "scaleY(.2)" }, { opacity: 1, transform: "none" }], { duration: 480, delay: 150 });
  play(".a-ring", fade, { duration: 360, delay: 240 });
  play(".a-ball", fade, { duration: 270, delay: 360 });
  play("#lit", fade, { duration: 420, delay: 420 });
  play("#mark > svg", fade, { duration: 600, delay: 300 });
  band.animate([{ transform: "translateX(-160%) skewX(-12deg)" }, { transform: "translateX(480%) skewX(-12deg)" }], { duration: 900, delay: 600, easing: EASE_IN_OUT });
  setTimeout(fireWave, 360);
};
if (move) {
  if (arena.getBoundingClientRect().top > innerHeight * .75) {
    arena.classList.add("pre");
    const once = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      once.disconnect();
      arena.classList.remove("pre");
      playArena();
    }, { threshold: .3 });
    once.observe(arena);
  }
  /* 포인터의 빛: 구멍 하나를 변형으로 옮긴다. 떠나면 몬스터볼로 돌아가 머문다 */
  let [x, y] = rest, tx = x, ty = y, raf = 0;
  const glide = () => {
    x += (tx - x) * .12; y += (ty - y) * .12;
    placeHole(x, y);
    raf = Math.abs(tx - x) + Math.abs(ty - y) > .3 ? requestAnimationFrame(glide) : 0;
  };
  const go = () => { if (!raf) raf = requestAnimationFrame(glide); };
  close.addEventListener("pointermove", e => {
    if (e.pointerType !== "mouse") return;
    const r = arena.getBoundingClientRect();
    tx = e.clientX - r.left; ty = e.clientY - r.top;
    go();
  }, { passive: true });
  close.addEventListener("pointerleave", () => { [tx, ty] = rest; go(); });
  addEventListener("resize", () => { [x, y] = [tx, ty] = rest; });
}

/* ---------- 시트: 슬랩을 누르면 우승 엔트리 여섯 마리 ---------- */
const sheet = $("#sheet");
const openSheet = gen => {
  const [name, line, party] = champions[gen];
  $("#sheetTitle").textContent = name;
  $("#sheetLine").textContent = `${gen}대 챔피언, ${line}`;
  $("#sheetParty").innerHTML = party.map(m => `<span><img src="${sprite(m)}" alt=""></span>`).join("");
  sheet.showModal();
  if (!move) return;
  const from = desktop() ? [{ opacity: 0, transform: "translateY(24px) scale(.96)" }, { opacity: 1, transform: "none" }] : [{ transform: "translateY(100%)" }, { transform: "none" }];
  sheet.animate(from, { duration: DUR.soft, easing: springs().soft });
  $$("#sheetParty span").forEach((el, i) => rise(el, 120 + i * 40, 12));
};
const closeSheet = () => {
  if (!sheet.open) return;
  if (!move) { sheet.close(); return; }
  const to = desktop() ? [{ opacity: 1 }, { opacity: 0, transform: "translateY(12px) scale(.98)" }] : [{ transform: "none" }, { transform: "translateY(100%)" }];
  sheet.animate(to, { duration: 220, easing: EASE_IN, fill: "forwards" }).finished.then(a => { sheet.close(); a.cancel(); });
};
track.addEventListener("click", e => { const s = e.target.closest(".slab"); if (s) openSheet(s.dataset.gen); });
$("#sheetX").addEventListener("click", closeSheet);
sheet.addEventListener("click", e => { if (e.target === sheet) closeSheet(); });
sheet.addEventListener("cancel", e => { e.preventDefault(); closeSheet(); });

/* ---------- 나머지 ---------- */
/* 탭 바의 바탕 띠는 푸터에 닿으면 네이비로 바뀐다 */
new IntersectionObserver(([e]) => document.body.classList.toggle("end", e.isIntersecting)).observe($("footer"));
document.fonts.ready.then(() => { measure(); placeBelt(); placePills(false); });
addEventListener("resize", () => { measure(); placeBelt(); drawArena(); placePills(false); });

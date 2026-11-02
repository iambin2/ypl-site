// The YPL Navy design law (DESIGN.md) as a test. Every CSS declaration in src/styles and every inline style={{}} in src
// is checked against the scales and rules below. A deliberate exception is listed in EXCEPT under its reason; an exception
// that no longer occurs fails too, so the list only shrinks. New UI that passes this test needs no separate consistency check.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const STYLES = join(ROOT, "src/styles");
const read = f => readFileSync(f, "utf8");
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
const rel = f => relative(ROOT, f).replaceAll("\\", "/");

// ---------- the scales (DESIGN.md "Space and radius", "Type") ----------
const TOKENS = read(join(STYLES, "tokens.css"));
const SPACE = new Set([0, ...[...TOKENS.matchAll(/--s\d+:\s*(\d+)px/g)].map(m => +m[1])]); // 4 times a Fibonacci number
const WEIGHTS = new Set(["400", "600", "700"]);
// a size comes with its tracking: the scale pairs them in tokens.css
const TRACK = new Set(["0", "inherit", "var(--ls-body)", "var(--ls-lead)", "var(--ls-h3)", "var(--ls-title)", "var(--ls-display)"]);
const trackFor = { "var(--fs-lead)": "var(--ls-lead)", "var(--fs-h3)": "var(--ls-h3)", "var(--fs-h2)": "var(--ls-title)", "var(--fs-h1)": "var(--ls-title)", "var(--fs-display)": "var(--ls-display)", "var(--fs-hero)": "var(--ls-display)" };
const LEADING = new Set(["1", "inherit", "1.236em", "var(--lh-caption)", "var(--lh-body)", "var(--lh-label)", "var(--lh-lead)", "var(--lh-title)", "var(--lh-display)"]);
const RADII = new Set([0]); // nothing is round: a control is a plane too

// ---------- declarations ----------
// each CSS rule block's declarations, so a rule can read a declaration beside its font-size
const BLOCKS = [];
const sib = (d, prop) => d.blk === undefined ? undefined : BLOCKS[d.blk][prop];
const sizePx = v => { const m = /^(\d*\.?\d+)(rem|px)$/.exec(v || ""); return m ? +m[1] * (m[2] === "rem" ? 16 : 1) : null; };
function cssDecls(file) {
  const src = read(file).replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "));
  const out = [], stack = []; let buf = "";
  const flush = () => {
    const t = buf.trim(), i = t.indexOf(":");
    if (i > 0 && stack.length) out.push({ file: rel(file), sel: stack.at(-1).sel, blk: stack.at(-1).blk, prop: t.slice(0, i).trim(), value: t.slice(i + 1).trim() });
    buf = "";
  };
  for (const ch of src) {
    if (ch === "{") { stack.push({ sel: buf.trim().replace(/\s+/g, " "), blk: BLOCKS.push({}) - 1 }); buf = ""; }
    else if (ch === "}") { flush(); stack.pop(); }
    else if (ch === ";") flush();
    else buf += ch;
  }
  return out;
}
// React adds px to bare numbers on length properties
const unit = (prop, v) => /margin|padding|gap|size|radius/.test(prop) ? v.replace(/(^|[?:\s])(-?\d*\.?\d+)(?=$|[?:\s])/g, "$1$2px") : v;
const kebab = k => k.replace(/[A-Z]/g, c => "-" + c.toLowerCase());
function inlineDecls(file) {
  const out = [];
  for (const [, body] of read(file).matchAll(/style=\{\{([^{}]*)\}\}/g))
    for (const [, k, v] of body.matchAll(/(\w+)\s*:\s*((?:"[^"]*"|'[^']*'|[^,"'])+)/g))
      out.push({ file: rel(file), sel: "style", prop: kebab(k), value: unit(kebab(k), v.trim().replace(/^["']|["']$/g, "")) });
  return out;
}
const SRC = walk(join(ROOT, "src")).filter(f => /\.(jsx?|mjs)$/.test(f) && !rel(f).startsWith("src/data/"));
const DECLS = [...readdirSync(STYLES).filter(f => f.endsWith(".css")).flatMap(f => cssDecls(join(STYLES, f))), ...SRC.flatMap(inlineDecls)];
for (const d of DECLS) if (d.blk !== undefined) BLOCKS[d.blk][d.prop] = d.value;
const keyOf = d =>`${d.file} | ${d.sel} | ${d.prop}: ${d.value}`;

// ---------- helpers ----------
const noVars = v => v.replace(/var\([^()]*(\([^()]*\))?[^()]*\)/g, "");
const pxs = v => [...noVars(v).matchAll(/(-?\d*\.?\d+)px/g)].map(m => Math.abs(+m[1]));
const fontFace = d => d.sel.startsWith("@font-face");
const COLOR = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|\b(white|black|red|green|blue|gray|grey)\b/i;

// ---------- the law: each rule names its DESIGN.md section ----------
const RULES = {
  "color: literals live only in tokens.css (Color)": d => d.file !== "src/styles/tokens.css" && !/mask/.test(d.prop) && COLOR.test(d.value),
  "space: margin, padding and gap sit on the golden scale (Space and radius)": d => /^(margin|padding|gap|row-gap|column-gap)(-|$)/.test(d.prop) && pxs(d.value).some(n => !SPACE.has(n)),
  "type: a size is a token, never a number (Type)": d => d.prop === "font-size" && !/^(inherit|var\(--(fs-[\w]+|hero(-\d)?|display(-l)?|title|fig-[sml])\))$/.test(d.value),
  "type: weights 400 600 700 (Type)": d => d.prop === "font-weight" && !fontFace(d) && !WEIGHTS.has(d.value) && !/^(inherit|var\()/.test(d.value),
  "type: tracking is a token and follows its size (Type)": d => d.prop === "letter-spacing" && (!TRACK.has(d.value) || (trackFor[sib(d, "font-size")] && trackFor[sib(d, "font-size")] !== d.value)),
  "type: line-heights on one set (Type)": d => d.prop === "line-height" && !LEADING.has(d.value),
  "type: big figures sit on the --fig scale, 28px and up (Type)": d => d.prop === "font-size" && /\.(fig|rc-poster-num|bk-draw-cnt)(?![\w-])/.test(d.sel) && !/^var\(--fig-[sml]\)$/.test(d.value),
  // one stack everywhere: Freesentation for Korean, Albert Sans for Latin and digits
  "type: one font stack; YPL Figures only with the brand (Type)": d => d.prop === "font-family" && !fontFace(d) && !/^(inherit|var\(--font\))$/.test(d.value),
  "type: no uppercase label (Type, Don't)": d => d.prop === "text-transform" && d.value === "uppercase",
  "type: only reading text carries a measure, 36em (Type)": d => /^max-(width|inline-size)$/.test(d.prop) && /\d(ch|r?em)\b/.test(d.value) && !(d.sel === ".prose" && d.value === "36em"),
  "golden: a split is equal or 1.618 to 1 (The golden law)": d => /^grid-template(-columns|-rows)?$/.test(d.prop) && [...d.value.matchAll(/(\d*\.?\d+)fr/g)].some(m => !["1", "1.618", "4.236"].includes(m[1])),
  "golden: a transition's scale comes from phi (The golden law)": d => (d.prop === "scale" || d.prop === "transform") && [...d.value.matchAll(/scale[XY]?\((\d*\.\d+)\)/g), ...(d.prop === "scale" ? [[0, d.value]] : [])].some(m => /^\d*\.\d+$/.test(m[1]) && ![".976", ".966", ".944", ".91", ".854", "1.034", "3.236"].includes(m[1])),
  "golden: a shadow stands on the steps of space (The golden law)": d => d.prop === "box-shadow" && /px/.test(noVars(d.value)) && !/^inset 0 (0 0 )?1px|^(inset )?0 0 0 /.test(d.value) && pxs(d.value).some(n => !SPACE.has(n)),
  "align: left by default, centre only for the four cases (Alignment)": d => d.prop === "text-align" && d.value === "center",
  "align: right only for trailing values and number columns (Alignment)": d => d.prop === "text-align" && /right|end/.test(d.value),
  "radius: nothing is round (The plane)": d => /radius/.test(d.prop) && !d.prop.startsWith("--") && pxs(d.value).some(n => !RADII.has(n)),
  "matte: nothing blurs what is behind it (Material)": d => /backdrop-filter$/.test(d.prop),
  "matte: nothing blurs itself; a blur repaints or recomposites every frame it moves (Material)": d => /^(-webkit-)?filter$/.test(d.prop) && /blur\(/.test(d.value),
  "matte: shadows are still, a shadow in a transition repaints its element every frame (Motion)": d => /^transition(-property)?$/.test(d.prop) && /box-shadow/.test(d.value),
  "motion: a filter stands still, it repaints every frame it moves (Motion)": d => /^transition/.test(d.prop) && /\bfilter\b/.test(d.value),
  // the verbs of the motion law: length and curve come as one token, so no element can invent a third way to move
  "motion: a transition or an animation reads a --move token (Motion)": d => /^(transition|animation)(-duration|-timing-function)?$/.test(d.prop)
    && (/cubic-bezier|\blinear\(|steps\(|\bease(-in|-out|-in-out)?\b|\d(ms|s)\b/.test(noVars(d.value)) || /var\(--(ease|spring)/.test(d.value)),
  "type: paragraphs are pretty, only headlines balance (Type)": d => d.prop === "text-wrap" && !((/pretty/.test(d.value) && d.sel === "p") || (/balance/.test(d.value) && /^(h1, h2, h3, h4|\.display|\.title|\.hof-plate)$/.test(d.sel))),
  "color: components read semantic tokens, never primitives (Color)": d => d.file !== "src/styles/tokens.css" && /var\(--(navy|gray)-\d+|var\(--white\)/.test(d.value),
  "depth: a z-index is a named step (Depth)": d => d.prop === "z-index" && !/^(auto|calc\(var\(--z-sticky\) \+ 1\)|var\(--z-[a-z]+\))$/.test(d.value),
  "opacity: 0, 1 or a token (Color)": d => d.prop === "opacity" && !/^(0|1|var\(--opacity-[a-z]+\))$/.test(d.value),
  "motion: a duration is a token (Motion)": d => /^(transition|animation)/.test(d.prop) && /(?<![\w.-])\d*\.?\d+m?s\b/.test(noVars(d.value)),
};

// ---------- deliberate exceptions, by rule and reason ----------
const C = "src/styles/components.css", P = "src/styles/pages.css", S = "src/styles/shell.css", T = "src/styles/tokens.css";
const B = "src/styles/bracket.css", K = "src/styles/calculator.css", R = "src/styles/records.css", TB = "src/styles/team-builder.css", A = "src/styles/admin.css";
const TYPES = ["normal: #9FA19F", "fire: #E62829", "water: #2980EF", "electric: #FAC000", "grass: #3FA129", "ice: #3FD8FF", "fighting: #FF8000", "poison: #9141CB", "ground: #915121",
  "flying: #81B9EF", "psychic: #EF4179", "bug: #91A119", "rock: #AFA981", "ghost: #704170", "dragon: #5060E1", "dark: #624D4E", "steel: #60A1B8", "fairy: #EF70EF"]
  .map(t => `${TB} | .type-${t.split(":")[0]} | --type:${t.split(":")[1]}`);
const EXCEPT = {
  "depth: a z-index is a named step (Depth)": {
    "a stack orders itself: toasts by their place": ["src/components/common/Toaster.jsx | style | z-index: 10 - index"],
  },
  "opacity: 0, 1 or a token (Color)": {
    "the fourth toast in a stack leaves": ["src/components/common/Toaster.jsx | style | opacity: index > 2 && !item.out ? 0 : undefined"],
  },
  "color: literals live only in tokens.css (Color)": {
    "Pokémon type colours are content, not chrome": TYPES,
    "a video letterbox is black in both themes": [`${P} | .bd-yt | background: #000`],
  },
  "space: margin, padding and gap sit on the golden scale (Space and radius)": {
    "a hairline: the screen-reader clip": [`${T} | .sr-only | margin: -1px`],
    "clears a fixed element by its size: the bars, a field's icon, the sheet's close button, a sprite, a checkbox, a status icon": [
      `${S} | .is-admin .site-foot-in | padding-bottom: 104px`,
      `${TB} | .tb-slot:not(.empty) | padding-top: 48px`, `${B} | .bk-award > .bk-chg-cnt | margin-left: 28px`,
      `${TB} | .tb-validation ul | margin: var(--s3) 0 0 44px`, `${TB} | .tb-more | margin: var(--s2) 0 0 44px`, `${TB} | .tb-official-meta | margin: var(--s5) 0 0 44px`,
      `${TB} | .tb-official-lookup | margin: var(--s5) 0 0 44px`, `${TB} | .tb-official-submit | margin: var(--s5) 0 0 44px`],
    "concentric inset: inner radius = outer radius - padding": [
      `${K} | .calc-stepper button | margin: 2px`],
  },
  "type: line-heights on one set (Type)": {
    "a rank cell sits on its neighbour's 28px line box": [`${R} | .r2-line > .r2-rk | line-height: 28px`],
  },
  "align: left by default, centre only for the four cases (Alignment)": {
    "(a) a label inside its control": [`${T} | button | text-align: center`, `${T} | .rs > i | text-align: center`, `${A} | .ed-grid input | text-align: center`,
      `${B} | .bk-count input | text-align: center`, `${B} | .bk-pt input | text-align: center`, `${B} | .bk-alloc-row input | text-align: center`,
      `${K} | .calc-stepper output | text-align: center`, `${TB} | .tb-stat-number | text-align: center`],
    "(b) a short mark in a narrow fixed cell, and the head of such a column": [`${B} | .bk-seed | text-align: center`, `${B} | .bk-series-no | text-align: center`,
      `${B} | .bk-series-vs | text-align: center`, `${C} | .ypl-table .c | text-align: center`,
      `${A} | .ed-head | text-align: center`],
    "(c) a caption under its picture": [`${K} | .calc-versus-mon | text-align: center`, `${P} | .hm-party li | text-align: center`, `${C} | .case-name | text-align: center`],
  },
  "align: right only for trailing values and number columns (Alignment)": {
    "a trailing value or a number column": [`${K} | .calc-hp b | text-align: right`, `${K} | .calc-base-row b | text-align: right`, `${K} | .calc-base-row small | text-align: right`,
      `${K} | .calc-table .num | text-align: right`, `${C} | .ypl-table .r | text-align: right`, `${R} | .rc-facts.rows dd | text-align: right`,
      `${P} | .sc-stat strong | text-align: right`, `${P} | .sc-stat-h > span:last-child | text-align: right`, `${P} | .sc-sp em | text-align: right`],
  },
};

for (const [rule, broken] of Object.entries(RULES)) {
  test(rule, () => {
    const allowed = new Set(Object.values(EXCEPT[rule] || {}).flat());
    const hits = new Set(DECLS.filter(broken).map(keyOf));
    const fresh = [...hits].filter(k => !allowed.has(k));
    const stale = [...allowed].filter(k => !hits.has(k));
    assert.deepEqual(fresh, [], `breaks the design law; fix it, or add it to EXCEPT with its reason:\n  ${fresh.join("\n  ")}`);
    assert.deepEqual(stale, [], `listed in EXCEPT but no longer occurs; remove it:\n  ${stale.join("\n  ")}`);
  });
}

test("a sentence ends with a period wherever it stands: headline, empty state, error or toast (Voice)", () => {
  const close = /(니다|세요|에요|예요|해요|돼요|네요)\s*$/;
  const hits = SRC.flatMap(f => read(f).split("\n").flatMap((l, i) => /^\s*(\/\/|\/?\*)/.test(l) ? []
    : [...l.matchAll(/"([^"\n]*[가-힣][^"\n]*)"|`([^`\n]*[가-힣][^`\n]*)`|>([^<>{}\n]*[가-힣][^<>{}\n]*)</g)]
      .map(m => m[1] ?? m[2] ?? m[3]).filter(t => close.test(t)).map(t => `${rel(f)}:${i + 1}: ${t}`)));
  assert.deepEqual(hits, [], "end it with a period");
});

test("Korean copy has no middle dot separators (Type)", () => {
  const hits = SRC.flatMap(f => read(f).split("\n").map((l, i) => ({ l, at: `${rel(f)}:${i + 1}` })))
    .filter(({ l }) => l.includes("·") && !/^\s*(\/\/|\/?\*)/.test(l) && !/\/[^/\n]*·[^/\n]*\/[gimsuy]*/.test(l)); // a regex that strips dots is fine
  assert.deepEqual(hits.map(h => h.at), []);
});

// A page's tab bar is Segmented with value={tab} (or {step}). Switching it slides the lens (K3) and the new view rises (.swap),
// also when each tab is its own component and the bar is handed down as a `tabs` prop and remounts with it.
const TAB_MOTION_EXCEPT = {
  "src/pages/TeamBuilderPage.jsx": "phone steps rise with their own stagger in changeStep (N5)",
};
test("a tab switch moves: the lens slides and the new view rises (Motion, K3)", () => {
  assert.match(read(join(ROOT, "src/components/common/Segmented.jsx")), /handoff\.set\(/, "Segmented must hand its lens across a remount");
  const pages = SRC.filter(f => /<Segmented\s+value=\{(tab|step)\}/.test(read(f)) && !TAB_MOTION_EXCEPT[rel(f)]);
  assert.deepEqual(pages.filter(f => !/className=[{"][^>]*\bswap\b/.test(read(f))).map(rel), [], "a page tab's view must enter with .swap");
  const handed = SRC.flatMap(f => [...read(f).matchAll(/function (\w+)\(\{[^}]*\btabs\b[^}]*\}\)\s*\{([\s\S]*?)\n\}/g)].map(([, name, body]) => ({ at: `${rel(f)} ${name}`, body })));
  assert.deepEqual(handed.filter(c => !/\bswap\b/.test(c.body)).map(c => c.at), [], "a view behind a handed-down tab bar must enter with .swap");
});

test("springs in script run at their natural length too (Motion)", () => {
  const hits = SRC.flatMap(f => [...read(f).matchAll(/\{[^{}]*springs\(\)\.(spring|lift)[^{}]*\}/g)]
    .filter(([obj, kind]) => !obj.includes(kind === "lift" ? "DUR.lift" : "DUR.place")).map(([obj]) => `${rel(f)}: ${obj}`));
  assert.deepEqual(hits, [], "use { duration: DUR.place } with springs().spring and DUR.lift with springs().lift");
});

// One law for space and time: each step of a scale is 1.618 times the last, give or take what the 4px grid and whole milliseconds allow.
test("space and time step by the golden ratio (Space and radius, Motion)", () => {
  const steps = pattern => [...TOKENS.matchAll(pattern)].map(m => +m[1]);
  for (const scale of [steps(/--s\d+:\s*(\d+)px/g), steps(/--t-[a-z]+:\s*(\d+)ms/g)]) {
    assert.ok(scale.length >= 7, scale.join());
    scale.slice(3).forEach((v, i) => assert.ok(Math.abs(v / scale[i + 2] - 1.618) < .08, `${scale[i + 2]} to ${v}`));
  }
});

// One ratio sets the rest too: type stands on the steps of space, leading and tracking are powers of 1/phi, and a curve is the Fibonacci sum of what it holds.
const PHI = (1 + Math.sqrt(5)) / 2;
test("type stands on the steps of space (Type)", () => {
  const rem = name => +new RegExp(`--fs-${name}:\\s*([\\d.]+)rem`).exec(TOKENS)[1] * 16;
  for (const name of ["lead", "h3", "h2", "h1", "display", "hero"]) assert.ok(SPACE.has(rem(name)), `--fs-${name} is ${rem(name)}px`);
});
test("leading is 1 + a power of 1/phi, tracking a power of 1/phi over ten (Type)", () => {
  const near = (v, set) => set.some(p => Math.abs(v - p) < .001);
  const powers = [1, 2, 3, 4, 5, 6].map(n => PHI ** -n);
  for (const [, v] of TOKENS.matchAll(/--lh-[a-z]+:\s*([\d.]+)/g)) assert.ok(near(+v - 1, powers), `leading ${v}`);
  for (const [, v] of TOKENS.matchAll(/--ls-[a-z0-9]+:\s*-?([\d.]+)em/g)) assert.ok(near(+v, powers.map(p => p / 10)), `tracking ${v}`);
});
test("planes hold, lines operate: the main action is the one plane, the rest is a line under a word (Plane and line)", () => {
  assert.doesNotMatch(TOKENS, /--r-[a-z]+:/, "there is no radius token");
  const alive = /live-dot|ypl-ping|aria-busy/;
  assert.deepEqual(DECLS.filter(d => /radius/.test(d.prop) && !/^0$/.test(d.value) && !alive.test(d.sel)).map(keyOf), [], "only what is alive is round");
  assert.deepEqual(decl(".btn--lg", "height"), ["52px"]);
  assert.deepEqual(decl(".btn--lg", "min-width"), ["136px"], "the main action is 1 to phi squared");
  assert.deepEqual(decl(".btn--secondary", "text-decoration"), ["underline"]);
  assert.ok(decl(".pill-ind", "height").includes("var(--rule)"), "the selection is a line");
  assert.deepEqual(decl(".ypl-group", "background"), [], "a list is rows on hairlines, not a grey box");
  assert.deepEqual(decl(".case", "padding"), [], "a case is two planes, not a frame");
});
test("a case with one picture is the golden rectangle cut once: a square window and the label that is left (The plane)", () => {
  assert.deepEqual(decl(".case.one", "aspect-ratio"), ["1 / var(--golden)"]);
  assert.deepEqual(decl(".case.one .case-win", "aspect-ratio"), ["1"]);
});
test("planes of one tone part by a seam of 4 (The plane)", () => {
  assert.ok(decl(".case-grid", "gap").includes("var(--s1)"));
  assert.ok(decl(".hm-rail", "gap").includes("var(--s1)"));
});
test("the middle is measured by ink: text from the font's baseline, a sprite from its own pixels (The centre)", () => {
  assert.match(TOKENS, /ascent-override: 97%; descent-override: 25%;/, "without it 16px text rides .8 above the middle of its box");
  assert.match(src("src/main.jsx"), /centreInk\(e\.target\)/, "every sprite stands on its ink");
  assert.deepEqual(decl(".ypl-table .ypl-table__rank", "text-align"), ["left"], "a rank stands on the same edge as the hairline over it");
});
test("the selection is one element (Plane and line)", () => {
  assert.doesNotMatch(src("src/components/common/Segmented.jsx"), /<i \/><i \/>/);
});

test("saved images stand on the same law (The golden law)", () => {
  const sizes = new Set(["13", "16", "20", "32", "52", "84", "136"]);
  for (const f of ["src/pages/BracketsPage.jsx", "src/components/teamSheetImage.js"]) {
    const fonts = [...src(f).matchAll(/ctx\.font\s*=\s*`([^`]*)`/g)].map(m => m[1]);
    assert.ok(fonts.length > 8, f);
    assert.deepEqual(fonts.filter(x => /\b800\b/.test(x)), [], "weights 400 600 700");
    assert.deepEqual(fonts.filter(x => !sizes.has((/ (\d+(?:\.\d+)?)px/.exec(x) || [])[1])).filter(x => / \d/.test(x)), [], "a size on the scale");
  }
});
test("the first screen of the home is four planes, each a golden section of the last, and nothing on it moves but what arrives (Pages)", () => {
  assert.deepEqual(decl(".hm-plate", "grid-template").map(v => v.replaceAll(/\s+/g, " ")).sort(), ["1.618fr 1fr / 4.236fr 1.618fr 1fr", "4.236fr 1.618fr 1fr / 1.618fr 1fr"]);
  const home = src("src/pages/HomePage.jsx");
  assert.doesNotMatch(home, /<Roll|\.animate\(|requestAnimationFrame/, "no digit rolls, no pointer tracking and no stage of its own on the home");
});

// A new thing that moves is one of the verbs. These files are where the verbs that need the finger or a measurement live.
const ANIMATES = new Set(["src/components/common/motion.js", "src/components/common/Modal.jsx", "src/components/common/Menu.jsx", "src/components/common/Dropdown.jsx",
  "src/components/common/Toaster.jsx", "src/components/common/StandTable.jsx"]);
test("pages move through the verbs of motion.js, never their own .animate() (Motion)", () => {
  assert.deepEqual(SRC.filter(f => /\.animate\(/.test(read(f)) && !ANIMATES.has(rel(f))).map(rel), [], "use place, stand or seal from motion.js");
});
test("keyframes are a closed list: a new one needs a new verb in DESIGN.md (Motion)", () => {
  const names = readdirSync(STYLES).flatMap(f => [...read(join(STYLES, f)).matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1])).sort();
  assert.deepEqual(names, ["bk-draw", "bk-land", "dd-in", "ping", "row-rise", "tab-pop", "y-fade", "y-loader-sweep", "y-pop", "y-pulse", "y-rise", "y-spin", "y-swap"]);
});

// 2026-10-27 consistency pass: the rules below were each broken somewhere before they were written down (DESIGN.md "Consistency").
const src = p => read(join(ROOT, p)).replace(/\r\n/g, "\n");
test("a title comes first: no date, chip or label above it (rule 2)", () => {
  for (const f of ["src/pages/NewsPage.jsx", "src/pages/BoardPage.jsx"])
    for (const [head] of src(f).matchAll(/<header className="nb-a-head">[\s\S]*?<\/header>/g))
      assert.ok(head.indexOf("<h1") < head.indexOf("nb-a-meta"), `${f}: the article title stands above its grey line`);
  for (const [head] of src("src/pages/BracketsPage.jsx").matchAll(/<header className="bk-t-head card">[\s\S]*?<\/header>/g))
    assert.ok(head.indexOf("<h1") < head.indexOf("bk-t-row"), "a bracket head shows its name before any chip");
  const lead = src("src/components/common/LeadFigures.jsx");
  assert.ok(lead.indexOf('"rc-poster-fig"') < lead.indexOf('"rc-poster-label"'), "a big figure stands above its label");
  assert.ok(!/className="r2-date"/.test(src("src/pages/RecordsPage.jsx")), "a round's date sits on its grey line, not above its name");
  assert.ok(!/<time[^>]*>[^<]*<\/time>\s*<div><b>/.test(src("src/pages/AboutPage.jsx")), "a timeline entry names the event before its date");
});

test("icons only say what words cannot: no decorative icons on pages (rule 3)", () => {
  const files = [...readdirSync(join(ROOT, "src/pages")).map(f => `src/pages/${f}`), "src/components/layout/SiteFooter.jsx"];
  const hits = files.flatMap(f => [...src(f).matchAll(/<Icon n="(crown|medal|chart|trophy|discord|msg|list)"/g)].map(m => `${f}: ${m[1]}`));
  assert.deepEqual(hits, []);
});

test("every sheet closes the same way: the X is not tied to a title (Components)", () => {
  assert.doesNotMatch(src("src/components/common/Modal.jsx"), /title !== undefined && <>\s*<button type="button" className="modal-x/);
});

test("a generation is written one way: 1대, never 초대 (Consistency)", async () => {
  const { generationText } = await import("../src/services/seasonLabel.js");
  assert.equal(generationText("초대"), "1대");
  assert.equal(generationText("초대 챔피언"), "1대");
  assert.equal(generationText("6대 챔피언"), "6대");
  for (const f of ["src/pages/TitlesPage.jsx", "src/pages/ChampionsPage.jsx", "src/pages/RecordsPage.jsx"])
    assert.match(src(f), /generationText/, `${f} shows generations through generationText`);
});

test("the press answers first: the nav lens leaves before the next page is drawn (K1, K3)", () => {
  const app = src("src/App.jsx");
  assert.match(app, /leadPills\(v\);\s*afterPaint\(/, "go() starts the lens, then renders after the frame");
  assert.match(app, /leadPills\(next\);\s*afterPaint\(/, "back and forward do the same");
});

// 2026-10-28 space and text law (DESIGN.md "Space and text law"): each was broken somewhere when it was written down.
const decl = (sel, prop) => DECLS.filter(d => d.sel === sel && d.prop === prop).map(d => d.value);
test("the touch floor raises a control but never lowers a field or a row (law 3)", () => {
  const floor = DECLS.filter(d => d.file === C && d.prop === "min-height" && d.value === "var(--target)" && d.sel.includes(".ypl button"));
  assert.ok(floor.length > 0, "the touch floor is still there");
  assert.deepEqual(floor.filter(d => !d.sel.startsWith(":where(")).map(keyOf), [], "the floor's height must carry no weight (:where)");
});

test("a list row is 52 everywhere, from one token (law 3)", () => {
  assert.match(TOKENS, /--row-min:\s*52px/);
  for (const sel of [".ypl-row", ".pick-row"]) assert.deepEqual(decl(sel, "min-height"), ["var(--row-min)"], sel);
});

test("a sheet's actions sit 40 under its body and its padding over its edge: the sticky reaches over the padding (law 2)", () => {
  const bottoms = decl(".modal-actions", "bottom");
  assert.equal(bottoms.length, 2, "phone and desktop");
  for (const b of bottoms) assert.match(b, /^calc\(.*\* -1\)$/, "a sticky box stops at its scroller's padding, so bottom: 0 rides it high");
});

test("rows in a sheet hang into its padding so their words stand on the title's edge (law 1)", () => {
  assert.deepEqual(decl(".modal > .menu, .pick-list, .sc-pick", "margin-inline"), ["calc(var(--s3) * -1)"]);
  for (const sel of [".mi", ".pick-row"]) assert.ok(DECLS.some(d => d.sel === sel && d.prop === "padding" && /var\(--s3\)$/.test(d.value)), `${sel} pads its words 12 in`);
});

test("chosen rows share one state ladder: hover soft, selected tint, keyboard focus strong (law 5)", () => {
  const rows = DECLS.filter(d => /^background(-color)?$/.test(d.prop) && /^(\.popover )?\.(mi|dd-opt|pick-row)[.:]/.test(d.sel));
  const want = sel => /:hover/.test(sel) ? "var(--state-hover)" : /focus-visible|\.cursor/.test(sel) ? "var(--state-pressed)" : /\.(on|sel)\b/.test(sel) ? "var(--state-selected)" : null;
  assert.ok(rows.length >= 9);
  assert.deepEqual(rows.filter(d => want(d.sel) && d.value !== want(d.sel)).map(keyOf), []);
  assert.deepEqual(decl(".dd-opt.sel", "font-weight"), [], "an option keeps its weight when chosen");
});

test("icons stand on three sizes: 16, 20, 24 (Icons)", () => {
  const hits = SRC.flatMap(f => [...read(f).matchAll(/<Icon [^>]*?size=\{(\d+)\}/g)].filter(m => !["16", "20", "24"].includes(m[1])).map(m => `${rel(f)}: ${m[1]}`));
  assert.deepEqual(hits, []);
});

test("three breakpoints: 640, 860, 1100 (Layout)", () => {
  const css = readdirSync(STYLES).filter(f => f.endsWith(".css")).map(f => read(join(STYLES, f))).join("\n");
  const widths = [...new Set([...css.matchAll(/\((?:min|max)-width:\s*(\d+)px\)/g)].map(m => +m[1]))].sort((a, b) => a - b);
  assert.deepEqual(widths.filter(w => ![639, 640, 859, 860, 1099, 1100].includes(w)), []);
});

test("script animations take their durations from DUR (Motion)", () => {
  const hits = SRC.flatMap(f => [...read(f).matchAll(/\.animate\([^;]*?duration:\s*(\d+)/g)].filter(m => +m[1] > 0).map(m => `${rel(f)}: ${m[1]}`));
  assert.deepEqual(hits, []);
});

test("an explanatory sentence reads in one grey (law 4)", () => {
  for (const sel of [".bk-hint, .hint", ".callout", ".dd-none"]) assert.deepEqual(decl(sel, "color"), ["var(--text-secondary)"], sel);
  assert.deepEqual(decl(".modal > .hint", "color"), [], "a sheet's hint takes the shared grey");
});

// 2026-11-01 (23rd round): what moves runs on the compositor. A filter, clip or background in a script animation repaints every frame;
// the home's pointer light held a desktop at 12 frames a second that way.
test("scripted animations move transform and opacity only (Motion)", () => {
  const hits = SRC.flatMap(f => [...read(f).matchAll(/\.animate\(\s*\[[^\]]*\]/g)].filter(([m]) => /\b(filter|clipPath|backgroundPosition|boxShadow|width|height)\s*:/.test(m)).map(([m]) => `${rel(f)}: ${m.slice(0, 80)}`));
  assert.deepEqual(hits, [], "move it by transform and opacity, or give it a still picture to move");
});
test("css keyframes move transform and opacity only (Motion)", () => {
  const css = readdirSync(STYLES).filter(f => f.endsWith(".css")).map(f => read(join(STYLES, f))).join("\n");
  const blocks = [...css.matchAll(/@keyframes ([\w-]+) \{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)].map(([, name, body]) => ({ name, props: [...body.matchAll(/([\w-]+)\s*:/g)].map(m => m[1]) }));
  const LOCAL = { "row-rise": "one row, once, when a ranking changes", "bk-land": "one bracket slot in the draw ceremony" };
  assert.ok(blocks.length > 8);
  assert.deepEqual(blocks.filter(b => !LOCAL[b.name] && b.props.some(p => !["transform", "opacity"].includes(p))).map(b => `${b.name}: ${b.props}`), []);
});
test("the bars and the page never hold a backdrop or a page copy (Material, Motion)", () => {
  assert.doesNotMatch(src("src/components/common/motion.js"), /"ghost"/, "a page change copies nothing");
  assert.doesNotMatch(TOKENS, /@property --(stage|surface|fg)\b/, "theme change restyles once, under the veil");
});

test("a sheet fills the width under 860 and clips its corners (Sheets)", () => {
  const css = read(join(STYLES, "components.css"));
  const base = css.match(/^\.sheet \{([^}]*)\}/m)[1];
  assert.match(base, /width: 100%/, "a narrower sheet floats round on top and square below");
  assert.match(base, /overflow: hidden/, "the pinned actions paint square over unclipped corners");
});

test("one button: every button that is a button comes from Button.jsx (Components)", () => {
  const hits = SRC.filter(f => !f.endsWith("Button.jsx")).flatMap(f => [...read(f).matchAll(/className=["{][^>\n]*\b(ypl-btn|btn-primary|btn-ghost|btn-danger)\b/g)].map(m => `${rel(f)}: ${m[1]}`));
  assert.deepEqual(hits, []);
  assert.doesNotMatch(TOKENS.replace(/\/\*[\s\S]*?\*\//g, ""), /\.hl\b/);
});

test("inline space is a token (Space)", () => {
  const hits = SRC.flatMap(f => [...read(f).matchAll(/style=\{\{([^{}]*)\}\}/g)].filter(([, b]) => /\b(margin\w*|padding\w*|gap)\s*:\s*-?[1-9]/.test(b)).map(([m]) => `${rel(f)}: ${m.slice(0, 60)}`));
  assert.deepEqual(hits, []);
});

test("no View Transitions snapshots (Don't)", () => {
  const hits = [...SRC, ...readdirSync(STYLES).map(f => join(STYLES, f))].filter(f => /startViewTransition|view-transition/.test(read(f)));
  assert.deepEqual(hits.map(rel), []);
});

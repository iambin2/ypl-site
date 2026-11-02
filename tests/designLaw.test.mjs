// The YPL Scoreboard design law (DESIGN.md) as a test. Every CSS declaration in src/styles and every inline style={{}} in src is checked
// against the rules below. A deliberate exception is listed in EXCEPT under its reason; an exception that no longer occurs fails too, so
// the list only shrinks.
//
// The build lands page by page. Page styles not yet rebuilt read the YPL Navy names through the bridge block in tokens.css, so the
// general rules hold for every file at once, and REBUILT files are held to the strict ones too: only scoreboard tokens, only lengths on
// the series. When the last page is rebuilt, REBUILT is every file and the bridge goes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const STYLES = join(ROOT, "src/styles");
const read = f => readFileSync(f, "utf8");
const src = p => read(join(ROOT, p)).replace(/\r\n/g, "\n");
const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
const rel = f => relative(ROOT, f).replaceAll("\\", "/");
const PHI = (1 + Math.sqrt(5)) / 2;

// ---------- the scales (DESIGN.md "The golden law") ----------
const TOKENS = src("src/styles/tokens.css");
const BRIDGE_BLOCK = /\/\* ---------- bridge:[\s\S]*?\n:root \{([\s\S]*?)\n\}/.exec(TOKENS)[1];
const BRIDGE = new Set([...BRIDGE_BLOCK.matchAll(/(--[\w-]+):/g)].map(m => m[1]));
const SPACE = new Set([0, ...[...TOKENS.matchAll(/--(?:s\d+|seam):\s*(\d+)px/g)].map(m => +m[1])]);
const WEIGHTS = new Set(["400", "600", "700"]);
// a length is a step of space, a line, an icon (16, 20, 24), a height (32, 44, 52, 64, 84), a bar (40, 56), a segment cell or a width of the layout
const LENGTHS = new Set([...SPACE, 1, 2, 3, 16, 20, 24, 32, 36, 40, 44, 52, 56, 64, 84, 120, 132, 204, 216, 240, 439, 576, 709, 1200]);

// these files are built to the scoreboard: no bridge names, only its own tokens
const REBUILT = new Set([
  "src/styles/shell.css", "src/styles/board.css", "src/styles/home.css",
  "src/pages/HomePage.jsx", "src/components/common/Board.jsx", "src/components/common/Button.jsx",
  "src/styles/news.css", "src/pages/NewsPage.jsx", "src/styles/brackets.css", "src/styles/records-board.css", "src/styles/more.css", "src/styles/hall.css", "src/styles/posts.css", "src/pages/BoardPage.jsx", "src/pages/TitlesPage.jsx", "src/pages/ChampionsPage.jsx", "src/pages/AboutPage.jsx", "src/components/common/ChampionSheet.jsx", "src/pages/MorePage.jsx", "src/components/common/PushControl.jsx", "src/pages/RecordsPage.jsx", "src/components/common/StandTable.jsx", "src/components/common/Pager.jsx", "src/components/common/ListSearch.jsx",
  "src/components/common/Seg.jsx", "src/components/common/seg.js", "src/components/common/Icon.jsx", "src/components/common/Loader.jsx", "src/components/common/Segmented.jsx",
  "src/components/layout/Navigation.jsx", "src/components/layout/SiteHeader.jsx", "src/components/layout/SiteFooter.jsx", "src/admin/AdminModeBar.jsx",
]);

// ---------- declarations ----------
const BLOCKS = [];
function cssDecls(file) {
  const text = read(file).replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "));
  const out = [], stack = []; let buf = "";
  const flush = () => {
    const t = buf.trim(), i = t.indexOf(":");
    if (i > 0 && stack.length) out.push({ file: rel(file), sel: stack.at(-1).sel, blk: stack.at(-1).blk, prop: t.slice(0, i).trim(), value: t.slice(i + 1).trim() });
    buf = "";
  };
  for (const ch of text) {
    if (ch === "{") { stack.push({ sel: buf.trim().replace(/\s+/g, " "), blk: BLOCKS.push({}) - 1 }); buf = ""; }
    else if (ch === "}") { flush(); stack.pop(); }
    else if (ch === ";") flush();
    else buf += ch;
  }
  return out;
}
// React adds px to bare numbers on length properties
const unit = (prop, v) => /margin|padding|gap|size|radius|width|height/.test(prop) ? v.replace(/(^|[?:\s])(-?\d*\.?\d+)(?=$|[?:\s])/g, "$1$2px") : v;
const kebab = k => k.replace(/[A-Z]/g, c => "-" + c.toLowerCase());
function inlineDecls(file) {
  const out = [];
  for (const [, body] of read(file).matchAll(/style=\{\{([^{}]*)\}\}/g))
    for (const [, k, v] of body.matchAll(/(\w+)\s*:\s*((?:"[^"]*"|'[^']*'|[^,"'])+)/g))
      out.push({ file: rel(file), sel: "style", prop: kebab(k), value: unit(kebab(k), v.trim().replace(/^["']|["']$/g, "")) });
  return out;
}
const SRC = walk(join(ROOT, "src")).filter(f => /\.(jsx?|mjs)$/.test(f) && !rel(f).startsWith("src/data/"));
const CSS = readdirSync(STYLES).filter(f => f.endsWith(".css"));
const DECLS = [...CSS.flatMap(f => cssDecls(join(STYLES, f))), ...SRC.flatMap(inlineDecls)];
for (const d of DECLS) if (d.blk !== undefined) BLOCKS[d.blk][d.prop] = d.value;
const keyOf = d => `${d.file} | ${d.sel} | ${d.prop}: ${d.value}`;
const decl = (sel, prop) => DECLS.filter(d => d.sel === sel && d.prop === prop).map(d => d.value);

// ---------- helpers ----------
const noVars = v => v.replace(/var\([^()]*(\([^()]*\))?[^()]*\)/g, "");
const pxs = v => [...noVars(v).matchAll(/(-?\d*\.?\d+)px/g)].map(m => Math.abs(+m[1]));
const fontFace = d => d.sel.startsWith("@font-face");
const strict = d => REBUILT.has(d.file);
// the comma-separated layers of a value, commas inside var() and calc() kept
const layers = v => { const out = [""]; let depth = 0; for (const ch of v) { depth += ch === "(" ? 1 : ch === ")" ? -1 : 0; if (ch === "," && !depth) out.push(""); else out[out.length - 1] += ch; } return out.map(p => p.trim()); };
const COLOR = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|\b(white|black|red|green|blue|gray|grey)\b/i;
const SIZE_TOKENS = /^(inherit|var\(--t(12|15|20|32)\))$/;
const SIZE_BRIDGE = /^var\(--(fs-\w+|title|display|hero|fig-[sml])\)$/;
const LINE_TOKENS = /^(1|inherit|var\(--l(12|15|20|32|-read)\))$/;
const LINE_BRIDGE = /^(1\.236em|var\(--lh-\w+\))$/;

// ---------- the law: each rule names its DESIGN.md section ----------
const RULES = {
  "colour: literals live only in tokens.css (Colour and light)": d => d.file !== "src/styles/tokens.css" && !/mask/.test(d.prop) && COLOR.test(d.value),
  "colour: components read semantic tokens, never primitives (Colour and light)": d => d.file !== "src/styles/tokens.css" && /var\(--(navy(-[123])?|white|mist|haze|amber(-deep)?|paper-[123]|slate(-2)?)\)/.test(d.value),
  "colour: solid only, no gradient (Colour and light)": d => /gradient\(/.test(d.value),
  "space: margin, padding and gap sit on the golden scale (Space)": d => /^(margin|padding|gap|row-gap|column-gap)(-|$)/.test(d.prop) && pxs(d.value).some(n => !SPACE.has(n)),
  "type: a size is one of the four tokens (Type)": d => d.prop === "font-size" && !SIZE_TOKENS.test(d.value) && (strict(d) || !SIZE_BRIDGE.test(d.value)),
  "type: a line is on the 4 grid, from its token (Type)": d => d.prop === "line-height" && !LINE_TOKENS.test(d.value) && (strict(d) || !LINE_BRIDGE.test(d.value)),
  "type: weights 400 600 700 (Type)": d => d.prop === "font-weight" && !fontFace(d) && !WEIGHTS.has(d.value) && !/^(inherit|var\()/.test(d.value),
  "type: tracking is a token (Type)": d => d.prop === "letter-spacing" && !/^(0|inherit|var\(--ls(20|32|-[a-z0-9]+)\))$/.test(d.value),
  "type: one font stack (Type)": d => d.prop === "font-family" && !fontFace(d) && !/^(inherit|var\(--font\))$/.test(d.value),
  "type: no uppercase label (Voice and tone)": d => d.prop === "text-transform" && d.value === "uppercase",
  "type: only reading text carries a measure, 36em (Type)": d => /^max-(width|inline-size)$/.test(d.prop) && /\d(ch|r?em)\b/.test(d.value) && !(d.sel === ".prose" && d.value === "36em"),
  "panels: nothing is round (Panels)": d => /radius/.test(d.prop) && !d.prop.startsWith("--") && !/^0(px)?$/.test(d.value),
  "panels: no shadow; a box-shadow only draws an inset hairline, rule or ring (Panels)": d => d.prop === "box-shadow" && !/^(none|var\(--shadow-[12]\))$/.test(d.value) && layers(d.value).some(p => !/^inset\s/.test(p)),
  "panels: no border (Panels)": d => strict(d) && /^border(-(top|right|bottom|left))?$/.test(d.prop) && !/^(0|none)$/.test(d.value),
  "light: nothing blurs what is behind it (Don't)": d => /backdrop-filter$/.test(d.prop),
  "light: nothing blurs or glows (Don't)": d => /^(-webkit-)?filter$/.test(d.prop) && /blur\(|drop-shadow\(/.test(d.value),
  "eye: every length stands on the series (The golden law)": d => strict(d) && /^((min-|max-)?(width|height)|top|right|bottom|left|inset|flex-basis)$/.test(d.prop) && !d.sel.startsWith("@") && pxs(d.value).some(n => !LENGTHS.has(n)),
  "eye: an underline stands 4px under its word (Controls)": d => d.prop === "text-underline-offset" && d.value !== "4px",
  "motion: a press scales to .976 and nothing grows (Motion)": d => (d.prop === "scale" || d.prop === "transform") && [...d.value.matchAll(/scale[XY]?\((\d*\.?\d+)\)/g), ...(d.prop === "scale" ? [[0, d.value]] : [])].some(m => /^\d*\.?\d+$/.test(m[1]) && ![".976", "1"].includes(m[1])) && !/^(from|to|[\d.]+%)/.test(d.sel) && !/^(\.bk-|\.tb-|\.calc-|\.rc-|\.hm-|\.case|\.hof|\.sc-)/.test(d.sel),
  "motion: a shadow, filter, clip, mask or background never moves (Motion)": d => /^transition(-property)?$/.test(d.prop) && /box-shadow|\bfilter\b|clip|mask|background-(position|image|size)/.test(d.value),
  "motion: a transition or an animation reads a --move token (Motion)": d => /^(transition|animation)(-duration|-timing-function)?$/.test(d.prop)
    && (/cubic-bezier|\blinear\(|steps\(|\bease(-in|-out|-in-out)?\b|\d(ms|s)\b/.test(noVars(d.value)) || /var\(--(ease|spring)/.test(d.value)),
  "motion: a duration is a token (Motion)": d => /^(transition|animation)/.test(d.prop) && /(?<![\w.-])\d*\.?\d+m?s\b/.test(noVars(d.value)),
  "opacity: 0, 1, a token, or an unlit bar (Colour and light)": d => d.prop === "opacity" && !/^(0|1|var\(--opacity-[a-z]+\)|var\(--off\))$/.test(d.value),
  "depth: a z-index is a named step": d => d.prop === "z-index" && !/^(auto|calc\(var\(--z-sticky\) \+ 1\)|var\(--z-[a-z]+\))$/.test(d.value),
  "text: wrap is pretty for paragraphs, balanced for headlines (Type)": d => d.prop === "text-wrap" && !((/pretty/.test(d.value) && d.sel === "p") || (/balance/.test(d.value) && /^(h1, h2, h3, h4|\.display|\.title|\.hof-plate)$/.test(d.sel))),
  "bridge: a rebuilt file reads no YPL Navy name": d => strict(d) && [...d.value.matchAll(/var\((--[\w-]+)/g)].some(m => BRIDGE.has(m[1])),
};

// ---------- deliberate exceptions, by rule and reason ----------
const C = "src/styles/components.css", P = "src/styles/pages.css", T = "src/styles/tokens.css";
const B = "src/styles/bracket.css", R = "src/styles/records.css", TB = "src/styles/team-builder.css";
const TYPES = ["normal: #9FA19F", "fire: #E62829", "water: #2980EF", "electric: #FAC000", "grass: #3FA129", "ice: #3FD8FF", "fighting: #FF8000", "poison: #9141CB", "ground: #915121",
  "flying: #81B9EF", "psychic: #EF4179", "bug: #91A119", "rock: #AFA981", "ghost: #704170", "dragon: #5060E1", "dark: #624D4E", "steel: #60A1B8", "fairy: #EF70EF"]
  .map(t => `${TB} | .type-${t.split(":")[0]} | --type:${t.split(":")[1]}`);
const EXCEPT = {
  "depth: a z-index is a named step": {
    "a stack orders itself: toasts by their place": ["src/components/common/Toaster.jsx | style | z-index: 10 - index"],
  },
  "opacity: 0, 1, a token, or an unlit bar (Colour and light)": {
    "the fourth toast in a stack leaves": ["src/components/common/Toaster.jsx | style | opacity: index > 2 && !item.out ? 0 : undefined"],
  },
  "colour: literals live only in tokens.css (Colour and light)": {
    "Pokémon type colours are content, not chrome": TYPES,
    "a video letterbox is black in both themes": ["src/styles/posts.css | .bd-yt | background: #000"],
  },
  "space: margin, padding and gap sit on the golden scale (Space)": {
    "a hairline: the screen-reader clip": [`${T} | .sr-only | margin: -1px`],
    "the bar ends on the page's edge by the icon's ink: half of 44 less 24": ["src/styles/shell.css | .iconbtn:last-child | margin-right: calc((var(--h-control) - 24px) / -2)"],
    "clears a fixed element by its size: a sprite, a checkbox, a status icon": [
      `${B} | .bk-award > .bk-chg-cnt | margin-left: 28px`,
      `${TB} | .tb-validation ul | margin: var(--s3) 0 0 44px`, `${TB} | .tb-more | margin: var(--s2) 0 0 44px`, `${TB} | .tb-official-meta | margin: var(--s5) 0 0 44px`,
      `${TB} | .tb-official-lookup | margin: var(--s5) 0 0 44px`, `${TB} | .tb-official-submit | margin: var(--s5) 0 0 44px`],
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

// ---------- the numbers, written once in DESIGN.md and once in tokens.css ----------
const DESIGN = src("DESIGN.md");
const hex = (theme, name) => {
  const prim = n => new RegExp(`--${n}:\\s*(#[0-9A-F]{6})`, "i").exec(TOKENS)?.[1];
  const block = theme === "dark" ? /:root \{\n  color-scheme: dark;([\s\S]*?)\n\}/.exec(TOKENS)[1] : /:root\[data-theme="light"\] \{([\s\S]*?)\n\}/.exec(TOKENS)[1];
  const v = new RegExp(`--${name}:\\s*([^;]+);`).exec(block)?.[1].trim();
  return /^var\(--([\w-]+)\)$/.test(v) ? prim(/^var\(--([\w-]+)\)$/.exec(v)[1]).toUpperCase() : v;
};
test("the colour table in DESIGN.md is tokens.css (Colour and light)", () => {
  const rows = [...DESIGN.matchAll(/^\| `--([\w-]+)` \| [^|]+ \| `?([#.\w]+)`? \| `?([#.\w]+)`? \|$/gm)];
  assert.ok(rows.length >= 9, "the table is still found");
  for (const [, name, dark, light] of rows) {
    assert.equal(hex("dark", name), dark.toUpperCase().replace(/^\.$/, ""), `--${name} dark`);
    assert.equal(hex("light", name), light.toUpperCase(), `--${name} light`);
  }
});
test("every word is AA on every surface, the lamp 3 or more, in both themes (Accessibility)", () => {
  const lum = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((s, c, i) => s + c * [.2126, .7152, .0722][i], 0);
  const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
  for (const theme of ["dark", "light"])
    for (const bg of ["ground", "panel", "panel-2"]) {
      for (const fg of ["lit", "dim", "mute"]) assert.ok(cr(hex(theme, fg), hex(theme, bg)) >= 4.5, `${theme} ${fg} on ${bg}`);
      assert.ok(cr(hex(theme, "signal"), hex(theme, bg)) >= 3, `${theme} lamp on ${bg}`);
    }
});
test("space and time step by the golden ratio (The golden law)", () => {
  const steps = pattern => [...TOKENS.matchAll(pattern)].map(m => +m[1]);
  const space = steps(/--s\d+:\s*(\d+)px/g), time = steps(/--t-[a-z]+:\s*(\d+)ms/g);
  assert.deepEqual(space, [4, 8, 12, 20, 32, 52, 84]);
  assert.deepEqual(time, [100, 160, 260, 420]);
  for (const scale of [space.slice(2), time]) scale.slice(1).forEach((v, i) => assert.ok(Math.abs(v / scale[i] - PHI) < .08, `${scale[i]} to ${v}`));
  assert.match(TOKENS, /--seam: 2px;/);
});
test("four type sizes, each line on the 4 grid (Type)", () => {
  const rem = n => +new RegExp(`--t${n}:\\s*([\\d.]+)rem`).exec(TOKENS)[1] * 16;
  assert.deepEqual([12, 15, 20, 32].map(rem), [12, 15, 20, 32]);
  const line = n => +new RegExp(`--l${n}:\\s*(\\d+)px`).exec(TOKENS)[1];
  for (const [n, l] of [[12, 16], [15, 20], [20, 28], [32, 40], ["-read", 24]]) { assert.equal(line(n), l); assert.equal(l % 4, 0); }
});
test("the heights: a strip, the touch floor, a row, a two-line row, a counter (The golden law)", () => {
  assert.match(TOKENS, /--h-strip: 32px; --h-control: 44px; --h-row: 52px; --h-row2: 64px; --h-counter: 84px;/);
  assert.match(TOKENS, /--nav-height: 56px; --tab-height: 64px; --admin-height: 40px;/);
});

// ---------- seven-segment displays ----------
test("a segment cell is real: h tall, h / phi wide, its unlit bars at --off (Seven-segment displays)", async () => {
  const { segCells, segWidth } = await import("../src/components/common/seg.js");
  const seg = src("src/components/common/Seg.jsx");
  assert.match(seg, /Math\.round\(h \/ PHI\)/, "width is height over phi");
  assert.match(seg, /w \* \.16/, "a bar is .16 of the width");
  assert.match(seg, /w \* \.32/, "cells stand .32 of the width apart");
  assert.match(seg, /className="off"/);
  assert.match(TOKENS, /\.seg \.off \{ opacity: var\(--off\); \}/);
  assert.deepEqual(segCells("6.5", 2), ["6", "5"], "no decimal point in segments: whole numbers only");
  assert.deepEqual(segCells(6, 2), [" ", "6"], "a total leaves its unused leading cells dark");
  assert.deepEqual(segCells("05", 2), ["0", "5"], "a countdown lights its leading zero");
  assert.deepEqual(segCells("13:00", 4), ["1", "3", ":", "0", "0"], "a clock is four cells and a dot cell");
  assert.equal(segWidth(40, 2), 25 * 2 + 8);
});
test("a display is never under 32 and stands on the segment scale (Seven-segment displays)", () => {
  const sizes = new Set(["32", "40", "84", "120", "240"]);
  const hits = SRC.flatMap(f => [...read(f).matchAll(/<Seg\b[^>]*?\bh=\{(\d+)\}/g)].filter(m => !sizes.has(m[1])).map(m => `${rel(f)}: ${m[1]}`));
  assert.deepEqual(hits, []);
});

// ---------- lamps, bars ----------
test("a lamp is an 8px square that never blinks or moves (Lamps)", () => {
  assert.match(TOKENS, /--lamp: 8px;/);
  const lamp = DECLS.filter(d => /(^|[\s,])\.(lamp|live-dot|ypl-ping)\b/.test(d.sel));
  assert.ok(lamp.length > 0);
  assert.deepEqual(lamp.filter(d => /^(animation|transition|border-radius)/.test(d.prop)).map(keyOf), []);
});
test("the bars stand still: nothing moves the top bar or the tab bar (Bars and navigation)", () => {
  const bars = DECLS.filter(d => /^\.(topbar|tabbar)\b/.test(d.sel));
  assert.ok(bars.length > 0);
  assert.deepEqual(bars.filter(d => /^(transition|animation|translate|transform)$/.test(d.prop)).map(keyOf), []);
  assert.doesNotMatch(src("src/components/layout/Navigation.jsx"), /pill|animate/, "the chosen tab's line switches on in place");
});
test("dark is the first visit; a chosen theme is stored and set before the first paint (Colour and light)", () => {
  assert.match(src("index.html"), /localStorage\.getItem\("ypl-theme"\)[\s\S]*?t==="light"/);
  assert.match(src("src/App.jsx"), /localStorage\.getItem\("ypl-theme"\)!=="light"/);
});

// ---------- voice ----------
test("a sentence ends with a period wherever it stands: headline, empty state, error or toast (Voice and tone)", () => {
  const close = /(니다|세요|에요|예요|해요|돼요|네요)\s*$/;
  const hits = SRC.flatMap(f => read(f).split("\n").flatMap((l, i) => /^\s*(\/\/|\/?\*)/.test(l) ? []
    : [...l.matchAll(/"([^"\n]*[가-힣][^"\n]*)"|`([^`\n]*[가-힣][^`\n]*)`|>([^<>{}\n]*[가-힣][^<>{}\n]*)</g)]
      .map(m => m[1] ?? m[2] ?? m[3]).filter(t => close.test(t)).map(t => `${rel(f)}:${i + 1}: ${t}`)));
  assert.deepEqual(hits, [], "end it with a period");
});
test("Korean copy has no middle dot separators (Voice and tone)", () => {
  const hits = SRC.flatMap(f => read(f).split("\n").map((l, i) => ({ l, at: `${rel(f)}:${i + 1}` })))
    .filter(({ l }) => l.includes("·") && !/^\s*(\/\/|\/?\*)/.test(l) && !/\/[^/\n]*·[^/\n]*\/[gimsuy]*/.test(l)); // a regex that strips dots is fine
  assert.deepEqual(hits.map(h => h.at), []);
});

// ---------- motion ----------
// A new thing that moves is one of the verbs. These files are where the verbs that need the finger or a measurement live.
const ANIMATES = new Set(["src/components/common/motion.js", "src/components/common/Modal.jsx", "src/components/common/Menu.jsx", "src/components/common/Dropdown.jsx",
  "src/components/common/Toaster.jsx", "src/components/common/StandTable.jsx"]);
test("pages move through the verbs of motion.js, never their own .animate() (Motion)", () => {
  assert.deepEqual(SRC.filter(f => /\.animate\(/.test(read(f)) && !ANIMATES.has(rel(f))).map(rel), []);
});
test("keyframes are a closed list: a new one needs a new verb in DESIGN.md (Motion)", () => {
  const names = CSS.flatMap(f => [...read(join(STYLES, f)).matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1])).sort();
  assert.deepEqual(names, ["bk-land", "dd-in", "row-rise", "y-fade", "y-pop", "y-pulse", "y-rise", "y-spin", "y-swap"]);
});
test("script animations take their durations from DUR (Motion)", () => {
  const hits = SRC.flatMap(f => [...read(f).matchAll(/\.animate\([^;]*?duration:\s*(\d+)/g)].filter(m => +m[1] > 0).map(m => `${rel(f)}: ${m[1]}`));
  assert.deepEqual(hits, []);
});
test("scripted animations move transform and opacity only (Motion)", () => {
  const hits = SRC.flatMap(f => [...read(f).matchAll(/\.animate\(\s*\[[^\]]*\]/g)].filter(([m]) => /\b(filter|clipPath|backgroundPosition|boxShadow|width|height)\s*:/.test(m)).map(([m]) => `${rel(f)}: ${m.slice(0, 80)}`));
  assert.deepEqual(hits, [], "move it by transform and opacity, or give it a still picture to move");
});
test("css keyframes move transform and opacity only (Motion)", () => {
  const css = CSS.map(f => read(join(STYLES, f))).join("\n");
  const blocks = [...css.matchAll(/@keyframes ([\w-]+) \{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)].map(([, name, body]) => ({ name, props: [...body.matchAll(/([\w-]+)\s*:/g)].map(m => m[1]) }));
  const LOCAL = { "row-rise": "one row, once, when a ranking changes", "bk-land": "one bracket slot in the draw ceremony" };
  assert.ok(blocks.length > 6);
  assert.deepEqual(blocks.filter(b => !LOCAL[b.name] && b.props.some(p => !["transform", "opacity"].includes(p))).map(b => `${b.name}: ${b.props}`), []);
});
test("a page change copies nothing and flies nothing; there is no burst (Motion)", () => {
  const motion = src("src/components/common/motion.js");
  assert.doesNotMatch(motion, /cloneNode|"ghost"|celebrate|placePill/);
  assert.doesNotMatch(TOKENS, /@property --(stage|surface|fg)\b/);
});
test("no View Transitions snapshots (Don't)", () => {
  const hits = [...SRC, ...CSS.map(f => join(STYLES, f))].filter(f => /startViewTransition|view-transition/.test(read(f)));
  assert.deepEqual(hits.map(rel), []);
});

// ---------- the eye and the shared parts ----------
test("the middle is measured by ink: text from the font's baseline, a sprite from its own pixels (The eye)", () => {
  assert.match(TOKENS, /ascent-override: 97%; descent-override: 25%;/, "without it text rides above the middle of its box");
  assert.match(src("src/main.jsx"), /centreInk\(e\.target\)/, "every sprite stands on its ink");
});
test("icons stand on three sizes: 16, 20, 24 (Icons)", () => {
  const hits = SRC.flatMap(f => [...read(f).matchAll(/<Icon [^>]*?size=\{(\d+)\}/g)].filter(m => !["16", "20", "24"].includes(m[1])).map(m => `${rel(f)}: ${m[1]}`));
  assert.deepEqual(hits, []);
  assert.match(src("src/components/common/Icon.jsx"), /viewBox="0 0 24 24"[\s\S]*strokeWidth="1\.5" strokeLinecap="square" strokeLinejoin="miter"/, "drawn on a 24 grid");
});
test("icons only say what words cannot: no decorative icons on pages (Icons)", () => {
  const files = [...readdirSync(join(ROOT, "src/pages")).map(f => `src/pages/${f}`), "src/components/layout/SiteFooter.jsx"];
  const hits = files.flatMap(f => [...src(f).matchAll(/<Icon n="(crown|medal|chart|trophy|discord|msg|list)"/g)].map(m => `${f}: ${m[1]}`));
  assert.deepEqual(hits, []);
});
test("three breakpoints: 640, 860, 1100 (Layout)", () => {
  const css = CSS.map(f => read(join(STYLES, f))).join("\n");
  const widths = [...new Set([...css.matchAll(/\((?:min|max)-width:\s*(\d+)px\)/g)].map(m => +m[1]))];
  assert.deepEqual(widths.filter(w => ![639, 640, 859, 860, 1099, 1100].includes(w)), []);
});
test("the touch floor raises a control but never lowers a field or a row (Accessibility)", () => {
  const floor = DECLS.filter(d => d.file === C && d.prop === "min-height" && d.value === "var(--target)" && d.sel.includes(".ypl button"));
  assert.ok(floor.length > 0, "the touch floor is still there");
  assert.deepEqual(floor.filter(d => !d.sel.startsWith(":where(")).map(keyOf), [], "the floor's height must carry no weight (:where)");
});
test("every sheet closes the same way: the X is not tied to a title (Sheets, dialogs, toasts)", () => {
  assert.doesNotMatch(src("src/components/common/Modal.jsx"), /title !== undefined && <>\s*<button type="button" className="modal-x/);
});
test("a generation is written one way: 1대, never 초대 (Voice and tone)", async () => {
  const { generationText } = await import("../src/services/seasonLabel.js");
  assert.equal(generationText("초대"), "1대");
  assert.equal(generationText("초대 챔피언"), "1대");
  assert.equal(generationText("6대 챔피언"), "6대");
  for (const f of ["src/pages/TitlesPage.jsx", "src/pages/ChampionsPage.jsx", "src/pages/RecordsPage.jsx"])
    assert.match(src(f), /generationText/, `${f} shows generations through generationText`);
});
test("one button: every button that is a button comes from Button.jsx (Controls)", () => {
  const hits = SRC.filter(f => !f.endsWith("Button.jsx")).flatMap(f => [...read(f).matchAll(/className=["{][^>\n]*\b(ypl-btn|btn-primary|btn-ghost|btn-danger)\b/g)].map(m => `${rel(f)}: ${m[1]}`));
  assert.deepEqual(hits, []);
});
test("inline space is a token (Space)", () => {
  const hits = SRC.flatMap(f => [...read(f).matchAll(/style=\{\{([^{}]*)\}\}/g)].filter(([, b]) => /\b(margin\w*|padding\w*|gap)\s*:\s*-?[1-9]/.test(b)).map(([m]) => `${rel(f)}: ${m.slice(0, 60)}`));
  assert.deepEqual(hits, []);
});
test("saved images stand on the type scale (Type)", () => {
  const sizes = new Set(["12", "13", "15", "16", "20", "32", "52", "84", "136"]); // ponytail: 13 16 52 84 136 are YPL Navy's, until the bracket and sheet images are rebuilt
  for (const f of ["src/pages/BracketsPage.jsx", "src/components/teamSheetImage.js"]) {
    const fonts = [...src(f).matchAll(/ctx\.font\s*=\s*`([^`]*)`/g)].map(m => m[1]);
    assert.ok(fonts.length > 8, f);
    assert.deepEqual(fonts.filter(x => /\b800\b/.test(x)), [], "weights 400 600 700");
    assert.deepEqual(fonts.filter(x => !sizes.has((/ (\d+(?:\.\d+)?)px/.exec(x) || [])[1])).filter(x => / \d/.test(x)), [], "a size on the scale");
  }
});

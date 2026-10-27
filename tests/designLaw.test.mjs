// The YPL Glass design law (DESIGN.md) as a test. Every CSS declaration in src/styles and every inline style={{}} in src
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
const SPACE = new Set([0, 80, 120, ...[...TOKENS.matchAll(/--s\d+:\s*(\d+)px/g)].map(m => +m[1])]); // --s1..--s14, --chapter 80/120
const SIZES = new Set([12, 13, 15, 16, 17, 20, 24, 28]);
const WEIGHTS = new Set(["400", "600", "700", "800"]);
// tracking follows size (one curve): none up to 18px, then tighter as type grows; YPL Figures stand at 0
const TRACK = new Set(["0", "inherit", "-.015em", "-.02em", "-.03em", "-.04em"]);
const trackFor = px => px <= 18 ? "0" : px < 24 ? "-.015em" : px <= 28 ? "-.02em" : "-.03em";
const LEADING = new Set(["1", "1.06", "1.15", "1.25", "1.35", "1.45", "1.55", "1.8", "inherit", "1.15em"]);
const RADII = new Set([0, 12, 20, 24, 32, 36, 999]); // tile, textarea, list row, card, hero, pill

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
function chromatic(v) {
  const hex = [...v.matchAll(/#([0-9a-f]{3,8})\b/gi)].map(([, h]) => h.length < 6 ? [...h.slice(0, 3)].map(c => parseInt(c + c, 16)) : [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)));
  const rgb = [...v.matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/g)].map(m => m.slice(1).map(Number));
  return /\b(hsla?|hwb|lab|lch|oklab|oklch)\(|\b(red|green|blue)\b/i.test(v) || [...hex, ...rgb].some(([r, g, b]) => r !== g || g !== b);
}

// ---------- the law: each rule names its DESIGN.md section ----------
const RULES = {
  "color: literals live only in tokens.css (Color)": d => d.file !== "src/styles/tokens.css" && !/mask/.test(d.prop) && COLOR.test(d.value),
  "color: achromatic only (Color B1-B5)": d => chromatic(d.value),
  "space: margin, padding and gap sit on the 4px scale (Space and radius)": d => /^(margin|padding|gap|row-gap|column-gap)(-|$)/.test(d.prop) && pxs(d.value).some(n => !SPACE.has(n)),
  "type: sizes 12 13 15 16 17 20 24 28, title and display (Type)": d => d.prop === "font-size" && !/^(inherit|var\(--[\w-]+\))$/.test(d.value) && !(/^-?\d*\.?\d+(rem|px)$/.test(d.value) && SIZES.has(parseFloat(d.value) * (d.value.endsWith("rem") ? 16 : 1))),
  "type: weights 400 600 700 800 (Type)": d => d.prop === "font-weight" && !fontFace(d) && !WEIGHTS.has(d.value) && !/^(inherit|var\()/.test(d.value),
  "type: 700 only for headlines of 20px and up; rows, labels and buttons are 600 (Type)": d => d.prop === "font-weight" && d.value === "700" && !((sizePx(sib(d, "font-size")) ?? 0) >= 20),
  "type: tracking follows size, none up to 18px (Type)": d => d.prop === "letter-spacing" && (!TRACK.has(d.value)
    || (sizePx(sib(d, "font-size")) !== null && !/fig/.test(d.sel) && trackFor(sizePx(sib(d, "font-size"))) !== d.value)),
  "type: line-heights on one set (Type)": d => d.prop === "line-height" && !LEADING.has(d.value),
  "type: big figures sit on the --fig scale, 28px and up (Type)": d => d.prop === "font-size" && /\.(fig|rc-poster-num|bk-draw-cnt)(?![\w-])/.test(d.sel) && !/^var\(--fig-[sml]\)$/.test(d.value),
  // YPL Figures belongs to the brand (the wordmark and its own text); a page's numbers are SUIT (2026-10-27)
  "type: one face, SUIT; YPL Figures only with the brand (Type)": d => d.prop === "font-family" && !fontFace(d) && !/^(inherit|var\(--font\))$/.test(d.value),
  "type: no uppercase label (Type, Don't)": d => d.prop === "text-transform" && d.value === "uppercase",
  "type: copy wraps only at its container's edge, never at a ch or em measure (Type)": d => /^max-(width|inline-size)$/.test(d.prop) && /\d(ch|r?em)\b/.test(d.value),
  "align: left by default, centre only for the four cases (Alignment)": d => d.prop === "text-align" && d.value === "center",
  "align: right only for trailing values and number columns (Alignment)": d => d.prop === "text-align" && /right|end/.test(d.value),
  "radius: hero 36, card 32, row 24, textarea 20, tile 12, pill (Space and radius)": d => /radius/.test(d.prop) && !d.prop.startsWith("--") && pxs(d.value).some(n => !RADII.has(n)),
  "glass: blur only in the glass recipes (Stage and material)": d => /backdrop-filter$/.test(d.prop) && !d.value.startsWith("none") && d.file !== "src/styles/tokens.css",
  "motion: easing only through --ease-* and --spring-* (Motion)": d => /^(transition|animation)/.test(d.prop) && /cubic-bezier|\blinear\(|steps\(|\bease(-in|-out|-in-out)?\b/.test(noVars(d.value)),
  // a spring curve stretched or squeezed feels like a different spring (2026-10-27: 400, 460, 480, 520 and 560ms snappy were all in use)
  "motion: a spring runs at its natural length, var(--dur-snappy) or var(--dur-soft) (Motion)": d => /^(transition|animation)/.test(d.prop)
    && [...d.value.matchAll(/(\S+)\s+var\(--spring-(snappy|soft)\)/g)].some(([, dur, kind]) => dur !== `var(--dur-${kind})`),
  // body copy runs to its container's edge (2026-10-16); only headlines and a caption under a picture may balance their lines
  "type: body copy never breaks early; balance only on headlines (Type)": d => d.prop === "text-wrap"
    && (/pretty/.test(d.value) || (/balance/.test(d.value) && !/^(h1, h2, h3, h4|\.display|\.title|\.hof-plate)$/.test(d.sel))),
};

// ---------- deliberate exceptions, by rule and reason ----------
const C = "src/styles/components.css", P = "src/styles/pages.css", S = "src/styles/shell.css", T = "src/styles/tokens.css";
const B = "src/styles/bracket.css", K = "src/styles/calculator.css", R = "src/styles/records.css", TB = "src/styles/team-builder.css", A = "src/styles/admin.css";
const TYPES = ["normal: #9FA19F", "fire: #E62829", "water: #2980EF", "electric: #FAC000", "grass: #3FA129", "ice: #3FD8FF", "fighting: #FF8000", "poison: #9141CB", "ground: #915121",
  "flying: #81B9EF", "psychic: #EF4179", "bug: #91A119", "rock: #AFA981", "ghost: #704170", "dragon: #5060E1", "dark: #624D4E", "steel: #60A1B8", "fairy: #EF70EF"]
  .map(t => `${TB} | .type-${t.split(":")[0]} | --type:${t.split(":")[1]}`);
const EXCEPT = {
  "color: literals live only in tokens.css (Color)": {
    "Pokémon type colours are content, not chrome": TYPES,
    "the sheet's opaque fallback is set beside the sheet": [`${C} | .sheet | --sheet-solid: #181818`, `${C} | :root[data-theme="light"] .sheet | --sheet-solid: #F7F7F7`],
    "a video letterbox is black in both themes": [`${P} | .bd-yt | background: #000`],
  },
  "color: achromatic only (Color B1-B5)": {
    "Pokémon type colours are content, not chrome": TYPES,
  },
  "space: margin, padding and gap sit on the 4px scale (Space and radius)": {
    "a hairline: the rim mask and the screen-reader clip": [
      `${C} | :is(.ypl-btn--glass, .ypl-btn--tonal, .btn:not(.btn-primary):not(.btn-danger):not(.tb-main-btn), .ann-link, .ann-submit)::before | padding: 1px`,
      `${T} | .glass::before, .glass-l3::before, .card::before | padding: 1px`, `${T} | .glint > b | padding: 1px`, `${T} | .sr-only | margin: -1px`],
    "clears a fixed element by its size: the bars, a field's icon, the sheet's close button, a sprite, a checkbox, a status icon": [
      `${S} | .page | padding-block: calc(env(safe-area-inset-top, 0px) + 92px) calc(env(safe-area-inset-bottom, 0px) + 116px)`, `${S} | .page | padding-block: 112px 96px`,
      `${S} | .site-foot-in | padding: var(--s14) 0 calc(env(safe-area-inset-bottom, 0px) + 112px)`, `${S} | .is-admin .site-foot-in | padding-bottom: 104px`,
      `${C} | .lsearch input, .records-search-field input, .tb-search-row input | padding-left: 48px`, `${C} | .lsearch input, .records-search-field input, .tb-search-row input | padding-right: 48px`,
      `${C} | .modal > h3 | padding-right: 52px`, `${TB} | .tb-slot:not(.empty) | padding-top: 48px`, `${B} | .bk-award > .bk-chg-cnt | margin-left: 28px`,
      `${TB} | .tb-validation ul | margin: var(--s3) 0 0 44px`, `${TB} | .tb-more | margin: var(--s2) 0 0 44px`, `${TB} | .tb-official-meta | margin: var(--s4) 0 0 44px`,
      `${TB} | .tb-official-lookup | margin: var(--s4) 0 0 44px`, `${TB} | .tb-official-submit | margin: var(--s4) 0 0 44px`],
    "concentric inset: inner radius = outer radius - padding": [
      `${S} | .topbar | padding: 0 6px`, `${S} | .admin-dock | padding: 0 6px 0 var(--s5)`, `${C} | .dd-menu | padding: 6px`, `${C} | .popover | padding: 6px`, `${K} | .calc-stepper button | margin: 2px`],
  },
  "type: sizes 12 13 15 16 17 20 24 28, title and display (Type)": {
    "the title step (28-36) itself and its copies": [`${T} | .title | font-size: clamp(1.75rem, 1.5rem + 1vw, 2.25rem)`, `${TB} | .tb-editor-title h2 | font-size: 2.25rem`],
    "an article body reads at 18px on desktop (Pages)": [`${P} | .prose p | font-size: 1.125rem`],
  },
  "type: copy wraps only at its container's edge, never at a ch or em measure (Type)": {
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
      `${R} | .records-party-sprite-fallback | text-align: center`, `${A} | .ed-head | text-align: center`],
    "(c) a caption under its picture": [`${K} | .calc-versus-mon | text-align: center`],
    "(d) a symmetric stage": [`${P} | .ha | text-align: center`, `${P} | .hof-stage | text-align: center`, `${P} | .hof-stage-who, .hofm-top | text-align: center`, `${P} | .hof-plate | text-align: center`],
  },
  "align: right only for trailing values and number columns (Alignment)": {
    "a trailing value or a number column": [`${K} | .calc-hp b | text-align: right`, `${K} | .calc-base-row b | text-align: right`, `${K} | .calc-base-row small | text-align: right`,
      `${K} | .calc-table .num | text-align: right`, `${C} | .ypl-table .r | text-align: right`, `${R} | .rc-facts.rows dd | text-align: right`,
      `${P} | .sc-stat strong | text-align: right`, `${P} | .sc-stat-h > span:last-child | text-align: right`, `${P} | .sc-sp em | text-align: right`],
  },
  "radius: hero 36, card 32, row 24, textarea 20, tile 12, pill (Space and radius)": {
    "concentric: a menu row inside a 24px menu with 6px padding": [`${C} | .dd-opt | border-radius: 18px`, `${C} | .popover .mi | border-radius: 18px`],
    "a bracket connector's bend, a line rather than a surface": [`${B} | .bk-col2:not(:last-child) .bk-mpos:nth-child(odd)::after | border-top-right-radius: 8px`,
      `${B} | .bk-col2:not(:last-child) .bk-mpos:nth-child(even)::after | border-bottom-right-radius: 8px`],
    "concentric: a match card holds 12px slots with 4px padding; the champion cell takes the card's shape": [`${B} | .bk-match | border-radius: 16px`, `${B} | .bk-champ-node | border-radius: 16px`],
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
  const hits = SRC.flatMap(f => [...read(f).matchAll(/\{[^{}]*springs\(\)\.(snappy|soft)[^{}]*\}/g)]
    .filter(([obj, kind]) => !obj.includes(`DUR.${kind}`)).map(([obj]) => `${rel(f)}: ${obj}`));
  assert.deepEqual(hits, [], "use { duration: DUR.snappy | DUR.soft } with springs()");
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

test("a list row is 60 everywhere, from one token (law 3)", () => {
  assert.match(TOKENS, /--row-min:\s*60px/);
  for (const sel of [".ypl-row", ".nb-item", ".bd-head", ".pick-row"]) assert.deepEqual(decl(sel, "min-height"), ["var(--row-min)"], sel);
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
  const want = sel => /:hover/.test(sel) ? "var(--tint-soft)" : /focus-visible|\.cursor/.test(sel) ? "var(--tint-strong)" : /\.(on|sel)\b/.test(sel) ? "var(--tint)" : null;
  assert.ok(rows.length >= 9);
  assert.deepEqual(rows.filter(d => want(d.sel) && d.value !== want(d.sel)).map(keyOf), []);
  assert.deepEqual(decl(".dd-opt.sel", "font-weight"), [], "an option keeps its weight when chosen");
});

test("an X is drawn at its circle's scale: 18, 14 or 12 (law 6)", () => {
  const STATUS = "src/pages/TeamBuilderPage.jsx: 15"; // the validation panel's status sign beside its check and alert, not a close
  const hits = SRC.flatMap(f => [...read(f).matchAll(/<Icon n="x" size=\{(\d+)\}/g)].filter(m => !["12", "14", "18"].includes(m[1])).map(m => `${rel(f)}: ${m[1]}`));
  assert.deepEqual(hits, [STATUS]);
});

test("an explanatory sentence reads in one grey (law 4)", () => {
  for (const sel of [".bk-hint, .hint", ".callout", ".dd-none"]) assert.deepEqual(decl(sel, "color"), ["var(--fg-2)"], sel);
  assert.deepEqual(decl(".modal > .hint", "color"), [], "a sheet's hint takes the shared grey");
});

test("no View Transitions snapshots (Don't)", () => {
  const hits = [...SRC, ...readdirSync(STYLES).map(f => join(STYLES, f))].filter(f => /startViewTransition|view-transition/.test(read(f)));
  assert.deepEqual(hits.map(rel), []);
});

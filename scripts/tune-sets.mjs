// The sample sets of the current regulation (M-C, singles and doubles) are the ladder's own sets (src/data/random-sets.ladder.json,
// built by scripts/build-random-sets.mjs) with their stat points spent by targets instead of by habit. Moves, item, ability, nature
// and Speed stay as the top of the ladder brings them; the other points are spent again:
//
//   attack: never more than the ladder's; the least of it that keeps every KO the ladder's own investment gets on the 20 most
//   used threats at rating 1760+ (each on the set the ladder plays it with), counted as the fewest hits at the lowest and the
//   highest roll, at full HP and after a quarter of chip;
//   the rest: a point at a time to HP or to the defences the ladder built (both, when it built neither), wherever it adds most
//   hits survived against those threats' strongest attacks, weighted by how often they are brought.
//
// Damage is Showdown's calculator (@smogon/calc) on Champions mechanics: level 50, stat points (32 a stat, 66 in all, one point
// one stat point). Why not more: redesigning moves, items and Speed from a one-on-one damage model was tried first (2026-11-12) and
// lost to the ladder's sets in real games, 34.5% and 46.3% over 400 games each (scripts/sets-benchmark.mjs, docs/SAMPLE_SETS.md);
// these spreads scored 50.0% ± 4.4, as strong, and every point now has a stated reason (docs/sample-sets/).
//
//   STATS_CACHE=<dir> node scripts/tune-sets.mjs [--kind singles|doubles] [--lanes 8]
//   (the 2026-10 chaos files of gen9championsbssregmc and gen9championsvgc2026regmc, -1760 and -0, in <dir>), then
//   node scripts/render-sample-sets.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fork } from "node:child_process";
import { cpus } from "node:os";
import { fileURLToPath } from "node:url";
import { Dex, toID } from "@pkmn/sim";
import * as champions from "@pkmn/mods/champions";
import { calculate, Field, Generations, Move, Pokemon } from "@smogon/calc";
import { validateTeam, formatId } from "../supabase/functions/battle/engine.mjs";
import { KO } from "../src/data/teamBuilderLocalization.js";

const ROOT = new URL("../", import.meta.url);
const LADDER_FILE = new URL("src/data/random-sets.ladder.json", ROOT);
const OUT_FILE = new URL("src/data/random-sets.json", ROOT);
const NOTES_DIR = new URL("docs/sample-sets/", ROOT);
const REG = "m-c", MONTH = "2026-10", THREATS = 20;
const CHAOS = { singles: "gen9championsbssregmc", doubles: "gen9championsvgc2026regmc" };
const STATS = ["hp", "atk", "def", "spa", "spd", "spe"];
const argv = process.argv.slice(2);
const args = Object.fromEntries(argv.map((a, i) => (a.startsWith("--") ? [a.slice(2), argv[i + 1]?.startsWith("--") ? true : argv[i + 1] ?? true] : null)).filter(Boolean));
const dex = Dex.mod("champions", champions);
const gen = Generations.get(0);

/* ---------- the ladder ---------- */
const top = map => Object.entries(map || {}).sort((a, b) => b[1] - a[1]);
function chaos(kind, cutoff) {
  if (!process.env.STATS_CACHE) throw new Error("STATS_CACHE: the folder with the chaos files");
  return JSON.parse(readFileSync(`${process.env.STATS_CACHE}/${MONTH}_chaos_${CHAOS[kind]}-${cutoff}.json`, "utf8")).data;
}
// each species' entry, 1760+ where it has one: usage, teammates and its most played set
function evidence(kind) {
  const high = chaos(kind, 1760), out = new Map();
  for (const [name, e] of Object.entries(chaos(kind, 0))) out.set(toID(name), { name, e, rated: false });
  for (const [name, e] of Object.entries(high)) out.set(toID(name), { name, e, rated: true });
  return { high, map: out };
}
const asSet = (species, form, ability, item, nature, evs, moves) =>
  ({ species, form, ability, battleAbility: form !== species ? dex.species.get(form).abilities[0] : ability, item, nature, evs, moves });
function threatsOf(ev) {
  const list = [];
  for (const [name, e] of top(Object.fromEntries(Object.entries(ev.high).map(([n, x]) => [n, x.usage])))) {
    if (list.length >= THREATS) break;
    const sp = dex.species.get(name), v = ev.map.get(toID(name)).e;
    if (!sp.exists) continue;
    const item = sp.isMega ? dex.items.all().find(i => i.megaStone && Object.values(i.megaStone).includes(sp.name))?.name : dex.items.get(top(v.Items)[0]?.[0]).name;
    if (!item) continue;
    const [nature, points] = top(v.Spreads)[0][0].split(":");
    const evs = Object.fromEntries(STATS.map((s, i) => [s, Number(points.split("/")[i]) || 0]));
    const moves = top(v.Moves).filter(([m]) => m).slice(0, 4).map(([m]) => dex.moves.get(m).name);
    list.push({ name, usage: e, set: asSet(sp.isMega ? sp.baseSpecies : sp.name, sp.name, dex.abilities.get(top(v.Abilities)[0][0]).name, item, nature, evs, moves) });
  }
  const total = list.reduce((s, t) => s + t.usage, 0);
  for (const t of list) t.weight = t.usage / total;
  return list;
}

/* ---------- damage ---------- */
// the calculator's own name for a forme (Aegislash attacks as Blade and takes hits as Shield), or the base with the forme's numbers
function calcMon(set) {
  const options = { level: 50, ability: set.battleAbility, item: set.item, nature: set.nature, evs: set.evs };
  if (set.form === "Aegislash") return new Pokemon(gen, "Aegislash-Both", options);
  if (gen.species.get(toID(set.form))) return new Pokemon(gen, set.form, options);
  const sp = dex.species.get(set.form);
  return new Pokemon(gen, sp.baseSpecies, { ...options, overrides: { baseStats: sp.baseStats, types: sp.types } });
}
// an attack that reads the user's own attacking stat (not Body Press or Foul Play, not fixed damage, not a two-turn or recharge move)
const attack = m => {
  const x = dex.moves.get(m);
  return x.category !== "Status" && x.basePower > 0 && !x.overrideOffensiveStat && !x.overrideOffensivePokemon && !(x.flags.charge && x.id !== "solarbeam") && !x.flags.recharge && !x.selfdestruct;
};
const RANGE = new Map();
function hit(att, def, move, doubles) {
  const key = JSON.stringify([att.form, att.battleAbility, att.item, att.nature, att.evs, def.form, def.battleAbility, def.item, def.nature, def.evs, move, doubles]);
  if (RANGE.has(key)) return RANGE.get(key);
  let out = null;
  try {
    const D = calcMon(def);
    const r = calculate(gen, calcMon(att), D, new Move(gen, move), new Field({ gameType: doubles ? "Doubles" : "Singles" }));
    let dmg = r.damage;
    if (Array.isArray(dmg) && Array.isArray(dmg[0])) dmg = dmg[0].map((_, i) => dmg.reduce((s, h) => s + h[i], 0));
    const rolls = Array.isArray(dmg) ? dmg : [dmg || 0];
    const max = Math.max(...rolls);
    if (max) {
      const ko = r.kochance(false);
      out = { move, min: Math.min(...rolls), max, mean: rolls.reduce((a, b) => a + b, 0) / rolls.length, hp: D.maxHP(), n: ko.n || 9, chance: ko.chance ?? 1 };
    }
  } catch {}
  if (RANGE.size > 300000) RANGE.clear();
  RANGE.set(key, out);
  return out;
}
// the strongest hit of a set on another: the fewest hits to KO, then the most damage
const bestHit = (att, def, doubles) => att.moves.filter(m => dex.moves.get(m).category !== "Status").map(m => hit(att, def, m, doubles)).filter(Boolean)
  .sort((a, b) => a.n - b.n || b.max - a.max)[0] || null;

/* ---------- the spread ---------- */
function tune(set, threats, doubles) {
  const base = dex.species.get(set.form).baseStats;
  const used = [...new Set(set.moves.filter(attack).map(m => (dex.moves.get(m).category === "Physical" ? "atk" : "spa")))];
  const signature = s => threats.map(t => {
    let a = 99, b = 99, c = 99, d = 99;
    for (const m of s.moves.filter(attack)) {
      const r = hit(s, t.set, m, doubles);
      if (!r) continue;
      a = Math.min(a, Math.ceil(r.hp / Math.max(1, r.min))); b = Math.min(b, Math.ceil(r.hp / r.max));
      c = Math.min(c, Math.ceil(r.hp * 0.75 / Math.max(1, r.min))); d = Math.min(d, Math.ceil(r.hp * 0.75 / r.max));
    }
    return `${a}.${b}.${c}.${d}`;
  }).join();
  // Speed stays, and so does Defence when it is an attack (Body Press)
  const pressDef = set.moves.some(m => dex.moves.get(m).overrideOffensiveStat === "def") ? set.evs.def || 0 : 0;
  const draft = { ...set, evs: { hp: 0, atk: 0, def: pressDef, spa: 0, spd: 0, spe: set.evs.spe || 0 } };
  let left = 66 - draft.evs.spe - pressDef;
  // never more than the ladder put in (a wall stays a wall): only points that change no KO come out
  for (const st of used) {
    const cap = Math.min(set.evs[st] || 0, left);
    const want = signature({ ...draft, evs: { ...draft.evs, [st]: cap } });
    let lo = 0, hi = cap;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (signature({ ...draft, evs: { ...draft.evs, [st]: mid } }) === want) hi = mid; else lo = mid + 1; }
    draft.evs[st] = lo; left -= lo;
  }
  // bulk: each threat's strongest attack on the set with no bulk, scaled by HP and the defending stat (damage goes as 1 / defence)
  const n = dex.natures.get(set.nature);
  const stat = (st, sp) => Math.floor((base[st] + sp + 20) * (n.plus === st ? 1.1 : n.minus === st ? 0.9 : 1));
  const zero = { ...draft, evs: { ...draft.evs } };
  const hits = threats.map(t => {
    let best = null;
    for (const m of t.set.moves) {
      const r = dex.moves.get(m).category !== "Status" && hit(t.set, zero, m, doubles);
      if (r && (!best || r.mean > best.mean)) best = { mean: r.mean, st: dex.moves.get(m).category === "Physical" ? "def" : "spd" };
    }
    return best && { ...best, w: t.weight, at: stat(best.st, 0) };
  }).filter(Boolean);
  const hp0 = base.hp + 75;
  const value = e => hits.reduce((v, h) => v + h.w * Math.min(5, (hp0 + e.hp) / (h.mean * h.at / stat(h.st, e[h.st]))), 0);
  // the defences the ladder chose to build (or both, when it built neither) take the points; HP always may
  const sides = ["def", "spd"].filter(st => (set.evs[st] || 0) >= 4);
  const room = ["hp", ...(sides.length ? sides : ["def", "spd"])];
  for (; left > 0; left--) {
    let pick = null, pv = -1;
    for (const st of room) {
      if (draft.evs[st] >= 32) continue;
      const v = value({ ...draft.evs, [st]: draft.evs[st] + 1 });
      if (v > pv) { pv = v; pick = st; }
    }
    if (!pick) break;
    draft.evs[pick]++;
  }
  // what is left (every room full) goes back where the ladder had it
  for (const st of [...used, "def", "spd"]) { const add = Math.min((st === "def" || st === "spd" ? 32 : set.evs[st] || 0) - draft.evs[st], left); if (add > 0) { draft.evs[st] += add; left -= add; } }
  return draft.evs;
}

// KOs won and lost by a new spread against the threats, both ways, weighted by how often each threat is brought
function koDelta(old, now, threats, doubles) {
  let d = 0;
  for (const t of threats) {
    const [mo, mn, to, tn] = [bestHit(old, t.set, doubles), bestHit(now, t.set, doubles), bestHit(t.set, old, doubles), bestHit(t.set, now, doubles)];
    if (mo && mn) d += t.weight * Math.sign(mo.n - mn.n);
    if (to && tn) d += t.weight * Math.sign(tn.n - to.n);
  }
  return d;
}

/* ---------- notes ---------- */
const NAMES = JSON.parse(readFileSync(new URL("src/data/champions-data.json", ROOT), "utf8")).speciesNames.koreanByEnglish;
const FORME = { Mega: "메가", "Mega-X": "메가 X", "Mega-Y": "메가 Y", "Mega-Z": "메가 Z", Wash: "워시", Heat: "히트", Frost: "프로스트", Fan: "스핀", Mow: "커트", Hisui: "히스이", Alola: "알로라", Galar: "가라르", "Paldea-Combat": "팔데아 컴뱃", "Paldea-Blaze": "팔데아 블레이즈", "Paldea-Aqua": "팔데아 워터", F: "암컷", Therian: "영물", "Low-Key": "로우" };
function koSpecies(name) {
  const sp = dex.species.get(name), base = NAMES[toID(sp.baseSpecies)] || sp.baseSpecies;
  if (!sp.forme) return base;
  const f = FORME[sp.forme] || sp.forme;
  return f.startsWith("메가") ? `메가${base}${f.slice(2)}` : `${base}(${f})`;
}
const koMove = n => KO.moves[toID(n)] || n, koItem = n => KO.items[toID(n)] || n, koAbility = n => KO.abilities[toID(n)] || n, koNature = n => KO.natures[toID(n)] || n;
const STAT_KO = { hp: "H", atk: "A", def: "B", spa: "C", spd: "D", spe: "S" };
const spreadText = evs => STATS.map(s => `${STAT_KO[s]}${evs[s] || 0}`).join(" ");
const pct = x => `${Math.round(x * 1000) / 10}%`;
const koWord = h => (!h || h.n >= 9 ? "확정 4타 이상" : h.chance >= 1 ? `확정 ${h.n}타` : `난수 ${h.n}타(${Math.round(h.chance * 100)}%)`);
const line = h => `${koMove(h.move)} ${pct(h.min / h.hp)}~${pct(h.max / h.hp)}, ${koWord(h)}`;

const SETUP = new Set(["swordsdance", "nastyplot", "dragondance", "calmmind", "bulkup", "quiverdance", "shellsmash", "coil", "tidyup", "victorydance", "shiftgear", "agility", "rockpolish", "irondefense", "curse", "growth", "workup", "honeclaws", "tailglow", "geomancy", "filletaway", "clangoroussoul", "noretreat", "bellydrum"]);
function roleOf(set, kind) {
  const ids = set.moves.map(toID), item = toID(set.item), has = list => ids.some(id => list.includes(id));
  const phys = set.moves.filter(m => dex.moves.get(m).category === "Physical").length, spec = set.moves.filter(m => dex.moves.get(m).category === "Special").length;
  const side = phys > spec ? "물리" : spec > phys ? "특수" : phys ? "양면" : "";
  const bulky = (set.evs.hp || 0) + (set.evs.def || 0) + (set.evs.spd || 0) >= 40, fast = (set.evs.spe || 0) >= 20 || item === "choicescarf";
  const mega = dex.items.get(set.item).megaStone ? "메가진화 " : "";
  if (has(["trickroom"])) return `${mega}트릭룸 시동`;
  if (has(["tailwind"])) return `${mega}순풍 서포터`;
  if (kind === "doubles" && has(["followme", "ragepowder"])) return `${mega}유인 서포터`;
  if (ids.some(id => SETUP.has(id))) return `${mega}${side} 랭크업 에이스`.replace(/\s+/g, " ");
  if (kind === "doubles" && has(["fakeout"])) return `${mega}속이기 견제 ${side}어태커`;
  if (item === "choicescarf") return `구애스카프 ${side} 클리너`;
  if (item === "choiceband" || item === "choicespecs") return `구애 ${side} 화력 돌파`;
  if (item === "assaultvest") return `돌격조끼 ${side} 탱커`;
  if (item === "focussash" && has(["stealthrock", "spikes", "taunt", "encore", "spore", "sleeppowder"])) return `기합의띠 선발 ${has(["stealthrock", "spikes"]) ? "깔개" : "견제"}`;
  if (has(["recover", "roost", "slackoff", "softboiled", "moonlight", "synthesis", "morningsun", "milkdrink", "shoreup", "strengthsap"]) && bulky) return `회복 ${(set.evs.def || 0) >= (set.evs.spd || 0) ? "물리" : "특수"} 받이`;
  if (has(["willowisp", "thunderwave", "spore", "sleeppowder", "yawn", "toxic"]) && bulky) return `상태이상 견제 ${side}탱커`.replace(/\s+/g, " ");
  return `${mega}${bulky ? "내구형 " : fast ? "고속 " : ""}${side} 어태커`.replace(/\s+/g, " ").trim();
}

function noteFor(species, kind, old, now, threats, ev, count) {
  const doubles = kind === "doubles";
  const v = ev.map.get(toID(now.form)) || ev.map.get(toID(species));
  const role = roleOf(now, kind);
  // speed: unchanged from the ladder; where it sits among the threats
  const spe = Math.floor(calcMon(now).stats.spe * (toID(now.item) === "choicescarf" ? 1.5 : 1));
  const speeds = threats.map(t => ({ name: t.name, spe: Math.floor(calcMon(t.set).stats.spe * (toID(t.set.item) === "choicescarf" ? 1.5 : 1)) }));
  const passed = speeds.filter(t => t.spe < spe).sort((a, b) => b.spe - a.spe), above = speeds.filter(t => t.spe >= spe).sort((a, b) => a.spe - b.spe);
  const speedLine = `스피드 ${spe}${toID(now.item) === "choicescarf" ? "(스카프 포함)" : ""}, 랭커와 같은 S${now.evs.spe || 0}: ${passed.length ? `${passed.slice(0, 3).map(t => `${koSpecies(t.name)}(${t.spe})`).join(", ")}까지 추월` : "상위 위협 중 추월하는 상대 없음"}${above.length ? `, ${koSpecies(above[0].name)}(${above[0].spe})부터 느림` : ""}`;
  // what the new points change against the 20 threats, both ways, and what the set does and takes
  const gained = [], lost = [], offense = [], defense = [];
  for (const t of threats) {
    const [mo, mn] = [bestHit(old, t.set, doubles), bestHit(now, t.set, doubles)];
    const [to, tn] = [bestHit(t.set, old, doubles), bestHit(t.set, now, doubles)];
    const tname = koSpecies(t.name);
    if (mo && mn && mn.n !== mo.n) (mn.n < mo.n ? gained : lost).push(`${tname}에게 ${koMove(mn.move)}: ${koWord(mo)} → ${koWord(mn)}`);
    if (to && tn && tn.n !== to.n) (tn.n > to.n ? gained : lost).push(`${tname}의 ${koMove(tn.move)}: ${koWord(to)} → ${koWord(tn)}`);
    if (mn && offense.length < 6) offense.push(`${tname}에게 ${line(mn)}`);
    if (tn && defense.length < 6) defense.push(`${tname}의 ${line(tn)}`);
  }
  const kills = threats.filter(t => (bestHit(now, t.set, doubles)?.n || 9) === 1).map(t => koSpecies(t.name));
  const killedBy = threats.filter(t => (bestHit(t.set, now, doubles)?.n || 9) === 1).map(t => koSpecies(t.name));
  const lead = role.includes("시동") || role.includes("선발") || role.includes("서포터") ? "선봉에서 판을 깔고" : role.includes("클리너") ? "상대가 지친 후반에 정리하고" : role.includes("받이") || role.includes("탱커") ? "상대의 주력 공격을 받아 내며" : role.includes("에이스") ? "안전한 턴에 능력을 올린 뒤 밀어붙이고" : "유리한 대면에서 압박하고";
  const strategy = `${lead}, ${now.moves.map(koMove).join(", ")}로 움직입니다.`
    + (kills.length ? ` 상위 위협 중 ${kills.slice(0, 4).join(", ")}는 한 번에 쓰러뜨릴 수 있습니다.` : "")
    + (killedBy.length ? ` ${killedBy.slice(0, 4).join(", ")}의 공격에는 한 번에 쓰러지므로 마주치지 않게 교체합니다.` : "");
  const verify = [];
  if (!v?.rated) verify.push("1760 이상 표본 없음: 전체 레이팅 통계의 세트");
  else if ((v.e.usage || 0) < 0.01) verify.push("랭커 사용률 1% 미만: 표본이 적은 세트");
  if (lost.length) verify.push("공격 투자를 줄여 잃은 확정 타수가 있음(위 목록)");
  return {
    species, name: koSpecies(now.form), role, sets: count, usage: v?.e.usage ?? null,
    ability: koAbility(now.ability), item: koItem(now.item), nature: koNature(now.nature), moves: now.moves.map(koMove),
    spread: { old: spreadText(old.evs), new: spreadText(now.evs) }, strategy, speed: speedLine,
    gained: gained.slice(0, 6), lost, offense, defense,
    partners: (v?.e.Teammates ? top(v.e.Teammates).slice(0, 4).map(([n]) => koSpecies(n)) : []),
    verify,
  };
}

/* ---------- running it ---------- */
async function worker() {
  const job = await new Promise(resolve => process.once("message", resolve));
  const ladder = JSON.parse(readFileSync(LADDER_FILE, "utf8"));
  const ev = evidence(job.kind), threats = threatsOf(ev), doubles = job.kind === "doubles";
  const formatid = formatId(REG, job.kind);
  for (const species of job.species) {
    try {
      const entry = ladder[REG][job.kind].find(e => e.species === species);
      const pairs = entry.sets.map(x => {
        const form = x.mega ? dex.items.get(x.items[0]).megaStone[species] : species;
        const old = asSet(species, form, x.ability, x.items[0], x.nature, Object.fromEntries(STATS.map(s => [s, x.evs[s] || 0])), x.moves);
        // a spread that loses more KOs than it wins (by the threats' weight) is not kept: the ladder's stays
        let now = { ...old, evs: tune(old, threats, doubles) };
        if (koDelta(old, now, threats, doubles) < 0) now = old;
        const evs = Object.fromEntries(Object.entries(now.evs).filter(([, n]) => n));
        const problems = validateTeam(formatid, [{ name: "", species, ability: x.ability, item: x.items[0], moves: x.moves, nature: x.nature, evs, level: 50 }]);
        if (problems) throw new Error(problems.join(" "));
        return { set: { ...x, evs }, old, now };
      });
      const main = pairs.reduce((a, b) => (b.set.weight > a.set.weight ? b : a));
      process.send({ species, sets: pairs.map(p => p.set), note: noteFor(species, job.kind, main.old, main.now, threats, ev, pairs.length) });
    } catch (e) {
      process.send({ species, error: String(e?.message || e) });
    }
  }
  process.exit(0);
}

async function main() {
  const ladder = JSON.parse(readFileSync(LADDER_FILE, "utf8"));
  // the other regulations as the ladder has them
  const out = { ...JSON.parse(readFileSync(OUT_FILE, "utf8")), ...Object.fromEntries(Object.entries(ladder).filter(([k]) => k !== REG)) };
  out.source = `${ladder.source}; ${REG} stat points spent by targets (scripts/tune-sets.mjs)`;
  mkdirSync(NOTES_DIR, { recursive: true });
  for (const kind of args.kind ? [args.kind] : ["singles", "doubles"]) {
    const species = ladder[REG][kind].map(e => e.species);
    const lanes = Math.min(Number(args.lanes) || Math.max(1, cpus().length - 1), species.length);
    const results = new Map();
    await Promise.all(Array.from({ length: lanes }, (_, lane) => new Promise((resolve, reject) => {
      const child = fork(fileURLToPath(import.meta.url), ["--worker", "1"]);
      child.on("message", m => { results.set(m.species, m); process.stdout.write(`\r${kind} ${results.size}/${species.length}   `); });
      child.on("exit", code => (code ? reject(new Error(`lane ${lane} exited ${code}`)) : resolve()));
      child.send({ kind, species: species.filter((_, i) => i % lanes === lane) });
    })));
    console.log();
    const notes = {};
    out[REG][kind] = ladder[REG][kind].map(entry => {
      const r = results.get(entry.species);
      if (!r || r.error) { console.warn(`kept the ladder's spreads: ${entry.species}${r?.error ? ` (${r.error})` : ""}`); return entry; }
      notes[entry.species] = r.note;
      return { ...entry, sets: r.sets };
    });
    writeFileSync(new URL(`${REG}-${kind}.json`, NOTES_DIR), JSON.stringify(notes, null, 1) + "\n");
  }
  writeFileSync(OUT_FILE, JSON.stringify(out));
}

if (args.worker) await worker();
else await main();

// Builds src/data/random-sets.json: the sample sets a random party is drawn from, and what the computer opponent believes a
// Pokémon carries until the battle shows otherwise.
//
// Every set comes from how the top of the ladder plays 포켓몬 챔피언스: Smogon's monthly usage statistics ("chaos") for each
// regulation and format, rating 1760 and up first, then all ratings, then the neighbouring formats for a Pokémon too rare there.
// Usage statistics give each part of a set on its own (how often each item, move, ability and spread is brought), so a set is put
// together the way players build one: the most common item with the most common moves that fit it (no status move under a Choice
// item or an Assault Vest), the most common spread that fits those moves (attacking stat, Trick Room speed), then variants that swap
// an item or the least common moves for the next most common ones. A Mega Evolution is its own entry in the statistics and gives the
// Mega sets, brought as the base Pokémon holding the stone. Every legal species gets at least three sets; each set is checked by
// Showdown's validator for its regulation, and carries back-up items for the item clause of a random party.
//
//   node scripts/build-random-sets.mjs          (downloads about 60 MB from smogon.com/stats)
//   STATS_CACHE=<dir> node scripts/build-random-sets.mjs   (keeps the downloads in <dir> and reads them from there next time)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Dex, toID } from "@pkmn/sim";
import { validateTeam, formatId } from "../supabase/functions/battle/engine.mjs";

const OUT = new URL("../src/data/random-sets.json", import.meta.url);
// the newest month of each regulation's ladder (M-B was the ladder's regulation until September)
const MONTH = { "m-c": "2026-10", "m-b": "2026-09" };
const MOD = { "m-c": "champions", "m-b": "championsregmb" };
const LADDER = { singles: reg => `gen9championsbssreg${reg.replace("-", "")}`, doubles: reg => `gen9championsvgc2026reg${reg.replace("-", "")}` };
const MIN_SETS = 3, MAX_SETS = 5;

const CACHE = process.env.STATS_CACHE;
async function stats(month, name) {
  const file = CACHE && `${CACHE}/${month}_chaos_${name}.json`;
  if (file && existsSync(file)) return JSON.parse(readFileSync(file, "utf8")).data;
  const res = await fetch(`https://www.smogon.com/stats/${month}/chaos/${name}.json`);
  if (!res.ok) { console.warn(`no statistics: ${month} ${name} (${res.status})`); return {}; }
  const text = await res.text();
  if (file) { mkdirSync(CACHE, { recursive: true }); writeFileSync(file, text); }
  return JSON.parse(text).data;
}
// species name → its entry, by id, so Farfetch’d and Farfetch'd meet
const byId = data => Object.fromEntries(Object.entries(data).map(([name, entry]) => [toID(name), entry]));

const cache = new Map();
function legal(formatid, set) {
  const key = formatid + JSON.stringify(set);
  if (!cache.has(key)) cache.set(key, !validateTeam(formatid, [{ name: "", nature: "Serious", evs: { hp: 2 }, level: 50, ...set }]));
  return cache.get(key);
}

/* One Pokémon's statistics from several sources, as shares of the Pokémon's games: P(item), P(move in the set), P(ability),
   P(spread). A source counts by its weight and by how much it has seen of the Pokémon, so a rare one leans on the wider data. */
function blend(entries) {
  const out = { Abilities: {}, Items: {}, Moves: {}, Spreads: {} };
  let weights = 0;
  for (const { entry, weight } of entries) {
    if (!entry) continue;
    const total = Object.values(entry.Abilities || {}).reduce((a, b) => a + b, 0);
    if (!total) continue;
    const w = weight * Math.min(1, total / 40);
    weights += w;
    for (const key of Object.keys(out)) for (const [k, v] of Object.entries(entry[key] || {})) out[key][k] = (out[key][k] || 0) + w * v / total;
  }
  if (!weights) return null;
  for (const key of Object.keys(out)) for (const k of Object.keys(out[key])) out[key][k] /= weights;
  return out;
}

const sorted = map => Object.entries(map).sort((a, b) => b[1] - a[1]);
const STATS = ["hp", "atk", "def", "spa", "spd", "spe"];
function parseSpread(text) {
  const [nature, points] = text.split(":");
  const values = points.split("/").map(Number);
  return { nature, evs: Object.fromEntries(STATS.map((s, i) => [s, values[i] || 0]).filter(([, v]) => v)) };
}

const BOOSTER = {
  Normal: "Silk Scarf", Fire: "Charcoal", Water: "Mystic Water", Electric: "Magnet", Grass: "Miracle Seed", Ice: "Never-Melt Ice",
  Fighting: "Black Belt", Poison: "Poison Barb", Ground: "Soft Sand", Flying: "Sharp Beak", Psychic: "Twisted Spoon", Bug: "Silver Powder",
  Rock: "Hard Stone", Ghost: "Spell Tag", Dragon: "Dragon Fang", Dark: "Black Glasses", Steel: "Metal Coat", Fairy: "Fairy Feather",
};
const GENERIC = ["Sitrus Berry", "Leftovers", "Focus Sash", "Life Orb", "Lum Berry", "Rocky Helmet", "Mental Herb", "Shell Bell", "Expert Belt", "Scope Lens", "Chesto Berry", "Quick Claw"];
const NO_STATUS = new Set(["choicescarf", "choiceband", "choicespecs", "assaultvest"]);
const CHOICE_OK = new Set(["trick", "switcheroo", "healingwish", "memento"]);

// the fewest moves a set needs: a Pokémon that learns fewer than four still gets every one it has
function pickMoves(dex, probs, item, leaning, banned = new Set()) {
  const status = NO_STATUS.has(toID(item));
  const fits = id => {
    if (banned.has(id)) return false;
    const move = dex.moves.get(id);
    if (status && move.category === "Status" && !(toID(item).startsWith("choice") && CHOICE_OK.has(id))) return false;
    return true;
  };
  // an attack of the other kind than the set leans on counts for less (a physical set's lone special move is rare)
  const score = ([id, p]) => {
    const move = dex.moves.get(id);
    const off = leaning && move.category !== "Status" && move.category !== leaning && !move.overrideOffensiveStat ? 0.6 : 1;
    return p * off;
  };
  return Object.entries(probs).filter(([id]) => fits(id)).sort((a, b) => score(b) - score(a)).map(([id]) => id);
}

function leaningOf(dex, probs) {
  let physical = 0, special = 0;
  for (const [id, p] of Object.entries(probs)) {
    const move = dex.moves.get(id);
    if (move.category === "Physical") physical += p;
    else if (move.category === "Special") special += p;
  }
  return physical >= special ? "Physical" : "Special";
}

// the most common spread that fits the moves: its nature must not lower the stat the attacks use, Trick Room wants no speed
function spreadFor(dex, spreads, moves, species) {
  const damaging = moves.map(id => dex.moves.get(id)).filter(m => m.category !== "Status");
  const physical = damaging.filter(m => m.category === "Physical").length, special = damaging.length - physical;
  const stat = !damaging.length ? null : physical >= special ? "atk" : "spa";
  const room = moves.includes("trickroom");
  for (const [text] of spreads) {
    const spread = parseSpread(text);
    const nature = dex.natures.get(spread.nature);
    if (stat && nature.minus === stat && !(physical && special)) continue;
    if (room && nature.plus === "spe") continue;
    return spread;
  }
  // nothing fits: a plain spread for the moves
  if (room) return { nature: stat === "atk" ? "Brave" : "Quiet", evs: { hp: 32, [stat || "def"]: 32, def: 2 } };
  if (!stat) return species.baseStats.def <= species.baseStats.spd ? { nature: "Bold", evs: { hp: 32, def: 32, spd: 2 } } : { nature: "Calm", evs: { hp: 32, spd: 32, def: 2 } };
  const fast = species.baseStats.spe >= 80;
  return { nature: stat === "atk" ? (fast ? "Jolly" : "Adamant") : (fast ? "Timid" : "Modest"), evs: { hp: 2, [stat]: 32, spe: 32 } };
}

/* The sets of one statistics entry (the Pokémon, or one of its Megas). Candidates are each common item with its fitting moves,
   and variants that put the next most common move in place of a less common one; each scores by how often its parts are seen. */
function entrySets(dex, formatid, species, stats, { stone, abilities }) {
  const moveProbs = Object.fromEntries(sorted(stats.Moves).filter(([id, p]) => id && p >= 0.01 && dex.moves.get(id).exists)
    .filter(([id]) => legal(formatid, { species: species.name, ability: abilities[0], moves: [dex.moves.get(id).name] })));
  if (!Object.keys(moveProbs).length) return [];
  const leaning = leaningOf(dex, moveProbs);
  const items = stone ? [[toID(stone), 1]]
    : sorted(stats.Items).filter(([id, p]) => id && id !== "nothing" && p >= 0.03 && dex.items.get(id).exists && !dex.items.get(id).megaStone)
      .filter(([id]) => legal(formatid, { species: species.name, ability: abilities[0], item: dex.items.get(id).name, moves: [dex.moves.get(Object.keys(moveProbs)[0]).name] }))
      .slice(0, 4);
  if (!items.length) items.push([toID(GENERIC.find(name => legal(formatid, { species: species.name, ability: abilities[0], item: name, moves: [dex.moves.get(Object.keys(moveProbs)[0]).name] })) || ""), 0.05]);
  const spreads = sorted(stats.Spreads);
  const candidates = [];
  for (const [item, pItem] of items) {
    const order = pickMoves(dex, moveProbs, item, leaning);
    if (!order.length) continue;
    // the moves nearly every one brings stay in every set; the other slots take each combination of the next most common
    const core = order.filter(id => moveProbs[id] >= 0.6).slice(0, 4);
    const flex = order.filter(id => !core.includes(id));
    const free = Math.min(4 - core.length, flex.length);
    const variants = combinations(flex.slice(0, free + 3), free).map(pick => [...core, ...pick]);
    for (const moves of variants) {
      const pMoves = moves.reduce((p, id) => p * Math.max(0.02, moveProbs[id]), 1);
      candidates.push({ item, moves: [...moves].sort(), score: pItem * pMoves });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const seen = new Set();
  return candidates.filter(c => { const key = c.item + c.moves.join(); return !seen.has(key) && seen.add(key); })
    .map(c => ({ ...c, ability: abilities[0], ...spreadFor(dex, spreads, c.moves, species) }));
}

function combinations(list, size) {
  if (size <= 0) return [[]];
  return list.flatMap((first, i) => combinations(list.slice(i + 1), size - 1).map(rest => [first, ...rest]));
}

/* choose sets so they differ: each next one must change the item, a move, the ability or the nature from every one already chosen.
   Each form players bring often (the Pokémon itself, or a Mega, at a tenth of its games or more) gets its best set first. */
function diverse(candidates, count) {
  const total = {};
  for (const c of candidates) total[c.entry] = Math.max(total[c.entry] || 0, c.entryWeight);
  const all = Object.values(total).reduce((a, b) => a + b, 0) || 1;
  const chosen = Object.keys(total).filter(e => total[e] / all >= 0.1).map(e => candidates.find(c => c.entry === e));
  const differs = (a, b) => a.item !== b.item || a.moves.some(m => !b.moves.includes(m)) || a.ability !== b.ability || a.nature !== b.nature;
  for (const c of candidates) if (chosen.length < count && !chosen.includes(c) && chosen.every(o => differs(c, o))) chosen.push(c);
  return chosen.sort((a, b) => b.score - a.score);
}

/* A Pokémon no player brings at all: sets built from its own learnset, so it still plays as it should. The strongest reliable attacks
   of its types first, then coverage, as an attacker on its better attacking stat, a bulkier one, and a Focus Sash lead. */
function learnsetSets(dex, formatid, species) {
  const learnset = dex.species.getLearnsetData(species.id)?.learnset || dex.species.getLearnsetData(dex.species.get(species.baseSpecies).id)?.learnset || {};
  const ability = species.abilities[0];
  const stat = species.baseStats.atk >= species.baseStats.spa ? "Physical" : "Special";
  const ok = move => legal(formatid, { species: species.name, ability, moves: [move.name] });
  const attacks = Object.keys(learnset).map(id => dex.moves.get(id))
    .filter(m => m.category === stat && m.basePower >= 50 && (m.accuracy === true || m.accuracy >= 85) && !m.flags.charge && !m.flags.recharge && !m.selfdestruct && !["focuspunch", "lastresort", "dreameater", "belch"].includes(m.id))
    .sort((a, b) => b.basePower * (species.types.includes(b.type) ? 1.5 : 1) - a.basePower * (species.types.includes(a.type) ? 1.5 : 1)).filter(ok);
  const moves = [];
  for (const m of attacks) if (moves.length < 3 && !moves.some(x => dex.moves.get(x).type === m.type)) moves.push(m.id);
  const status = ["protect", "recover", "roost", "slackoff", "willowisp", "thunderwave", "toxic", "swordsdance", "nastyplot", "calmmind", "uturn", "voltswitch"]
    .filter(id => learnset[id] && ok(dex.moves.get(id)));
  const four = [...moves, ...status, ...attacks.map(m => m.id)].filter((id, i, all) => all.indexOf(id) === i).slice(0, 4);
  if (!four.length) return [];
  const fast = species.baseStats.spe >= 80;
  const atk = stat === "Physical" ? "atk" : "spa";
  return [
    { item: "lifeorb", moves: four, ability, nature: stat === "Physical" ? (fast ? "Jolly" : "Adamant") : (fast ? "Timid" : "Modest"), evs: { hp: 2, [atk]: 32, spe: 32 }, score: 0.5 },
    { item: "sitrusberry", moves: four, ability, nature: stat === "Physical" ? "Adamant" : "Modest", evs: { hp: 32, [atk]: 32, def: 2 }, score: 0.3 },
    { item: "focussash", moves: four, ability, nature: stat === "Physical" ? "Jolly" : "Timid", evs: { hp: 2, [atk]: 32, spe: 32 }, score: 0.2 },
  ];
}

const out = { source: "Smogon usage statistics for 포켓몬 챔피언스 (rating 1760+, then all ratings and neighbouring formats)", built: new Date().toISOString().slice(0, 10), months: MONTH };
for (const reg of Object.keys(MONTH)) {
  const month = MONTH[reg];
  const dex = Dex.mod(MOD[reg]);
  for (const kind of ["singles", "doubles"]) {
    const formatid = formatId(reg, kind);
    const otherKind = kind === "singles" ? "doubles" : "singles";
    const otherReg = reg === "m-c" ? "m-b" : "m-c";
    const sources = [
      { data: byId(await stats(month, `${LADDER[kind](reg)}-1760`)), weight: 1 },
      { data: byId(await stats(month, `${LADDER[kind](reg)}-0`)), weight: 0.35 },
      { data: byId(await stats(MONTH[otherReg], `${LADDER[kind](otherReg)}-0`)), weight: 0.12 },
      { data: byId(await stats(month, `${LADDER[otherKind](reg)}-0`)), weight: 0.08 },
      ...(kind === "singles" ? [{ data: byId(await stats("2026-10", "gen9championsou-0")), weight: 0.1 }, { data: byId(await stats("2026-10", "gen9championsuu-0")), weight: 0.1 }] : []),
    ];
    const usageOf = id => sources[0].data[id]?.usage ?? (sources[1].data[id]?.usage ?? 0) * 0.5;
    const list = [];
    let fromLearnset = 0;
    for (const species of dex.species.all()) {
      if (!species.exists || species.battleOnly || /-Gmax$/.test(species.name)) continue;
      const baseOf = dex.species.get(species.baseSpecies);
      if (baseOf.cosmeticFormes?.includes(species.name)) continue;
      const learnset = dex.species.getLearnsetData(species.id)?.learnset || dex.species.getLearnsetData(baseOf.id)?.learnset || {};
      const anyMove = Object.keys(learnset).map(id => dex.moves.get(id).name).find(name => legal(formatid, { species: species.name, ability: species.abilities[0], moves: [name] }));
      if (!anyMove) continue;
      const abilityOk = name => legal(formatid, { species: species.name, ability: name, moves: [anyMove] });
      // the Pokémon's own statistics; a forme nobody brings (Squawkabilly-Blue, Meowstic-F) borrows its base or sibling's
      const ids = [species.id, ...(species.id === baseOf.id ? [] : [baseOf.id]), ...(baseOf.otherFormes || []).map(toID)];
      const entryFor = id => sources.map(s => ({ entry: s.data[id], weight: s.weight }));
      const own = blend(entryFor(species.id)) || ids.slice(1).map(id => blend(entryFor(id))).find(Boolean);
      const abilities = own ? sorted(own.Abilities).map(([id]) => dex.abilities.get(id).name).filter(abilityOk) : [];
      if (!abilities.length) abilities.push(...Object.values(species.abilities).filter(abilityOk));
      let sets = [];
      if (own) {
        const weight = Math.max(usageOf(species.id), 0.0005);
        sets.push(...entrySets(dex, formatid, species, own, { abilities }).map(s => ({ ...s, score: s.score * weight, entry: species.id, entryWeight: weight })));
        // a second common ability gives sets of its own
        const second = own && sorted(own.Abilities).map(([id, p]) => [dex.abilities.get(id).name, p]).find(([name, p]) => name !== abilities[0] && p >= 0.2 && abilityOk(name));
        if (second) sets.push(...entrySets(dex, formatid, species, own, { abilities: [second[0]] }).map(s => ({ ...s, score: s.score * weight * second[1], entry: species.id, entryWeight: weight })));
      }
      // its Megas, each brought as this Pokémon holding the stone
      for (const megaName of (species.otherFormes || []).filter(name => /-Mega/.test(name))) {
        const mega = dex.species.get(megaName);
        const stats = blend(entryFor(mega.id));
        if (!stats || !legal(formatid, { species: species.name, ability: abilities[0], item: mega.requiredItem, moves: [anyMove] })) continue;
        const weight = Math.max(usageOf(mega.id), 0.0005);
        sets.push(...entrySets(dex, formatid, species, stats, { stone: mega.requiredItem, abilities }).map(s => ({ ...s, score: s.score * weight, mega: true, entry: mega.id, entryWeight: weight })));
      }
      if (sets.length < MIN_SETS) { sets.push(...learnsetSets(dex, formatid, species).map(s => ({ ...s, score: s.score * 1e-9, entry: "learnset", entryWeight: 0 }))); if (!own) fromLearnset++; }
      sets.sort((a, b) => b.score - a.score);
      const whole = set => ({ name: "", species: species.name, ability: set.ability, item: dex.items.get(set.item).name, moves: set.moves.map(id => dex.moves.get(id).name), nature: set.nature, evs: set.evs, level: 50 });
      sets = sets.filter(set => !validateTeam(formatid, [whole(set)]));
      let chosen = diverse(sets, MAX_SETS);
      if (chosen.length < MIN_SETS) chosen = [...chosen, ...sets.filter(s => !chosen.includes(s))].slice(0, MIN_SETS);
      if (!chosen.length) continue;
      const total = chosen.reduce((sum, s) => sum + s.score, 0) || 1;
      list.push({
        species: species.name,
        usage: Math.round(usageOf(species.id) * 1e4) / 1e4 + (species.otherFormes || []).filter(n => /-Mega/.test(n)).reduce((sum, n) => sum + Math.round(usageOf(toID(n)) * 1e4) / 1e4, 0),
        sets: chosen.map(set => {
          const name = dex.items.get(set.item).name;
          // back-ups for the item clause: the Pokémon's other common items, then items any set can hold
          const backups = set.mega ? [] : [...(own ? sorted(own.Items).map(([id]) => dex.items.get(id).name) : []), ...set.moves.map(id => BOOSTER[dex.moves.get(id).type]), ...GENERIC]
            .filter(item => item && item !== name && dex.items.get(item).exists && !dex.items.get(item).megaStone && legal(formatid, { species: species.name, ability: set.ability, item, moves: [dex.moves.get(set.moves[0]).name] }));
          return {
            weight: Math.round(Math.max(0.01, set.score / total) * 100) / 100,
            ability: set.ability, items: [...new Set([name, ...backups])].slice(0, 5),
            moves: set.moves.map(id => dex.moves.get(id).name), nature: set.nature, evs: set.evs, ...(set.mega ? { mega: true } : {}),
          };
        }),
      });
    }
    (out[reg] ||= {})[kind] = list;
    const short = list.filter(e => e.sets.length < MIN_SETS).map(e => e.species);
    console.log(reg, kind, `${list.length} species, ${list.reduce((n, e) => n + e.sets.length, 0)} sets, ${fromLearnset} from learnsets only, under ${MIN_SETS}: ${short.join(", ") || "none"}`);
  }
}
writeFileSync(OUT, JSON.stringify(out));
console.log("wrote", OUT.pathname);

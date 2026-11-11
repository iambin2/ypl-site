/* 도전의 탑의 상대 파티 (docs/BATTLE_STREAK.md 15장): 랭커 구축은 상대 그 자체가 아니라 짜는 법의 교본이다. 랭커 구축 433개를 역할로
   읽어 틀, 핵심 짝, 유형을 배우고, 랜덤 풀 전체(금지 목록을 뺀 m-c 싱글)에서 판마다 서로 다르게 짜는 빌더 넷 가운데 하나로 여섯을
   짠다. 역할 안에서 종은 같은 무게로 뽑히고(세트가 많은 종이 더 나오지 않는다), 한 도전에서 이미 본 종은 거의 다시 나오지 않는다.
   세기는 몫의 합으로 맞춘다(partyBalance.js): 어느 빌더가 뽑혀도 같고, 층의 세기는 컴퓨터의 계단이 맡는다(streak.js STREAK_STEPS). */
import { Dex } from "@pkmn/sim";
import * as champions from "@pkmn/mods/champions";
import { fairPool, shuffled, validateTeam, weighted } from "./engine.mjs";
import { MEGA_STONE, STREAK_BAN, STREAK_FORMAT_ID } from "../../../src/services/streak.js";
import { BAND, PLAN, ratingOf, tierOf } from "../../../src/services/partyBalance.js";
import RANKER from "../../../src/data/ranker-teams.json" with { type: "json" };
import TOWER_TIERS from "../../../src/data/tower-tiers.json" with { type: "json" };

const dex = Dex.mod("champions", champions);
const TYPES = dex.types.names();

/* ---------- the tower's sets, as the draft and the foes take them (14.4) ---------- */
export const LOCKS = /^(Choice (Band|Specs|Scarf)|Assault Vest)$/;
export const statusMove = set => set.moves.some(m => Dex.moves.get(m).category === "Status");
// the items each species is brought with on the ladder's top teams, by how often
export const HELD = new Map();
for (const t of RANKER.teams) for (const m of t.team) if (m.item) {
  const held = HELD.get(m.species) || new Map();
  held.set(m.item, (held.get(m.item) || 0) + 1);
  HELD.set(m.species, held);
}
// the whole random pool under a ban (15장: the foes' material), and the ladder's species in it (14장: the draft's)
export const wholePool = (ban = STREAK_BAN) => fairPool(STREAK_FORMAT_ID, ban);
const pools = new Map();
export function towerPool(ban = STREAK_BAN) {
  if (!pools.has(ban)) pools.set(ban, new Map(wholePool(ban).filter(e => e.species in TOWER_TIERS).map(e => [e.species, e])));
  return pools.get(ban);
}
/* a sample set of the species that holds the item: one that carries it, by weight, or else one that can (never a Mega set for an item
   that is not its stone, never a status move under a Choice item or an Assault Vest). No item: a set that is not a Mega's. null when
   none can */
export function setFor(entry, item, random) {
  const carry = item ? entry.sets.filter(set => set.items.includes(item)) : [];
  const sets = carry.length ? carry : item && MEGA_STONE.test(item) ? [] : entry.sets.filter(set => !set.mega && !(LOCKS.test(item) && statusMove(set)));
  return sets.length ? weighted(sets, random) : null;
}
export const member = (species, set, item) => ({ name: "", species, ability: set.ability, item, moves: [...set.moves], nature: set.nature, evs: { ...set.evs }, ...(set.ivs ? { ivs: { ...set.ivs } } : {}), level: 50 });

/* ---------- roles (15.3) ---------- */
const PIVOT = new Set(["uturn", "voltswitch", "flipturn", "partingshot", "teleport", "chillyreception", "shedtail"]);
const HAZARD = new Set(["stealthrock", "spikes", "toxicspikes", "stickyweb", "ceaselessedge", "stoneaxe"]);
const REMOVAL = new Set(["rapidspin", "defog", "mortalspin", "tidyup", "courtchange"]);
const HEAL = new Set(["rest", "wish", "strengthsap", "painsplit"]);
const SETTER = { drought: "sun", orichalcumpulse: "sun", drizzle: "rain", sandstream: "sand", snowwarning: "snow" };
const SETTER_MOVE = { sunnyday: "sun", raindance: "rain", sandstorm: "sand", snowscape: "snow", chillyreception: "snow" };
const ABUSER = { chlorophyll: "sun", solarpower: "sun", protosynthesis: "sun", flowergift: "sun", swiftswim: "rain", sandrush: "sand", sandforce: "sand", slushrush: "snow" };
export const OFFENCE = new Set(["setup", "physical", "special"]);

/* a set's main role and its tags. setup: it fights by raising its attack; physical, special: three attacks or more; bulky: two attacks
   or fewer with recovery or a bulky spread; support: the rest (hazards, status, screens, pivots) */
const roles = new WeakMap();
export function roleOf(species, set) {
  if (roles.has(set)) return roles.get(set);
  const moves = set.moves.map(m => Dex.moves.get(m));
  const attacks = moves.filter(m => m.category !== "Status");
  const phys = attacks.filter(m => m.category === "Physical").length, spec = attacks.length - phys;
  const setup = moves.some(m => m.category === "Status" && m.target === "self" && ((m.boosts?.atk || 0) > 0 || (m.boosts?.spa || 0) > 0)) || moves.some(m => m.id === "bellydrum");
  const heal = moves.some(m => m.flags?.heal || HEAL.has(m.id));
  const ev = set.evs || {};
  const bulk = (ev.hp || 0) >= 20 && ((ev.def || 0) >= 20 || (ev.spd || 0) >= 20);
  const primary = setup && attacks.length ? "setup"
    : attacks.length >= 3 ? (phys > spec || (phys === spec && (ev.atk || 0) >= (ev.spa || 0)) ? "physical" : "special")
      : heal || bulk ? "bulky" : "support";
  const s = dex.species.get(species);
  const ability = dex.toID(set.ability);
  const tags = new Set();
  for (const m of moves) {
    if (PIVOT.has(m.id)) tags.add("pivot");
    if (HAZARD.has(m.id)) tags.add("hazard");
    if (REMOVAL.has(m.id)) tags.add("removal");
    if (m.id === "trickroom") tags.add("room");
    if (SETTER_MOVE[m.id]) tags.add(`weather:${SETTER_MOVE[m.id]}`);
  }
  if (SETTER[ability]) tags.add(`weather:${SETTER[ability]}`);
  if (ABUSER[ability]) tags.add(`abuser:${ABUSER[ability]}`);
  if (s.baseStats.spe <= 50) tags.add("slow");
  if (set.mega) tags.add("mega");
  const out = { primary, tags, types: s.types };
  roles.set(set, out);
  return out;
}
const offensive = r => OFFENCE.has(r.primary);
// the attacking types a party of these types is weak to, and whether these types take one at half or less
const weakTo = types => TYPES.filter(t => dex.getImmunity(t, types) && dex.getEffectiveness(t, types) > 0);
const resists = (types, t) => !dex.getImmunity(t, types) || dex.getEffectiveness(t, types) < 0;

/* ---------- what the ladder's top teams teach (15.4), learned once on the first foe ---------- */
let lesson = null;
function learn() {
  if (lesson) return lesson;
  const pool = new Map(wholePool().map(e => [e.species, e]));
  const fixed = () => 0.5; // the set a ranker's item points to, read the same every time
  const templates = [], pairs = new Map(), kinds = new Map(), weathers = new Map();
  let hazards = 0;
  for (const t of RANKER.teams) {
    const read = t.team.map(m => {
      const entry = pool.get(m.species), set = entry && setFor(entry, m.item, fixed);
      return set ? roleOf(m.species, set) : null;
    });
    if (read.some(r => !r)) continue;
    if (read.some(r => r.tags.has("hazard"))) hazards++;
    templates.push(read.map(r => ({ role: r.primary, hazard: r.tags.has("hazard"), pivot: r.tags.has("pivot") })));
    for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
      const [a, b] = [read[i], read[j]].map(r => `${r.primary}/${r.types[0]}`).sort();
      const key = `${a}|${b}`;
      pairs.set(key, (pairs.get(key) || 0) + 1);
    }
    const weather = read.flatMap(r => [...r.tags]).find(x => x.startsWith("weather:"));
    const kind = weather ? "weather" : read.some(r => r.tags.has("room")) ? "room" : read.filter(offensive).length >= 4 ? "offence" : read.filter(r => r.primary === "bulky").length >= 3 ? "stall" : "balance";
    kinds.set(kind, (kinds.get(kind) || 0) + 1);
    if (weather) weathers.set(weather.slice(8), (weathers.get(weather.slice(8)) || 0) + 1);
  }
  // counts by their square root, so the most common does not take it all; no kind below a tenth (15.5)
  const soft = map => [...map].map(([key, n]) => ({ key, weight: Math.sqrt(n) }));
  const kindList = soft(kinds);
  for (const kind of ["weather", "room", "offence", "stall", "balance"]) if (!kinds.has(kind)) kindList.push({ key: kind, weight: 0 });
  const total = kindList.reduce((s, k) => s + k.weight, 0);
  for (const k of kindList) k.weight = Math.max(k.weight, total / 10);
  lesson = {
    templates,
    // the share of the ladder's teams that bring hazards: a foe wants them that often, not always
    hazards: hazards / Math.max(1, templates.length),
    pairs: soft(pairs).map(p => ({ ...p, sides: p.key.split("|").map(x => x.split("/")) })),
    kinds: kindList,
    weathers: soft(weathers),
  };
  return lesson;
}
export const towerLesson = learn;

/* ---------- building (15.5, 15.6) ---------- */
// the strength a foe aims at: the mean share of a party with one of each tier, as randomTeam's balanced parties aim at
let aim = null;
function target() {
  if (aim !== null) return aim;
  const sums = Array(6).fill(0), counts = Array(6).fill(0);
  for (const e of wholePool()) { const t = tierOf(STREAK_FORMAT_ID, e.species); sums[t] += ratingOf(STREAK_FORMAT_ID, e.species); counts[t]++; }
  aim = PLAN.reduce((s, t) => s + sums[t] / Math.max(1, counts[t]), 0);
  return aim;
}

// a party being built: its members ({ species, set, item, role }), the base species, items and whether a Mega is in
function party(random, seen) {
  return { random, seen, members: [], bases: new Set(), items: new Set(), mega: false, hazards: random() < learn().hazards };
}
const SEEN_WEIGHT = 0.05;
/* one more member whose set meets want(role): every species that has such a set weighs the same (a species seen in this run 0.05), and
   among its fitting sets by the set's own weight. false when none fits */
function add(p, want) {
  const options = [];
  for (const entry of wholePool()) {
    const base = dex.species.get(entry.species).baseSpecies;
    if (p.bases.has(base)) continue;
    const sets = entry.sets.filter(set => !(p.mega && set.mega) && want(roleOf(entry.species, set)) && set.items.some(i => !p.items.has(i)));
    if (sets.length) options.push({ entry, base, sets, weight: p.seen.has(entry.species) ? SEEN_WEIGHT : 1 });
  }
  if (!options.length) return false;
  const { entry, base, sets } = weighted(options, p.random);
  const set = weighted(sets, p.random);
  const item = set.items.find(i => !p.items.has(i));
  p.members.push({ species: entry.species, set, item, role: roleOf(entry.species, set) });
  p.bases.add(base);
  p.items.add(item);
  if (set.mega) p.mega = true;
  return true;
}
// add, trying the wants in turn (the narrowest first)
const addAny = (p, ...wants) => wants.some(w => add(p, w));
const any = () => true;
// the attacking types two or more members are weak to and none takes at half or less, the most shared first
function holes(p) {
  const count = new Map();
  for (const m of p.members) for (const t of weakTo(m.role.types)) count.set(t, (count.get(t) || 0) + 1);
  return [...count].filter(([t, n]) => n >= 2 && !p.members.some(m => resists(m.role.types, t))).sort((a, b) => b[1] - a[1]).map(([t]) => t);
}
/* the rest of the six: an attacker if there is none, hazards if none (on as many foes as the ladder brings them), then one that takes the party's worst hole, then the main role the
   party has least of */
function fill(p) {
  while (p.members.length < 6) {
    const has = r => p.members.some(m => r(m.role));
    const least = ["physical", "special", "setup", "bulky", "support"].map(role => [role, p.members.filter(m => m.role.primary === role).length, p.random()]).sort((a, b) => a[1] - b[1] || a[2] - b[2])[0][0];
    const hole = holes(p)[0];
    const ok = !has(offensive) ? addAny(p, offensive, any)
      : p.hazards && !has(r => r.tags.has("hazard")) ? addAny(p, r => r.tags.has("hazard"), any)
        : hole ? addAny(p, r => resists(r.types, hole) && r.primary === least, r => resists(r.types, hole), any)
          : addAny(p, r => r.primary === least, any);
    if (!ok) return false;
  }
  return true;
}
const pick = (list, random) => list[Math.floor(random() * list.length)];

export const BUILDERS = {
  // ① a ranker team's shape: each place a species of that main role (hazards and pivots where the ranker had them)
  template(p) {
    const slots = shuffled(pick(learn().templates, p.random), p.random);
    for (const s of slots) {
      const role = r => r.primary === s.role;
      addAny(p, r => role(r) && (!s.hazard || r.tags.has("hazard")) && (!s.pivot || r.tags.has("pivot")), role);
    }
    return fill(p);
  },
  // ② a pair the ladder brings together (main role and first type each), then what covers its holes
  core(p) {
    const { sides } = weighted(learn().pairs, p.random);
    for (const [role, type] of sides) addAny(p, r => r.primary === role && r.types.includes(type), r => r.primary === role);
    return fill(p);
  },
  // ③ an ace (a Mega may be it), two that take what it is weak to, hazards or a pivot, the rest
  ace(p) {
    add(p, offensive);
    const weak = weakTo(p.members[0]?.role.types || []);
    for (let i = 0; i < 2; i++) {
      const open = weak.filter(t => !p.members.slice(1).some(m => resists(m.role.types, t)));
      if (open.length) addAny(p, r => resists(r.types, open[0]) && (open.length < 2 || resists(r.types, open[1])), r => resists(r.types, open[0]));
    }
    addAny(p, r => r.tags.has("hazard") || r.tags.has("pivot"));
    return fill(p);
  },
  // ④ a kind of team the ladder plays, its quota first
  kind(p) {
    const kind = weighted(learn().kinds, p.random).key;
    const n = (k, want) => { for (let i = 0; i < k; i++) add(p, want); };
    if (kind === "weather") {
      const w = weighted(learn().weathers, p.random).key;
      if (add(p, r => r.tags.has(`weather:${w}`))) n(2, r => r.tags.has(`abuser:${w}`) && !r.tags.has(`weather:${w}`));
    } else if (kind === "room") {
      if (add(p, r => r.tags.has("room"))) n(3, r => r.tags.has("slow") && offensive(r));
    } else if (kind === "offence") { n(4, offensive); if (p.hazards) add(p, r => r.tags.has("hazard")); }
    else if (kind === "stall") { n(3, r => r.primary === "bulky"); addAny(p, r => r.tags.has("removal"), r => r.tags.has("hazard")); }
    else { n(3, offensive); n(2, r => r.primary === "bulky"); add(p, r => r.primary === "support"); }
    return fill(p);
  },
};
export const BUILDER_NAMES = Object.keys(BUILDERS);

const TRIES = 40;
/* a foe of 도전의 탑: a builder drawn alike from the four, then parties of it until one is legal and its six shares lie within BAND of
   the aim (the closest legal one after TRIES). seen: species this run has been shown (none on a daily run, 15.6) */
export function towerFoe(random = Math.random, seen = [], builder = pick(BUILDER_NAMES, random)) {
  const known = new Set(seen);
  let best = null, bestGap = Infinity;
  for (let tries = 0; tries < TRIES; tries++) {
    const p = party(random, known);
    if (!BUILDERS[builder](p)) continue;
    const gap = Math.abs(p.members.reduce((s, m) => s + ratingOf(STREAK_FORMAT_ID, m.species), 0) - target());
    if (gap >= bestGap && best) continue;
    const team = p.members.map(m => member(m.species, m.set, m.item));
    if (validateTeam(STREAK_FORMAT_ID, team)) continue;
    best = team; bestGap = gap;
    if (gap <= BAND) break;
  }
  if (!best) throw new Error(`the ${builder} builder made no legal party`);
  return { team: best, builder };
}

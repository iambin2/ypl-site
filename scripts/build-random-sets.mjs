// Builds src/data/random-sets.json: the sets a random battle party is drawn from.
//
// Every set is made by Pokémon Showdown's own gen 9 random battle generator (@pkmn/randoms, pinned with @pkmn/sim), which already
// picks moves, abilities and items as a whole set (STAB, coverage, setup with something to use it, recovery on walls). Each species is
// generated many times; the most common sets are kept with how often they came, so a Pokémon with more than one way to play shows each
// of them at that rate. Then the set is moved into 포켓몬 챔피언스: an item the regulation does not have becomes the nearest one it has,
// a move it does not have is replaced by the species' next most common legal move, and stat points and a nature are given by its role.
// Every species, ability, item and move is checked by Showdown's validator for the regulation, so a party is legal by construction
// (the engine checks again). Each set also carries back-up items, so the item clause never leaves a Pokémon empty-handed.
//
//   node scripts/build-random-sets.mjs      (no network; deterministic for a given @pkmn version)
import { writeFileSync } from "node:fs";
import { Teams, Dex } from "@pkmn/sim";
import { TeamGenerators } from "@pkmn/randoms";
import { validateTeam, formatId } from "../supabase/functions/battle/engine.mjs";

Teams.setGeneratorFactory(TeamGenerators);
const OUT = new URL("../src/data/random-sets.json", import.meta.url);
const REGULATIONS = ["m-c", "m-b"];
const GENERATORS = { singles: "gen9randombattle", doubles: "gen9randomdoublesbattle" };
const DRAWS = 120;      // sets generated per species
const KEEP = 4;         // distinct sets kept per species at most
const MIN_SHARE = 0.12; // a set seen less often than this (after the first) is left out
const MEGA_SHARE = 0.35;

const BOOSTER = {
  Normal: "Silk Scarf", Fire: "Charcoal", Water: "Mystic Water", Electric: "Magnet", Grass: "Miracle Seed", Ice: "Never-Melt Ice",
  Fighting: "Black Belt", Poison: "Poison Barb", Ground: "Soft Sand", Flying: "Sharp Beak", Psychic: "Twisted Spoon", Bug: "Silver Powder",
  Rock: "Hard Stone", Ghost: "Spell Tag", Dragon: "Dragon Fang", Dark: "Black Glasses", Steel: "Metal Coat", Fairy: "Fairy Feather",
};
const SUPPORT_ITEMS = ["Leftovers", "Sitrus Berry", "Rocky Helmet", "Lum Berry", "Mental Herb", "Shell Bell", "Chesto Berry"];

const base = { name: "", nature: "Serious", evs: { hp: 2 }, level: 50 };
const cache = new Map();
function legal(formatid, set) {
  const key = formatid + JSON.stringify(set);
  if (!cache.has(key)) cache.set(key, !validateTeam(formatid, [{ ...base, ...set }]));
  return cache.get(key);
}

const isSupportRole = role => /Support|Bulky Protect/.test(role);

function attackProfile(dex, moves) {
  const damaging = moves.map(name => dex.moves.get(name)).filter(move => move.category !== "Status");
  const physical = damaging.filter(move => move.category === "Physical").length;
  const special = damaging.length - physical;
  return { damaging, physical, special, stat: physical >= special ? "atk" : "spa" };
}

// stat points (66 in all, 32 at most on one) and a nature for how the set plays; 포켓몬 챔피언스 keeps every IV at 31
function spread(dex, species, role, moves) {
  const { damaging, physical, stat } = attackProfile(dex, moves);
  if (moves.includes("Trick Room")) {
    return { nature: stat === "atk" ? "Brave" : "Quiet", evs: { hp: 32, [stat]: 32, def: 2 } };
  }
  if (/Fast Support/.test(role) && damaging.length) {
    return { nature: stat === "atk" ? "Jolly" : "Timid", evs: { hp: 32, [stat]: 2, spe: 32 } };
  }
  if (isSupportRole(role) || damaging.length <= 1) {
    const physicalWall = species.baseStats.def <= species.baseStats.spd;
    const nature = stat === "atk" && physical ? (physicalWall ? "Impish" : "Careful") : (physicalWall ? "Bold" : "Calm");
    return { nature, evs: { hp: 32, def: physicalWall ? 32 : 2, spd: physicalWall ? 2 : 32 } };
  }
  if (/Bulky/.test(role)) {
    return { nature: stat === "atk" ? "Adamant" : "Modest", evs: { hp: 32, [stat]: 32, spe: 2 } };
  }
  const fast = species.baseStats.spe >= 80;
  const nature = stat === "atk" ? (fast ? "Jolly" : "Adamant") : (fast ? "Timid" : "Modest");
  return { nature, evs: { hp: 2, [stat]: 32, spe: 32 } };
}

// the item the set came with, moved into the regulation, then back-ups in order for the item clause
function itemsFor(formatid, dex, speciesName, role, moves, generated) {
  const support = isSupportRole(role);
  const { damaging, stat } = attackProfile(dex, moves);
  const stabs = damaging.map(move => move.type).filter(type => dex.species.get(speciesName).types.includes(type));
  const boosters = [...new Set([...stabs, ...damaging.map(move => move.type)])].map(type => BOOSTER[type]);
  const MAP = {
    "Choice Band": boosters[0] || "Life Orb", "Choice Specs": boosters[0] || "Life Orb", "Heavy-Duty Boots": support ? "Leftovers" : "Life Orb",
    "Assault Vest": "Sitrus Berry", "Booster Energy": "Life Orb", "Loaded Dice": "Life Orb", "Throat Spray": "Life Orb",
    "Weakness Policy": "Sitrus Berry", "Covert Cloak": "Sitrus Berry", "Clear Amulet": "Sitrus Berry", "Safety Goggles": "Sitrus Berry",
    "Eviolite": "Sitrus Berry", "Black Sludge": "Leftovers", "Flame Orb": "Life Orb", "Toxic Orb": "Life Orb", "Protective Pads": "Life Orb",
    "Room Service": "Sitrus Berry", "Punching Glove": boosters[0] || "Life Orb", "Mirror Herb": "White Herb", "Adrenaline Orb": "Sitrus Berry",
  };
  const first = MAP[generated] || generated;
  const attack = ["Life Orb", ...boosters, "Expert Belt", stat === "atk" ? "Muscle Band" : "Wise Glasses", "Scope Lens", "Focus Sash", "Shell Bell"];
  const order = support ? [first, ...SUPPORT_ITEMS, ...attack] : [first, ...attack, ...SUPPORT_ITEMS];
  const ability = dex.species.get(speciesName).abilities[0];
  return [...new Set(order.filter(Boolean))].filter(item => legal(formatid, { species: speciesName, ability, item, moves: [moves[0]] })).slice(0, 5);
}

const out = { source: "Pokémon Showdown gen 9 random battle generator (@pkmn/randoms 0.10.13), moved into each regulation", built: new Date().toISOString().slice(0, 10) };
for (const [kind, generatorId] of Object.entries(GENERATORS)) {
  const generator = Teams.getGenerator(generatorId, [11, 23, 37, 41]);
  const doubles = kind === "doubles";
  const speciesList = Object.keys(doubles ? generator.randomDoublesSets || generator.randomSets : generator.randomSets);
  // draw each species many times once, then fit to every regulation
  const drawn = {};
  for (const id of speciesList) {
    const sets = [];
    for (let n = 0; n < DRAWS; n++) {
      try { sets.push(generator.randomSet(id, {}, n % 6 === 0, doubles)); } catch { break; }
    }
    if (sets.length) drawn[id] = sets;
  }
  for (const reg of REGULATIONS) {
    const formatid = formatId(reg, kind);
    const dex = Dex.mod(reg === "m-c" ? "champions" : "championsregmb");
    const list = [];
    for (const sets of Object.values(drawn)) {
      // a cosmetic forme (Alcremie-Ruby-Cream, Vivillon-Marine) is brought as its base: the battle shows the same Pokémon, and its name and picture are known
      const drawnSpecies = dex.species.get(sets[0].species);
      const baseOf = dex.species.get(drawnSpecies.baseSpecies);
      const speciesName = baseOf.cosmeticFormes?.includes(drawnSpecies.name) ? baseOf.name : drawnSpecies.name;
      const species = dex.species.get(speciesName);
      if (!species.exists) continue;
      const anyMove = sets.flatMap(set => set.moves).map(id => dex.moves.get(id).name).find(move => legal(formatid, { species: speciesName, ability: species.abilities[0], moves: [move] }));
      if (!anyMove) continue;
      // the species' moves by how often the generator chose them, legal ones only: the stock a missing move is replaced from
      const moveCount = new Map();
      for (const set of sets) for (const id of set.moves) { const name = dex.moves.get(id).name; moveCount.set(name, (moveCount.get(name) || 0) + 1); }
      // when the generator's own moves run short in this regulation, its strongest reliable attacks follow (STAB first)
      const learnable = Object.keys(dex.species.getLearnsetData(species.id)?.learnset || dex.species.getLearnsetData(dex.species.get(species.baseSpecies).id)?.learnset || {})
        .map(id => dex.moves.get(id)).filter(move => move.category !== "Status" && move.basePower >= 60 && (move.accuracy === true || move.accuracy >= 90) && !move.flags.charge && !move.flags.recharge && !move.selfdestruct && move.priority >= 0 && !["focuspunch", "belch", "lastresort", "dreameater", "synchronoise", "steelbeam", "mindblown", "skydrop"].includes(move.id))
        .sort((a, b) => b.basePower * (species.types.includes(b.type) ? 1.5 : 1) - a.basePower * (species.types.includes(a.type) ? 1.5 : 1))
        .map(move => move.name);
      const stock = [...[...moveCount.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name), ...learnable.slice(0, 6)]
        .filter((move, i, all) => all.indexOf(move) === i && legal(formatid, { species: speciesName, ability: species.abilities[0], moves: [move] }));
      const groups = new Map();
      for (const set of sets) {
        const ability = legal(formatid, { species: speciesName, ability: set.ability, moves: [anyMove] }) ? set.ability : Object.values(species.abilities).find(a => legal(formatid, { species: speciesName, ability: a, moves: [anyMove] }));
        if (!ability) continue;
        const kept = set.moves.map(id => dex.moves.get(id).name).filter(move => stock.includes(move) && legal(formatid, { species: speciesName, ability, moves: [move] }));
        const role = set.role || "";
        const sameRole = sets.filter(other => (other.role || "") === role).flatMap(other => other.moves.map(id => dex.moves.get(id).name));
        const leaning = attackProfile(dex, kept).stat === "atk" ? "Physical" : "Special";
        for (const move of [...stock.filter(m => sameRole.includes(m)), ...stock]) {
          if (kept.length >= 4) break;
          if (kept.includes(move) || (!moveCount.has(move) && dex.moves.get(move).category !== leaning)) continue;
          kept.push(move);
        }
        if (!kept.length) continue;
        const moves = kept.slice(0, 4).sort();
        const key = [role, ability, set.item, ...moves].join("|");
        const group = groups.get(key) || { role, ability, generated: set.item, moves, count: 0 };
        group.count++;
        groups.set(key, group);
      }
      const ranked = [...groups.values()].sort((a, b) => b.count - a.count);
      if (!ranked.length) continue;
      const total = ranked.reduce((sum, group) => sum + group.count, 0);
      // the most common set of every role first, then the most common others, until KEEP
      const chosen = [];
      for (const group of ranked) if (!chosen.some(c => c.role === group.role)) chosen.push(group);
      for (const group of ranked) if (chosen.length < KEEP && !chosen.includes(group) && group.count / total >= MIN_SHARE) chosen.push(group);
      const kept = chosen.slice(0, KEEP).filter((group, i) => i === 0 || group.count / total >= MIN_SHARE / 2);
      const keptTotal = kept.reduce((sum, group) => sum + group.count, 0);
      const out = kept.map(group => {
        const items = itemsFor(formatid, dex, speciesName, group.role, group.moves, group.generated);
        return { role: group.role, weight: Math.round((group.count / keptTotal) * 100) / 100, ability: group.ability, items, moves: group.moves, ...spread(dex, species, group.role, group.moves) };
      }).map(set => {
        return set;
      }).filter(set => {
        // the whole set, as it will be brought, must pass
        return !validateTeam(formatid, [{ name: "", species: speciesName, ability: set.ability, item: set.items[0], moves: set.moves, nature: set.nature, evs: set.evs, level: 50 }]);
      }).filter(set => set.items.length);
      // a species that Mega Evolves in this regulation carries its stone some of the time, as the most common set
      const megaName = (species.otherFormes || []).find(name => /-Mega/.test(name));
      const stone = megaName && dex.species.get(megaName).requiredItem;
      if (stone && out.length && legal(formatid, { species: speciesName, ability: out[0].ability, item: stone, moves: [out[0].moves[0]] })) {
        for (const set of out) set.weight = Math.round(set.weight * (1 - MEGA_SHARE) * 100) / 100;
        out.push({ ...out[0], role: `${out[0].role} (Mega)`, weight: MEGA_SHARE, items: [stone], mega: true });
      }
      if (out.length) list.push({ species: speciesName, sets: out });
    }
    (out[reg] ||= {})[kind] = list;
    console.log(reg, kind, `${list.length} species, ${list.reduce((n, e) => n + e.sets.length, 0)} sets`);
  }
}
writeFileSync(OUT, JSON.stringify(out));
console.log("wrote", OUT.pathname);

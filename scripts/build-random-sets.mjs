// Builds src/data/random-sets.json: Pokémon Showdown's gen 9 random battle sets (singles and doubles, as pkmn publishes them),
// kept to what each of the site's regulations allows. Every species, ability, item and move is checked by Showdown's own team
// validator for that regulation's format, so a random party is legal by construction (the engine validates it again).
//
//   node scripts/build-random-sets.mjs      (needs the network: pkmn.github.io)
import { writeFileSync } from "node:fs";
import { validateTeam, formatId } from "../supabase/functions/battle/engine.mjs";

const SOURCES = {
  singles: "https://pkmn.github.io/randbats/data/gen9randombattle.json",
  doubles: "https://pkmn.github.io/randbats/data/gen9randomdoublesbattle.json",
};
const REGULATIONS = ["m-c", "m-b"];
const OUT = new URL("../src/data/random-sets.json", import.meta.url);

const base = { name: "", nature: "Serious", evs: { hp: 2 }, level: 50 };
// a set alone, padded to a legal team of one (the engine lifts the six-Pokémon minimum)
const legal = (formatid, set) => !validateTeam(formatid, [{ ...base, ...set }]);

const out = { source: SOURCES, built: new Date().toISOString().slice(0, 10) };
for (const [kind, url] of Object.entries(SOURCES)) {
  const data = await (await fetch(url)).json();
  for (const reg of REGULATIONS) {
    const formatid = formatId(reg, kind);
    const list = [];
    for (const [species, entry] of Object.entries(data)) {
      // the species itself, with a move it surely knows and no item, must be legal first
      const roles = [];
      for (const role of Object.values(entry.roles || {})) {
        const abilities = (role.abilities || entry.abilities || []).filter(ability => role.moves.some(move => legal(formatid, { species, ability, moves: [move] })));
        if (!abilities.length) continue;
        const moves = role.moves.filter(move => legal(formatid, { species, ability: abilities[0], moves: [move] }));
        if (moves.length < 2) continue;
        const items = (role.items || entry.items || []).filter(item => legal(formatid, { species, ability: abilities[0], item, moves: [moves[0]] }));
        roles.push({ abilities, items, moves });
      }
      if (roles.length) list.push({ species, roles });
    }
    (out[reg] ||= {})[kind] = list;
    console.log(reg, kind, `${list.length} species of ${Object.keys(data).length}`);
  }
}
writeFileSync(OUT, JSON.stringify(out));
console.log("wrote", OUT.pathname);

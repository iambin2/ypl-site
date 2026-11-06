// Whether a set plays as it should in its kind of battle. The ladder's statistics carry sets from the wrong game: a rare Pokémon's
// singles share is filled from doubles and from low ratings that copy doubles sets (Indeedee-F with Follow Me in singles), and old
// habits from games that played otherwise (Protect on a Mega Beedrill, which since Gen 7 gets its Mega speed on the turn it evolves).
import { toID } from "@pkmn/sim";

// moves that need a partner, or only help the foe, when there is no ally on the field
export const ALLY_ONLY = new Set(["followme", "ragepowder", "spotlight", "helpinghand", "allyswitch", "aromaticmist", "holdhands",
  "coaching", "dragoncheer", "healpulse", "floralhealing", "afteryou", "quash", "instruct", "decorate", "wideguard",
  "quickguard", "craftyshield"]);
const PROTECT = new Set(["protect", "detect", "spikyshield", "kingsshield", "banefulbunker", "silktrap", "burningbulwark", "obstruct"]);
// in singles a turn behind Protect pays only when something works for the set in that turn
const PROTECT_ABILITY = new Set(["speedboost", "poisonheal", "moody", "hungerswitch"]);
const PROTECT_ITEM = new Set(["flameorb", "toxicorb"]);
const PROTECT_MOVE = new Set(["wish", "leechseed", "toxic", "perishsong", "saltcure", "willowisp", "yawn", "futuresight", "doomdesire",
  "toxicspikes", "infestation", "whirlpool", "firespin", "sandtomb", "magmastorm", "bind", "wrap", "snaptrap", "thundercage"]);

/* the moves of a singles set that do nothing for it: { kind, ability (the Mega's own for a Mega set), item, moves }. Doubles sets keep
   everything: there every one of these has a use. */
export function idleMoves({ kind, ability, item, moves }) {
  if (kind !== "singles") return [];
  const ids = moves.map(toID);
  const protectPays = PROTECT_ABILITY.has(toID(ability)) || PROTECT_ITEM.has(toID(item)) || ids.some(id => PROTECT_MOVE.has(id));
  return moves.filter((_, i) => ALLY_ONLY.has(ids[i]) || (PROTECT.has(ids[i]) && !protectPays));
}

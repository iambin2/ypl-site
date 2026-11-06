// The team builder's type matchups (DESIGN.md "Team builder"): how hard each attacking type hits each member, and how hard each
// member's moves hit each type. Pure; the 18 by 18 chart is written here so the builder does not load @smogon/calc for it
// (tests/teamTypeChart.test.mjs checks it against the calculator's own chart).
import { TYPE_OPTIONS } from "../data/index.js";

const TYPES = TYPE_OPTIONS.map(type => type.english);

// attacking type: [hits these for 2, these for 1/2, these for 0]
const CHART = {
  Normal: [[], ["Rock", "Steel"], ["Ghost"]],
  Fire: [["Grass", "Ice", "Bug", "Steel"], ["Fire", "Water", "Rock", "Dragon"], []],
  Water: [["Fire", "Ground", "Rock"], ["Water", "Grass", "Dragon"], []],
  Electric: [["Water", "Flying"], ["Electric", "Grass", "Dragon"], ["Ground"]],
  Grass: [["Water", "Ground", "Rock"], ["Fire", "Grass", "Poison", "Flying", "Bug", "Dragon", "Steel"], []],
  Ice: [["Grass", "Ground", "Flying", "Dragon"], ["Fire", "Water", "Ice", "Steel"], []],
  Fighting: [["Normal", "Ice", "Rock", "Dark", "Steel"], ["Poison", "Flying", "Psychic", "Bug", "Fairy"], ["Ghost"]],
  Poison: [["Grass", "Fairy"], ["Poison", "Ground", "Rock", "Ghost"], ["Steel"]],
  Ground: [["Fire", "Electric", "Poison", "Rock", "Steel"], ["Grass", "Bug"], ["Flying"]],
  Flying: [["Grass", "Fighting", "Bug"], ["Electric", "Rock", "Steel"], []],
  Psychic: [["Fighting", "Poison"], ["Psychic", "Steel"], ["Dark"]],
  Bug: [["Grass", "Psychic", "Dark"], ["Fire", "Fighting", "Poison", "Flying", "Ghost", "Steel", "Fairy"], []],
  Rock: [["Fire", "Ice", "Flying", "Bug"], ["Fighting", "Ground", "Steel"], []],
  Ghost: [["Psychic", "Ghost"], ["Dark"], ["Normal"]],
  Dragon: [["Dragon"], ["Steel"], ["Fairy"]],
  Dark: [["Psychic", "Ghost"], ["Fighting", "Dark", "Fairy"], []],
  Steel: [["Ice", "Rock", "Fairy"], ["Fire", "Water", "Electric", "Steel"], []],
  Fairy: [["Fighting", "Dragon", "Dark"], ["Fire", "Poison", "Steel"], []],
};

export function effectiveness(attacking, defending) {
  const [double, half, none] = CHART[attacking] || [[], [], []];
  return none.includes(defending) ? 0 : double.includes(defending) ? 2 : half.includes(defending) ? 0.5 : 1;
}

// Abilities that change what a type does to their holder. ponytail: immunities and halvings only; Filter, Fluffy, Dry Skin's fire and
// Wonder Guard are left out, add them here when the regulation makes them matter.
const ABILITY_TAKEN = {
  Levitate: { Ground: 0 }, "Earth Eater": { Ground: 0 },
  "Flash Fire": { Fire: 0 }, "Well-Baked Body": { Fire: 0 },
  "Water Absorb": { Water: 0 }, "Storm Drain": { Water: 0 }, "Dry Skin": { Water: 0 },
  "Volt Absorb": { Electric: 0 }, "Lightning Rod": { Electric: 0 }, "Motor Drive": { Electric: 0 },
  "Sap Sipper": { Grass: 0 },
  "Thick Fat": { Fire: 0.5, Ice: 0.5 }, Heatproof: { Fire: 0.5 }, "Water Bubble": { Fire: 0.5 }, "Purifying Salt": { Ghost: 0.5 },
};

// One member against every attacking type, its ability counted.
export function damageTaken(types = [], ability = "") {
  return TYPES.map(attacking => types.reduce((m, type) => m * effectiveness(attacking, type), 1) * (ABILITY_TAKEN[ability]?.[attacking] ?? 1));
}

// What a move hits each type for. Normal moves turn under an -ate ability; a few moves and abilities break the plain chart.
const ATE = { Pixilate: "Fairy", Aerilate: "Flying", Refrigerate: "Ice", Galvanize: "Electric" };
// moves whose damage does not follow the matchup (fixed or taken from HP): they count for nothing here
const FIXED = new Set(["seismictoss", "nightshade", "superfang", "ruination", "naturesmadness", "finalgambit", "endeavor", "counter", "mirrorcoat", "metalburst", "comeuppance", "psywave"]);
function moveHits(move, ability, defending) {
  const type = ability === "Normalize" ? "Normal" : move.type === "Normal" && ATE[ability] ? ATE[ability] : move.type;
  if (move.id === "freezedry" && defending === "Water") return 2;
  if (move.id === "thousandarrows" && defending === "Flying") return 1;
  if (defending === "Ghost" && (type === "Normal" || type === "Fighting") && (ability === "Scrappy" || ability === "Mind's Eye")) return 1;
  const m = effectiveness(type, defending);
  return move.id === "flyingpress" ? m * effectiveness("Flying", defending) : m;
}

// One member's best damaging move against every type: [{ m, move }] or null where it has no damaging move.
export function damageDealt(moves = [], ability = "") {
  const hitting = moves.filter(move => move && move.category !== "Status" && !FIXED.has(move.id));
  if (!hitting.length) return TYPES.map(() => null);
  return TYPES.map(defending => hitting.reduce((best, move) => {
    const m = moveHits(move, ability, defending);
    return !best || m > best.m ? { m, move } : best;
  }, null));
}

// The team's rows, one an attacking (defence) or defending (offence) type, in the games' order.
// members: [{ types, ability, moves: [{ id, type, category }] }]
export function teamMatchups(members = []) {
  const taken = members.map(member => damageTaken(member.types, member.ability));
  const dealt = members.map(member => damageDealt(member.moves, member.ability));
  return TYPE_OPTIONS.map((type, row) => {
    const defence = taken.map(column => column[row]);
    const offence = dealt.map(column => column[row]);
    return {
      type,
      defence,
      weak: defence.filter(m => m > 1).length,
      resist: defence.filter(m => m < 1).length,
      offence,
      hits: offence.filter(cell => cell && cell.m > 1).length,
    };
  });
}

// ×4, ×2, ×½, ×¼, ×0, or "" for ×1: the battle's own marks (DESIGN.md "Battle", Choices)
export function multiplierMark(m) {
  if (m == null || m === 1) return "";
  return m >= 4 ? "×4" : m > 1 ? "×2" : m === 0 ? "×0" : m >= 0.5 ? "×½" : "×¼";
}

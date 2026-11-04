// 배틀 실험실(개발 전용)의 견본 팀. A는 엔진 시험의 팀(메가진화 포함), B는 날씨, 필드, 벽, 상태이상을 고루 꺼내는 팀이다.
const set = (species, item, ability, moves, nature) => ({ name: "", species, item, ability, moves, nature, evs: { hp: 2, atk: 32, spe: 32 }, level: 50 });

export const LAB_TEAMS = {
  "견본 A": [
    set("Charizard-Mega-Y", "Charizardite Y", "Blaze", ["Heat Wave", "Air Slash", "Solar Beam", "Protect"], "Timid"),
    set("Garchomp", "Choice Scarf", "Rough Skin", ["Earthquake", "Dragon Claw", "Rock Slide", "Protect"], "Jolly"),
    set("Incineroar", "Sitrus Berry", "Intimidate", ["Fake Out", "Flare Blitz", "Throat Chop", "Parting Shot"], "Adamant"),
    set("Rotom-Wash", "Leftovers", "Levitate", ["Hydro Pump", "Thunderbolt", "Will-O-Wisp", "Protect"], "Modest"),
    set("Kingambit", "Black Glasses", "Defiant", ["Kowtow Cleave", "Sucker Punch", "Iron Head", "Protect"], "Adamant"),
    set("Sinistcha", "Mental Herb", "Hospitality", ["Matcha Gotcha", "Rage Powder", "Trick Room", "Strength Sap"], "Relaxed"),
  ],
  "견본 B": [
    set("Tyranitar", "Sitrus Berry", "Sand Stream", ["Rock Slide", "Stealth Rock", "Dragon Dance", "Protect"], "Adamant"),
    set("Pelipper", "Damp Rock", "Drizzle", ["Hurricane", "Hydro Pump", "Tailwind", "Protect"], "Modest"),
    set("Whimsicott", "Focus Sash", "Prankster", ["Moonblast", "Tailwind", "Light Screen", "Encore"], "Timid"),
    set("Gengar", "Leftovers", "Cursed Body", ["Shadow Ball", "Will-O-Wisp", "Thunder Wave", "Toxic"], "Timid"),
    set("Hatterene", "Mental Herb", "Magic Bounce", ["Psychic", "Trick Room", "Calm Mind", "Mystical Fire"], "Quiet"),
    set("Ninetales-Alola", "Light Clay", "Snow Warning", ["Blizzard", "Aurora Veil", "Freeze-Dry", "Moonblast"], "Timid"),
  ],
};

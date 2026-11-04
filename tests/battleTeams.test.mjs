// A team saved in the builder becomes a Showdown team the battle function accepts.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { showdownTeam, readSavedTeams } from "../src/services/battleTeams.js";
import { TEAM_STORAGE_KEY } from "../src/services/teamBuilderCore.js";
import { formatId, validateTeam } from "../supabase/functions/battle/engine.mjs";

const detailData = JSON.parse(readFileSync(new URL("../src/data/champions-data.json", import.meta.url), "utf8"));
const member = (pokemonName, pokemonId, item, ability, moves, alignment, statPoints) => ({ pokemonName, pokemonId, item, ability, moves, alignment, statPoints });
const saved = {
  id: "t1", name: "테스트", regulationId: "m-c", updatedAt: "2026-11-04T00:00:00Z",
  members: [
    member("Charizard [Mega Y]", "charizardmegay", "charizarditey", "Blaze", ["heatwave", "airslash", "solarbeam", "protect"], "timid", { hp: 2, spa: 32, spe: 32 }),
    member("Garchomp", "garchomp", "choicescarf", "Rough Skin", ["earthquake", "dragonclaw", "rockslide", ""], "jolly", { hp: 2, atk: 32, spe: 32 }),
    member("Incineroar", "incineroar", "sitrusberry", "Intimidate", ["fakeout", "flareblitz", "throatchop", "partingshot"], "adamant", { hp: 32, atk: 32, spd: 2 }),
    member("Rotom [Wash]", "rotomwash", "leftovers", "Levitate", ["hydropump", "thunderbolt", "willowisp", "protect"], "modest", { hp: 32, spa: 32, spd: 2 }),
    member("Kingambit", "kingambit", "blackglasses", "Defiant", ["kowtowcleave", "suckerpunch", "ironhead", "protect"], "adamant", { hp: 32, atk: 32, spe: 2 }),
    member("Sinistcha", "sinistcha", "mentalherb", "Hospitality", ["matchagotcha", "ragepowder", "trickroom", "strengthsap"], "relaxed", { hp: 32, def: 32, spa: 2 }),
  ],
};

test("a saved builder team is a legal Showdown team, points as they are and the Mega brought as its base form", () => {
  const team = showdownTeam(saved, detailData);
  assert.equal(team[0].species, "Charizard-Mega-Y");
  assert.equal(team[0].nature, "Timid");
  assert.deepEqual(team[0].evs, { hp: 2, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 });
  assert.deepEqual(team[1].moves, ["earthquake", "dragonclaw", "rockslide"], "an empty move slot is left out");
  for (const kind of ["singles", "doubles"]) assert.equal(validateTeam(formatId("m-c", kind), team), null, kind);
});

test("saved teams are read newest first, and broken storage reads as none", () => {
  const store = value => ({ getItem: key => (key === TEAM_STORAGE_KEY ? value : null) });
  const older = { ...saved, id: "t0", updatedAt: "2026-10-01T00:00:00Z" };
  assert.deepEqual(readSavedTeams(store(JSON.stringify([older, saved]))).map(t => t.id), ["t1", "t0"]);
  assert.deepEqual(readSavedTeams(store("{broken")), []);
  assert.deepEqual(readSavedTeams(store(null)), []);
});

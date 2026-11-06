// Every sample set holds its moves with every item it may carry: the first, and each back-up the item clause of a random party falls
// back on. A Choice item or an Assault Vest takes no status move (a Choice item may carry Trick and its kin), so 명상 never comes under
// a Choice Scarf (feedback 2026-11-06).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Dex } from "@pkmn/sim";
import { idleMoves } from "../scripts/setFit.mjs";

const sets = JSON.parse(readFileSync(new URL("../src/data/random-sets.json", import.meta.url), "utf8"));
const detail = JSON.parse(readFileSync(new URL("../src/data/champions-data.json", import.meta.url), "utf8"));
const id = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const NO_STATUS = new Set(["choicescarf", "choiceband", "choicespecs", "assaultvest"]);
const CHOICE_OK = new Set(["trick", "switcheroo", "healingwish", "memento"]);

test("no set carries a status move under a Choice item or an Assault Vest, first item or back-up", () => {
  const bad = [];
  for (const reg of ["m-c", "m-b"]) for (const format of ["singles", "doubles"]) for (const entry of sets[reg][format]) for (const set of entry.sets) {
    for (const item of set.items) {
      if (!NO_STATUS.has(id(item))) continue;
      const wrong = set.moves.filter(m => detail.moves[id(m)]?.category === "Status" && !(id(item).startsWith("choice") && CHOICE_OK.has(id(m))));
      if (wrong.length) bad.push(`${reg} ${format} ${entry.species}: ${item} with ${wrong.join(", ")}`);
    }
  }
  assert.deepEqual(bad.slice(0, 5), []);
});

// singles sets carry nothing that needs a partner (Follow Me, Helping Hand) and no Protect without a reason in that turn: Protect on a
// Mega Beedrill was for the Mega speed of Gen 6 (feedback 2026-11-07). A Mega set is judged by the Mega's own ability, and every item
// a set may carry counts, back-ups included.
test("no singles set carries a move that does nothing without an ally or a Protect with nothing to wait for", () => {
  const bad = [];
  for (const reg of ["m-c", "m-b"]) for (const entry of sets[reg].singles) for (const set of entry.sets) for (const item of set.items) {
    const mega = Dex.items.get(item).megaStone?.[entry.species];
    const idle = idleMoves({ kind: "singles", ability: mega ? Dex.species.get(mega).abilities[0] : set.ability, item, moves: set.moves });
    if (idle.length) bad.push(`${reg} ${entry.species}: ${idle.join(", ")} with ${item}`);
  }
  assert.deepEqual(bad.slice(0, 5), []);
});

import { PRNG, toID } from "@pkmn/sim";
import { loadBattle, setPool } from "../../supabase/functions/battle/engine.mjs";
import { revives, slotPasses } from "./battleLog.js";

/* 컴퓨터 상대 (1인 배틀). 엔진은 이 브라우저의 워커에서 돌고(src/pages/battle/cpu.worker.js), 컴퓨터는 사람처럼 자기 요청과 공개된 것만 보고 고른다.

   보지 않는 것: 상대가 이번 턴에 고른 것(컴퓨터가 늘 먼저 고른다), 상대 포켓몬의 아직 드러나지 않은 기술, 도구, 특성, 노력치,
   그리고 엔진의 난수(시뮬레이션마다 새 시드를 쓴다). 상대가 데려온 포켓몬의 종은 안다(선출 뒤의 벤치까지는 숨기지 않는다).
   ponytail: 벤치의 종까지 숨기려면 결정화에서 드러나지 않은 벤치 포켓몬을 선출 화면의 여섯에서 뽑아 바꿔 넣는다.

   고르는 법 (랭커가 생각하는 순서를 그대로):
   1. 결정화: 상대 포켓몬마다 아직 드러나지 않은 세트를 래더 사용률 샘플 세트(random-sets.json)에서 드러난 것과 맞는 것으로 뽑아 채운다.
   2. 후보: 우리 선택지와 상대 선택지를 휴리스틱(기대 피해, 기절, 우선도, 보조기의 쓸모)으로 줄인다. 앞의 포켓몬에게 아무 일도
      일으키지 못하는 기술(면역, 이미 걸린 상태이상, 체력이 가득할 때의 회복, 이미 펼쳐진 벽, 구애 고정이 묶은 그런 기술)은
      다른 선택이 있는 한 후보에서 뺀다. 교체를 읽고 던지는 헛수는 두지 않는다.
   3. 행렬: 두 선택의 모든 짝을 진짜 엔진으로 한 턴 돌리고, 둘 다 가장 센 공격을 고르는 한 턴을 더 본 뒤 국면을 평가한다.
   4. 상대 모형: 행렬의 내시 균형(최선의 상대)과 사람이 고르기 쉬운 수(눈에 띄는 공격)를 반씩 섞고, 그 안의 교체 비중을 이 상대가
      실제로 교체해 온 만큼으로 당겨, 그에 대한 기대값이 가장 큰 수를 둔다.
   5. 시간이 남는 동안 1에서 4를 다시 뽑아 평균한다(결정화 몬테카를로). 시간은 정해져 있어 느린 휴대폰에서는 표본이 줄 뿐이다. */

/* tuned by self-play against the quick player (60 mirrored games a setting, 2026-11-06): the trade term from 0.1 to 0.7 and the
   human share from 0.2 to 0.8 all landed within noise of each other, so both stay in the middle */
const TUNE = { race: 0.35, human: 0.5 };
// one greedy turn after the pair: three measured no stronger (41 of 60 either way) and cost twice the time
const ROLLOUT_TURNS = 1;
// what a hard switch has to win by over staying in, in the evaluation's Pokémon (one healthy Pokémon is about 2)
const SWITCH_COST = 0.12;
const NOW = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const other = side => (side === "p1" ? "p2" : "p1");
const isDoubles = battle => battle.gameType === "doubles";

// a fresh copy of a battle that prints nothing; its log is dropped, as nothing it plays is ever read back
function strip(battle) {
  const json = battle.toJSON();
  json.log = []; json.inputLog = []; json.messageLog = []; json.sentLogPos = 0; json.lastMoveLine = -1;
  return JSON.stringify(json);
}
function revive(text, seed) {
  const s = loadBattle(JSON.parse(text));
  s.send = () => {};
  if (seed) s.prng = new PRNG(seed);
  return s;
}
const seedOf = random => Array.from({ length: 4 }, () => Math.floor(random() * 0x10000));

/* ---------- what the battle has shown of the other side: items and abilities by name (moves are kept by the engine as used) ---------- */
export function revealed(log, foe) {
  const seen = {};
  const nameOf = who => (who && who.startsWith(foe) ? who.replace(/^p\d[a-d]?: /, "") : null);
  const note = (name, key, value) => { if (name && value) (seen[name] ||= {})[key] = value; };
  let secret = false;
  for (const line of log) {
    // after |split| comes the secret copy of a line, then its public copy: only the public one is read
    if (secret) { secret = false; continue; }
    if (line.startsWith("|split|")) { secret = true; continue; }
    if (!line.includes(foe)) continue;
    const parts = line.split("|");
    const [tag, subject] = [parts[1], parts[2]];
    if (tag === "-item" || tag === "-enditem") note(nameOf(subject), "item", parts[3]);
    if (tag === "-ability") note(nameOf(subject), "ability", parts[3]);
    if (tag === "-mega") note(nameOf(subject), "item", parts[4]);
    const from = parts.find(p => p.startsWith("[from] "))?.slice(7);
    const of = parts.find(p => p.startsWith("[of] "))?.slice(5);
    const m = from && /^(item|ability): (.+)$/.exec(from);
    if (m) note(of ? nameOf(of) : nameOf(subject), m[1], m[2]);
  }
  return seen;
}

/* ---------- how often the other side switches when it could have stayed: a switch after a faint or from a pivoting move is not
   a choice, so only the turn's own switches before the upkeep count ---------- */
export function habit(log, foe) {
  let main = false, secret = false, switches = 0, chances = 0;
  for (const line of log) {
    if (secret) { secret = false; continue; }
    if (line.startsWith("|split|")) { secret = true; continue; }
    const [, tag, who = ""] = line.split("|");
    if (tag === "turn") main = true;
    else if (tag === "upkeep") main = false;
    else if (main && who.startsWith(foe) && !line.includes("[from]")) {
      if (tag === "switch") { switches++; chances++; } else if (tag === "move" || tag === "cant") chances++;
    }
  }
  return { switches, chances };
}

/* ---------- belief: the other side's hidden sets filled in from the sample sets, kept to what has been shown ---------- */
function poolOf(formatid) {
  const map = new Map();
  for (const entry of setPool(formatid)) map.set(toID(entry.species), entry.sets.map(set => ({ ...set, moveIds: set.moves.map(toID), itemId: toID(set.items[0]) })));
  return map;
}
function pickWeighted(list, random) {
  let roll = random() * list.reduce((sum, x) => sum + x.weight, 0);
  return list.find(x => (roll -= x.weight) < 0) || list[list.length - 1];
}
/* what one of their Pokémon may carry: its sample sets, and each attacking set with a Choice item or an Assault Vest it does not list,
   at a hundredth of its weight (players bring a Scarf the ladder's top sets lack). What the battle shows narrows these (infer below). */
const VARIANTS = [["choicescarf", "any"], ["choiceband", "Physical"], ["choicespecs", "Special"], ["assaultvest", "any"]];
function hypothesesOf(dex, sets) {
  const out = [...sets];
  for (const set of sets) {
    if (set.mega) continue;
    const kinds = set.moveIds.map(id => dex.moves.get(id).category);
    if (kinds.includes("Status")) continue;
    const leaning = kinds.filter(k => k === "Physical").length >= kinds.filter(k => k === "Special").length ? "Physical" : "Special";
    for (const [item, kind] of VARIANTS) {
      if (set.itemId === item || set.items.some(name => toID(name) === item) || (kind !== "any" && kind !== leaning)) continue;
      out.push({ ...set, items: [dex.items.get(item).name], itemId: item, weight: set.weight * 0.01, variant: true });
    }
  }
  return out;
}
const fitsShown = (set, used, shown) => used.every(id => set.moveIds.includes(id))
  && (!shown.ability || toID(shown.ability) === toID(set.ability)) && (!shown.item || toID(shown.item) === set.itemId);
function believe(state, foe, candidatesOf, seen, random, likeliest) {
  const megaUsed = state[foe].pokemon.some(p => p.species.isMega);
  for (const p of state[foe].pokemon) {
    const sets = candidatesOf(state, p);
    if (!sets || p.transformed) continue;
    const shown = seen[p.name] || {};
    const used = p.baseMoveSlots.filter(slot => slot.used).map(slot => slot.id);
    const fits = sets.filter(set => fitsShown(set, used, shown));
    const choices = fits.length ? fits : sets.filter(set => used.every(id => set.moveIds.includes(id))).length ? sets.filter(set => used.every(id => set.moveIds.includes(id))) : sets;
    const set = likeliest ? choices.reduce((a, b) => (b.weight > a.weight ? b : a)) : pickWeighted(choices, random);
    applySet(state, p, set, shown, megaUsed);
  }
}
function applySet(state, p, set, shown, megaUsed) {
  const used = p.baseMoveSlots.filter(slot => slot.used).map(slot => slot.id);
  // moves: the ones shown stay as they are (with their PP), the rest come from the set
  const ids = [...used];
  for (const id of set.moveIds) if (ids.length < 4 && !ids.includes(id)) ids.push(id);
  const old = Object.fromEntries(p.baseMoveSlots.map(slot => [slot.id, slot]));
  p.baseMoveSlots = ids.map(id => old[id] || slotFor(state, id));
  p.moveSlots = p.baseMoveSlots.slice();
  if (!shown.ability && p.ability === p.baseAbility && !p.species.isMega) {
    const ability = toID(set.ability);
    p.baseAbility = p.ability = ability;
    p.abilityState = state.initEffectState({ id: ability, target: p });
  }
  if (!shown.item && p.item && !p.species.isMega) {
    p.item = set.itemId;
    p.itemState = state.initEffectState({ id: p.item, target: p });
  }
  p.canMegaEvo = megaUsed ? null : state.actions.canMegaEvo(p);
  // stats from the set's nature and points; the share of HP left is what the screen shows
  // in place: the engine finds a Pokémon's set in its side's team by identity when it saves the battle
  Object.assign(p.set, { nature: set.nature, evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...set.evs }, ability: set.ability, item: set.items[0], moves: ids });
  const stats = state.spreadModify(p.species.baseStats, p.set);
  const share = p.maxhp ? p.hp / p.maxhp : 1;
  p.baseMaxhp = p.maxhp = stats.hp;
  p.hp = p.fainted ? 0 : Math.max(1, Math.round(share * stats.hp));
  p.baseStoredStats = stats;
  for (const key of Object.keys(p.storedStats)) p.storedStats[key] = stats[key];
  p.speed = p.storedStats.spe;
}
function slotFor(state, id) {
  const move = state.dex.moves.get(id);
  const pp = state.calculatePP ? state.calculatePP(move, 3) : Math.floor(move.pp * 8 / 5);
  return { move: move.name, id: move.id, pp, maxpp: pp, target: move.target, disabled: false, disabledSource: "", used: false };
}

/* ---------- inference: what the last turn showed about their sets, as a ranker reads it ----------
   Two readings, each on the battle as it stood before the turn with one guess at a time put on their Pokémon:
   - speed: their Pokémon and ours both attacked at the same priority; whoever moved first is the faster (a Pokémon that should be
     slower but moved first holds a Choice Scarf);
   - damage: a hit is held against the damage roll range the guess allows (a hit harder than any roll of the plain set means a Choice
     Band or Specs, a hit softer than any roll on them an Assault Vest or a bulkier spread). Our HP is read exactly, theirs as a percent.
   A guess the turn rules out is dropped for the rest of the battle. Anything that could change the reading before the move (a switch,
   a Mega Evolution, a stat change, weather, a field or side condition, an item used, a critical hit, a Protect or Substitute, a Sash)
   leaves that turn unread, and a turn that would rule out every guess is ignored, so a misreading never leaves the computer empty. */
const UNREAD = /^\|(switch|drag|replace|-mega|-boost|-unboost|-setboost|-clearboost|-clearallboost|-clearnegativeboost|-copyboost|-swapboost|-invertboost|-status|-curestatus|-weather|-fieldstart|-fieldend|-sidestart|-sideend|-swapsideconditions|-enditem|-item|-activate|detailschange|-formechange|-transform|-start|-end|-singleturn|-ability|cant)\|/;
// what can change who moves first: only these stop the speed reading (a Defense boost from Stamina does not)
const SPEED_UNREAD = /^\|(switch|drag|replace|-mega|detailschange|-formechange|-transform|-weather|-fieldstart|-fieldend|-sidestart|-sideend|-enditem|-item|-clearboost|-clearallboost|-swapboost|-copyboost|-invertboost)\|/;
const changesSpeed = (line, parts) => SPEED_UNREAD.test(line) || (/^\|-(boost|unboost|setboost)\|/.test(line) && parts[3] === "spe")
  || (parts[1] === "-status" && parts[3] === "par") || (parts[1] === "-activate" && /Quick Claw|Quick Draw/.test(line));
const hpOf = field => (field ? parseInt(field, 10) || 0 : null);
const nameIn = who => who?.replace(/^p\d[a-d]?: /, "") ?? null;
// the public lines of one turn's main part, each of our own Pokémon's damage lines with its exact HP from the secret copy
function turnEvents(log, turn, side) {
  const start = log.indexOf(`|turn|${turn}`);
  if (start < 0) return [];
  const out = [];
  for (let i = start + 1; i < log.length; i++) {
    const line = log[i];
    if (line === "|upkeep" || line.startsWith("|turn|")) break;
    if (line.startsWith("|split|")) {
      const mine = line.slice(7) === side;
      out.push({ parts: log[i + 2].split("|"), line: log[i + 2], exact: mine ? hpOf(log[i + 1].split("|")[3]) : null });
      i += 2;
    } else out.push({ parts: line.split("|"), line, exact: null });
  }
  return out;
}
function readings(log, turn, side, dex, doubles) {
  const foe = other(side);
  const events = turnEvents(log, turn, side);
  const out = [];
  let unread = false, speedUnread = false;
  const firstMove = {}; // who → index of their own first move line, while nothing had changed who moves first
  const hit = new Set();
  events.forEach((e, i) => {
    const [, tag, who] = e.parts;
    if (changesSpeed(e.line, e.parts)) speedUnread = true;
    if (UNREAD.test(e.line)) { unread = true; return; }
    if (tag !== "move" || e.line.includes("[from]")) return;
    if (!speedUnread && firstMove[who] == null) firstMove[who] = { index: i, move: e.parts[3] };
    if (unread) return;
    // the move's damage line: the first one on its target before the next move, with nothing in between that changes it
    const target = e.parts[4];
    const move = dex.moves.get(e.parts[3]);
    if (!target || move.category === "Status" || move.multihit || (doubles && /^all/.test(move.target)) || hit.has(target)) return;
    for (let j = i + 1; j < events.length; j++) {
      const [, t, subject] = events[j].parts;
      if (t === "move") break;
      if (subject === target && (t === "-crit" || t === "-activate" || t === "-enditem" || t === "-immune" || t === "-fail")) break;
      if (t === "-damage" && subject === target) {
        if (!events[j].line.includes("[from]")) {
          const mine = target.startsWith(side), theirs = who.startsWith(foe) && mine, ours = who.startsWith(side) && target.startsWith(foe);
          if (theirs || ours) out.push({ kind: "damage", foe: nameIn(theirs ? who : target), attacker: nameIn(who), target: nameIn(target), mine, move: move.name, after: mine ? events[j].exact : hpOf(events[j].parts[3]) });
        }
        hit.add(target);
        break;
      }
    }
  });
  for (const [a, x] of Object.entries(firstMove)) for (const [b, y] of Object.entries(firstMove)) {
    if (!a.startsWith(side) || !b.startsWith(foe)) continue;
    const mx = dex.moves.get(x.move), my = dex.moves.get(y.move);
    if (mx.category === "Status" || my.category === "Status" || mx.priority !== my.priority) continue;
    out.push({ kind: "speed", foe: nameIn(b), mine: nameIn(a), foeFirst: y.index < x.index });
  }
  return out;
}
// the damage a move does with its lowest and highest roll and no critical hit, or null when the engine cannot say
function damageRange(state, source, target, moveName) {
  const out = [];
  for (const roll of [85, 100]) {
    state.randomizer = damage => Math.floor(Math.floor(damage * roll) / 100);
    const move = state.dex.getActiveMove(moveName);
    move.willCrit = false;
    let damage;
    try { damage = state.actions.getDamage(source, target, move, true); } catch { return null; }
    if (typeof damage !== "number") return null;
    out.push(damage);
  }
  return out;
}
const publicPercent = p => (p.hp <= 0 ? 0 : Math.min(p.hp < p.maxhp ? 99 : 100, Math.ceil((100 * p.hp) / p.maxhp)));
/* narrows hypotheses (name → guesses) by the turn before: before is that battle as it stood (strip), log the battle's log now */
function infer(before, log, turn, side, hypotheses, seen) {
  const foe = other(side);
  const state = revive(before);
  const list = readings(log, turn, side, state.dex, isDoubles(state));
  if (!list.length) return;
  const find = (s, name) => state[s].pokemon.find(p => p.name === name && p.isActive && !p.fainted);
  const megaUsed = state[foe].pokemon.some(p => p.species.isMega);
  // their other Pokémon wear their likeliest guess, so nothing hidden of theirs enters a reading
  for (const p of state[foe].pokemon) {
    const guesses = hypotheses.get(p.name);
    if (guesses?.length && !p.transformed) applySet(state, p, guesses.reduce((a, b) => (b.weight > a.weight ? b : a)), seen[p.name] || {}, megaUsed);
  }
  for (const name of new Set(list.map(r => r.foe))) {
    const guesses = hypotheses.get(name);
    const p = find(foe, name);
    if (!guesses || guesses.length < 2 || !p || p.transformed) continue;
    const shown = seen[name] || {};
    const theirs = list.filter(r => r.foe === name);
    const percentBefore = publicPercent(p), oursBefore = Object.fromEntries(state[side].active.filter(Boolean).map(q => [q.name, q.hp]));
    const kept = guesses.filter(guess => {
      applySet(state, p, guess, shown, megaUsed);
      return theirs.every(r => {
        if (r.kind === "speed") {
          const mine = find(side, r.mine);
          if (!mine) return true;
          const a = speedOf(p), b = speedOf(mine);
          return r.foeFirst ? a >= b : a <= b;
        }
        const source = r.mine ? p : find(side, r.attacker), target = r.mine ? find(side, r.target) : p;
        if (!source || !target || r.after == null) return true;
        const range = damageRange(state, source, target, r.move);
        if (!range) return true;
        if (r.mine) {
          const dealt = oursBefore[target.name] - r.after;
          return r.after === 0 ? range[1] + 1 >= dealt : range[0] - 1 <= dealt && dealt <= range[1] + 1;
        }
        const dealt = percentBefore - r.after, low = (100 * range[0]) / p.maxhp, high = (100 * range[1]) / p.maxhp;
        return r.after === 0 ? high + 2 >= dealt : low - 2 <= dealt && dealt <= high + 2;
      });
    });
    if (kept.length) hypotheses.set(name, kept);
  }
}

/* ---------- damage, as the engine counts it, with the average roll and no critical hit ---------- */
// the average damage roll for every estimate; a critical hit never enters one (willCrit), and chances (accuracy, effects) stay random
function calcOn(state) {
  state.randomizer = damage => Math.floor(damage * 0.925);
  return state;
}
const MULTI = { 2: 2, 3: 3, 5: 5 };
function hitShare(state, source, target, moveId) {
  if (!source || !target || source.fainted || target.fainted) return 0;
  const move = state.dex.getActiveMove(moveId);
  if (move.category === "Status") return 0;
  move.willCrit = false;
  let damage;
  try { damage = state.actions.getDamage(source, target, move, true); } catch { return 0; }
  if (!damage) return 0;
  const hits = Array.isArray(move.multihit) ? (move.multihit[1] >= 5 ? 3.1 : move.multihit[0]) : MULTI[move.multihit] || 1;
  const accuracy = move.accuracy === true ? 1 : move.accuracy / 100;
  return (damage * hits * accuracy) / Math.max(1, target.hp);
}
const bestHit = (state, source, target) => Math.max(0, ...source.moveSlots.filter(s => s.pp > 0 && !s.disabled).map(s => hitShare(state, source, target, s.id)));
const speedOf = p => { try { return p.getActionSpeed(); } catch { return p.storedStats?.spe || 0; } };

/* how one Pokémon fares against another: +1 it wins the trade of blows, -1 it loses (turns to faint each other, then speed) */
function race(state, a, b) {
  const ab = Math.min(1, bestHit(state, a, b)), ba = Math.min(1, bestHit(state, b, a));
  if (!ab && !ba) return 0;
  const ta = ab ? Math.ceil(1 / ab - 1e-9) : 9, tb = ba ? Math.ceil(1 / ba - 1e-9) : 9;
  const first = speedOf(a) > speedOf(b) ? 0.5 : speedOf(a) < speedOf(b) ? -0.5 : 0;
  return Math.max(-1, Math.min(1, (tb - ta + first) / 2));
}

/* ---------- the position: what a ranker counts, in Pokémon (one healthy Pokémon is about 2) ---------- */
const STATUS_COST = { brn: 0.3, par: 0.3, slp: 0.45, frz: 0.5, psn: 0.15, tox: 0.25 };
const HAZARD = { stealthrock: 0.12, spikes: 0.07, toxicspikes: 0.08, stickyweb: 0.12 };
const SCREEN = { reflect: 0.2, lightscreen: 0.2, auroraveil: 0.3, tailwind: 0.35, safeguard: 0.05, mist: 0.03 };
function sideScore(state, side) {
  const s = state[side];
  let score = 0, bench = 0;
  for (const p of s.pokemon) {
    if (p.fainted || p.hp <= 0) continue;
    let value = 1 + p.hp / p.maxhp;
    const physical = p.storedStats.atk >= p.storedStats.spa;
    value -= (STATUS_COST[p.status] || 0) * (p.status === "brn" && !physical ? 0.4 : p.status === "par" && p.storedStats.spe < 60 ? 0.5 : 1);
    if (p.isActive) {
      const b = p.boosts;
      value += 0.12 * Math.max(-3, Math.min(3, physical ? b.atk : b.spa)) + 0.03 * (physical ? b.spa : b.atk)
        + 0.1 * Math.max(-3, Math.min(3, b.spe)) + 0.06 * Math.max(-3, Math.min(3, b.def + b.spd)) + 0.06 * (b.evasion - b.accuracy);
      if (p.volatiles.substitute) value += 0.15;
      if (p.volatiles.confusion) value -= 0.1;
      if (p.volatiles.leechseed) value -= 0.1;
    } else bench++;
    score += value;
  }
  for (const [id, cond] of Object.entries(s.sideConditions)) {
    if (HAZARD[id]) score -= HAZARD[id] * (cond.layers || 1) * bench;
    if (SCREEN[id]) score += screenWorth(state, side, id) * Math.min(1, (cond.duration || 3) / 3);
  }
  return score;
}
/* a screen is worth what it blocks, for the Pokémon left to stand behind it (2026-11-06: every screen counted 0.2 whoever attacked,
   so Grimmsnarl put Reflect up against a special attacker, Light Screen against a physical one, and a screen with no one left behind
   it instead of attacking). Reflect counts the other side's physical attacks, Light Screen its special ones, by the moves they carry */
const WALLS = { reflect: "Physical", lightscreen: "Special", auroraveil: "both" };
function physicalShare(state, side) {
  let physical = 0, all = 0;
  for (const p of state[side].pokemon) {
    if (p.fainted || p.hp <= 0) continue;
    for (const slot of p.moveSlots) {
      const move = state.dex.moves.get(slot.id);
      if (move.category === "Status") continue;
      all++;
      if (move.category === "Physical") physical++;
    }
  }
  return all ? physical / all : 0.5;
}
function screenWorth(state, side, id) {
  const wall = WALLS[id];
  if (!wall) return SCREEN[id] || 0;
  const share = physicalShare(state, other(side));
  const blocks = wall === "both" ? 1 : wall === "Physical" ? share : 1 - share;
  // five turns shield the whole team: one Pokémon left gains a quarter of it, two most of it
  const left = state[side].pokemon.filter(p => !p.fainted && p.hp > 0).length;
  return SCREEN[id] * blocks * Math.min(1, 0.25 + 0.375 * (left - 1));
}
function evaluate(state, side) {
  if (state.ended) {
    const winner = state.winnerSide || (state.winner === state[side].name ? side : state.winner === state[other(side)].name ? other(side) : "tie");
    /* a win keeps more, a loss leaves the winner less: in a game lost every way the moves that hurt most still come first (the only
       way back is a miss or a critical hit), instead of a screen or a pivot that only delays it */
    if (winner === "tie") return 0;
    return winner === side ? 100 + sideScore(state, side) : -100 - sideScore(state, other(side));
  }
  const foe = other(side);
  let value = sideScore(state, side) - sideScore(state, foe);
  // the Pokémon facing each other: who wins the trade of blows (an empty place counts our best Pokémon left to send)
  const mine = state[side].active.filter(p => p && !p.fainted);
  const theirs = state[foe].active.filter(p => p && !p.fainted);
  if (mine.length && theirs.length) {
    let trade = 0;
    for (const a of mine) for (const b of theirs) trade += race(state, a, b);
    value += TUNE.race * trade / (mine.length * theirs.length);
  }
  return value;
}

/* ---------- choices, as the request (or, for the other side, the engine's own request data) allows ---------- */
const FOE_TARGETS = new Set(["normal", "any", "adjacentFoe"]);
function slotChoices(state, side, i, active, mons, doubles) {
  const mon = mons[i];
  if (!mon || mon.fainted || active.commanding) return [{ choice: "pass" }];
  const out = [];
  const foe = other(side);
  const mega = active.canMegaEvo ? " mega" : "";
  active.moves.forEach((m, j) => {
    if (m.disabled || (m.pp != null && m.pp <= 0 && active.moves.some(x => x.pp > 0 && !x.disabled))) return;
    const id = m.id || toID(m.move);
    if (!doubles) { out.push({ choice: `move ${j + 1}${mega}`, move: id, targets: [0] }); return; }
    if (FOE_TARGETS.has(m.target)) {
      for (const t of [1, 2]) if (state[foe].active[t - 1] && !state[foe].active[t - 1].fainted) out.push({ choice: `move ${j + 1} ${t}${mega}`, move: id, targets: [t - 1], foe: true });
      if (!out.some(o => o.move === id)) out.push({ choice: `move ${j + 1} 1${mega}`, move: id, targets: [0], foe: true });
    } else if (m.target === "adjacentAlly") {
      const ally = state[side].active[1 - i];
      if (ally && !ally.fainted) out.push({ choice: `move ${j + 1} -${2 - i}${mega}`, move: id, ally: true });
    } else if (m.target === "adjacentAllyOrSelf") {
      out.push({ choice: `move ${j + 1} -${i + 1}${mega}`, move: id, self: true });
    } else out.push({ choice: `move ${j + 1}${mega}`, move: id, spread: true });
  });
  if (!active.trapped) mons.forEach((p, k) => { if (k >= state[side].active.length && !p.fainted && !p.active) out.push({ choice: `switch ${k + 1}`, to: k }); });
  return out.length ? out : [{ choice: "move 1" }];
}
// the request rows of a side, from the engine (for the side whose request we may not read, the believed state's own data)
function requestRows(state, side) {
  const s = state[side];
  return {
    active: s.active.map(p => (p && !p.fainted ? { ...p.getMoveRequestData(), canMegaEvo: Boolean(p.canMegaEvo) && !s.pokemon.some(x => x.species.isMega) } : { moves: [] })),
    mons: s.pokemon.map(p => ({ fainted: p.fainted || p.hp <= 0, active: p.isActive })),
  };
}

/* the heuristic worth of one slot's choice: the share of the target's HP it takes (more for a faint), or what a support move buys */
const PROTECT = new Set(["protect", "detect", "spikyshield", "kingsshield", "banefulbunker", "silktrap", "burningbulwark", "obstruct", "maxguard"]);
function prior(state, side, i, option, doubles) {
  const user = state[side].active[i];
  if (!user || option.choice === "pass") return 0;
  const foe = other(side);
  if (option.to != null) {
    const into = state[side].pokemon[option.to];
    const foes = state[foe].active.filter(p => p && !p.fainted);
    const gain = foes.reduce((sum, f) => sum + race(state, into, f) - race(state, user, f), 0) / Math.max(1, foes.length);
    return Math.max(0, 0.15 + 0.35 * gain) * (into.hp / into.maxhp);
  }
  const move = state.dex.moves.get(option.move);
  if (move.category !== "Status") {
    if (move.id === "fakeout" && user.activeMoveActions > 0) return 0;
    const targets = option.spread ? state[foe].active.filter(p => p && !p.fainted) : option.foe || !doubles ? [state[foe].active[option.targets?.[0] ?? 0]].filter(p => p && !p.fainted) : [];
    let value = 0;
    for (const t of targets) {
      const share = hitShare(state, user, t, move.id) * (option.spread && targets.length > 1 ? 0.75 : 1);
      value += Math.min(1, share) + (share >= 1 ? 0.5 + (move.priority > 0 ? 0.3 : 0) : 0);
    }
    if (move.id === "fakeout") value += doubles ? 0.45 : 0.25;
    if (move.selfSwitch) value += 0.1;
    return value;
  }
  const hp = user.hp / user.maxhp;
  if (PROTECT.has(move.id)) return user.volatiles.stall ? 0.02 : doubles ? 0.3 : 0.08;
  if (move.heal || move.flags?.heal) return Math.max(0, 0.85 - hp) * 0.8;
  if (move.boosts && move.target === "self") return hp > 0.55 ? 0.35 : 0.05;
  if (move.status) {
    const t = state[foe].active[option.targets?.[0] ?? 0];
    return t && !t.status && !t.fainted ? 0.3 : 0;
  }
  if (move.sideCondition && HAZARD[move.id]) return state[foe].sideConditions[move.id] ? 0 : 0.3;
  if (move.sideCondition) {
    const id = toID(move.sideCondition);
    if (state[side].sideConditions[id]) return 0;
    return WALLS[id] ? 0.35 * screenWorth(state, side, id) / SCREEN[id] : 0.35;
  }
  if (move.pseudoWeather) return state.field.pseudoWeather[toID(move.pseudoWeather)] ? 0 : 0.35;
  if (move.weather || move.terrain) return 0.2;
  if (["followme", "ragepowder", "helpinghand", "allyswitch", "spore"].includes(move.id)) return doubles ? 0.3 : 0;
  if (move.selfSwitch) return 0.2;
  return 0.1;
}

// every whole choice of a side, best first by the heuristic, pruned to width (two places in doubles, never the same Pokémon twice)
function wholeChoices(state, side, rows, width, slotWidth) {
  const doubles = isDoubles(state);
  const perSlot = rows.active.map((active, i) => slotChoices(state, side, i, active, rows.mons, doubles)
    .map(o => ({ ...o, score: prior(state, side, i, o, doubles) })).sort((a, b) => b.score - a.score).slice(0, slotWidth));
  let whole = [{ choice: [], score: 0, to: [], mega: false }];
  for (const slot of perSlot) {
    // one Mega Evolution a turn: a second place that could evolve too simply does not
    whole = whole.flatMap(w => slot.map(o => {
      const mega = / mega$/.test(o.choice);
      return { choice: [...w.choice, mega && w.mega ? o.choice.replace(/ mega$/, "") : o.choice], score: w.score + o.score, to: o.to != null ? [...w.to, o.to] : w.to, mega: w.mega || mega };
    })).filter(w => new Set(w.to).size === w.to.length);
  }
  return whole.sort((a, b) => b.score - a.score).slice(0, width).map(w => ({ choice: w.choice.join(", "), score: w.score }));
}

/* ---------- playing a pair of choices and one more greedy turn ---------- */
// the one more turn both sides play in a simulation: each place's move worth the most by the heuristic, never a switch
function greedy(state, side) {
  const doubles = isDoubles(state);
  const rows = requestRows(state, side);
  let mega = false;
  return rows.active.map((active, i) => {
    const options = slotChoices(state, side, i, active, rows.mons, doubles).filter(o => o.to == null);
    let best = options[0], bestScore = -1;
    for (const o of options) { const score = prior(state, side, i, o, doubles); if (score > bestScore) { bestScore = score; best = o; } }
    let choice = best?.choice || "move 1";
    if (/ mega$/.test(choice)) { if (mega) choice = choice.replace(/ mega$/, ""); mega = true; }
    return choice;
  }).join(", ");
}
// a place left empty by a faint is filled with the Pokémon that fares best against what stands opposite
function bestSwitches(state, side) {
  const s = state[side];
  const req = s.activeRequest;
  if (!req?.forceSwitch) return null;
  const foes = state[other(side)].active.filter(p => p && !p.fainted);
  const taken = new Set();
  return req.forceSwitch.map((must, i) => {
    if (!must || slotPasses(req, i)) return "pass";
    // Revival Blessing names a fainted one; the one that would fare best against the foes now out comes back
    const reviving = revives(req, i);
    let best = -1, bestScore = -Infinity;
    s.pokemon.forEach((p, k) => {
      if (k < s.active.length || p.fainted !== reviving || taken.has(k)) return;
      const score = foes.reduce((sum, f) => sum + race(state, p, f), 0) + (reviving ? 0 : p.hp / p.maxhp);
      if (score > bestScore) { bestScore = score; best = k; }
    });
    if (best < 0) return "pass";
    taken.add(best);
    return `switch ${best + 1}`;
  }).join(", ");
}
function owes(state, side) {
  const req = state[side].activeRequest;
  return Boolean(req && !req.wait && !state[side].isChoiceDone());
}
function settle(state) {
  for (let i = 0; i < 4 && !state.ended; i++) {
    const open = ["p1", "p2"].filter(side => owes(state, side) && state[side].activeRequest.forceSwitch);
    if (!open.length) return;
    for (const side of open) if (!state.choose(side, bestSwitches(state, side) || "pass")) return;
  }
}
function play(text, side, mine, theirs, seed, rollout) {
  const state = revive(text, seed);
  const foe = other(side);
  if (!state.choose(side, mine)) return null;
  if (theirs && !state.choose(foe, theirs)) return null;
  if (rollout && !state.ended) {
    calcOn(state);
    settle(state);
    for (let turn = 0; turn < ROLLOUT_TURNS && !state.ended && owes(state, side) && owes(state, foe) && !state[side].activeRequest.forceSwitch; turn++) {
      state.choose(side, greedy(state, side));
      state.choose(foe, greedy(state, foe));
      settle(state);
    }
  } else calcOn(state);
  return evaluate(state, side);
}

/* does a choice do nothing at all: one of our moves the engine answers only with an immunity or a failure (Shadow Ball into a
   Normal type, a burn on a Pokémon already statused, Recover at full HP, a screen already up, Fake Out after the first turn,
   a Choice item holding us to such a move). Played against the other side standing and attacking, on the believed copy. */
const NOTHING = new Set(["-immune", "-fail", "-hint"]);
function idle(state, side, choice, seed) {
  if (!/move/.test(choice)) return false;
  const s = calcOn(revive(strip(state), seed));
  const foe = other(side);
  if (!s.choose(side, choice)) return false;
  if (owes(s, foe) && !s.choose(foe, greedy(s, foe))) return false;
  let tags = null;
  const done = () => tags?.length > 0 && tags.every(t => NOTHING.has(t)) && tags.some(t => t !== "-hint");
  for (const line of s.log) {
    const [, tag = "", who = ""] = line.split("|");
    if (tag === "split") continue;
    if (tag.startsWith("-")) { tags?.push(tag); continue; }
    if (done()) return true;
    tags = tag === "move" && who.startsWith(side) && !line.includes("[from]") ? [] : null;
  }
  return done();
}

/* ---------- the matrix game: regret matching to an equilibrium (a few hundred rounds on a small matrix) ---------- */
function equilibrium(matrix, rounds = 300) {
  const rows = matrix.length, cols = matrix[0].length;
  const rr = new Float64Array(rows), cr = new Float64Array(cols), rs = new Float64Array(rows), cs = new Float64Array(cols);
  const norm = r => { const pos = Array.from(r, x => Math.max(0, x)); const t = pos.reduce((a, b) => a + b, 0); return t ? pos.map(x => x / t) : pos.map(() => 1 / pos.length); };
  for (let n = 0; n < rounds; n++) {
    const p = norm(rr), q = norm(cr);
    const rowValue = matrix.map(row => row.reduce((sum, v, j) => sum + v * q[j], 0));
    const colValue = Array.from({ length: cols }, (_, j) => matrix.reduce((sum, row, i) => sum + row[j] * p[i], 0));
    const value = rowValue.reduce((sum, v, i) => sum + v * p[i], 0);
    for (let i = 0; i < rows; i++) { rr[i] += rowValue[i] - value; rs[i] += p[i]; }
    for (let j = 0; j < cols; j++) { cr[j] += value - colValue[j]; cs[j] += q[j]; }
  }
  const total = a => { const t = a.reduce((x, y) => x + y, 0); return Array.from(a, x => x / t); };
  return { row: total(rs), col: total(cs) };
}
const softmax = (scores, temperature) => {
  const top = Math.max(...scores);
  const e = scores.map(s => Math.exp((s - top) / temperature));
  const t = e.reduce((a, b) => a + b, 0);
  return e.map(x => x / t);
};

/* ---------- team preview: which to bring and who leads ---------- */
function choose(list, size) {
  if (size === 0) return [[]];
  return list.flatMap((x, i) => choose(list.slice(i + 1), size - 1).map(rest => [x, ...rest]));
}
const LEAD_SUPPORT = { fakeout: 0.3, tailwind: 0.25, trickroom: 0.25, followme: 0.2, ragepowder: 0.2, spore: 0.15, icywind: 0.1, electroweb: 0.1, partingshot: 0.1 };
function teamPreview(state, side, req, random) {
  const foe = other(side);
  const mine = state[side].pokemon, theirs = state[foe].pokemon;
  const size = Math.min(req.maxChosenTeamSize || mine.length, mine.length);
  const m = mine.map(a => theirs.map(b => race(state, a, b)));
  // their Pokémon that beat more of ours count for more
  const weight = theirs.map((_, j) => 1 + Math.max(0, -m.reduce((sum, row) => sum + row[j], 0) / mine.length));
  const doubles = isDoubles(state);
  const scored = choose(mine.map((_, i) => i), size).map(pick => {
    let value = 0;
    theirs.forEach((_, j) => {
      const answers = pick.map(i => m[i][j]).sort((a, b) => b - a);
      value += weight[j] * (answers[0] + 0.35 * (answers[1] ?? 0));
    });
    return { pick, value };
  }).sort((a, b) => b.value - a.value);
  const top = scored.slice(0, 3);
  const pick = top[pickIndex(softmax(top.map(s => s.value), 0.4), random)].pick;
  const support = i => doubles ? mine[i].moveSlots.reduce((sum, s) => sum + (LEAD_SUPPORT[s.id] || 0), 0) + (mine[i].ability === "intimidate" ? 0.2 : 0) : 0;
  const leadCount = doubles ? 2 : 1;
  const leads = choose(pick, leadCount).map(lead => ({
    lead, value: theirs.reduce((sum, _, j) => sum + Math.max(...lead.map(i => m[i][j])), 0) / theirs.length + lead.reduce((sum, i) => sum + support(i), 0),
  })).sort((a, b) => b.value - a.value).slice(0, 2);
  const lead = leads[pickIndex(softmax(leads.map(l => l.value), 0.25), random)].lead;
  const order = [...lead, ...pick.filter(i => !lead.includes(i))];
  return `team ${order.map(i => i + 1).join(", ")}`;
}
const pickIndex = (weights, random) => { let roll = random(); for (let i = 0; i < weights.length; i++) if ((roll -= weights[i]) < 0) return i; return weights.length - 1; };

/* ---------- the computer ---------- */
export function createCpu(formatid, { random = Math.random, budgetMs, rollout = true, reads = true, now = NOW } = {}) {
  const pool = poolOf(formatid);
  const doubles = /vgc/.test(formatid);
  const budget = budgetMs ?? (doubles ? 2200 : 1400);
  /* their Pokémon's name → what it may carry, narrowed turn by turn (infer); before is the battle as it stood when we last chose a move.
     ponytail: kept in memory only, so a battle resumed after the page reloads starts guessing afresh; replaying its log through infer
     turn by turn would carry the readings over */
  const hypotheses = new Map();
  let before = null;
  const candidatesOf = (state, p) => {
    if (!hypotheses.has(p.name)) {
      const sets = pool.get(toID(p.baseSpecies.name)) || pool.get(toID(p.baseSpecies.baseSpecies));
      hypotheses.set(p.name, sets ? (reads ? hypothesesOf(state.dex, sets) : sets) : null);
    }
    return hypotheses.get(p.name);
  };

  // one believed copy of the battle, from this side's view
  function sample(battle, side, likeliest) {
    const state = revive(strip(battle), seedOf(random));
    state[other(side)].clearChoice?.();
    believe(state, other(side), candidatesOf, revealed(battle.log, other(side)), random, likeliest);
    return state;
  }

  function search(battle, side, own) {
    const foe = other(side);
    const seen = habit(battle.log, foe);
    const totals = new Float64Array(own.length), counts = new Float64Array(own.length);
    const start = now(), end = start + budget;
    let width = doubles ? 7 : 10;
    for (let n = 0; n < 24 && (n < 1 || now() < end); n++) {
      const state = calcOn(sample(battle, side, n === 0));
      const foeReq = state[foe].activeRequest;
      const text = strip(state);
      // one seed for the whole matrix: every pair meets the same luck (rolls, critical hits, accuracy), so they compare fairly
      const seed = seedOf(random);
      let theirs = !foeReq || foeReq.wait ? [] : wholeChoices(state, foe, requestRows(state, foe), width, doubles ? 5 : 10);
      if (!theirs.length) theirs = [{ choice: null, score: 0 }];
      // a slow device answers in time all the same: one pair is timed, and the other side's choices are cut to what fits
      if (n === 0) {
        const t = now();
        play(text, side, own[0].choice, theirs[0].choice, seed, rollout);
        const cell = Math.max(0.05, now() - t);
        width = Math.max(2, Math.min(width, Math.floor((1.2 * budget) / (cell * own.length))));
      }
      theirs = theirs.slice(0, width);
      const matrix = own.map(a => theirs.map(b => play(text, side, a.choice, b.choice, seed, rollout)));
      // a choice the engine refused on this copy counts as the worst of its row, so it is never preferred for it
      const clean = matrix.map(row => { const ok = row.filter(v => v != null); const floor = ok.length ? Math.min(...ok) : -100; return row.map(v => v ?? floor); });
      const { col } = equilibrium(clean);
      const human = softmax(theirs.map(b => b.score), 0.2);
      let model = col.map((p, j) => (1 - TUNE.human) * p + TUNE.human * human[j]);
      /* the switches the model expects, leaned toward how often this player has really switched (a player who stays turn after turn
         is not played around as if a switch were coming; four turns of the model's own guess weigh against what was seen) */
      const switching = theirs.map(b => /switch/.test(b.choice || ""));
      const share = model.reduce((t, p, j) => t + (switching[j] ? p : 0), 0);
      if (seen.chances && share > 0 && share < 1) {
        const want = (share * 4 + seen.switches) / (4 + seen.chances);
        model = model.map((p, j) => p * (switching[j] ? want / share : (1 - want) / (1 - share)));
      }
      clean.forEach((row, i) => { if (matrix[i].some(v => v != null)) { totals[i] += row.reduce((sum, v, j) => sum + v * model[j], 0); counts[i]++; } });
    }
    return own.map((o, i) => ({ ...o, value: counts[i] ? totals[i] / counts[i] : -Infinity }));
  }

  function decide(battle, side) {
    const req = battle[side].activeRequest;
    if (!req || req.wait || battle.ended) return null;
    if (reads && before && battle.turn > before.turn) {
      try { infer(before.text, battle.log, before.turn, side, hypotheses, revealed(battle.log, other(side))); } catch (e) { console.warn("cpu infer", e); }
      before = null;
    }
    if (req.teamPreview) return teamPreview(calcOn(sample(battle, side, true)), side, req, random);
    if (req.forceSwitch) {
      // a switch the battle asks for: each way of filling the places is tried against the turn that follows
      const state = calcOn(sample(battle, side, true));
      const options = forcedOptions(state, side, req);
      if (options.length <= 1) return options[0] || bestSwitches(state, side);
      const valued = options.map(choice => {
        const next = revive(strip(state), seedOf(random));
        if (!next.choose(side, choice)) return { choice, value: -Infinity };
        calcOn(next);
        settle(next);
        return { choice, value: evaluate(next, side) };
      });
      return valued.reduce((a, b) => (b.value > a.value ? b : a)).choice;
    }
    if (reads) before = { text: strip(battle), turn: battle.turn };
    const state = calcOn(sample(battle, side, true));
    const all = wholeChoices(state, side, { active: req.active.map(a => ({ ...a, canMegaEvo: Boolean(a.canMegaEvo) })), mons: req.side.pokemon.map(p => ({ fainted: p.condition.endsWith(" fnt"), active: p.active })) }, doubles ? 11 : 12, doubles ? 6 : 12);
    // a move that does nothing to what stands in front is never played as a read on a switch; only when nothing else is left
    const live = all.filter(o => !idle(state, side, o.choice, seedOf(random)));
    const own = live.length ? live : all;
    if (own.length <= 1) return own[0]?.choice || "move 1";
    /* a switch has to be clearly better than staying, as a ranker sees it: the search looks one turn on, so it never sees that the
       Pokémon it brings in will want out again, and two that each lose to the foe were switched back and forth, each taking the hit
       coming in (2026-11-06, Grimmsnarl and Delphox against Golisopod) */
    const valued = search(battle, side, own).map(v => ({ ...v, value: v.value - SWITCH_COST * (v.choice.match(/switch/g) || []).length }));
    const best = Math.max(...valued.map(v => v.value));
    // choices within a hair of the best are played at random, so the computer is not read by habit
    const near = valued.filter(v => v.value >= best - 0.03);
    return near[Math.floor(random() * near.length)].choice;
  }

  return { decide, guesses: name => hypotheses.get(name) };
}

// every way to fill the places a forced switch leaves (a place that must pass passes)
function forcedOptions(state, side, req) {
  const free = req.side.pokemon.map((p, k) => (!p.active && !p.condition.endsWith(" fnt") ? k + 1 : 0)).filter(Boolean);
  const fainted = req.side.pokemon.map((p, k) => (!p.active && p.condition.endsWith(" fnt") ? k + 1 : 0)).filter(Boolean);
  let ways = [[]];
  req.forceSwitch.forEach((must, i) => {
    if (!must || slotPasses(req, i)) { ways = ways.map(w => [...w, "pass"]); return; }
    ways = ways.flatMap(w => (revives(req, i) ? fainted : free).filter(k => !w.includes(`switch ${k}`)).map(k => [...w, `switch ${k}`]));
  });
  return ways.filter(w => w.length).map(w => w.join(", "));
}

/* a quick player for tests and benchmarks: its strongest attack by the heuristic, the best matchup when a switch is forced, no search */
export function quickChoice(battle, side) {
  const req = battle[side].activeRequest;
  if (!req || req.wait || battle.ended) return null;
  if (req.teamPreview) return `team ${req.side.pokemon.slice(0, req.maxChosenTeamSize || 6).map((_, i) => i + 1).join(", ")}`;
  const state = calcOn(revive(strip(battle)));
  if (req.forceSwitch) return bestSwitches(state, side);
  return greedy(state, side);
}

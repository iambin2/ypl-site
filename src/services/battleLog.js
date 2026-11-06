/* 배틀 기록(쇼다운 프로토콜)을 한 줄씩 읽어 화면의 상태와 한국어 문장, 그리고 배틀 동작으로 바꾼다.
   문장은 쇼다운의 한국어 텍스트(src/data/battle-text-ko.json, Champions 원문)를 그대로 쓴다. 이 파일은 그 틀을 채울 뿐이다.
   쇼다운 클라이언트의 해석기(AGPL)는 쓰지 않고, 프로토콜 문서(PROTOCOL.md, MIT)만 보고 썼다. */

export const toID = text => String(text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/* 선수가 답한 요청의 표시(턴과 요청의 FNV-1a). 쇼다운 엔진은 rqid를 주지 않으므로, 서버(engine.mjs의 choose)가 이 값으로
   지난 요청에 대한 선택을 막는다. 같은 요청이 두 턴에 걸쳐 똑같을 수 있어(고정된 기술) 턴을 함께 넣는다.
   키 순서에는 기대지 않는다: 엔진 상태는 jsonb로 저장되고 jsonb는 키 순서를 지키지 않는다. */
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object" ? `{${Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`
  : JSON.stringify(value ?? null);
/* 요청에서 i번째 자리가 고를 것 없이 pass인지: 쓰러진 자리, 교체를 묻지 않은 자리, 또는 벤치가 바닥난 자리.
   더블에서 둘이 함께 쓰러지고 하나만 남으면 쇼다운은 둘 다 묻고 "switch 3, pass"를 받는다. */
/* Revival Blessing: the engine asks the place of the one who used it to name a fainted Pokémon to bring back (the request marks that
   Pokémon reviving). Only a fainted one can be named there; with none, the place passes (feedback 2026-11-06: the bench offered
   only standing Pokémon, the engine refused them, and the player could choose nothing) */
export const revives = (request, i) => Boolean(request.forceSwitch?.[i] && request.side?.pokemon?.[i]?.reviving);
export function slotPasses(request, i) {
  const forced = request.forceSwitch, mons = request.side?.pokemon || [];
  if (forced && revives(request, i)) return !mons.some(m => !m.active && String(m.condition).endsWith(" fnt"));
  if (forced) return !forced[i] || forced.slice(0, i).filter((f, k) => f && !revives(request, k)).length >= mons.filter(m => !m.active && !String(m.condition).endsWith(" fnt")).length;
  return !mons[i] || String(mons[i].condition).endsWith(" fnt") || Boolean(request.active?.[i]?.commanding);
}

export function requestKey(turn, request) {
  const text = `${turn}|${canonical(request)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

// 한국어 조사: 마지막 글자의 받침으로 고른다. 한글이 아닌 끝(숫자, 영문)은 받침 없는 쪽으로 둔다.
const PARTICLES = { topic: ["은", "는"], subject: ["이", "가"], object: ["을", "를"], conjunctive: ["과", "와"] };
export function josa(word, kind) {
  const last = String(word).trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  const final = code >= 0 && code <= 11171 ? code % 28 : 0;
  if (kind === "directional") return word + (final && final !== 8 ? "으로" : "로");
  const pair = PARTICLES[kind];
  return pair ? word + (final ? pair[0] : pair[1]) : word;
}

// "p1a: Garchomp" → { side: "p1", slot: 0, name: "Garchomp" }. "p1: Name" (a side) has no slot.
export function parseIdent(ident = "") {
  const match = /^(p[12])([ab]?):\s*(.*)$/.exec(String(ident));
  if (!match) return null;
  return { side: match[1], slot: match[2] ? match[2].charCodeAt(0) - 97 : -1, name: match[3] };
}
const parseDetails = details => {
  const [species, ...rest] = String(details).split(", ");
  return { species, level: Number(rest.find(p => /^L\d+$/.test(p))?.slice(1) || 100), gender: rest.find(p => p === "M" || p === "F") || "" };
};
// "141/156 par" → { hp: 141, maxhp: 156, status: "par" }. "0 fnt" is a fainted Pokémon.
export const parseHP = condition => {
  const [hpPart, status = ""] = String(condition).split(" ");
  if (hpPart === "0" || status === "fnt") return { hp: 0, maxhp: 0, status: "fnt" };
  const [hp, maxhp] = hpPart.split("/").map(Number);
  return { hp, maxhp: maxhp || 100, status };
};

function splitLine(line) {
  const parts = String(line).split("|").slice(1);
  const args = [], kw = {};
  for (const part of parts) {
    const match = /^\[(\w+)\]\s?(.*)$/.exec(part);
    if (match && args.length) kw[match[1]] = match[2] || true;
    else args.push(part);
  }
  return { cmd: args[0] || "", args: args.slice(1), kw };
}
// "move: Trick Room" → { kind: "move", id: "trickroom", name: "Trick Room" }.
const parseEffect = effect => {
  const match = /^(move|ability|item):\s*(.*)$/.exec(String(effect || ""));
  const name = match ? match[2] : String(effect || "");
  return { kind: match ? match[1] : "", id: toID(name), name };
};

export function newBattleState() {
  return { turn: 0, gameType: "singles", ended: false, winner: null, players: { p1: "", p2: "" }, sides: { p1: newSide(), p2: newSide() }, weather: null, weatherSince: 0, fields: [], fieldSince: {} };
}
// since: the turn a side condition began (its turns left are counted from it); layers: Spikes and Toxic Spikes stack
const newSide = () => ({ active: [null, null], team: {}, conditions: [], preview: [], since: {}, layers: {} });
const newMon = (side, name, slot) => ({ ident: `${side}: ${name}`, side, name, species: name, hp: 100, maxhp: 100, status: "", fainted: false, boosts: {}, slot, gender: "", level: 100, item: "", ability: "", moves: [], ppUsed: {}, volatiles: [] });
// the moves that guard their user this turn: they show as a shield
const GUARDS = new Set(["protect", "detect", "spikyshield", "kingsshield", "banefulbunker", "silktrap", "burningbulwark", "obstruct", "maxguard", "wideguard", "quickguard"]);

/* text: battle-text-ko.json. moves: champions-data.json의 기술 표(분류, 타입, 대상). perspective: 이 화면의 주인(p1 또는 p2). */
export function createBattleReader({ text, moves = {}, perspective = "p1" }) {
  const state = newBattleState();
  const tables = { move: text.moves, ability: text.abilities, item: text.items };

  const speciesName = species => text.pokedex[toID(species)] || species;
  // the slot is trusted only while the one standing there has the ident's name (a missed swap never moves HP onto its partner)
  const monOf = ident => {
    const who = parseIdent(ident);
    if (!who) return null;
    const side = state.sides[who.side];
    const there = who.slot >= 0 ? side.active[who.slot] : null;
    return (there?.name === who.name ? there : null)
      || side.team[who.name]
      || (side.team[who.name] = newMon(who.side, who.name, who.slot));
  };
  const monWord = mon => {
    if (!mon) return "";
    const template = mon.side === perspective ? text.default.default.pokemon : text.default.default.opposingPokemon;
    return template.replace("{NICKNAME}", speciesName(mon.species));
  };
  const pokemonWord = ident => monWord(monOf(ident));
  // Transform lasts while it stays out: leaving or falling gives the Pokémon back its own form
  const untransform = mon => { if (mon?.transformedFrom) { mon.species = mon.transformedFrom; delete mon.transformedFrom; } };
  // what each slot's Pokémon was before it came out, so an Illusion that breaks gives the disguise back as it was
  const entered = {};
  const snapshot = mon => ({ species: mon.species, hp: mon.hp, maxhp: mon.maxhp, status: mon.status, fainted: mon.fainted,
    item: mon.item, ability: mon.ability, moves: [...mon.moves], ppUsed: { ...mon.ppUsed } });
  const teamWord = side => (side === perspective ? text.default.default.team : text.default.default.opposingTeam);
  const effectName = effect => {
    const { kind, id, name } = parseEffect(effect);
    return (kind ? tables[kind]?.[id]?.name : tables.move[id]?.name || tables.ability[id]?.name || tables.item[id]?.name || text.default[id]?.weatherName) || name;
  };
  // A message for an effect: its own table first (a move, an ability, an item), then the same id anywhere, as Showdown's text
  // is one table: a field's lines live under default (move: Trick Room → default.trickroom.start).
  // "#psn" points at another entry's line of the same key, "#.start" at another key of the same entry.
  const lookup = (kind, id, key) => (kind ? tables[kind]?.[id]?.[key] : undefined)
    ?? text.default[id]?.[key] ?? tables.move[id]?.[key] ?? tables.ability[id]?.[key] ?? tables.item[id]?.[key];
  const template = (effect, key) => {
    let { kind, id } = parseEffect(effect);
    let line = lookup(kind, id, key);
    for (let hops = 0; hops < 3 && typeof line === "string" && line.startsWith("#"); hops++) {
      const [to, toKey] = line.slice(1).split(".");
      id = to || id; key = toKey || key; kind = to ? "" : kind;
      line = lookup(kind, id, key);
    }
    return line;
  };
  const fill = (source, values) => {
    if (!source) return null;
    const out = source.replace(/[{[]([A-Z0-9]+)((?::[a-z]+)*)[}\]]/g, (whole, key, modifiers, at) => {
      let word = values[key] ?? "";
      for (const modifier of modifiers.split(":").filter(Boolean)) word = josa(word, modifier);
      // Showdown's Korean writes both {X:directional}부터 and {X:directional}로부터: 로 is never said twice
      if (modifiers.endsWith(":directional") && source[at + whole.length] === "로") word = word.slice(0, -1);
      return word;
    });
    return out.replace(/\*\*/g, "").trim();
  };
  const D = key => text.default.default[key];

  /* passed: the one coming in takes over what the one leaving carried, as Showdown's own client does (the protocol does not say it
     again): after Baton Pass its stat changes and the effects that go with it; after Shed Tail its substitute only */
  const PASSED = new Set(["substitute", "confusion", "focusenergy", "leechseed", "curse", "aquaring", "ingrain", "embargo", "healblock", "magnetrise", "gastroacid", "powertrick", "laserfocus", "perish1", "perish2", "perish3"]);
  function setActive(ident, details, condition, passing = true) {
    const who = parseIdent(ident);
    const side = state.sides[who.side];
    const previous = side.active[who.slot];
    const via = passing && previous && !previous.fainted ? previous.lastMove : "";
    const carried = via === "batonpass" ? { boosts: { ...previous.boosts }, volatiles: previous.volatiles.filter(v => PASSED.has(v)) }
      : via === "shedtail" ? { boosts: {}, volatiles: previous.volatiles.filter(v => v === "substitute") } : { boosts: {}, volatiles: [] };
    const { species, level, gender } = parseDetails(details);
    /* an Illusion wears the name of a teammate: when that name already stands in the other slot (doubles), this is a second
       Pokémon, kept apart under its own key so the two never share HP, status or stat changes (the slot finds it, monOf) */
    const ally = side.active.find((m, slot) => m && slot !== who.slot && m.name === who.name);
    const key = ally ? `${who.name}@${who.slot}` : who.name;
    const known = side.team[key] && side.team[key] !== ally ? side.team[key] : null;
    const mon = known || (side.team[key] = newMon(who.side, who.name, who.slot));
    entered[`${who.side}${who.slot}`] = { mon, key, before: known ? snapshot(mon) : null };
    untransform(previous);
    // a Pokémon sent in leaves its stat changes and volatile effects behind; its item, ability and moves stay known
    Object.assign(mon, { species, details, level, gender, slot: who.slot, fainted: false, lastMove: "", ...carried }, parseHP(condition));
    delete mon.types; delete mon.addedType;
    delete mon.transformedFrom;
    side.active[who.slot] = mon;
    return previous && previous !== mon && !previous.fainted ? previous : null;
  }
  // |replace|: an Illusion broke. The one really standing there takes over what the disguise showed (HP, status, changes),
  // and the disguise goes back to what it was, or to not yet seen.
  function unmask(ident, details) {
    const who = parseIdent(ident);
    const side = state.sides[who.side];
    const shown = side.active[who.slot];
    const { species, level, gender } = parseDetails(details);
    const mon = side.team[who.name] || (side.team[who.name] = newMon(who.side, who.name, who.slot));
    Object.assign(mon, { species, details, level, gender, slot: who.slot, hp: shown?.hp ?? 100, maxhp: shown?.maxhp ?? 100, status: shown?.status || "",
      fainted: Boolean(shown?.fainted), boosts: { ...shown?.boosts }, volatiles: [...(shown?.volatiles || [])] });
    side.active[who.slot] = mon;
    const was = entered[`${who.side}${who.slot}`];
    if (shown && shown !== mon && was?.mon === shown) {
      // what the disguise revealed (moves, an item, an ability) was the Zoroark's: it takes those, the disguise gets its own back
      if (!mon.item) mon.item = shown.item;
      for (const move of shown.moves) if (!was.before?.moves.includes(move) && !mon.moves.includes(move)) mon.moves.push(move);
      if (was.before) Object.assign(shown, was.before, { boosts: {}, volatiles: [] });
      else delete side.team[was.key];
    }
  }
  const setCondition = (ident, condition) => {
    const mon = monOf(ident);
    const before = mon.maxhp ? mon.hp / mon.maxhp : 0;
    // "0 fnt" carries no maximum: a fainted Pokémon keeps the one it had (0 / 172, never 0 / 0)
    const next = parseHP(condition);
    Object.assign(mon, next, next.status === "fnt" && mon.maxhp ? { maxhp: mon.maxhp } : {});
    if (mon.status === "fnt") mon.fainted = true;
    return { mon, before };
  };

  /* 한 줄을 읽는다. lines: 화면에 켤 문장들, event: 배틀 동작(DESIGN.md Battle). 상태는 이 줄을 반영한 뒤의 것이다. */
  function read(line) {
    const { cmd, args, kw } = splitLine(line);
    const lines = [];
    let event = null;
    const say = (source, values) => { const said = fill(source, values); if (said) lines.push(said); };
    const from = kw.from ? parseEffect(kw.from) : null;
    // an ability or an item named as the cause of a line is now known: the stage pops the ability up as the game does
    let reveal = null;
    if (from?.kind === "ability" && (kw.of || args[0]) && parseIdent(kw.of || args[0])?.slot >= 0) {
      const owner = kw.of || args[0];
      monOf(owner).ability = from.name;
      reveal = { ident: owner, ability: effectName(kw.from) };
    } else if (from?.kind === "item" && parseIdent(args[0])?.slot >= 0) monOf(args[0]).item = from.name;

    switch (cmd) {
      case "player": if (args[1]) state.players[args[0]] = args[1]; break;
      case "gametype": state.gameType = args[0]; break;
      case "poke": state.sides[args[0]].preview.push(parseDetails(args[1]).species); break;
      // Roost's grounding lasts the turn it was used: it goes with the turn's upkeep (a switch asked for after it comes before the next turn)
      case "upkeep": for (const side of ["p1", "p2"]) for (const m of state.sides[side].active) if (m) delete m.roost; break;
      case "turn": state.turn = Number(args[0]); for (const side of ["p1", "p2"]) for (const m of state.sides[side].active) if (m) delete m.roost; event = { verb: "turn", turn: state.turn }; break;
      case "win": state.ended = true; state.winner = state.players.p1 === args[0] ? "p1" : "p2"; event = { verb: "end", winner: state.winner }; break;
      case "tie": state.ended = true; state.winner = "tie"; event = { verb: "end", winner: "tie" }; break;

      // the true form is drawn where the disguise stood, as a change of form is (|replace| carries no HP)
      case "replace": unmask(args[0], args[1]); event = { verb: "change", ident: args[0] }; break;
      // Ally Switch: |swap|p1a: X|1 puts X at position 1 and whoever stood there where X was
      case "swap": {
        const who = parseIdent(args[0]);
        const side = state.sides[who.side];
        const mon = monOf(args[0]);
        const from = side.active.indexOf(mon), to = Number(args[1]);
        if (from >= 0 && to >= 0 && to !== from) {
          const partner = side.active[to];
          [side.active[from], side.active[to]] = [partner || null, mon];
          mon.slot = to;
          if (partner) partner.slot = from;
          if (partner) say(D("swap"), { POKEMON: monWord(mon), TARGET: monWord(partner) });
        }
        event = { verb: "swap", side: who.side };
        break;
      }
      case "switch": case "drag": {
        const who = parseIdent(args[0]);
        const previous = setActive(args[0], args[1], args[2], cmd === "switch");
        const own = who.side === perspective;
        if (previous && cmd === "switch") say(own ? D("switchOutOwn") : D("switchOut"), { TRAINER: state.players[who.side], NICKNAME: speciesName(previous.species) });
        const name = speciesName(parseDetails(args[1]).species);
        if (cmd === "drag") say(D("drag"), { FULLNAME: own ? name : pokemonWord(args[0]) });
        else if (cmd === "switch") say(own ? D("switchInOwn") : D("switchIn"), { TRAINER: state.players[who.side], FULLNAME: name });
        event = { verb: "enter", ident: args[0], leaving: previous?.ident || null, drag: cmd === "drag" };
        break;
      }
      case "detailschange": case "-formechange": {
        const mon = monOf(args[0]);
        mon.species = parseDetails(args[1]).species;
        // a new form brings its own typing
        delete mon.types; delete mon.addedType;
        event = { verb: "change", ident: args[0] };
        break;
      }
      case "-mega": {
        // the form has already changed (detailschange comes first), but the messages name the Pokémon before it evolved
        const mon = monOf(args[0]);
        const before = (mon.side === perspective ? text.default.default.pokemon : text.default.default.opposingPokemon).replace("{NICKNAME}", speciesName(args[1]));
        say(D("mega"), { POKEMON: before, ITEM: effectName(`item: ${args[2]}`), TRAINER: state.players[mon.side] });
        say(D("transformMega"), { POKEMON: before, SPECIES: speciesName(args[1]) });
        event = { verb: "mega", ident: args[0] };
        break;
      }
      case "move": {
        const source = args[0];
        const move = moves[toID(args[1])] || {};
        const user = monOf(source);
        if (user && !user.moves.includes(args[1])) user.moves.push(args[1]);
        if (user) user.lastMove = toID(args[1]);
        // PP spent, as Showdown counts it for a tooltip: a move called by another ([from]: Sleep Talk, a locked-in Outrage) spends none.
        // ponytail: Pressure's extra PP is not counted; count each Pressure target here if it ever matters
        if (user && !kw.from) user.ppUsed = { ...user.ppUsed, [toID(args[1])]: (user.ppUsed?.[toID(args[1])] || 0) + 1 };
        say(D("move"), { POKEMON: pokemonWord(source), MOVE: effectName(`move: ${args[1]}`) });
        const spread = typeof kw.spread === "string" ? kw.spread.split(",").map(slot => `${slot}:`) : null;
        const targets = (spread || (args[2] ? [args[2]] : [])).filter(t => parseIdent(t)?.slot >= 0);
        const self = !targets.length || targets.every(t => t.slice(0, 3) === source.slice(0, 3));
        const verb = self ? "self" : move.category === "Physical" ? "strike" : "chase";
        event = { verb, ident: source, targets: self ? [] : targets, type: move.type || "", category: move.category || "", move: toID(args[1]), spread: Boolean(spread), miss: Boolean(kw.miss), still: Boolean(kw.still) };
        break;
      }
      case "faint": {
        const mon = monOf(args[0]);
        mon.fainted = true; mon.hp = 0;
        say(D("faint"), { POKEMON: pokemonWord(args[0]) });
        untransform(mon);
        event = { verb: "fall", ident: args[0] };
        break;
      }
      case "-damage": case "-heal": case "-sethp": {
        const { mon } = setCondition(args[0], args[1]);
        const values = { POKEMON: pokemonWord(args[0]), SOURCE: kw.of ? pokemonWord(kw.of) : "" };
        if (cmd === "-heal") {
          if (from) say(template(kw.from, "heal") || D("healFromEffect"), { ...values, ITEM: effectName(kw.from), EFFECT: effectName(kw.from) });
          else say(D("heal"), values);
        } else if (from) {
          const own = template(kw.from, "damage");
          say(own || (from.kind === "item" ? D("damageFromItem") : null), { ...values, ITEM: effectName(kw.from), MOVE: effectName(kw.from) });
        }
        event = { verb: cmd === "-damage" && !from ? "take" : "hp", ident: args[0], hp: mon.hp, maxhp: mon.maxhp, heal: cmd === "-heal", from: from?.id || "" };
        break;
      }
      case "-status": {
        const mon = monOf(args[0]);
        mon.status = args[1];
        say(from?.kind === "item" ? template(args[1], "startFromItem") : template(args[1], "start"), { POKEMON: pokemonWord(args[0]), ITEM: from ? effectName(kw.from) : "" });
        event = { verb: "status", ident: args[0], status: args[1] };
        break;
      }
      case "-curestatus": {
        const mon = monOf(args[0]);
        mon.status = "";
        say(template(args[1], "end"), { POKEMON: pokemonWord(args[0]) });
        event = { verb: "cure", ident: args[0], status: args[1] };
        break;
      }
      case "-boost": case "-unboost": {
        const mon = monOf(args[0]);
        const amount = Number(args[2] || 0);
        mon.boosts[args[1]] = Math.max(-6, Math.min(6, (mon.boosts[args[1]] || 0) + (cmd === "-boost" ? amount : -amount)));
        const key = (cmd === "-boost" ? "boost" : "unboost") + (amount === 0 ? "0" : amount >= 3 ? "3" : amount === 2 ? "2" : "");
        say(D(key), { POKEMON: pokemonWord(args[0]), STAT: text.stats[args[1]] || args[1] });
        event = { verb: "boost", ident: args[0], up: cmd === "-boost", stat: args[1], amount: cmd === "-boost" ? amount : -amount };
        break;
      }
      case "-setboost": monOf(args[0]).boosts[args[1]] = Number(args[2]); event = { verb: "boost", ident: args[0] }; break;
      case "-clearboost": case "-clearallboost": case "-clearnegativeboost": {
        const targets = cmd === "-clearallboost" ? Object.values(state.sides).flatMap(s => s.active.filter(Boolean)) : [monOf(args[0])];
        for (const mon of targets) mon.boosts = cmd === "-clearnegativeboost" ? Object.fromEntries(Object.entries(mon.boosts).filter(([, v]) => v > 0)) : {};
        say(cmd === "-clearallboost" ? D("clearAllBoost") : D("clearBoost"), { POKEMON: args[0] ? pokemonWord(args[0]) : "" });
        break;
      }
      // Spectral Thief takes the target's rises (the user's own -boost lines follow); Psych Up copies; Heart, Power and Guard Swap trade; Topsy-Turvy flips
      case "-clearpositiveboost": {
        const mon = monOf(args[0]);
        mon.boosts = Object.fromEntries(Object.entries(mon.boosts).filter(([, v]) => v < 0));
        say(template(args[2], "clearBoost") || D("clearBoost"), { POKEMON: pokemonWord(args[0]), SOURCE: args[1] ? pokemonWord(args[1]) : "" });
        event = { verb: "boost", ident: args[0] };
        break;
      }
      case "-copyboost": {
        const [mon, target] = [monOf(args[0]), monOf(args[1])];
        mon.boosts = { ...target.boosts };
        say(D("copyBoost"), { POKEMON: pokemonWord(args[0]), TARGET: pokemonWord(args[1]) });
        event = { verb: "boost", ident: args[0] };
        break;
      }
      case "-swapboost": {
        const [mon, target] = [monOf(args[0]), monOf(args[1])];
        const stats = args[2] ? args[2].split(/,\s*/) : [...new Set([...Object.keys(mon.boosts), ...Object.keys(target.boosts)])];
        for (const stat of stats) [mon.boosts[stat], target.boosts[stat]] = [target.boosts[stat] || 0, mon.boosts[stat] || 0];
        const key = args[2] === "atk, spa" ? "swapOffensiveBoost" : args[2] === "def, spd" ? "swapDefensiveBoost" : "swapBoost";
        say(D(key), { POKEMON: pokemonWord(args[0]) });
        event = { verb: "boost", ident: args[0] };
        break;
      }
      case "-invertboost": {
        const mon = monOf(args[0]);
        mon.boosts = Object.fromEntries(Object.entries(mon.boosts).map(([k, v]) => [k, -v]));
        say(D("invertBoost"), { POKEMON: pokemonWord(args[0]) });
        event = { verb: "boost", ident: args[0] };
        break;
      }
      // Court Change: what lay on each side now lies on the other (its -activate line speaks)
      case "-swapsideconditions": {
        const { p1, p2 } = state.sides;
        for (const key of ["conditions", "since", "layers"]) [p1[key], p2[key]] = [p2[key], p1[key]];
        event = { verb: "side" };
        break;
      }
      case "-weather": {
        const id = toID(args[0]);
        if (id === "none") { if (state.weather) say(template(state.weather, "end"), {}); state.weather = null; }
        else if (kw.upkeep) say(template(id, "upkeep"), {});
        else { if (state.weather !== id) state.weatherSince = state.turn; state.weather = id; say(template(id, "start"), {}); }
        event = { verb: "weather", id: state.weather, upkeep: Boolean(kw.upkeep) };
        break;
      }
      case "-fieldstart": case "-fieldend": {
        const { id } = parseEffect(args[0]);
        state.fields = cmd === "-fieldstart" ? [...new Set([...state.fields, id])] : state.fields.filter(f => f !== id);
        if (cmd === "-fieldstart") state.fieldSince[id] = state.turn;
        say(template(args[0], cmd === "-fieldstart" ? "start" : "end") || D(cmd === "-fieldstart" ? "startFieldEffect" : "endFieldEffect"), { EFFECT: effectName(args[0]), POKEMON: kw.of ? pokemonWord(kw.of) : "" });
        event = { verb: "field", id, on: cmd === "-fieldstart" };
        break;
      }
      case "-sidestart": case "-sideend": {
        const side = parseIdent(args[0])?.side;
        const { id } = parseEffect(args[1]);
        const conditions = state.sides[side].conditions;
        state.sides[side].conditions = cmd === "-sidestart" ? [...new Set([...conditions, id])] : conditions.filter(c => c !== id);
        if (cmd === "-sidestart") { if (!conditions.includes(id)) state.sides[side].since[id] = state.turn; state.sides[side].layers[id] = (state.sides[side].layers[id] || 0) + 1; }
        else delete state.sides[side].layers[id];
        say(template(args[1], cmd === "-sidestart" ? "start" : "end") || D(cmd === "-sidestart" ? "startTeamEffect" : "endTeamEffect"), { TEAM: teamWord(side), EFFECT: effectName(args[1]) });
        event = { verb: "side", side, id, on: cmd === "-sidestart" };
        break;
      }
      case "-start": case "-end": {
        const mon = monOf(args[0]);
        const { id } = parseEffect(args[1]);
        if (mon && id) mon.volatiles = cmd === "-start" ? [...new Set([...mon.volatiles, id])] : mon.volatiles.filter(v => v !== id);
        /* a typing changed by a move or an ability (Soak, Burn Up, Protean: typechange with the new types; Trick-or-Treat and Forest's
           Curse: typeadd with the one added). types replaces the species' typing and addedType comes on top of it, until it goes out */
        // a new typing replaces an added one too (Soak after Trick-or-Treat leaves Water alone), as the engine's setType does
        if (mon && id === "typechange") { if (cmd === "-start") mon.types = String(args[2] || "").split("/").filter(t => t && t !== "???"); else delete mon.types; delete mon.addedType; }
        if (mon && id === "typeadd") { if (cmd === "-start") mon.addedType = args[2]; else delete mon.addedType; }
        event = { verb: "volatile", ident: args[0], id, on: cmd === "-start" };
        // a typing put back says nothing, as the games and Showdown say nothing (it said "typechange로부터 풀려났다")
        // Supreme Overlord's count of the fallen (fallen1 to fallen5) is a number on the plate, never a sentence
        if (!(cmd === "-end" && (id === "typechange" || id === "typeadd")) && !/^fallen\d$/.test(id))
          say(template(args[1], cmd === "-start" ? "start" : "end") || (cmd === "-end" ? D("end") : null), { POKEMON: pokemonWord(args[0]), EFFECT: effectName(args[1]), SOURCE: kw.of ? pokemonWord(kw.of) : "" });
        break;
      }
      case "-singleturn": case "-singlemove": {
        say(template(args[1], "start"), { POKEMON: pokemonWord(args[0]) });
        // Roost: the Flying type is set aside until the turn ends (currentTypes leaves it out)
        if (parseEffect(args[1]).id === "roost" && monOf(args[0])) monOf(args[0]).roost = true;
        if (GUARDS.has(parseEffect(args[1]).id)) event = { verb: "protect", ident: args[0], id: parseEffect(args[1]).id };
        break;
      }
      case "-activate": {
        if (GUARDS.has(parseEffect(args[1]).id)) event = { verb: "protect", ident: args[0], id: parseEffect(args[1]).id };
        const source = template(args[1], "activate") ?? template(args[1], "block") ?? null;
        say(source, { POKEMON: pokemonWord(args[0]), TARGET: kw.of ? pokemonWord(kw.of) : "", SOURCE: kw.of ? pokemonWord(kw.of) : "", EFFECT: effectName(args[1]) });
        break;
      }
      case "-ability": {
        say(D("abilityActivation"), { POKEMON: pokemonWord(args[0]), ABILITY: effectName(`ability: ${args[1]}`) });
        say(template(`ability: ${args[1]}`, "start"), { POKEMON: pokemonWord(args[0]) });
        monOf(args[0]).ability = args[1];
        event = { verb: "ability", ident: args[0], name: effectName(`ability: ${args[1]}`) };
        break;
      }
      case "-item": {
        say(template(`item: ${args[1]}`, "start") || D("addItem"), { POKEMON: pokemonWord(args[0]), ITEM: effectName(`item: ${args[1]}`), SOURCE: kw.of ? pokemonWord(kw.of) : "" });
        monOf(args[0]).item = args[1];
        event = { verb: "item", ident: args[0], name: effectName(`item: ${args[1]}`) };
        break;
      }
      case "-enditem": {
        const values = { POKEMON: pokemonWord(args[0]), ITEM: effectName(`item: ${args[1]}`) };
        say(kw.eat ? template(`item: ${args[1]}`, "eat") || D("eatItem") : template(`item: ${args[1]}`, "end") || D("removeItem"), values);
        monOf(args[0]).item = "";
        event = { verb: "item", ident: args[0], name: values.ITEM, gone: true };
        break;
      }
      case "cant": say(template(args[1], "cant") || D("cant"), { POKEMON: pokemonWord(args[0]), MOVE: args[2] ? effectName(`move: ${args[2]}`) : "" }); event = { verb: "cant", ident: args[0], why: parseEffect(args[1]).id }; break;
      case "-prepare": say(template(`move: ${args[1]}`, "prepare"), { POKEMON: pokemonWord(args[0]) }); break;
      case "-supereffective": say(D("superEffective"), { POKEMON: pokemonWord(args[0]) }); event = { verb: "super", ident: args[0] }; break;
      case "-resisted": say(D("resisted"), { POKEMON: pokemonWord(args[0]) }); event = { verb: "resist", ident: args[0] }; break;
      case "-immune": say(D("immune"), { POKEMON: pokemonWord(args[0]) }); event = { verb: "immune", ident: args[0] }; break;
      case "-crit": say(D("crit"), { POKEMON: pokemonWord(args[0]) }); event = { verb: "crit", ident: args[0] }; break;
      case "-miss": say(D("miss"), { POKEMON: pokemonWord(args[1] || args[0]) }); event = { verb: "miss", ident: args[1] || args[0] }; break;
      case "-fail": say(D("fail"), { POKEMON: pokemonWord(args[0]) }); event = { verb: "fail", ident: args[0] }; break;
      case "-notarget": say(D("noTarget"), { POKEMON: args[0] ? pokemonWord(args[0]) : "" }); break;
      case "-ohko": say(D("ohko"), {}); break;
      case "-hitcount": say(D("hitCount") || D("hitCountSingular"), { POKEMON: pokemonWord(args[0]), NUMBER: args[1] }); break;
      // Transform and Imposter: it takes the target's form (its picture and its types) until it leaves
      case "-transform": {
        const [mon, target] = [monOf(args[0]), monOf(args[1])];
        say(template("move: Transform", "transform") || D("transform"), { POKEMON: pokemonWord(args[0]), SPECIES: speciesName(target.species) });
        mon.transformedFrom ??= mon.species;
        mon.species = target.species;
        // Transform takes the target's stat changes and typing as they stand, as the engine does
        mon.boosts = { ...target.boosts };
        if (target.types) mon.types = [...target.types]; else delete mon.types;
        if (target.addedType) mon.addedType = target.addedType; else delete mon.addedType;
        event = { verb: "change", ident: args[0] };
        break;
      }
      case "-message": lines.push(args[0]); break;
      default: break;
    }
    return { lines, event, reveal };
  }

  return { state, read, speciesName, pokemonWord, effectName };
}

/* 끝난 공식 배틀들에서 포켓몬마다 실제로 나온 판, 선봉으로 나온 판, 나와서 이긴 판을 센다(기록의 포켓몬 시트).
   rows: { log, winner } 들. 전체 로그는 비밀 줄(|split| 다음 줄)과 공개 줄이 겹쳐 있어 공개 줄만 읽는다.
   종은 나올 때의 이름으로 센다: 메가진화는 원래 모습으로 나오므로 원래 종으로 센다. */
export function battleUsage(rows = []) {
  const usage = new Map();
  const bump = (id, key) => { const u = usage.get(id) || { picked: 0, leads: 0, wins: 0 }; u[key] += 1; usage.set(id, u); };
  for (const row of rows) {
    const seen = { p1: new Set(), p2: new Set() }, leads = { p1: new Set(), p2: new Set() };
    // the last one sent into each slot, and whether that was the first time it was seen: an Illusion that breaks (|replace|)
    // was the Zoroark all along, so the disguise it wore is not counted unless it really came out
    const last = {};
    let started = false, skip = false;
    for (const line of String(row?.log || "").split("\n")) {
      if (skip) { skip = false; continue; }
      if (line.startsWith("|split|")) { skip = true; continue; }
      if (line.startsWith("|turn|")) started = true;
      const swap = /^\|swap\|(p[12])([ab]): [^|]*\|([01])/.exec(line);
      if (swap) { const [a, b] = [swap[1] + swap[2], swap[1] + "ab"[swap[3]]]; [last[a], last[b]] = [last[b], last[a]]; continue; }
      const match = /^\|(switch|drag|replace)\|(p[12])([ab]?): [^|]*\|([^|,]+)/.exec(line);
      if (!match) continue;
      const [, cmd, side, slot] = match;
      const id = toID(match[4]);
      const was = last[side + slot];
      const lead = cmd === "replace" ? Boolean(was?.lead) : !started;
      if (cmd === "replace" && was?.fresh) { seen[side].delete(was.id); leads[side].delete(was.id); }
      last[side + slot] = { id, fresh: !seen[side].has(id), lead };
      seen[side].add(id);
      if (lead) leads[side].add(id);
    }
    for (const side of ["p1", "p2"]) for (const id of seen[side]) {
      bump(id, "picked");
      if (leads[side].has(id)) bump(id, "leads");
      if (row.winner === side) bump(id, "wins");
    }
  }
  return usage;
}

/* 쌓인 기록 전체를 읽는다. 끝난 배틀과 리플레이가 쓴다. 턴마다 { turn, lines } 로 묶는다. */
export function readWholeLog(log, options) {
  const reader = createBattleReader(options);
  const turns = [{ turn: 0, lines: [] }];
  for (const line of String(log).split("\n")) {
    const { lines, event } = reader.read(line);
    if (event?.verb === "turn") turns.push({ turn: event.turn, lines: [] });
    turns[turns.length - 1].lines.push(...lines);
  }
  return { state: reader.state, turns };
}

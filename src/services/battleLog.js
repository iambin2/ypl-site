/* 배틀 기록(쇼다운 프로토콜)을 한 줄씩 읽어 화면의 상태와 한국어 문장, 그리고 배틀 동작으로 바꾼다.
   문장은 쇼다운의 한국어 텍스트(src/data/battle-text-ko.json, Champions 원문)를 그대로 쓴다. 이 파일은 그 틀을 채울 뿐이다.
   쇼다운 클라이언트의 해석기(AGPL)는 쓰지 않고, 프로토콜 문서(PROTOCOL.md, MIT)만 보고 썼다. */

export const toID = text => String(text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

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
  return { turn: 0, gameType: "singles", ended: false, winner: null, players: { p1: "", p2: "" }, sides: { p1: newSide(), p2: newSide() }, weather: null, fields: [] };
}
const newSide = () => ({ active: [null, null], team: {}, conditions: [], preview: [] });

/* text: battle-text-ko.json. moves: champions-data.json의 기술 표(분류, 타입, 대상). perspective: 이 화면의 주인(p1 또는 p2). */
export function createBattleReader({ text, moves = {}, perspective = "p1" }) {
  const state = newBattleState();
  const tables = { move: text.moves, ability: text.abilities, item: text.items };

  const speciesName = species => text.pokedex[toID(species)] || species;
  const monOf = ident => {
    const who = parseIdent(ident);
    if (!who) return null;
    const side = state.sides[who.side];
    return (who.slot >= 0 ? side.active[who.slot] : null)
      || side.team[who.name]
      || (side.team[who.name] = { ident: `${who.side}: ${who.name}`, side: who.side, name: who.name, species: who.name, hp: 100, maxhp: 100, status: "", fainted: false, boosts: {}, slot: who.slot });
  };
  const pokemonWord = ident => {
    const mon = monOf(ident);
    if (!mon) return "";
    const nickname = speciesName(mon.species);
    const template = mon.side === perspective ? text.default.default.pokemon : text.default.default.opposingPokemon;
    return template.replace("{NICKNAME}", nickname);
  };
  const teamWord = side => (side === perspective ? text.default.default.team : text.default.default.opposingTeam);
  const effectName = effect => {
    const { kind, id, name } = parseEffect(effect);
    return (kind ? tables[kind]?.[id]?.name : tables.move[id]?.name || tables.ability[id]?.name || tables.item[id]?.name || text.default[id]?.weatherName) || name;
  };
  // A message for an effect: its own entry first (a move, an ability, an item or a condition), then the shared default.
  const template = (effect, key) => {
    const { kind, id } = parseEffect(effect);
    const own = kind ? tables[kind]?.[id]?.[key] : (text.default[id]?.[key] ?? tables.move[id]?.[key] ?? tables.ability[id]?.[key] ?? tables.item[id]?.[key]);
    return own;
  };
  const fill = (source, values) => {
    if (!source) return null;
    const out = source.replace(/[{[]([A-Z0-9]+)((?::[a-z]+)*)[}\]]/g, (_, key, modifiers) => {
      let word = values[key] ?? "";
      for (const modifier of modifiers.split(":").filter(Boolean)) word = josa(word, modifier);
      return word;
    });
    return out.replace(/\*\*/g, "").trim();
  };
  const D = key => text.default.default[key];

  function setActive(ident, details, condition) {
    const who = parseIdent(ident);
    const side = state.sides[who.side];
    const previous = side.active[who.slot];
    const { species } = parseDetails(details);
    const mon = side.team[who.name] || (side.team[who.name] = { ident: `${who.side}: ${who.name}`, side: who.side, name: who.name, boosts: {} });
    Object.assign(mon, { species, details, slot: who.slot, fainted: false, boosts: {} }, parseHP(condition));
    side.active[who.slot] = mon;
    return previous && previous !== mon && !previous.fainted ? previous : null;
  }
  const setCondition = (ident, condition) => {
    const mon = monOf(ident);
    const before = mon.maxhp ? mon.hp / mon.maxhp : 0;
    Object.assign(mon, parseHP(condition));
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

    switch (cmd) {
      case "player": if (args[1]) state.players[args[0]] = args[1]; break;
      case "gametype": state.gameType = args[0]; break;
      case "poke": state.sides[args[0]].preview.push(parseDetails(args[1]).species); break;
      case "turn": state.turn = Number(args[0]); event = { verb: "turn", turn: state.turn }; break;
      case "win": state.ended = true; state.winner = state.players.p1 === args[0] ? "p1" : "p2"; event = { verb: "end" }; break;
      case "tie": state.ended = true; state.winner = "tie"; event = { verb: "end" }; break;

      case "switch": case "drag": case "replace": {
        const who = parseIdent(args[0]);
        const previous = setActive(args[0], args[1], args[2]);
        const own = who.side === perspective;
        if (previous && cmd === "switch") say(own ? D("switchOutOwn") : D("switchOut"), { TRAINER: state.players[who.side], NICKNAME: speciesName(previous.species) });
        const name = speciesName(parseDetails(args[1]).species);
        if (cmd === "drag") say(D("drag"), { FULLNAME: own ? name : pokemonWord(args[0]) });
        else if (cmd === "switch") say(own ? D("switchInOwn") : D("switchIn"), { TRAINER: state.players[who.side], FULLNAME: name });
        event = { verb: "enter", ident: args[0], leaving: previous?.ident || null };
        break;
      }
      case "detailschange": case "-formechange": {
        const mon = monOf(args[0]);
        mon.species = parseDetails(args[1]).species;
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
        say(D("move"), { POKEMON: pokemonWord(source), MOVE: effectName(`move: ${args[1]}`) });
        const spread = typeof kw.spread === "string" ? kw.spread.split(",").map(slot => `${slot}:`) : null;
        const targets = (spread || (args[2] ? [args[2]] : [])).filter(t => parseIdent(t)?.slot >= 0);
        const self = !targets.length || targets.every(t => t.slice(0, 3) === source.slice(0, 3));
        const verb = self ? "self" : move.category === "Physical" ? "strike" : "chase";
        event = { verb, ident: source, targets: self ? [] : targets, type: move.type || "", miss: Boolean(kw.miss), still: Boolean(kw.still) };
        break;
      }
      case "faint": {
        const mon = monOf(args[0]);
        mon.fainted = true; mon.hp = 0;
        say(D("faint"), { POKEMON: pokemonWord(args[0]) });
        event = { verb: "fall", ident: args[0] };
        break;
      }
      case "-damage": case "-heal": case "-sethp": {
        const { mon } = setCondition(args[0], args[1]);
        const values = { POKEMON: pokemonWord(args[0]), SOURCE: kw.of ? pokemonWord(kw.of) : "" };
        if (cmd === "-heal") {
          if (from) say(template(kw.from, "heal") || (from.kind === "item" ? D("healFromItem") : D("heal")), { ...values, ITEM: effectName(kw.from), EFFECT: effectName(kw.from) });
          else say(D("heal"), values);
        } else if (from) {
          const own = template(kw.from, "damage");
          say(own || (from.kind === "item" ? D("damageFromItem") : null), { ...values, ITEM: effectName(kw.from), MOVE: effectName(kw.from) });
        }
        event = { verb: cmd === "-damage" && !from ? "take" : "hp", ident: args[0], hp: mon.hp, maxhp: mon.maxhp };
        break;
      }
      case "-status": {
        const mon = monOf(args[0]);
        mon.status = args[1];
        say(from?.kind === "item" ? template(args[1], "startFromItem") : template(args[1], "start"), { POKEMON: pokemonWord(args[0]), ITEM: from ? effectName(kw.from) : "" });
        event = { verb: "status", ident: args[0] };
        break;
      }
      case "-curestatus": {
        const mon = monOf(args[0]);
        mon.status = "";
        say(template(args[1], "end"), { POKEMON: pokemonWord(args[0]) });
        event = { verb: "status", ident: args[0] };
        break;
      }
      case "-boost": case "-unboost": {
        const mon = monOf(args[0]);
        const amount = Number(args[2] || 0);
        mon.boosts[args[1]] = Math.max(-6, Math.min(6, (mon.boosts[args[1]] || 0) + (cmd === "-boost" ? amount : -amount)));
        const key = (cmd === "-boost" ? "boost" : "unboost") + (amount === 0 ? "0" : amount >= 3 ? "3" : amount === 2 ? "2" : "");
        say(D(key), { POKEMON: pokemonWord(args[0]), STAT: text.stats[args[1]] || args[1] });
        event = { verb: "boost", ident: args[0], up: cmd === "-boost" };
        break;
      }
      case "-setboost": monOf(args[0]).boosts[args[1]] = Number(args[2]); event = { verb: "boost", ident: args[0] }; break;
      case "-clearboost": case "-clearallboost": case "-clearnegativeboost": {
        const targets = cmd === "-clearallboost" ? Object.values(state.sides).flatMap(s => s.active.filter(Boolean)) : [monOf(args[0])];
        for (const mon of targets) mon.boosts = cmd === "-clearnegativeboost" ? Object.fromEntries(Object.entries(mon.boosts).filter(([, v]) => v > 0)) : {};
        say(cmd === "-clearallboost" ? D("clearAllBoost") : D("clearBoost"), { POKEMON: args[0] ? pokemonWord(args[0]) : "" });
        break;
      }
      case "-weather": {
        const id = toID(args[0]);
        if (id === "none") { if (state.weather) say(template(state.weather, "end"), {}); state.weather = null; }
        else if (kw.upkeep) say(template(id, "upkeep"), {});
        else { state.weather = id; say(template(id, "start"), {}); }
        event = { verb: "field" };
        break;
      }
      case "-fieldstart": case "-fieldend": {
        const { id } = parseEffect(args[0]);
        state.fields = cmd === "-fieldstart" ? [...new Set([...state.fields, id])] : state.fields.filter(f => f !== id);
        say(template(args[0], cmd === "-fieldstart" ? "start" : "end") || D(cmd === "-fieldstart" ? "startFieldEffect" : "endFieldEffect"), { EFFECT: effectName(args[0]), POKEMON: kw.of ? pokemonWord(kw.of) : "" });
        event = { verb: "field" };
        break;
      }
      case "-sidestart": case "-sideend": {
        const side = parseIdent(args[0])?.side;
        const { id } = parseEffect(args[1]);
        const conditions = state.sides[side].conditions;
        state.sides[side].conditions = cmd === "-sidestart" ? [...new Set([...conditions, id])] : conditions.filter(c => c !== id);
        say(template(args[1], cmd === "-sidestart" ? "start" : "end") || D(cmd === "-sidestart" ? "startTeamEffect" : "endTeamEffect"), { TEAM: teamWord(side), EFFECT: effectName(args[1]) });
        event = { verb: "field" };
        break;
      }
      case "-start": case "-end": {
        say(template(args[1], cmd === "-start" ? "start" : "end") || (cmd === "-end" ? D("end") : null), { POKEMON: pokemonWord(args[0]), EFFECT: effectName(args[1]), SOURCE: kw.of ? pokemonWord(kw.of) : "" });
        break;
      }
      case "-singleturn": case "-singlemove": say(template(args[1], "start"), { POKEMON: pokemonWord(args[0]) }); break;
      case "-activate": {
        const source = template(args[1], "activate") ?? template(args[1], "block") ?? null;
        say(source, { POKEMON: pokemonWord(args[0]), TARGET: kw.of ? pokemonWord(kw.of) : "", SOURCE: kw.of ? pokemonWord(kw.of) : "", EFFECT: effectName(args[1]) });
        break;
      }
      case "-ability": {
        say(D("abilityActivation"), { POKEMON: pokemonWord(args[0]), ABILITY: effectName(`ability: ${args[1]}`) });
        say(template(`ability: ${args[1]}`, "start"), { POKEMON: pokemonWord(args[0]) });
        break;
      }
      case "-item": say(template(`item: ${args[1]}`, "start") || D("addItem"), { POKEMON: pokemonWord(args[0]), ITEM: effectName(`item: ${args[1]}`), SOURCE: kw.of ? pokemonWord(kw.of) : "" }); break;
      case "-enditem": {
        const values = { POKEMON: pokemonWord(args[0]), ITEM: effectName(`item: ${args[1]}`) };
        say(kw.eat ? template(`item: ${args[1]}`, "eat") || D("eatItem") : template(`item: ${args[1]}`, "end") || D("removeItem"), values);
        break;
      }
      case "cant": say(template(args[1], "cant") || D("cant"), { POKEMON: pokemonWord(args[0]), MOVE: args[2] ? effectName(`move: ${args[2]}`) : "" }); break;
      case "-prepare": say(template(`move: ${args[1]}`, "prepare"), { POKEMON: pokemonWord(args[0]) }); break;
      case "-supereffective": say(D("superEffective"), { POKEMON: pokemonWord(args[0]) }); break;
      case "-resisted": say(D("resisted"), { POKEMON: pokemonWord(args[0]) }); break;
      case "-immune": say(D("immune"), { POKEMON: pokemonWord(args[0]) }); break;
      case "-crit": say(D("crit"), { POKEMON: pokemonWord(args[0]) }); break;
      case "-miss": say(D("miss"), { POKEMON: pokemonWord(args[1] || args[0]) }); break;
      case "-fail": say(D("fail"), { POKEMON: pokemonWord(args[0]) }); break;
      case "-notarget": say(D("noTarget"), { POKEMON: args[0] ? pokemonWord(args[0]) : "" }); break;
      case "-ohko": say(D("ohko"), {}); break;
      case "-hitcount": say(D("hitCount") || D("hitCountSingular"), { POKEMON: pokemonWord(args[0]), NUMBER: args[1] }); break;
      case "-transform": say(D("transform"), { POKEMON: pokemonWord(args[0]), SPECIES: speciesName(monOf(args[1])?.species || "") }); break;
      case "-message": lines.push(args[0]); break;
      default: break;
    }
    return { lines, event };
  }

  return { state, read, speciesName, pokemonWord };
}

/* 끝난 공식 배틀들에서 포켓몬마다 실제로 나온 판, 선봉으로 나온 판, 나와서 이긴 판을 센다(기록의 포켓몬 시트).
   rows: { log, winner } 들. 전체 로그는 비밀 줄(|split| 다음 줄)과 공개 줄이 겹쳐 있어 공개 줄만 읽는다.
   종은 나올 때의 이름으로 센다: 메가진화는 원래 모습으로 나오므로 원래 종으로 센다. */
export function battleUsage(rows = []) {
  const usage = new Map();
  const bump = (id, key) => { const u = usage.get(id) || { picked: 0, leads: 0, wins: 0 }; u[key] += 1; usage.set(id, u); };
  for (const row of rows) {
    const seen = { p1: new Set(), p2: new Set() }, leads = { p1: new Set(), p2: new Set() };
    let started = false, skip = false;
    for (const line of String(row?.log || "").split("\n")) {
      if (skip) { skip = false; continue; }
      if (line.startsWith("|split|")) { skip = true; continue; }
      if (line.startsWith("|turn|")) started = true;
      const match = /^\|(switch|drag|replace)\|(p[12])[ab]?: [^|]*\|([^|,]+)/.exec(line);
      if (!match) continue;
      const id = toID(match[3]);
      seen[match[2]].add(id);
      if (!started) leads[match[2]].add(id);
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

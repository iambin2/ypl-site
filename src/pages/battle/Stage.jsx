import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Modal from "../../components/common/Modal.jsx";
import { onSpriteError, spriteUrl } from "../../services/teamBuilderCore.js";
import { defensiveMatchups, statRange } from "../../services/calculatorCore.js";
import { Generations } from "@smogon/calc";
import { createBattleReader, toID } from "../../services/battleLog.js";
import * as fx from "./stageFx.js";
import * as cam from "./stageCamera.js";
import Seg from "../../components/common/Seg.jsx";

/* 배틀 무대 (DESIGN.md "Battle", The stage). 경기장 위에 두 편이 마주 서고, 각 포켓몬 머리 위에 쇼다운처럼 상태 막대가 뜬다.
   날씨, 필드, 룸, 벽, 설치기는 무대 위에 그대로 남아 보이고, 기록 한 줄마다 stageFx.js의 연출이 돈다.
   무대는 테마와 상관없이 늘 밤의 남색 경기장이다(영상의 레터박스처럼). */

const GEN = Generations.get(9);
export const other = side => (side === "p1" ? "p2" : "p1");
export const keyOf = ident => String(ident).slice(0, 3);
const slotKey = (side, slot) => `${side}${"ab"[slot]}`;

/* ---------- what the stage shows, taken from the reader's state ---------- */
// standing: a Pokémon whose HP reached 0 stays on the stage until its fall is played (the log marks it fainted at the blow)
const monSnap = (mon, standing = false) => mon && {
  name: mon.name, species: mon.species, hp: mon.hp, maxhp: mon.maxhp, status: mon.status, fainted: mon.fainted, standing,
  boosts: { ...mon.boosts }, volatiles: [...(mon.volatiles || [])], gender: mon.gender, level: mon.level,
  item: mon.item, ability: mon.ability, moves: [...(mon.moves || [])], ppUsed: { ...(mon.ppUsed || {}) },
};
function roster(side) {
  // the team in its preview order; those not yet seen stand as they were shown
  const seen = Object.values(side.team);
  const list = side.preview.length ? side.preview.map(species => seen.find(m => m.name === species || toID(m.species).startsWith(toID(species))) || { species, hp: 1, maxhp: 1 }) : seen;
  return list.map(m => ({ species: m.species, name: m.name || "", fainted: Boolean(m.fainted), status: m.status && m.status !== "fnt" ? m.status : "", out: side.active.includes(m), seen: Boolean(m.name),
    hp: m.hp, maxhp: m.maxhp, item: m.item || "", ability: m.ability || "", moves: [...(m.moves || [])], ppUsed: { ...(m.ppUsed || {}) } }));
}
export function sceneOf(state, standing = null) {
  const side = id => {
    const s = state.sides[id];
    return { active: s.active.map((m, slot) => monSnap(m, Boolean(standing?.has(slotKey(id, slot))))), conditions: [...s.conditions], since: { ...s.since }, layers: { ...s.layers }, roster: roster(s) };
  };
  return { turn: state.turn, weather: state.weather, weatherSince: state.weatherSince, fields: [...state.fields], fieldSince: { ...state.fieldSince }, ended: state.ended, winner: state.winner, players: { ...state.players }, p1: side("p1"), p2: side("p2") };
}

/* ---------- words ---------- */
export const STATUS = { brn: "화상", par: "마비", slp: "잠듦", frz: "얼음", psn: "독", tox: "맹독" };
const STAT = { atk: "공격", def: "방어", spa: "특공", spd: "특방", spe: "스피드", accuracy: "명중", evasion: "회피" };
const VOLATILE = { confusion: "혼란", substitute: "대타출동", taunt: "도발", encore: "앙코르", leechseed: "씨뿌리기", attract: "헤롱헤롱", torment: "트집", disable: "사슬묶기", healblock: "회복봉인", yawn: "하품", perishsong: "멸망의노래", curse: "저주", focusenergy: "기충전", magnetrise: "전자부유", ingrain: "뿌리박기", aquaring: "아쿠아링", saltcure: "소금절이", partiallytrapped: "속박", smackdown: "떨어뜨리기", throatchop: "지옥찌르기", tarshot: "타르샷", charge: "충전", stockpile: "비축", laserfocus: "일점집중", typechange: "타입 변화", dynamax: "다이맥스" };
const HIDDEN_VOLATILES = new Set(["typechange"]);
// turns a field effect lasts; the ones an item stretches by three say so
const LASTS = { trickroom: 5, gravity: 5, magicroom: 5, wonderroom: 5, tailwind: 4, safeguard: 5, mist: 5, luckychant: 5 };
const STRETCH = { raindance: 5, sunnyday: 5, sandstorm: 5, snowscape: 5, snow: 5, hail: 5, electricterrain: 5, psychicterrain: 5, grassyterrain: 5, mistyterrain: 5, reflect: 5, lightscreen: 5, auroraveil: 5 };
function turnsLeft(id, since, turn) {
  const base = LASTS[id] || STRETCH[id];
  if (!base || since == null) return "";
  const left = Math.max(1, base - (turn - since));
  return STRETCH[id] ? `${left}~${left + 3}턴` : `${left}턴`;
}
const multiplier = (stat, n) => {
  const b = stat === "accuracy" || stat === "evasion" ? 3 : 2;
  const v = n >= 0 ? (b + n) / b : b / (b - n);
  return `×${Number(v.toFixed(2))}`;
};
export const nameOf = (res, species) => res.text.pokedex[toID(species)] || species;
export const effectWord = (res, id) => VOLATILE[id] || res.text.moves[id]?.name || res.text.abilities[id]?.name || res.text.default[id]?.weatherName || id;
export const typesOf = (res, species) => res.detail.pokedex[toID(species)]?.types || [];
// a move's type against a typing, as the games mark it: ×4, ×2, ×1, ×½, ×¼, ×0
export function effectiveness(moveType, types) {
  return types.reduce((p, t) => p * (GEN.types.get(toID(moveType))?.effectiveness?.[t] ?? 1), 1);
}
export const effLabel = m => ({ 4: "×4", 2: "×2", 1: "×1", .5: "×½", .25: "×¼", 0: "×0" })[m] ?? `×${m}`;

/* every picture either side may send in is fetched as soon as the team preview names it, so no Pokémon arrives as an empty frame */
const fetched = new Set();
function preload(state) {
  for (const side of ["p1", "p2"]) {
    const s = state.sides[side];
    for (const species of [...s.preview, ...Object.values(s.team).map(m => m.species)]) {
      if (!species || fetched.has(species)) continue;
      fetched.add(species);
      const img = new Image();
      img.decoding = "async";
      img.src = spriteUrl(species);
    }
  }
}

// a picture fetched and decoded before it is shown (a Mega Evolution's new form), or given up on after a moment
const decoded = src => { const img = new Image(); img.src = src; return Promise.race([img.decode?.().catch(() => {}), new Promise(resolve => setTimeout(resolve, 900))]); };

/* ---------- the tape: the log played one line at a time on the stage ---------- */
// how long a line stays the newest before the next one comes, counted from when it lit (its effect plays inside this time)
const MSG_MS = 680;
/* lines that are the result of the blow before them (critical, matchup, the damage itself, a guard or a substitute taking it):
   Showdown runs them as one beat with the move, so they land with the impact and the line before them does not hold its reading
   time; their words join the move's in the box (the move dim, the newest lit) */
const RESULT = /^\|-(crit|supereffective|resisted|immune|miss|fail|activate|hitcount)\||^\|-damage\|(?!.*\|\[from\])/;
const GUARD = /Protect|Detect|Shield|Bunker|Silk Trap|Bulwark|Max Guard|Wide Guard|Quick Guard|Mat Block|Obstruct/i;
const part = (line, n) => line.split("|")[n] || "";
// another direct hit on k among the results that follow (a multi-hit move)
const moreHits = (lines, k) => { for (const l of lines) { if (!RESULT.test(l)) return false; if (/^\|-damage\|/.test(l) && keyOf(part(l, 2)) === k) return true; } return false; };
const ofKey = line => line.match(/\|\[of\] (p\d[a-d])/)?.[1] || "";
// what the minor lines right after a move say about its blow, so the move can draw it: how hard by target, who is missed, whose guard holds
function aheadOf(lines) {
  const ahead = { power: {}, missed: new Set(), blocked: new Set() };
  for (const line of lines) {
    if (!line.startsWith("|-")) break;
    const cmd = part(line, 1), k = keyOf(part(line, 2));
    const add = n => { ahead.power[k] = (ahead.power[k] || 1) + n; };
    if (cmd === "-crit") add(.3);
    else if (cmd === "-supereffective") add(.3);
    else if (cmd === "-resisted") add(-.3);
    else if (cmd === "-miss") ahead.missed.add(keyOf(part(line, 3) || part(line, 2)));
    else if (cmd === "-activate" && GUARD.test(part(line, 3))) ahead.blocked.add(k);
  }
  return ahead;
}
// epoch: a jump (a replay's seek, a change of side) starts the tape again from the top and catches up at once, as a page opened mid-battle does
export function useStageTape(log, res, perspective, epoch = 0) {
  const reader = useRef(null);
  const done = useRef(0);
  const running = useRef(false);
  const seenEpoch = useRef(epoch);
  const latest = useRef({ log, epoch });
  latest.current = { log, epoch };
  const stageRef = useRef(null);
  const [scene, setScene] = useState(null);
  const [lines, setLines] = useState([]);
  const [said, setSaid] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [kick, setKick] = useState(0);
  // the newest log, read when a run ends: lines that came while it played are played next, not left until the log moves again
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const reset = () => { reader.current = createBattleReader({ text: res.text, moves: res.detail.moves, perspective }); done.current = 0; };
  if (!reader.current) reset();

  useEffect(() => {
    if (running.current || log == null) return;
    const all = String(log).split("\n");
    if (epoch !== seenEpoch.current || all.length < done.current) { seenEpoch.current = epoch; reset(); setLines([]); }
    const fresh = all.slice(done.current);
    if (!fresh.length) return;
    running.current = true;
    // a page opened mid-battle catches up at once; only what arrives while it is open is played
    const catchUp = done.current === 0;
    const R = reader.current;
    if (!catchUp && !fx.instant()) setPlaying(true);
    (async () => {
      await null; // out of the effect: flushSync may not run inside React's own work
      let pending = [], lastSaid = [], saidAt = 0;
      const flushLines = () => { if (pending.length) { const add = pending; pending = []; flushSync(() => setLines(list => [...list, ...add])); } };
      const standing = new Set();
      const show = () => flushSync(() => setScene(sceneOf(R.state, standing)));
      const own = key => key.startsWith(perspective);
      const word = key => { const mon = R.state.sides[key.slice(0, 2)].active[key.charCodeAt(2) - 97]; return mon ? `${own(key) ? "" : "상대 "}${R.speciesName(mon.species)}` : ""; };
      // the blow being played: who struck with what, and what the lines after it said about each target
      const freshBlow = () => ({ from: "", type: "", crit: new Set(), strong: new Set(), weak: new Set(), hit: new Set(), hits: {}, on: false });
      let blow = freshBlow();
      let chained = false; // the line before this one handed its reading time on (it and this one are one beat)
      let shown = [];
      const busy = {}; // the HP still moving on each Pokémon: a second hit on it (a multi-hit move) waits for the first
      let landing = []; // HP moves of this beat started together (a spread move's targets), awaited when the beat ends
      // the camera (DESIGN.md "Battle", The camera): pushed in while a beat plays, back to wide once its words have stood
      let framed = false, shotId = 0, opened = false;
      const toWide = () => { shotId += 1; if (framed) { framed = false; return cam.wide(stageRef.current); } return null; };
      const push = (key, scale, duration) => { const stage = stageRef.current; if (!stage) return; shotId += 1; framed = true; cam.frame(stage, fx.spot(stage, key), scale, duration); };
      for (let i = 0; i < fresh.length; i++) {
        if (latest.current.epoch !== epoch) break; // a jump came while this played: the next run starts again
        const line = fresh[i];
        const next = fresh[i + 1] || "";
        done.current += 1;
        const before = {};
        for (const side of ["p1", "p2"]) R.state.sides[side].active.forEach((m, s) => { if (m) before[slotKey(side, s)] = { hp: m.hp, maxhp: m.maxhp }; });
        const { lines: text, event, reveal } = R.read(line);
        if (event?.verb === "turn") pending.push({ turn: event.turn });
        pending.push(...text.map(t => ({ text: t })));
        if (text.length) lastSaid = text;
        if (event?.verb === "enter" || /^\|(poke|teampreview)/.test(line)) preload(R.state);
        // a hidden page keeps no animation clock and throttles its timers: it reads on without effects, as does a stage that is gone
        if (catchUp || fx.instant() || document.hidden || !alive.current) continue;
        const result = RESULT.test(line);
        if (!result) {
          if (landing.length) { await Promise.all(landing); landing = []; }
          // a line caused by the move itself (Brick Break taking a screen down before it hits) is still its blow
          if (!/^\|move\||^\|-sideend\||\|\[from\] move:/.test(line)) blow.on = false;
          // a fall keeps the camera on the one falling
          if (!blow.on && !/^\|faint\|/.test(line)) toWide();
        }
        // one beat: a move and its results; the leads sent out together; the stat changes of one cause (Intimidate on both foes)
        const chain = (blow.on || /^\|move\|/.test(line)) && (RESULT.test(next) || /^\|-sideend\|/.test(next))
          || (R.state.turn === 0 && /^\|switch\|/.test(line) && /^\|switch\|/.test(next))
          || (/^\|-(un)?boost\|/.test(line) && /^\|-(un)?boost\|/.test(next));
        flushLines();
        if (text.length) { shown = chained ? [...shown, ...text].slice(-2) : text; flushSync(() => setSaid(shown)); saidAt = performance.now(); }
        chained = chain;
        const stage = stageRef.current;
        const k = event?.ident ? keyOf(event.ident) : "";
        if (reveal) { fx.popup(stage, keyOf(reveal.ident), `${word(keyOf(reveal.ident))}의 특성`, reveal.ability, own(keyOf(reveal.ident))); await fx.wait(420); }
        // lines the reader keeps as words alone still show on the stage
        const raw = part(line, 1), rk = keyOf(part(line, 2));
        if (raw === "-activate" && /confusion/i.test(part(line, 3))) await fx.sway(stage, rk);
        else if (raw === "-activate" && /Substitute/.test(part(line, 3))) fx.hit(stage, rk, { share: .2 });
        else if (raw === "-prepare") { const m = res.detail.moves[toID(part(line, 3))]; await fx.gather(stage, rk, m?.type || "Normal"); }
        else if (raw === "-transform") await fx.morph(stage, rk);
        else if (raw === "-hitcount") await busy[rk]; // the count is said in the message window once the last hit has landed
        // an effect that fails is skipped, never the battle: the lines read on and the scene still follows them
        try { switch (event?.verb) {
          case "strike": case "chase": case "self": {
            blow = { ...freshBlow(), from: k, type: event.type, on: true };
            const data = res.detail.moves[event.move] || {};
            /* the camera frames the user as it gathers and pans to its target as the move travels, holding there through the blow;
               a spread move stays wide and leans in a little on its user */
            // the move itself carries the camera on from the user (moveFx.js: on the user, on both, on the target)
            push(k, event.spread ? 1.05 : 1.12, 420);
            await fx.move(stage, { ...event, priority: data.priority || 0 }, keyOf, aheadOf(fresh.slice(i + 1)));
            break;
          }
          /* as in 포켓몬 챔피언스, nothing is written over a Pokémon: the message window says the critical hit, the matchup, a miss;
             the stage shows them by the camera, the weight of the blow and the sound */
          case "crit": blow.crit.add(k); push(k, 1.25, 200); break;
          case "super": blow.strong.add(k); break;
          case "resist": blow.weak.add(k); break;
          case "take": case "hp": {
            const was = before[k];
            if (event.hp === 0 && !event.heal) standing.add(k);
            // the stage as this line leaves it: the lines after it are read on while it plays (a multi-hit move's further hits),
            // and its bar must not show their HP before they land
            const view = sceneOf(R.state, standing);
            const direct = event.verb === "take";
            const again = direct && blow.on && blow.hit.has(k);
            // one hit of several: each keeps a short rhythm and its number stands apart from the one before
            const nth = direct && blow.on ? (blow.hits[k] = (blow.hits[k] || 0) + 1) - 1 : 0;
            const several = again || (direct && blow.on && moreHits(fresh.slice(i + 1), k));
            if (direct) blow.hit.add(k);
            const strike = { share: 0, crit: blow.crit.has(k), strong: blow.strong.has(k), weak: blow.weak.has(k), direct };
            const source = ofKey(line);
            const knockout = direct && event.hp === 0;
            const run = (async () => {
              await busy[k];
              // weight (DESIGN.md "Battle", Weight): the stage holds still at the impact, longer for a hard blow and longest for the
              // one that knocks out, which then plays on at half speed with the camera on its target
              if (direct && blow.on && nth === 0) {
                await cam.hitStop(stage, knockout ? 120 : strike.crit || strike.strong ? 90 : 60);
                if (knockout) { push(k, strike.crit ? 1.25 : 1.18, 300); fx.slowMo(stage, 700); }
              }
              // a further hit of a multi-hit move lands its own blow, and its HP goes with it
              if (again) fx.burst(stage, k, blow.type, .8);
              flushSync(() => setScene(view));
              if (!was || !event.maxhp) return;
              const lost = was.hp - event.hp;
              if (!lost) return;
              // HP that flows: a draining move heals from its target (the gain fills once the motes arrive), Leech Seed feeds its seeder
              if (lost < 0 && event.from === "drain" && source) await fx.flow(stage, source, k);
              if (lost > 0 && event.from === "leechseed" && source) fx.flow(stage, k, source);
              const drain = fx.drain(stage, k, was.hp / was.maxhp, event.hp / event.maxhp, { quick: several });
              if (lost < 0) await Promise.all([drain, fx.heal(stage, k)]);
              else {
                const shook = fx.hit(stage, k, { ...strike, share: several ? .1 : lost / event.maxhp });
                await Promise.all([drain, several ? null : shook, direct ? null : fx.residual(stage, k, event.from)]);
              }
            })().catch(err => console.error("stage", err));
            busy[k] = run;
            const whole = run;
            if (chain) landing.push(whole); else await Promise.all([...landing, whole]);
            if (!chain) landing = [];
            break;
          }
          case "fall": {
            // the stadium's lamps dim a step while it sinks, and come back as it goes out
           
            fx.darken(stage, .7, 900);
            await fx.faint(stage, k);
            standing.delete(k); show(); toWide(); break;
          }
          case "enter": {
            if (event.leaving) { await fx.leave(stage, k, { drag: event.drag }); }
            standing.delete(k);
            show();
            // the stage mounts with the first lead, so it is read again here
            const st = stageRef.current;
            // the opening (DESIGN.md "Battle", The big moments): the trainers' names and VS while the lamps switch on, then the throws
            if (!opened && R.state.turn === 0 && st) {
              opened = true;
              // the plates come in once the leads stand (the first turn, or the end of this run)
              st.classList.add("bs-intro");
              st.querySelectorAll(".bs-mon").forEach(el => { el.style.opacity = "0"; });
              await fx.opening(st, R.state.players[perspective] || "", R.state.players[other(perspective)] || "");
            }
           
            // a Pokémon sent in mid-battle is framed on its side; the leads come out wide
            if (R.state.turn > 0 && !chain) push(k, 1.08, 420);
            if (chain) { fx.enter(st, k); await fx.wait(260); } else await fx.enter(st, k);
            break;
          }
          case "change": {
            const next = R.state.sides[k.slice(0, 2)].active[k.charCodeAt(2) - 97];
            const ready = next ? decoded(spriteUrl(next.species)) : null;
            if (fresh[i + 1]?.startsWith("|-mega|")) { await Promise.all([fx.megaStart(stage, k), ready]); }
            else await ready;
            show();
            if (!fresh[i + 1]?.startsWith("|-mega|")) await fx.flashMon(stage, k);
            break;
          }
          case "mega": show(); await fx.megaEnd(stage, k); break;
          case "status": show(); await fx.status(stage, k, event.status); break;
          case "cure": show(); await fx.flashMon(stage, k, .5); break;
          case "boost": show(); if (chain) { fx.boost(stage, k, event.amount); await fx.wait(120); } else await fx.boost(stage, k, event.amount); break;
          case "weather": show(); if (!event.upkeep && event.id) await fx.wait(500); break;
          case "field": show(); await Promise.all([fx.wait(450), event.on && event.id === "trickroom" ? fx.twist(stage) : null]); break;
          case "side":
            // a screen that a blow breaks falls apart before it fades; one that runs out only fades
            // (inside a blow the hit lands while the shards still fall)
            if (!event.on && blow.on) { fx.shatter(stage, event.side === perspective, event.id); await fx.wait(120); show(); break; }
            show(); await fx.wait(450); break;
          case "protect": await fx.shield(stage, k, event.id); break;
          case "ability": fx.popup(stage, k, `${word(k)}의 특성`, event.name, own(k)); await fx.wait(520); show(); break;
          case "item": fx.popup(stage, k, `${word(k)}의 도구`, event.name, own(k)); await fx.wait(400); show(); break;
          case "volatile":
            if (event.id === "substitute" && !event.on) { await fx.breakDoll(stage, k); show(); await fx.doll(stage, k, false); break; }
            if (event.on && event.id === "substitute") await fx.hideForDoll(stage, k);
            show();
            if (event.on && event.id === "substitute") await fx.doll(stage, k, true);
            break;
          case "cant": show(); await fx.cant(stage, k, event.why); break;
          case "turn": show(); stageRef.current?.classList.remove("bs-intro"); await toWide(); await fx.banner(stage, `${event.turn}턴`); break;
          case "end": {
            // the end: the camera frames the winner's last Pokémon standing, the lamps run along their banks, the winner's plate rises
            show(); await toWide();
            const last = event.winner && event.winner !== "tie" ? R.state.sides[event.winner].active.findIndex(m => m && !m.fainted) : -1;
            if (last >= 0) push(slotKey(event.winner, last), 1.14, 680);
            await Promise.all([fx.banner(stage, event.winner === "tie" ? "무승부" : `${R.state.players[event.winner]} 승리`, { tone: "win" }), fx.victory(stage)]);
            break;
          }
          default: show();
        } } catch (err) { console.error("stage", err); show(); }
        if (text.length && !chain) await fx.hold(saidAt, MSG_MS);
      }
      if (landing.length) await Promise.all(landing);
      toWide();
      stageRef.current?.classList.remove("bs-intro");
      flushLines();
      if (lastSaid.length) flushSync(() => setSaid(shown.at(-1) === lastSaid.at(-1) ? shown : lastSaid));
      flushSync(() => setScene(sceneOf(R.state)));
      running.current = false;
      // the log moved on (or jumped) while this played: read it again
      if (latest.current.log !== log || latest.current.epoch !== epoch) setKick(n => n + 1);
      else setPlaying(false);
    })();
  }, [log, kick, epoch]);

  // read: how many lines of the log the stage has taken in, so a replay knows when a turn has finished playing
  return { scene, lines, said, playing, stageRef, read: done.current, state: reader.current.state, speciesName: reader.current.speciesName };
}

/* ---------- the stage ---------- */
// a status carries its type's square, as a type tag does
const STATUS_TYPE = { brn: "fire", par: "electric", psn: "poison", tox: "poison", slp: "normal", frz: "ice" };
const hpTone = share => (share <= .2 ? "type-fire" : share <= .5 ? "type-electric" : "type-grass");
// HP as one bar that empties from the right, green while half stands, yellow to a fifth, red under it; stageFx.drain moves it
function Gauge({ share }) {
  return <span className={`bt-hp ${hpTone(share)}`} aria-hidden="true"><b style={{ "--f": Math.max(0, Math.min(1, share)) }} /></span>;
}

/* a Pokémon's plate on the stage, as the games put it (DESIGN.md "Battle", The HUD): the foe's in the top corners, ours over the
   message window at the bottom right, so none covers a Pokémon. Our HP is exact, the foe's in percent as Showdown shows it; a status
   rides by the name; rises, falls and what clings to it stand on a line under the bar only when there are any. Tapping it opens
   the Pokémon's sheet. */
function Plate({ slotKey: key, mon, own, res, onInfo }) {
  if (!mon) return null;
  const exact = own && mon.maxhp !== 100;
  const share = mon.fainted || !mon.maxhp ? 0 : mon.hp / mon.maxhp;
  const hp = mon.fainted ? 0 : exact ? mon.hp : Math.max(mon.hp > 0 ? 1 : 0, Math.round(share * 100));
  const boosts = Object.entries(mon.boosts || {}).filter(([, v]) => v);
  const vols = (mon.volatiles || []).filter(v => !HIDDEN_VOLATILES.has(v));
  const status = mon.status && mon.status !== "fnt" ? mon.status : "";
  const name = nameOf(res, mon.species);
  return (
    <button type="button" className={"bt-plate" + (own ? " own" : "") + (mon.fainted ? " out" : "")} data-bar={key} onClick={onInfo}
      aria-label={`${own ? "" : "상대 "}${name} 정보, ${mon.fainted ? "쓰러짐" : `HP ${hp}${exact ? ` / ${mon.maxhp}` : "%"}`}`}>
      <span className="bt-plate-top" key={mon.name}>
        <b className="bt-plate-name">{name}</b>
        {mon.gender && <i className={`bt-sex ${mon.gender}`} aria-hidden="true">{mon.gender === "M" ? "♂" : "♀"}</i>}
        {/* every Pokémon here is level 50; a level is shown only when it is not */}
        {mon.level !== 50 && <span className="bt-plate-lv">{`Lv${mon.level}`}</span>}
        {status && <span className={`bt-st type-${STATUS_TYPE[status] || "normal"}`}>{STATUS[status]}</span>}
        {/* on a phone in doubles the marks fold into their count (the sheet lists them), so two of our plates never hide a foe */}
        {boosts.length + vols.length > 0 && <span className="bt-plate-more">{`+${boosts.length + vols.length}`}</span>}
      </span>
      <span className="bt-plate-hp">
        <Gauge share={share} />
        <span className="bt-plate-num">{mon.fainted ? "쓰러짐" : exact ? `${hp}/${mon.maxhp}` : `${hp}%`}</span>
      </span>
      {(boosts.length > 0 || vols.length > 0) && <span className="bt-marks">
        {boosts.map(([k, v]) => <span key={k} className={"bt-mark " + (v > 0 ? "up" : "down")}>{`${STAT[k] || k} ${multiplier(k, v)}`}</span>)}
        {vols.map(v => <span key={v} className="bt-mark">{effectWord(res, v)}</span>)}
      </span>}
    </button>
  );
}
const plates = (side, scene, own, doubles, res, onInfo) => (doubles ? [0, 1] : [0]).map(slot => {
  const key = slotKey(side, slot);
  return <Plate key={key} slotKey={key} mon={scene?.[side]?.active?.[slot]} own={own} res={res} onInfo={() => onInfo?.(key)} />;
});

const hard = m => m >= 2;
function SideField({ side, scene, own, doubles, res, targeting }) {
  const s = scene?.[side];
  const slots = doubles ? [0, 1] : [0];
  return (
    <div className={`bs-side ${own ? "own" : "foe"}`}>
      {slots.map(slot => {
        const key = slotKey(side, slot);
        const mon = s?.active?.[slot];
        const pick = targeting?.(side, slot);
        const alive = mon && (!mon.fainted || mon.standing);
        return (
          <div key={slot} className="bs-slot" data-mon={key} data-pos={`${own ? "own" : "foe"}${doubles ? `-d${slot}` : ""}`}>
            {/* the picture is drawn by the GPU stage (gl.js), which reads what stands here; the element keeps the place and the doll */}
            {alive && <div className="bs-mon" key={mon.name} data-name={mon.name}>
              {mon.volatiles.includes("substitute") ? <i className="bs-sub" aria-hidden="true" />
                : <img src={spriteUrl(mon.species)} alt="" draggable="false" decoding="async" onError={onSpriteError()} />}
            </div>}
            {pick && <button type="button" className="bt-pick" onClick={pick.onPick}
              aria-label={`${alive ? `${own ? "" : "상대 "}${nameOf(res, mon.species)}` : "빈 자리"} 대상으로 고르기${pick.mark != null ? `, ${effLabel(pick.mark)}` : ""}`}>
              {pick.mark != null && <span className={"bt-pick-mark" + (hard(pick.mark) ? " hard" : "")}>{effLabel(pick.mark)}</span>}
            </button>}
          </div>
        );
      })}
    </div>
  );
}

// own: our side, whose brought Pokémon (known) we know before they come out; a player can open their own party's sets from it (onParty)
function Strip({ side, scene, name, res, known, onParty }) {
  const s = scene?.[side];
  const knows = species => known?.some(k => toID(k).startsWith(toID(species)) || toID(species).startsWith(toID(k)));
  return (
    <div className="pn bt-strip">
      <b className="t12 bt-trainer">{name}</b>
      <span className="bt-balls" aria-label={`${name}의 파티`}>
        {(s?.roster || []).map((m, i) => <i key={i} className={"bt-ball" + (m.fainted ? " out" : !m.seen && !knows(m.species) ? " hid" : "") + (m.status ? ` st type-${STATUS_TYPE[m.status] || "normal"}` : "") + (m.out ? " on" : "")}
          title={`${nameOf(res, m.species)}${m.fainted ? ", 쓰러짐" : m.out ? ", 나와 있음" : !m.seen ? ", 아직 나오지 않음" : m.status ? `, ${STATUS[m.status]}` : ""}`}>
          <img src={spriteUrl(m.species)} alt="" draggable="false" decoding="async" onError={onSpriteError()} /></i>)}
      </span>
      {(s?.conditions || []).length > 0 && <span className="bt-conds">
        {s.conditions.map(c => <span key={c} className="bt-cond">{`${effectWord(res, c)}${s.layers[c] > 1 ? ` ×${s.layers[c]}` : ""}`}
          {turnsLeft(c, s.since[c], scene.turn) && <span>{turnsLeft(c, s.since[c], scene.turn)}</span>}</span>)}
      </span>}
      {onParty && <button type="button" className="bt-key" onClick={onParty}>내 파티</button>}
    </div>
  );
}

// the message window over the bottom of the stage: the newest line lit, the one before it dim; when the game asks
// (리자몽은 무엇을 할까?) the question is the newest
export function Say({ said, ask }) {
  const shown = ask ? [...said.slice(-1), ask] : said;
  return <div className="bt-say" aria-live="polite">{shown.map((line, i) => <p key={`${line}-${i}-${shown.length}`}>{line}</p>)}</div>;
}


/* the clock on the stage (DESIGN.md "Battle", The clock): the seconds of a decision in segment cells, as the board announces a
   number, and a bar under them emptying as the 90 run out; amber under 30, red for the last 10. mine: the decision owed is ours */
const CLOCK = 90;
function Clock({ left, mine }) {
  if (left == null) return null;
  const share = Math.max(0, Math.min(1, left / CLOCK));
  const tone = left <= 10 ? " hot" : left <= 30 ? " warm" : "";
  return <div className={"bt-clock" + tone + (mine ? " mine" : "")} role="timer" aria-label={`${mine ? "내 선택" : "선택"}까지 ${left}초`}>
    <Seg value={String(left)} h={24} cells={2} label="" />
    <i aria-hidden="true"><b style={{ "--f": share }} /></i>
  </div>;
}

export function Stage({ scene, stageRef, perspective, doubles, res, targeting, names, said, ask, known, onParty, clock = null, mine = false }) {
  const foe = other(perspective);
  const [info, setInfo] = useState(null);
  const fields = scene?.fields || [];
  // the GPU stage reads who stands where after every change, and draws the field as the scene leaves it
  useLayoutEffect(() => {
    const st = stageRef.current;
    if (!st) return;
    fx.sync(st);
    fx.field(st, { weather: scene?.weather || "", fields, foe: { conditions: scene?.[foe]?.conditions || [], layers: scene?.[foe]?.layers || {} }, own: { conditions: scene?.[perspective]?.conditions || [], layers: scene?.[perspective]?.layers || {} } });
  });
  const chips = [
    scene?.weather && [res.text.default[scene.weather]?.weatherName || scene.weather, turnsLeft(scene.weather, scene.weatherSince, scene.turn)],
    ...fields.map(f => [effectWord(res, f), turnsLeft(f, scene.fieldSince[f], scene.turn)]),
  ].filter(Boolean);
  return (
    <div className="bt-arena">
      <Strip side={foe} scene={scene} name={names[foe]} res={res} />
      <div className="bs-stage hud" ref={stageRef}>
        {/* the arena, the Pokémon, every effect, the field and the camera are one GPU picture (gl.js) under these places */}
        <div className="bs-world">
          <SideField side={foe} scene={scene} own={false} doubles={doubles} res={res} targeting={targeting} />
          <SideField side={perspective} scene={scene} own doubles={doubles} res={res} targeting={targeting} />
        </div>
        {/* the turn, the winner, an ability's plate and the opening stand here, outside the camera, so they keep the middle */}
        <div className="bs-over" aria-hidden="true" />
        {/* the HUD over the stage: the foe's plates together in the top corner, side by side in the order the two stand (as Showdown
            keeps a side's bars together), the field's tags under them; ours at the bottom right over the message window */}
        <div className={"bt-hud" + (doubles ? " two" : "")}>
          <div className={"bt-hud-foe" + (doubles ? " two" : "")}>
            <div className="bt-hud-plates">{plates(foe, scene, false, doubles, res, setInfo)}</div>
            {chips.length > 0 && <div className="bt-fieldchips">{chips.map(([word, left]) => <span key={word}>{word}{left && <span>{left}</span>}</span>)}</div>}
          </div>
          <div className="bt-hud-own">{plates(perspective, scene, true, doubles, res, setInfo)}</div>
          <Say said={said} ask={ask} />
          <Clock left={clock} mine={mine} />
        </div>
      </div>
      <Strip side={perspective} scene={scene} name={names[perspective]} res={res} known={known} onParty={onParty} />
      {info && scene && <MonInfo res={res} mon={scene[info.slice(0, 2)].active[info.charCodeAt(2) - 97]} own={info.startsWith(perspective)} onClose={() => setInfo(null)} />}
    </div>
  );
}

/* before a battle (DESIGN.md "Battle", Opening and waiting): the court with our leads on the near side and the far side empty until
   the opponent comes. A change of team or format sends the leads in again, out of the same light as in a battle. */
// awaiting: the opponent has not come yet, and a light breathes on the far floor where each of theirs will be sent in
export function LobbyStage({ leads, doubles, label, awaiting = false }) {
  const ref = useRef(null);
  const scene = { p1: { active: leads.map(species => ({ name: species, species, volatiles: [] })) } };
  // before paint, so a new lead never shows for a frame before it comes out of the light
  useLayoutEffect(() => { fx.sync(ref.current); leads.forEach((_, slot) => fx.enter(ref.current, slotKey("p1", slot), { ball: false })); }, [leads.join("|"), doubles]);
  return (
    <div className="bs-stage" ref={ref} role="img" aria-label={label}>
      <div className="bs-world">
        {awaiting && <div className="bs-side foe" aria-hidden="true">
          {(doubles ? [0, 1] : [0]).map(slot => <div key={slot} className="bs-slot" data-pos={`foe${doubles ? `-d${slot}` : ""}`}><i className="bs-await" /></div>)}
        </div>}
        <SideField side="p1" scene={scene} own doubles={doubles} />
      </div>
    </div>
  );
}
/* under the lobby's stage, where a battle has our status bars: each Pokémon standing there, its name and its types, in the order they stand */
// random: a random party is drawn when the battle opens, so its places say so instead of standing empty
export function LobbyBars({ leads, doubles, res, random = false }) {
  return <div className={"stack bt-bars" + (doubles ? " two" : "")}>
    {(doubles ? [0, 1] : [0]).map(slot => {
      const species = leads[slot];
      return <div key={slot} className="pn bt-lead">
        {random && <><b className="t15 dim">랜덤</b><span className="t12 mute">배틀이 열리면 정해집니다</span></>}
        {species && <><b className="t15">{nameOf(res, species)}</b>
          <span className="tb-types">{typesOf(res, species).map(t => <span key={t} className={`tb-type type-${toID(t)}`}>{res.text.types[t] || t}</span>)}</span></>}
      </div>;
    })}
  </div>;
}

/* ---------- a Pokémon's sheet: what the games and Showdown let a player look up mid-battle ---------- */
const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];
const STAT_FULL = { hp: "HP", atk: "공격", def: "방어", spa: "특공", spd: "특방", spe: "스피드" };
function MonInfo({ res, mon, own, onClose }) {
  if (!mon) return null;
  const dex = res.detail.pokedex[toID(mon.species)] || {};
  const types = dex.types || [];
  const weak = defensiveMatchups(types);
  const typeTag = t => <span key={t} className={`tb-type type-${toID(t)}`}>{res.text.types[t] || t}</span>;
  const abilityName = a => res.text.abilities[toID(a)]?.name || a;
  const [lo, hi] = dex.baseStats ? statRange(dex.baseStats.spe, "spe") : [0, 0];
  return (
    <Modal title={`${own ? "" : "상대 "}${nameOf(res, mon.species)}`} onClose={onClose}>
      <div className="bt-info">
        <div className="bt-info-row"><span className="t12 dim">HP</span><span>{own && mon.maxhp !== 100 ? `${mon.hp} / ${mon.maxhp}` : `${Math.round(mon.hp / (mon.maxhp || 1) * 100)}%`}</span></div>
        {mon.gender && <div className="bt-info-row"><span className="t12 dim">성별</span><span>{mon.gender === "M" ? "수컷" : "암컷"}</span></div>}
        <div className="bt-info-row"><span className="t12 dim">타입</span><span className="tb-types">{types.map(typeTag)}</span></div>
        <div className="bt-info-row"><span className="t12 dim">특성</span><span>{mon.ability ? abilityName(mon.ability) : (dex.abilities || []).map(abilityName).join(", ") + " 중 하나"}</span></div>
        <div className="bt-info-row"><span className="t12 dim">도구</span><span>{mon.item ? res.text.items[toID(mon.item)]?.name || mon.item : "아직 모름"}</span></div>
        {dex.baseStats && <div className="bt-info-row"><span className="t12 dim">종족값</span><span className="bt-info-stats">{STAT_KEYS.map(k => <span key={k}><small>{STAT_FULL[k]}</small>{dex.baseStats[k]}</span>)}</span></div>}
        {Object.values(mon.boosts || {}).some(Boolean) && <div className="bt-info-row"><span className="t12 dim">능력 변화</span><span>{Object.entries(mon.boosts).filter(([, v]) => v).map(([k, v]) => `${STAT[k] || k} ${multiplier(k, v)}`).join(", ")}</span></div>}
        {(mon.volatiles || []).some(v => !HIDDEN_VOLATILES.has(v)) && <div className="bt-info-row"><span className="t12 dim">걸린 효과</span><span>{mon.volatiles.filter(v => !HIDDEN_VOLATILES.has(v)).map(v => effectWord(res, v)).join(", ")}</span></div>}
        {dex.baseStats && <div className="bt-info-row"><span className="t12 dim">스피드 (Lv50)</span><span>{`${lo}~${hi}`}{mon.boosts?.spe ? ` (${multiplier("spe", mon.boosts.spe)})` : ""}</span></div>}
        {["4", "2"].map(m => weak[m]?.length > 0 && <div key={m} className="bt-info-row"><span className="t12 dim">{`약점 ×${m}`}</span><span className="tb-types">{weak[m].map(typeTag)}</span></div>)}
        {["0"].map(m => weak[m]?.length > 0 && <div key={m} className="bt-info-row"><span className="t12 dim">무효</span><span className="tb-types">{weak[m].map(typeTag)}</span></div>)}
        <div className="bt-info-row"><span className="t12 dim">{own ? "기술" : "보인 기술"}</span><span>{mon.moves.length ? mon.moves.map(m => res.text.moves[toID(m)]?.name || m).join(", ") : "아직 없음"}</span></div>
      </div>
    </Modal>
  );
}

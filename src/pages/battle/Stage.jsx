import React, { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Modal from "../../components/common/Modal.jsx";
import { spriteUrl } from "../../services/teamBuilderCore.js";
import { defensiveMatchups, statRange } from "../../services/calculatorCore.js";
import { Generations } from "@smogon/calc";
import { createBattleReader, toID } from "../../services/battleLog.js";
import * as fx from "./stageFx.js";
import { Court, Fading, Hazards, RoomBox, Screens, Wind } from "./Field.jsx";

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
  item: mon.item, ability: mon.ability, moves: [...(mon.moves || [])],
};
function roster(side) {
  // the team in its preview order; those not yet seen stand as they were shown
  const seen = Object.values(side.team);
  const list = side.preview.length ? side.preview.map(species => seen.find(m => m.name === species || toID(m.species).startsWith(toID(species))) || { species, hp: 1, maxhp: 1 }) : seen;
  return list.map(m => ({ species: m.species, fainted: Boolean(m.fainted), status: m.status && m.status !== "fnt" ? m.status : "", out: side.active.includes(m), seen: Boolean(m.name) }));
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
export function useStageTape(log, res, perspective) {
  const reader = useRef(null);
  const done = useRef(0);
  const running = useRef(false);
  const stageRef = useRef(null);
  const [scene, setScene] = useState(null);
  const [lines, setLines] = useState([]);
  const [said, setSaid] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [kick, setKick] = useState(0);
  const reset = () => { reader.current = createBattleReader({ text: res.text, moves: res.detail.moves, perspective }); done.current = 0; };
  if (!reader.current) reset();

  useEffect(() => {
    if (running.current || log == null) return;
    const all = String(log).split("\n");
    if (all.length < done.current) { reset(); setLines([]); }
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
      let blow = { crit: false, strong: false };
      for (let i = 0; i < fresh.length; i++) {
        const line = fresh[i];
        done.current += 1;
        const before = {};
        for (const side of ["p1", "p2"]) R.state.sides[side].active.forEach((m, s) => { if (m) before[slotKey(side, s)] = { hp: m.hp, maxhp: m.maxhp }; });
        const { lines: text, event, reveal } = R.read(line);
        if (event?.verb === "turn") pending.push({ turn: event.turn });
        pending.push(...text.map(t => ({ text: t })));
        if (text.length) lastSaid = text;
        if (event?.verb === "enter" || /^\|(poke|teampreview)/.test(line)) preload(R.state);
        if (catchUp || fx.instant()) continue;
        flushLines();
        if (text.length) { flushSync(() => setSaid(text)); saidAt = performance.now(); }
        const stage = stageRef.current;
        const k = event?.ident ? keyOf(event.ident) : "";
        if (reveal) { fx.popup(stage, keyOf(reveal.ident), `${word(keyOf(reveal.ident))}의 특성`, reveal.ability, own(keyOf(reveal.ident))); await fx.wait(420); }
        switch (event?.verb) {
          case "strike": case "chase": case "self": blow = { crit: false, strong: false }; await fx.move(stage, event, keyOf); break;
          case "crit": blow.crit = true; fx.label(stage, k, "급소", "hard"); break;
          case "super": blow.strong = true; fx.label(stage, k, "효과가 굉장하다", "hard"); break;
          case "resist": fx.label(stage, k, "효과가 별로", "soft"); break;
          case "immune": fx.label(stage, k, "효과 없음", "soft"); break;
          case "miss": fx.label(stage, k, "빗나감", "soft"); break;
          case "fail": fx.label(stage, k, "실패", "soft"); break;
          case "take": case "hp": {
            const was = before[k];
            if (event.hp === 0 && !event.heal) standing.add(k);
            show();
            if (!was || !event.maxhp) break;
            const lost = was.hp - event.hp;
            const exact = own(k) && event.maxhp !== 100;
            const amount = exact ? Math.abs(lost) : Math.round(Math.abs(lost) / event.maxhp * 100);
            if (!amount) break;
            const text = `${lost > 0 ? "-" : "+"}${amount}${exact ? "" : "%"}`;
            const drain = fx.drain(stage, k, was.hp / was.maxhp, event.hp / event.maxhp);
            if (lost < 0) await Promise.all([drain, fx.heal(stage, k), fx.number(stage, k, text, true)]);
            else await Promise.all([drain, fx.hit(stage, k, { share: lost / event.maxhp, ...blow }), fx.number(stage, k, text)]);
            blow = { crit: false, strong: false };
            break;
          }
          case "fall": await fx.faint(stage, k); standing.delete(k); show(); break;
          case "enter":
            if (event.leaving && !event.drag) await fx.leave(stage, k);
            standing.delete(k);
            show();
            await fx.enter(stage, k);
            break;
          case "change": {
            const next = R.state.sides[k.slice(0, 2)].active[k.charCodeAt(2) - 97];
            const ready = next ? decoded(spriteUrl(next.species)) : null;
            if (fresh[i + 1]?.startsWith("|-mega|")) await Promise.all([fx.megaStart(stage, k), ready]);
            else await ready;
            show();
            if (!fresh[i + 1]?.startsWith("|-mega|")) await fx.flashMon(stage, k);
            break;
          }
          case "mega": show(); await fx.megaEnd(stage, k); break;
          case "status": show(); await fx.status(stage, k, event.status); break;
          case "cure": show(); await fx.flashMon(stage, k, .5); break;
          case "boost": show(); await fx.boost(stage, k, event.amount); break;
          case "weather": show(); if (!event.upkeep && event.id) await fx.wait(500); break;
          case "field": case "side": show(); await fx.wait(450); break;
          case "protect": await fx.shield(stage, k); break;
          case "ability": fx.popup(stage, k, `${word(k)}의 특성`, event.name, own(k)); await fx.wait(520); show(); break;
          case "item": fx.popup(stage, k, `${word(k)}의 도구`, event.name, own(k)); await fx.wait(400); show(); break;
          case "volatile": show(); if (event.on && event.id === "substitute") await fx.flashMon(stage, k, .8); break;
          case "cant": show(); await fx.flashMon(stage, k, .4); break;
          case "turn": show(); await fx.banner(stage, `${event.turn}턴`); break;
          case "end": show(); await fx.banner(stage, event.winner === "tie" ? "무승부" : `${R.state.players[event.winner]} 승리`, { tone: "win" }); break;
          default: show();
        }
        if (text.length) await fx.hold(saidAt, MSG_MS);
      }
      flushLines();
      if (lastSaid.length) flushSync(() => setSaid(lastSaid));
      flushSync(() => setScene(sceneOf(R.state)));
      running.current = false;
      if (String(log).split("\n").length > done.current) setKick(n => n + 1);
      else setPlaying(false);
    })();
  }, [log, kick]);

  return { scene, lines, said, playing, stageRef, state: reader.current.state, speciesName: reader.current.speciesName };
}

/* ---------- the stage ---------- */
// a status carries its type's square, as a type tag does
const STATUS_TYPE = { brn: "fire", par: "electric", psn: "poison", tox: "poison", slp: "normal", frz: "ice" };
const hpTone = share => (share <= .2 ? "type-fire" : share <= .5 ? "type-electric" : "type-grass");
// HP as ten cells on the seam, each filled by the share it holds; stageFx.drain sweeps it cell by cell when HP moves
function Gauge({ share }) {
  return <span className={`bt-gauge ${hpTone(share)}`} aria-hidden="true">
    {Array.from({ length: 10 }, (_, i) => <i key={i}><b style={{ "--f": Math.max(0, Math.min(1, share * 10 - i)) }} /></i>)}
  </span>;
}

/* a Pokémon's status bar: a board panel on the seam outside the stage, in the order its Pokémon stand (left to right).
   Our HP is exact, the foe's in percent as Showdown shows it; then the marks: a status, a rise lit and a fall dim, what clings to it. */
function StatBar({ slotKey: key, mon, own, res, onInfo }) {
  if (!mon) return <div className="pn bt-bar" data-bar={key} />;
  const exact = own && mon.maxhp !== 100;
  const share = mon.fainted || !mon.maxhp ? 0 : mon.hp / mon.maxhp;
  const hp = mon.fainted ? 0 : exact ? mon.hp : Math.max(mon.hp > 0 ? 1 : 0, Math.round(share * 100));
  const boosts = Object.entries(mon.boosts || {}).filter(([, v]) => v);
  const vols = (mon.volatiles || []).filter(v => !HIDDEN_VOLATILES.has(v));
  const status = mon.status && mon.status !== "fnt" ? mon.status : "";
  const name = nameOf(res, mon.species);
  return (
    <button type="button" className={"pn bt-bar" + (mon.fainted ? " out" : "")} data-bar={key} onClick={onInfo}
      aria-label={`${own ? "" : "상대 "}${name} 정보, ${mon.fainted ? "쓰러짐" : `HP ${hp}${exact ? ` / ${mon.maxhp}` : "%"}`}`}>
      <span className="bt-bar-top swap" key={mon.name}>
        <b className="bt-bar-name">{name}</b>
        {/* every Pokémon here is level 50; a level is shown only when it is not */}
        {mon.level !== 50 && <span className="t12 dim">{`Lv${mon.level}`}</span>}
        <span className="bt-bar-num">{mon.fainted ? "쓰러짐" : exact ? `${hp}/${mon.maxhp}` : `${hp}%`}</span>
      </span>
      <Gauge share={share} />
      <span className="bt-marks">
        {status && <span className={`bt-mark type-${STATUS_TYPE[status] || "normal"}`}>{STATUS[status]}</span>}
        {boosts.map(([k, v]) => <span key={k} className={"bt-mark " + (v > 0 ? "up" : "down")}>{`${STAT[k] || k} ${multiplier(k, v)}`}</span>)}
        {vols.map(v => <span key={v} className="bt-mark">{effectWord(res, v)}</span>)}
      </span>
    </button>
  );
}
function Bars({ side, scene, own, doubles, res, onInfo }) {
  const slots = doubles ? [0, 1] : [0];
  return <div className={"stack bt-bars" + (doubles ? " two" : "")}>
    {slots.map(slot => { const key = slotKey(side, slot); return <StatBar key={slot} slotKey={key} mon={scene?.[side]?.active?.[slot]} own={own} res={res} onInfo={() => onInfo?.(key)} />; })}
  </div>;
}

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
            {alive && <div className="bs-mon" key={mon.name}>
              {mon.volatiles.includes("substitute") ? <i className="bs-sub" aria-hidden="true" /> : <img src={spriteUrl(mon.species)} alt="" draggable="false" decoding="async" />}
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

// own: our side, whose brought Pokémon (known) we know before they come out
function Strip({ side, scene, name, res, known }) {
  const s = scene?.[side];
  const knows = species => known?.some(k => toID(k).startsWith(toID(species)) || toID(species).startsWith(toID(k)));
  return (
    <div className="pn bt-strip">
      <b className="t12 bt-trainer">{name}</b>
      <span className="bt-balls" aria-label={`${name}의 파티`}>
        {(s?.roster || []).map((m, i) => <i key={i} className={"bt-ball" + (m.fainted ? " out" : !m.seen && !knows(m.species) ? " hid" : "") + (m.status ? ` st type-${STATUS_TYPE[m.status] || "normal"}` : "") + (m.out ? " on" : "")}
          title={`${nameOf(res, m.species)}${m.fainted ? ", 쓰러짐" : m.out ? ", 나와 있음" : !m.seen ? ", 아직 나오지 않음" : m.status ? `, ${STATUS[m.status]}` : ""}`}>
          <img src={spriteUrl(m.species)} alt="" draggable="false" decoding="async" /></i>)}
      </span>
      {(s?.conditions || []).length > 0 && <span className="bt-conds">
        {s.conditions.map(c => <span key={c} className="bt-cond">{`${effectWord(res, c)}${s.layers[c] > 1 ? ` ×${s.layers[c]}` : ""}`}
          {turnsLeft(c, s.since[c], scene.turn) && <span>{turnsLeft(c, s.since[c], scene.turn)}</span>}</span>)}
      </span>}
    </div>
  );
}

// the message box: the newest line lit, the one before it dim; when the game asks (리자몽은 무엇을 할까?) the question is the newest
export function Say({ said, ask }) {
  const shown = ask ? [...said.slice(-1), ask] : said;
  return <div className="pn bt-say" aria-live="polite">{shown.map((line, i) => <p key={`${line}-${i}-${shown.length}`}>{line}</p>)}</div>;
}

const WEATHER_KIND = { raindance: "rain", primordialsea: "rain", sunnyday: "sun", desolateland: "sun", sandstorm: "sand", snowscape: "snow", snow: "snow", hail: "hail", deltastream: "wind" };
const ROOMS = ["trickroom", "magicroom", "wonderroom"];

export function Stage({ scene, stageRef, perspective, doubles, res, targeting, names, said, ask, known }) {
  const foe = other(perspective);
  const [info, setInfo] = useState(null);
  const fields = scene?.fields || [];
  const terrain = fields.find(f => /terrain$/.test(f)) || "";
  const chips = [
    scene?.weather && [res.text.default[scene.weather]?.weatherName || scene.weather, turnsLeft(scene.weather, scene.weatherSince, scene.turn)],
    ...fields.map(f => [effectWord(res, f), turnsLeft(f, scene.fieldSince[f], scene.turn)]),
  ].filter(Boolean);
  return (
    <div className="bt-arena">
      <Strip side={foe} scene={scene} name={names[foe]} res={res} />
      <Bars side={foe} scene={scene} own={false} doubles={doubles} res={res} onInfo={setInfo} />
      <div className="bs-stage" ref={stageRef}>
        {/* back to front: the court, the terrain on it, what lies on each side's floor and blows behind it, the Pokémon,
            the screens over each side, the weather, and a room or gravity over everything */}
        <div className="bs-world">
          <i className="bs-sky" aria-hidden="true" />
          <Court />
          <Fading kind="bs-terrain" value={terrain} />
          {[foe, perspective].map(side => <React.Fragment key={side}>
            <Hazards cond={scene?.[side]?.conditions || []} layers={scene?.[side]?.layers || {}} own={side === perspective} />
            <Wind on={(scene?.[side]?.conditions || []).includes("tailwind")} own={side === perspective} />
          </React.Fragment>)}
          <SideField side={foe} scene={scene} own={false} doubles={doubles} res={res} targeting={targeting} />
          <SideField side={perspective} scene={scene} own doubles={doubles} res={res} targeting={targeting} />
          <Screens cond={scene?.[foe]?.conditions || []} own={false} />
          <Screens cond={scene?.[perspective]?.conditions || []} own />
          <Fading kind="bs-weather" value={WEATHER_KIND[scene?.weather] || ""} />
          {ROOMS.map(r => <Fading key={r} kind="bs-room" value={fields.includes(r) ? r : ""}>{() => <RoomBox />}</Fading>)}
          <Fading kind="bs-gravity" value={fields.includes("gravity") ? "on" : ""} />
        </div>
        {chips.length > 0 && <div className="bt-fieldchips">{chips.map(([word, left]) => <span key={word}>{word}{left && <span>{left}</span>}</span>)}</div>}
        <div className="bs-fx" aria-hidden="true" />
      </div>
      <Bars side={perspective} scene={scene} own doubles={doubles} res={res} onInfo={setInfo} />
      <Strip side={perspective} scene={scene} name={names[perspective]} res={res} known={known} />
      <Say said={said} ask={ask} />
      {info && scene && <MonInfo res={res} mon={scene[info.slice(0, 2)].active[info.charCodeAt(2) - 97]} own={info.startsWith(perspective)} onClose={() => setInfo(null)} />}
    </div>
  );
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

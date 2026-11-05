/* 배틀 무대의 소리 (DESIGN.md "Battle", Sound). 보는 사람이 켰을 때만 난다(소리 칩, 기기에 기억). 모든 소리는 브라우저가
   Web Audio로 그 자리에서 만든다: 파일도 의존성도 없고, 게임의 소리는 하나도 쓰지 않는다. 짧고, 되풀이되지 않고,
   연출 속도를 따른다(건너뛰기는 조용하다). 첫 소리는 칩을 누른 손길 안에서 AudioContext를 깨운다. */

let on = false;
let speed = 1;
let ctx = null;
let out = null;
let noise = null;

const LEVEL = .32; // the whole stage's loudness: under speech, never startling

function wake() {
  if (ctx || typeof window === "undefined") return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  out = ctx.createDynamicsCompressor();
  const master = ctx.createGain();
  master.gain.value = LEVEL;
  out.connect(master).connect(ctx.destination);
  // one second of white noise, shared by every thud, crack and whoosh
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // turned on by a remembered choice, outside a tap: the browser keeps it asleep until the first touch on the page
  if (ctx.state === "suspended") window.addEventListener("pointerdown", () => ctx.resume(), { once: true });
  return ctx;
}

export function setSound(value) {
  on = Boolean(value);
  if (on) { wake(); ctx?.resume?.(); }
}
export const soundOn = () => on;
export const setSoundSpeed = s => { speed = s; };

const live = () => on && speed !== 0 && ctx && ctx.state !== "closed";
// a time scale: 연출 빠르게 plays every sound a little shorter
const len = t => t * (speed === .5 ? .75 : 1);

// a gain that rises at once and falls away (an envelope), on a node chain ending at the stage's output
function env(peak, attack, decay, at = 0) {
  const g = ctx.createGain(), t = ctx.currentTime + at;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return { g, t, end: t + attack + decay + .05 };
}
// a tone whose pitch glides from f0 to f1
function tone(type, f0, f1, peak, decay, { attack = .005, at = 0 } = {}) {
  const e = env(peak, attack, len(decay), at);
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, e.t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), e.end);
  o.connect(e.g);
  o.start(e.t);
  o.stop(e.end);
}
// a burst of noise through a filter that may sweep (a thud, a crack, a whoosh)
function hiss(kind, f0, f1, peak, decay, { attack = .004, at = 0, q = 1 } = {}) {
  const e = env(peak, attack, len(decay), at);
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = kind;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, e.t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), e.end);
  src.connect(f).connect(e.g);
  src.start(e.t, Math.random() * .5);
  src.stop(e.end);
}

/* ---------- what the stage sounds ---------- */
// a blow lands: a thud scaled by how hard (power about .6 to 1.5)
export function hit(power = 1) {
  if (!live()) return;
  const p = Math.max(.5, Math.min(1.6, power));
  hiss("lowpass", 1400 * p, 220, .55 * p, .16 + .06 * p);
  tone("sine", 140 * p, 48, .7 * p, .18 + .05 * p);
}
// a critical hit: a sharper crack over the thud
export function crit() {
  if (!live()) return;
  hiss("bandpass", 3600, 1800, .5, .07, { q: 2 });
  tone("triangle", 1180, 880, .22, .09, { at: .01 });
}
// super effective: a rising chime; resisted: a dull one
export function strong() {
  if (!live()) return;
  tone("sine", 660, 990, .22, .12);
  tone("sine", 990, 1320, .2, .16, { at: .07 });
}
export function weak() {
  if (!live()) return;
  tone("triangle", 260, 180, .2, .16);
}
// sent in and called back: a short sweep up, and down
export function enter() {
  if (!live()) return;
  hiss("bandpass", 380, 2600, .3, .28, { attack: .03, q: 1.4 });
  tone("sine", 520, 1040, .14, .26, { attack: .02 });
}
export function leave() {
  if (!live()) return;
  hiss("bandpass", 2400, 360, .26, .24, { attack: .01, q: 1.4 });
  tone("sine", 900, 420, .12, .2);
}
// a faint: a falling tone that goes out
export function faint() {
  if (!live()) return;
  tone("sine", 440, 98, .3, .62, { attack: .02 });
  tone("triangle", 330, 74, .14, .62, { attack: .02 });
}
// Mega Evolution: a low swell as the light builds, then a bright hit as it opens
export function megaStart() {
  if (!live()) return;
  hiss("lowpass", 160, 1600, .3, 1, { attack: .7 });
  tone("sawtooth", 55, 110, .12, .9, { attack: .6 });
}
export function megaEnd() {
  if (!live()) return;
  hiss("highpass", 2400, 6000, .3, .3);
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone("sine", f, f, .14, .8, { at: i * .015 }));
}
// a turn opens: a soft tick; the clock's last ten seconds: a dry tick each second
export function turn() {
  if (!live()) return;
  tone("sine", 1250, 1200, .1, .05);
}
export function tick() {
  if (!on || !ctx) return; // the clock ticks under 건너뛰기 too: it is not an effect
  tone("square", 1000, 1000, .05, .03);
}
// a move sets off: a short whoosh, brighter for a special move
export function launch(special = false) {
  if (!live()) return;
  hiss("bandpass", special ? 900 : 500, special ? 3200 : 1600, .16, .18, { attack: .02, q: 1.2 });
}

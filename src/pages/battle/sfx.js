/* 배틀의 효과음 (DESIGN.md "Battle", Sound). 포켓몬 챔피언스의 배틀이 내는 소리의 자리마다 하나씩: 누르는 키, 공을 던지고 여는 소리,
   돌아오는 빛, 기술이 모이고 날아가고 맞는 소리(타입마다, 베기와 물기와 주먹마다), 효과가 굉장함과 별로와 급소, 빗나감, 능력이 오르고
   내리는 소리, 상태 이상마다의 소리, 회복, 쓰러짐, 방어, 특성과 도구, 대타, 날씨와 필드와 벽과 함정, 메가진화, 턴, 시계, 승패.
   게임의 소리 파일은 하나도 쓰지 않는다: 모두 브라우저가 Web Audio로 그 자리에서 만든다(파일도 의존성도 없음). 무대의 그림과 같은
   시각에 울리고(at: 무대의 ms), 연출 속도를 따르고, 건너뛰기는 조용하고, 소리 칩이 꺼지면 울음과 함께 멎는다. 왼쪽은 우리, 오른쪽은
   상대: 소리가 나는 자리를 따라 좌우로 놓이고, 경기장의 울림(짧은 잔향)이 뒤에 깔린다. */
import { audio, soundOn } from "./cries.js";

const LEVEL = .5; // the stage under the cries, never startling
let speed = 1;
export const setSfxSpeed = s => { speed = s; };
let moveType = "normal";
export const setMoveType = t => { moveType = String(t || "normal").toLowerCase(); };

let bus = null, wetIn = null, noiseBuf = null;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// a stadium's air: two seconds of noise that falls away, a little different in each ear
function room(ctx) {
  const len = Math.round(ctx.sampleRate * 1.6), buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4) * (i < 400 ? i / 400 : 1); }
  return buf;
}
// the keys and the clock are not effects: they sound under 건너뛰기 too
const ALWAYS = new Set(["select", "tick"]);
// the stage's output: every voice into one bus, a compressor, and the stadium's air behind it
function wire(ctx) {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = .002; comp.release.value = .18;
  bus = ctx.createGain(); bus.gain.value = LEVEL;
  bus.connect(comp).connect(ctx.destination);
  const verb = ctx.createConvolver(); verb.buffer = room(ctx);
  wetIn = ctx.createGain(); wetIn.connect(verb).connect(bus);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
function ready(always) {
  const ctx = audio();
  if (!ctx || ctx.state !== "running" || !soundOn() || (!speed && !always)) return null;
  if (!bus || bus.context !== ctx) wire(ctx);
  return ctx;
}
// one sound rendered off the line, for the lab and the checks: its loudest sample (0 is silence) and its samples, mixed to one channel
export async function renderSound(name, o = {}, seconds = 2.5, rate = 44100) {
  const off = new OfflineAudioContext(2, Math.round(rate * seconds), rate), kept = [bus, wetIn, noiseBuf];
  wire(off);
  try { LIB[name](off, .01, { type: "normal", sec: 0, k: 1, ...o }); } finally { [bus, wetIn, noiseBuf] = kept; }
  const out = await off.startRendering(), l = out.getChannelData(0), r = out.getChannelData(1), mono = new Float32Array(l.length);
  let peak = 0;
  for (let i = 0; i < l.length; i++) { mono[i] = (l[i] + r[i]) / 2; peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i])); }
  return { peak, mono };
}

/* ---------------------------------------------------------------- the voices ---------------------------------------------------------------- */
function outlet(ctx, pan, wet) {
  const g = ctx.createGain();
  let head = g;
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); head = p; }
  head.connect(bus);
  if (wet) { const s = ctx.createGain(); s.gain.value = wet; head.connect(s).connect(wetIn); }
  return g;
}
function envelope(p, t, peak, a, hold, d) {
  p.setValueAtTime(.0001, t);
  p.exponentialRampToValueAtTime(Math.max(.0002, peak), t + a);
  if (hold) p.setValueAtTime(Math.max(.0002, peak), t + a + hold);
  p.exponentialRampToValueAtTime(.0001, t + a + hold + d);
}
function glide(param, f, to, t, end) { param.setValueAtTime(f, t); if (to) param.exponentialRampToValueAtTime(Math.max(20, to), end); }
function lfo(ctx, rate, depth, param, t, end, type = "sine") {
  const l = ctx.createOscillator(), g = ctx.createGain();
  l.type = type; l.frequency.value = rate; g.gain.value = depth;
  l.connect(g).connect(param); l.start(t); l.stop(end + .02);
}
// a pulse in the loudness (a buzz, a rustle, a wobble)
function tremolo(ctx, node, am, t, end) {
  if (!am) return node;
  const g = ctx.createGain(); g.gain.value = 1 - am[1] / 2;
  node.connect(g); lfo(ctx, am[0], am[1] / 2, g.gain, t, end, am[2] || "sine");
  return g;
}
function filtered(ctx, node, kind, f, to, q, t, end) {
  const flt = ctx.createBiquadFilter();
  flt.type = kind; flt.Q.value = q;
  glide(flt.frequency, f, to, t, end);
  node.connect(flt);
  return flt;
}
// a pitched voice: f gliding to `to`, with vibrato, FM (a bell, a clang), a low-pass, a pulse
function tone(ctx, t0, { type = "sine", f = 440, to = null, peak = .3, a = .005, hold = 0, d = .2, pan = 0, wet = .15, vib = null, fm = null, lp = null, am = null, detune = 0, at = 0, g = 0 } = {}) {
  const t = t0 + at, end = t + a + hold + d, out = outlet(ctx, pan, wet), o = ctx.createOscillator();
  o.type = type; o.detune.value = detune;
  glide(o.frequency, f, to, t, g ? t + g : end);
  let node = o;
  if (lp) node = filtered(ctx, node, "lowpass", lp[0] ?? lp, lp[1] ?? null, lp[2] ?? .7, t, end);
  tremolo(ctx, node, am, t, end).connect(out);
  envelope(out.gain, t, peak, a, hold, d);
  if (vib) lfo(ctx, vib[0], f * vib[1], o.frequency, t, end);
  if (fm) {
    const m = ctx.createOscillator(), mg = ctx.createGain();
    glide(m.frequency, f * fm[0], to && to * fm[0], t, end);
    mg.gain.setValueAtTime(f * fm[1], t); mg.gain.exponentialRampToValueAtTime(Math.max(1, f * fm[1] * (fm[2] ?? .05)), end);
    m.connect(mg).connect(o.frequency); m.start(t); m.stop(end + .02);
  }
  o.start(t); o.stop(end + .02);
}
// a breath of noise through a filter that may sweep: a thud, a crack, a whoosh, rain, wind. g: the sweep may finish early and hold
// there, as the game's own sweeps reach their top fast and stay
function hiss(ctx, t0, { kind = "bandpass", f = 1000, to = null, q = 1, peak = .3, a = .005, hold = 0, d = .2, pan = 0, wet = .15, am = null, at = 0, g = 0 } = {}) {
  const t = t0 + at, end = t + a + hold + d, out = outlet(ctx, pan, wet), src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  tremolo(ctx, filtered(ctx, src, kind, f, to, q, t, g ? t + g : end), am, t, end).connect(out);
  envelope(out.gain, t, peak, a, hold, d);
  src.start(t, rand(0, 1.4)); src.stop(end + .02);
}
// many small ones over a stretch: crackles of fire, the clack of stones, bubbles, glints, ice
function clicks(ctx, t, { n = 6, over = .3, f = 3000, q = 1.2, peak = .25, d = [.01, .03], pan = 0, wet = .1, kind = "bandpass", at = 0 } = {}) {
  for (let i = 0; i < n; i++) hiss(ctx, t, { kind, f: f * rand(.7, 1.3), q, peak: peak * rand(.5, 1), a: .001, d: rand(d[0], d[1]), pan: pan + rand(-.1, .1), wet, at: at + rand(0, over) });
}
function blips(ctx, t, { n = 6, over = .3, lo = 600, hi = 1400, up = 1.6, peak = .14, d = .06, type = "sine", pan = 0, wet = .2, at = 0 } = {}) {
  for (let i = 0; i < n; i++) { const f = rand(lo, hi); tone(ctx, t, { type, f, to: up ? f * up : null, peak: peak * rand(.6, 1), a: .003, d: d * rand(.7, 1.3), pan: pan + rand(-.15, .15), wet, at: at + (n > 1 ? i / (n - 1) : 0) * over + rand(0, over / n) }); }
}
function notes(ctx, t, fs, { gap = .07, type = "triangle", peak = .14, d = .3, lp = null, pan = 0, wet = .35, at = 0, a = .004 } = {}) {
  fs.forEach((f, i) => tone(ctx, t, { type, f, peak, a, d, lp, pan, wet, at: at + i * gap }));
}
const thud = (ctx, t, p = 1, pan = 0, at = 0) => {
  tone(ctx, t, { f: 150 * clamp(p, .7, 1.3), to: 40, peak: .62 * p, a: .002, d: .24 + .1 * p, pan, wet: .15, at });
  hiss(ctx, t, { kind: "lowpass", f: 1800 * clamp(p, .7, 1.4), to: 160, peak: .42 * p, a: .001, d: .35 + .25 * p, pan, wet: .2, at });
};
// the pitch each type sings at: its charge, its flight, its sparkle
const PITCH = { normal: 523, fire: 392, water: 587, electric: 880, grass: 659, ice: 1175, fighting: 330, poison: 294, ground: 220, flying: 784, psychic: 698, bug: 988, rock: 262, ghost: 466, dragon: 196, dark: 247, steel: 1047, fairy: 1319 };
const pitchOf = t => PITCH[t] || 523;

/* ---------------------------------------------------------------- what each type sounds like as it lands ---------------------------------------------------------------- */
export const TYPE_HIT = {
  normal: (c, t, p, pan) => { thud(c, t, p, pan); hiss(c, t, { f: 1800, q: .8, peak: .32 * p, d: .07, pan }); },
  fire: (c, t, p, pan) => { thud(c, t, p * .8, pan); hiss(c, t, { kind: "lowpass", f: 3200, to: 380, peak: .5 * p, a: .012, d: .42, pan, wet: .25 }); clicks(c, t, { n: 9, over: .38, f: 2600, peak: .2 * p, pan, at: .03 }); },
  water: (c, t, p, pan) => { thud(c, t, p * .7, pan); hiss(c, t, { f: 1100, to: 420, q: 1.4, peak: .5 * p, a: .004, d: .32, pan, wet: .25 }); blips(c, t, { n: 7, over: .28, lo: 500, hi: 1300, up: 1.9, peak: .12 * p, pan, at: .04 }); },
  electric: (c, t, p, pan) => { thud(c, t, p * .7, pan); hiss(c, t, { kind: "highpass", f: 2600, peak: .42 * p, d: .16, pan }); tone(c, t, { type: "sawtooth", f: 120, to: 90, peak: .2 * p, d: .28, lp: 2400, am: [46, .9, "square"], pan }); clicks(c, t, { n: 8, over: .24, f: 5000, kind: "highpass", peak: .22 * p, pan }); },
  grass: (c, t, p, pan) => { thud(c, t, p * .7, pan); hiss(c, t, { kind: "highpass", f: 2400, to: 4200, peak: .32 * p, a: .01, d: .3, am: [32, .7], pan, wet: .2 }); clicks(c, t, { n: 5, over: .2, f: 1800, peak: .16 * p, pan }); },
  ice: (c, t, p, pan) => { thud(c, t, p * .6, pan); hiss(c, t, { kind: "highpass", f: 5200, peak: .36 * p, d: .14, pan }); blips(c, t, { n: 8, over: .22, lo: 2400, hi: 5400, up: 0, peak: .11 * p, d: .24, type: "triangle", pan, wet: .4 }); },
  fighting: (c, t, p, pan) => { thud(c, t, p * 1.25, pan); hiss(c, t, { kind: "lowpass", f: 2400, to: 300, peak: .62 * p, a: .001, d: .14, pan }); },
  poison: (c, t, p, pan) => { thud(c, t, p * .7, pan); hiss(c, t, { kind: "lowpass", f: 900, to: 300, peak: .34 * p, d: .3, pan, wet: .2 }); blips(c, t, { n: 9, over: .34, lo: 220, hi: 620, up: 1.5, peak: .16 * p, d: .08, pan }); },
  ground: (c, t, p, pan) => { thud(c, t, p * 1.2, pan); hiss(c, t, { kind: "lowpass", f: 480, to: 110, peak: .6 * p, a: .01, d: .62, pan, wet: .25 }); clicks(c, t, { n: 6, over: .3, f: 900, peak: .2 * p, pan, at: .08 }); },
  flying: (c, t, p, pan) => { thud(c, t, p * .7, pan); hiss(c, t, { f: 900, to: 3200, q: 1.6, peak: .38 * p, a: .02, d: .24, pan, wet: .2 }); },
  psychic: (c, t, p, pan) => { thud(c, t, p * .6, pan); tone(c, t, { f: 880, to: 620, peak: .18 * p, d: .5, vib: [9, .04], pan, wet: .5 }); tone(c, t, { f: 1320, to: 930, peak: .12 * p, d: .45, vib: [11, .04], pan, wet: .5 }); },
  bug: (c, t, p, pan) => { thud(c, t, p * .7, pan); hiss(c, t, { f: 4200, q: 4, peak: .3 * p, d: .22, am: [64, .9, "square"], pan }); },
  rock: (c, t, p, pan) => { thud(c, t, p * 1.1, pan); hiss(c, t, { kind: "lowpass", f: 1600, to: 260, peak: .5 * p, d: .2, pan }); clicks(c, t, { n: 7, over: .22, f: 1300, q: 2, peak: .3 * p, pan, at: .02 }); },
  ghost: (c, t, p, pan) => { thud(c, t, p * .55, pan); tone(c, t, { f: 520, to: 240, peak: .18 * p, a: .02, d: .6, vib: [6, .06], pan, wet: .7 }); tone(c, t, { type: "triangle", f: 524, to: 250, peak: .1 * p, a: .02, d: .6, detune: 18, pan, wet: .7 }); },
  dragon: (c, t, p, pan) => { thud(c, t, p * 1.1, pan); tone(c, t, { type: "sawtooth", f: 110, to: 62, peak: .32 * p, a: .01, d: .48, lp: [1400, 300], vib: [7, .05], pan, wet: .3 }); hiss(c, t, { kind: "lowpass", f: 1200, to: 300, peak: .34 * p, d: .32, pan }); },
  dark: (c, t, p, pan) => { thud(c, t, p, pan); tone(c, t, { type: "square", f: 210, to: 80, peak: .16 * p, d: .22, lp: 900, pan }); hiss(c, t, { kind: "lowpass", f: 1300, to: 260, peak: .3 * p, d: .14, pan }); },
  steel: (c, t, p, pan) => { thud(c, t, p * .7, pan); tone(c, t, { f: 1240, peak: .2 * p, a: .001, d: .8, fm: [1.41, 2.4, .1], pan, wet: .4 }); tone(c, t, { f: 1870, peak: .1 * p, a: .001, d: .5, pan, wet: .4 }); hiss(c, t, { kind: "highpass", f: 4500, peak: .3 * p, d: .05, pan }); },
  fairy: (c, t, p, pan) => { thud(c, t, p * .55, pan); notes(c, t, [1568, 1976, 2349, 3136], { gap: .045, peak: .12 * p, d: .42, pan, wet: .55 }); hiss(c, t, { kind: "highpass", f: 6000, peak: .14 * p, d: .3, pan, wet: .3 }); },
};
const MARK_SOUND = {
  slash: (c, t, pan) => { hiss(c, t, { f: 3200, to: 6400, q: 2.2, peak: .4, a: .006, d: .12, pan }); tone(c, t, { f: 2600, to: 3400, peak: .06, d: .14, pan, wet: .3 }); },
  claw: (c, t, pan) => [0, .05, .1].forEach(at => hiss(c, t, { f: 3600, to: 6000, q: 2, peak: .3, a: .004, d: .07, pan, at })),
  cross: (c, t, pan) => [0, .07].forEach(at => hiss(c, t, { f: 3000, to: 6200, q: 2.2, peak: .38, a: .005, d: .11, pan, at })),
  fang: (c, t, pan) => [0, .09].forEach(at => { hiss(c, t, { kind: "lowpass", f: 3000, to: 900, peak: .5, a: .001, d: .05, pan, at }); tone(c, t, { type: "square", f: 300, to: 120, peak: .1, d: .06, lp: 1200, pan, at }); }),
};

/* ---------------------------------------------------------------- the library ---------------------------------------------------------------- */
const LIB = {
  /* ---------- keys and the clock ---------- */
  select: (c, t) => { tone(c, t, { type: "square", f: 1568, peak: .08, d: .05, lp: 3200, wet: .05 }); tone(c, t, { type: "square", f: 2093, peak: .08, d: .08, lp: 3200, wet: .05, at: .045 }); },
  tick: (c, t, o) => tone(c, t, { type: "square", f: o.n <= 3 ? 1480 : 1040, peak: o.n <= 3 ? .24 : .16, d: .045, lp: 3000, wet: 0 }),
  turn: (c, t) => { tone(c, t, { f: 1175, peak: .09, d: .12, wet: .3 }); tone(c, t, { f: 1760, peak: .08, d: .2, wet: .3, at: .06 }); },

  /* ---------- the big moments ---------- */
  lamps: (c, t) => {
    [0, .26, .52].forEach((at, i) => { tone(c, t, { f: 96 - i * 6, to: 46, peak: .5, a: .002, d: .22, wet: .45, at }); hiss(c, t, { kind: "lowpass", f: 900, to: 200, peak: .3, a: .001, d: .1, wet: .4, at }); hiss(c, t, { kind: "highpass", f: 5000, peak: .05, a: .001, d: .05, at: at + .01 }); });
    tone(c, t, { type: "sawtooth", f: 60, peak: .07, a: .5, hold: .3, d: .7, lp: 260, wet: .4 });
  },
  throw: (c, t, o) => { const s = o.sec || .72; hiss(c, t, { f: 500, to: 2200, q: 1.2, peak: .26, a: s * .55, d: s * .45, pan: o.pan, am: [16, .6] }); tone(c, t, { f: 520, to: 980, peak: .05, a: s * .5, d: s * .5, am: [16, .9], pan: o.pan, wet: .2 }); },
  // measured from the game (ranked footage, a send-out): one bright noise sweep from the middle to the top in about a tenth of a
  // second, held a third of a second, fading; no pop, no sparkles
  ballOpen: (c, t, o) => {
    hiss(c, t, { f: 2000, to: 9500, q: 2.2, peak: .55, a: .1, hold: .26, d: .14, g: .12, pan: o.pan, wet: .35 });
    hiss(c, t, { kind: "highpass", f: 4000, to: 8000, peak: .26, a: .1, hold: .24, d: .16, g: .12, pan: o.pan, wet: .45 });
    hiss(c, t, { kind: "lowpass", f: 700, peak: .28, a: .02, d: .4, pan: o.pan, wet: .2 });
  },
  // measured (a withdraw): high noise sliding down for most of a second, then a short sweep back up as the light flies home
  recall: (c, t, o) => {
    const k = o.k || 1;
    hiss(c, t, { f: 10500, to: 5500, q: 4.5, peak: .6, a: .06, hold: 1, d: .2, g: 1.15, pan: o.pan, wet: .35 });
    hiss(c, t, { kind: "highpass", f: 9000, to: 6000, peak: .08, a: .06, hold: .9, d: .3, g: 1.15, pan: o.pan, wet: .4 });
    hiss(c, t, { f: 5500, to: 10500, q: 4, peak: .42, a: .16, d: .1, pan: o.pan, wet: .4, at: 1.1 * k });
    hiss(c, t, { kind: "lowpass", f: 600, peak: .18, a: .1, hold: .6, d: .4, pan: o.pan, wet: .2 });
  },
  drag: (c, t, o) => { hiss(c, t, { f: 600, to: 2400, q: 1.1, peak: .4, a: .08, d: .3, pan: o.pan, wet: .3 }); hiss(c, t, { kind: "lowpass", f: 500, peak: .2, a: .05, d: .4, pan: o.pan }); },
  // measured (three faints, all alike): a band of bright noise falls from the top to about 3.5 kHz in 0.6 s and sweeps back up by 1.1 s
  faint: (c, t, o) => {
    const k = o.k || 1;
    hiss(c, t, { f: 10500, to: 3500, q: 4, peak: .6, a: .05, hold: .45, d: .15, g: .6 * k, pan: o.pan, wet: .4 });
    hiss(c, t, { f: 3500, to: 10500, q: 4, peak: .5, a: .42 * k, d: .12, g: .45 * k, pan: o.pan, wet: .4, at: .55 * k });
    hiss(c, t, { kind: "highpass", f: 7000, to: 3000, peak: .1, a: .05, hold: .4, d: .3, g: .6 * k, pan: o.pan, wet: .4 });
    hiss(c, t, { kind: "lowpass", f: 600, peak: .2, a: .08, hold: .4, d: .5, pan: o.pan, wet: .2 });
  },
  megaStart: (c, t, o) => {
    hiss(c, t, { f: 240, to: 3600, q: 1.4, peak: .3, a: .62, d: .2, pan: o.pan, wet: .4 });
    tone(c, t, { f: 300, to: 1200, peak: .08, a: .6, d: .2, vib: [7, .02], pan: o.pan, wet: .5 });
    hiss(c, t, { kind: "highpass", f: 4000, peak: .28, a: .002, d: .5, wet: .5, at: .6 });
    tone(c, t, { f: 2637, peak: .14, a: .002, d: .7, wet: .6, at: .6 });
    [220, 277.2, 329.6, 440].forEach((f, i) => tone(c, t, { type: i % 2 ? "triangle" : "sine", f, to: f * 1.5, peak: .07, a: .9, hold: .3, d: .25, vib: [5 + i, .012], wet: .6, at: .7 }));
    blips(c, t, { n: 16, over: .9, lo: 1500, hi: 4200, up: 0, peak: .05, d: .2, type: "triangle", wet: .6, at: .7 });
  },
  megaEnd: (c, t) => {
    tone(c, t, { f: 90, to: 28, peak: .9, a: .002, d: .9, wet: .4 });
    hiss(c, t, { kind: "lowpass", f: 7000, to: 400, peak: .7, a: .002, d: 1.2, wet: .5 });
    [523.3, 659.3, 784, 1046.5, 1318.5].forEach((f, i) => tone(c, t, { type: "triangle", f, peak: .09, a: .01, d: 1.5, wet: .6, at: i * .012 }));
    blips(c, t, { n: 12, over: .6, lo: 2000, hi: 5200, up: 0, peak: .07, d: .3, type: "triangle", wet: .6, at: .05 });
  },
  win: (c, t) => { notes(c, t, [784, 988, 1175], { gap: .11, type: "square", lp: 2600, peak: .09, d: .16 }); tone(c, t, { type: "square", f: 1568, peak: .1, a: .005, hold: .25, d: .6, lp: 2600, vib: [6, .008], wet: .45, at: .33 }); tone(c, t, { type: "triangle", f: 784, peak: .08, a: .005, hold: .25, d: .6, wet: .45, at: .33 }); },
  lose: (c, t) => notes(c, t, [659, 523, 392], { gap: .2, type: "triangle", peak: .1, d: .5, wet: .45 }),
  draw: (c, t) => notes(c, t, [659, 659], { gap: .22, type: "triangle", peak: .1, d: .45, wet: .45 }),

  /* ---------- a move ---------- */
  // light gathering at the user: air drawn in and the type's note rising into it
  charge: (c, t, o) => { const s = o.sec || .42, f = pitchOf(o.type); hiss(c, t, { f: 300, to: 2600, q: 1.3, peak: .2, a: s * .85, d: .08, pan: o.pan, wet: .3 }); tone(c, t, { f: f / 2, to: f, peak: .07, a: s * .8, d: .12, vib: [12, .015], pan: o.pan, wet: .4 }); },
  aura: (c, t, o) => {
    const s = o.sec || .6, f = pitchOf(o.type);
    if (o.type === "fire") hiss(c, t, { kind: "lowpass", f: 600, to: 2800, peak: .32, a: s * .4, d: s * .6, pan: o.pan, wet: .3 });
    else if (o.type === "electric") tone(c, t, { type: "sawtooth", f: 110, peak: .12, a: .05, hold: s * .5, d: s * .4, lp: 2000, am: [38, .9, "square"], pan: o.pan });
    else hiss(c, t, { f: 500, to: 3000, q: 1.2, peak: .2, a: s * .5, d: s * .5, pan: o.pan, wet: .35 });
    tone(c, t, { f, to: f * 1.5, peak: .07, a: s * .4, d: s * .6, vib: [8, .02], pan: o.pan, wet: .5 });
  },
  // the user dashes at its target: the air tears past as it strikes
  dash: (c, t, o) => { const s = o.sec || .27; hiss(c, t, { f: 420, to: 2000, q: 1, peak: .3, a: s, d: .12, pan: o.pan }); },
  miss: (c, t, o) => { hiss(c, t, { f: 2600, to: 700, q: 1.6, peak: .3, a: .01, d: .22, pan: o.pan }); },
  fail: (c, t, o) => { tone(c, t, { type: "square", f: 300, to: 240, peak: .1, d: .1, lp: 900, pan: o.pan }); tone(c, t, { type: "square", f: 220, to: 170, peak: .1, d: .14, lp: 900, pan: o.pan, at: .12 }); },
  // what the move sends: a thing in flight, a stream, a beam, a bolt, a slash, a falling stone, a swarm of motes
  shot: (c, t, o) => { const s = clamp(o.sec || .36, .12, 1.2), f = pitchOf(o.type); hiss(c, t, { f: 700, to: 2400, q: 1.1, peak: .22, a: s * .7, d: s * .3, pan: o.pan }); hiss(c, t, { kind: "lowpass", f: 1000, peak: .2, a: s * .7, d: s * .4, pan: o.pan }); tone(c, t, { type: "triangle", f: f * 1.5, to: f, peak: .07, a: .01, d: s, vib: [14, .02], pan: o.pan, wet: .3 }); },
  stream: (c, t, o) => {
    const s = clamp(o.sec || .6, .2, 2), ty = o.type;
    // measured (Aqua Jet): water rushes as bright grainy noise round 5 to 6 kHz for as long as it runs; fire and the rest keep that brightness
    if (ty === "fire") { hiss(c, t, { kind: "lowpass", f: 1400, peak: .5, a: .08, hold: s, d: .4, am: [9, .3], pan: o.pan, wet: .3 }); hiss(c, t, { f: 2800, q: .5, peak: .12, a: .08, hold: s, d: .35, pan: o.pan, wet: .3 }); hiss(c, t, { kind: "lowpass", f: 260, peak: .65, a: .1, hold: s, d: .5, pan: o.pan }); clicks(c, t, { n: Math.round(s * 30), over: s, f: 3500, peak: .14, pan: o.pan }); }
    else if (ty === "water") { hiss(c, t, { f: 6500, q: .7, peak: .42, a: .12, hold: s, d: .35, am: [5.3, .25], pan: o.pan, wet: .35 }); hiss(c, t, { kind: "lowpass", f: 700, peak: .5, a: .08, hold: s, d: .45, pan: o.pan }); clicks(c, t, { n: Math.round(s * 40), over: s, f: 7000, q: .9, peak: .16, pan: o.pan, d: [.015, .05] }); }
    else if (ty === "ice") { hiss(c, t, { kind: "highpass", f: 4000, peak: .26, a: .04, hold: s, d: .25, pan: o.pan, wet: .4 }); blips(c, t, { n: Math.round(s * 16), over: s, lo: 2600, hi: 5200, up: 0, peak: .06, d: .2, type: "triangle", pan: o.pan, wet: .4 }); }
    else { const f = pitchOf(ty); hiss(c, t, { f: Math.max(3000, f * 5), q: .6, peak: .3, a: .05, hold: s, d: .25, am: [18, .35], pan: o.pan, wet: .3 }); hiss(c, t, { kind: "lowpass", f: 800, peak: .26, a: .06, hold: s, d: .35, pan: o.pan }); tone(c, t, { type: "sawtooth", f: f / 2, peak: .05, a: .05, hold: s, d: .2, lp: f * 3, pan: o.pan }); }
  },
  beam: (c, t, o) => {
    const s = clamp(o.sec || .7, .2, 2), f = pitchOf(o.type);
    hiss(c, t, { kind: "lowpass", f: 4000, peak: .42, a: .05, hold: s * .8, d: s * .4, am: [24, .2], pan: o.pan, wet: .35 });
    hiss(c, t, { kind: "lowpass", f: 280, peak: .34, a: .06, hold: s * .8, d: s * .4, pan: o.pan, wet: .2 });
    hiss(c, t, { f: f * 3, q: 1.2, peak: .2, a: .03, hold: s * .7, d: s * .3, pan: o.pan, wet: .3 });
    tone(c, t, { type: "sawtooth", f: f / 2, peak: .06, a: .04, hold: s * .7, d: s * .3, lp: [f * 4, f * 1.5], vib: [32, .02], pan: o.pan, wet: .35 });
  },
  zap: (c, t, o) => {
    const s = clamp(o.sec || .38, .1, 1);
    hiss(c, t, { kind: "highpass", f: 1800, peak: .44, a: .001, d: .09, pan: o.pan });
    clicks(c, t, { n: 7, over: s * .6, f: 4500, kind: "highpass", peak: .24, pan: o.pan });
    tone(c, t, { type: "sawtooth", f: 70, peak: .14, a: .002, hold: s * .4, d: .1, lp: 3000, am: [55, .9, "square"], pan: o.pan });
    if (o.big) hiss(c, t, { kind: "lowpass", f: 320, to: 60, peak: .55, a: .02, d: 1.1, pan: o.pan, wet: .6, at: .04 });
  },
  slash: (c, t, o) => MARK_SOUND.slash(c, t, o.pan),
  swoosh: (c, t, o) => { const s = clamp(o.sec || .5, .15, 1.2); hiss(c, t, { f: 600, to: 2600, q: 1.3, peak: .24, a: s * .5, d: s * .5, pan: o.pan, wet: .2 }); },
  fall: (c, t, o) => { const s = o.sec || .42; tone(c, t, { f: 1800, to: 500, peak: .05, a: .02, d: s, pan: o.pan, wet: .3 }); hiss(c, t, { f: 900, to: 2400, q: 1.4, peak: .14, a: s * .9, d: .05, pan: o.pan }); },
  motes: (c, t, o) => {
    const s = clamp(o.sec || .6, .2, 1.6), f = pitchOf(o.type);
    blips(c, t, { n: Math.round(6 + s * 10), over: s, lo: f * 1.5, hi: f * 3, up: o.type === "grass" ? 1.3 : 0, peak: .05, d: .16, type: "triangle", pan: o.pan, wet: .5 });
    hiss(c, t, { kind: "highpass", f: 3000, to: 6000, peak: .08, a: s * .6, d: s * .4, pan: o.pan, wet: .4 });
  },
  // measured (Earthquake): the low shake goes on under rubble that crackles high for two and a half seconds
  quake: (c, t, o) => {
    tone(c, t, { f: 55, to: 32, peak: .7, a: .03, hold: 1, d: 1, am: [9, .5], wet: .5 });
    hiss(c, t, { kind: "lowpass", f: 260, to: 90, peak: .8, a: .03, hold: 1, d: 1, wet: .5 });
    hiss(c, t, { f: 4500, q: .6, peak: .1, a: .1, hold: 1.4, d: .8, am: [7, .6], pan: o.pan, wet: .4 });
    clicks(c, t, { n: 90, over: 2.5, f: 5000, q: 1, peak: .26, pan: o.pan, at: .05, d: [.01, .04] });
  },
  sound: (c, t, o) => { const f = pitchOf(o.type); [0, .12, .24].forEach((at, i) => { tone(c, t, { type: "sawtooth", f: f * (1 - i * .05), to: f * .7, peak: .1, a: .01, d: .22, lp: f * 5, pan: o.pan, wet: .5, at }); hiss(c, t, { f: 1400, to: 500, q: 1, peak: .16, a: .01, d: .2, pan: o.pan, at }); }); },
  boom: (c, t, o) => { const p = o.p || 1; tone(c, t, { f: 80, to: 28, peak: .85 * p, a: .003, d: 1.4, pan: o.pan, wet: .5 }); hiss(c, t, { kind: "lowpass", f: 4000, to: 200, peak: .5 * p, a: .002, hold: .8, d: 2.4, pan: o.pan, wet: .5 }); hiss(c, t, { kind: "lowpass", f: 300, peak: .75 * p, a: .05, hold: 1.6, d: 2, am: [6, .4], pan: o.pan, wet: .4 }); clicks(c, t, { n: 30, over: 2, f: 1800, q: .8, peak: .2, pan: o.pan, at: .1, d: [.02, .06] }); },

  /* ---------- what comes of it ---------- */
  // the type's matter at the moment of the blow, and a blade's or a fang's mark; a status move lands as the type's glint
  impact: (c, t, o) => {
    const ty = TYPE_HIT[o.type] ? o.type : "normal", p = clamp(o.p || 1, .4, 1.8);
    if (o.soft) { const f = pitchOf(ty); tone(c, t, { type: "triangle", f: f * 2, peak: .1, a: .003, d: .3, pan: o.pan, wet: .5 }); tone(c, t, { f: f * 3, peak: .06, a: .003, d: .3, pan: o.pan, wet: .5, at: .05 }); return; }
    TYPE_HIT[ty](c, t, p, o.pan || 0);
    // the blow's air: full range, falling to a dull tail over most of a second
    hiss(c, t, { kind: "lowpass", f: 7000, to: 600, peak: .3 * p, a: .004, d: .8 + .5 * p, pan: o.pan || 0, wet: .35 });
    MARK_SOUND[o.mark]?.(c, t, o.pan || 0);
  },
  // the damage itself, as the games voice it: a plain blow, a heavier double crunch when it is super effective, a muffled one
  // when it is not very effective, a sharp crack over it on a critical hit; HP lost to the field or a status is a dull knock
  damage: (c, t, o) => { const p = clamp(.7 + (o.share || .2), .7, 1.4); hiss(c, t, { f: 1600, q: .6, peak: .45 * p, a: .001, d: .14, pan: o.pan }); tone(c, t, { f: 190, to: 60, peak: .22 * p, a: .001, d: .16, pan: o.pan }); hiss(c, t, { f: 2200, to: 1200, q: .45, peak: .3 * p, a: .002, d: .6, pan: o.pan, wet: .3 }); },
  super: (c, t, o) => {
    hiss(c, t, { f: 2000, to: 1200, q: .4, peak: .8, a: .001, hold: .55, d: .9, pan: o.pan, wet: .35 });
    hiss(c, t, { kind: "highpass", f: 4000, peak: .2, a: .001, hold: .5, d: .8, pan: o.pan, wet: .35 });
    tone(c, t, { f: 120, to: 34, peak: .3, a: .001, d: .45, pan: o.pan, wet: .2 });
    hiss(c, t, { f: 1800, q: .8, peak: .3, a: .001, d: .14, pan: o.pan, at: .06 });
    clicks(c, t, { n: 12, over: 1.1, f: 2600, q: .8, peak: .2, pan: o.pan, at: .15, d: [.02, .06] });
  },
  resist: (c, t, o) => { hiss(c, t, { kind: "lowpass", f: 900, to: 250, peak: .34, a: .002, d: .35, pan: o.pan, wet: .2 }); tone(c, t, { f: 140, to: 70, peak: .28, a: .002, d: .2, pan: o.pan }); },
  crit: (c, t, o) => { hiss(c, t, { kind: "highpass", f: 2600, peak: .6, a: .001, d: .07, pan: o.pan }); tone(c, t, { type: "triangle", f: 1700, to: 900, peak: .18, a: .001, d: .14, pan: o.pan, wet: .3 }); tone(c, t, { f: 2400, peak: .08, a: .001, d: .4, fm: [1.5, 1.5], pan: o.pan, wet: .45, at: .03 }); hiss(c, t, { kind: "lowpass", f: 8000, to: 600, peak: .3, a: .001, d: .6, pan: o.pan, wet: .3 }); },
  knock: (c, t, o) => { hiss(c, t, { kind: "lowpass", f: 900, to: 260, peak: .3, a: .002, d: .1, pan: o.pan }); tone(c, t, { f: 160, to: 80, peak: .26, a: .002, d: .12, pan: o.pan }); },
  flinch: (c, t, o) => { hiss(c, t, { f: 1500, q: 1, peak: .22, a: .002, d: .06, pan: o.pan }); tone(c, t, { type: "square", f: 330, to: 220, peak: .07, d: .08, lp: 1200, pan: o.pan }); },

  /* ---------- the Pokémon's state ---------- */
  // measured (Intimidate): a falling burst of grainy noise about a third of a second long round 4 to 5 kHz; a rise mirrors it
  statUp: (c, t, o) => { const n = clamp(o.n || 1, 1, 3), s = .22 + n * .06; for (let i = 0; i < n; i++) hiss(c, t, { f: 2500, to: 10000, q: 3, peak: .42, a: s * .7, d: s * .5, pan: o.pan, wet: .4, at: i * s * .8 }); },
  statDown: (c, t, o) => { const n = clamp(o.n || 1, 1, 3), s = .22 + n * .06; for (let i = 0; i < n; i++) hiss(c, t, { f: 10000, to: 2500, q: 3, peak: .42, a: .01, hold: s * .3, d: s * .8, g: s, pan: o.pan, wet: .4, at: i * s * .8 }); },
  st_brn: (c, t, o) => { const n = o.n || 1; hiss(c, t, { kind: "lowpass", f: 500, to: 3000, peak: .36 * n, a: .08, d: .45, pan: o.pan, wet: .3 }); clicks(c, t, { n: Math.round(12 * n), over: .55, f: 2600, peak: .16, pan: o.pan }); },
  st_par: (c, t, o) => { const n = o.n || 1; tone(c, t, { type: "square", f: 160, peak: .1 * n, a: .005, hold: .3, d: .14, lp: 2600, am: [19, 1, "square"], pan: o.pan }); clicks(c, t, { n: Math.round(12 * n), over: .45, f: 5200, kind: "highpass", peak: .22, pan: o.pan }); },
  st_psn: (c, t, o) => { const n = o.n || 1; blips(c, t, { n: Math.round(10 * n), over: .6, lo: 200, hi: 520, up: 1.6, peak: .16, d: .09, pan: o.pan }); tone(c, t, { f: 210, to: 140, peak: .08 * n, a: .05, d: .5, vib: [12, .15], pan: o.pan, wet: .3 }); },
  st_slp: (c, t, o) => notes(c, t, [784, 659, 523], { gap: .28, type: "sine", peak: .1, d: .5, pan: o.pan, wet: .6, a: .04 }),
  st_frz: (c, t, o) => { hiss(c, t, { kind: "highpass", f: 5500, peak: .22, a: .15, d: .4, pan: o.pan, wet: .4 }); clicks(c, t, { n: 14, over: .5, f: 6000, kind: "highpass", peak: .2, pan: o.pan }); blips(c, t, { n: 6, over: .5, lo: 2600, hi: 4800, up: 0, peak: .1, d: .4, type: "triangle", pan: o.pan, wet: .5, at: .25 }); },
  confused: (c, t, o) => [0, .22, .44, .66].forEach((at, i) => tone(c, t, { f: i % 2 ? 1700 : 2100, to: i % 2 ? 2300 : 2700, peak: .07, a: .01, d: .14, pan: o.pan, wet: .4, at })),
  cure: (c, t, o) => notes(c, t, [1047, 1568], { gap: .08, peak: .1, d: .35, pan: o.pan, wet: .5 }),
  heal: (c, t, o) => { notes(c, t, [1047, 1319, 1568, 2093, 2637, 3136], { gap: .08, peak: .07, d: 1, pan: o.pan, wet: .6 }); hiss(c, t, { kind: "highpass", f: 3500, to: 8000, peak: .2, a: .5, hold: .5, d: .8, pan: o.pan, wet: .5 }); blips(c, t, { n: 18, over: 1.5, lo: 3500, hi: 8000, up: 0, peak: .05, d: .3, type: "triangle", pan: o.pan, wet: .6, at: .2 }); },
  protect: (c, t, o) => { hiss(c, t, { kind: "highpass", f: 2000, to: 6500, peak: .22, a: .02, d: .3, pan: o.pan, wet: .4 }); tone(c, t, { type: "triangle", f: 1397, peak: .1, a: .01, d: .8, fm: [2, .4], pan: o.pan, wet: .55 }); tone(c, t, { type: "triangle", f: 1405, peak: .08, a: .01, d: .8, pan: o.pan, wet: .55 }); tone(c, t, { f: 2794, peak: .05, a: .01, d: .6, pan: o.pan, wet: .55, at: .2 }); if (o.spiky) clicks(c, t, { n: 8, over: .2, f: 4200, q: 3, peak: .16, pan: o.pan, at: .1 }); },
  ability: (c, t, o) => { hiss(c, t, { f: 900, to: 3000, q: 1.2, peak: .16, a: .06, d: .1, pan: o.pan }); notes(c, t, [1175, 1568], { gap: .07, type: "square", lp: 3000, peak: .07, d: .2, pan: o.pan, wet: .3, at: .08 }); },
  item: (c, t, o) => { hiss(c, t, { f: 900, to: 3000, q: 1.2, peak: .16, a: .06, d: .1, pan: o.pan }); notes(c, t, [988, 1319, 1661], { gap: .05, type: "triangle", peak: .08, d: .25, pan: o.pan, wet: .4, at: .08 }); },
  puff: (c, t, o) => hiss(c, t, { kind: "lowpass", f: 1500, to: 400, peak: .3, a: .01, d: .3, pan: o.pan, wet: .3, at: o.at2 || 0 }),
  boing: (c, t, o) => { tone(c, t, { f: 240, to: 520, peak: .14, a: .005, d: .28, vib: [16, .12], pan: o.pan, wet: .3 }); thud(c, t, .6, o.pan); },
  pop: (c, t, o) => { hiss(c, t, { f: 1800, q: 1, peak: .5, a: .001, d: .05, pan: o.pan }); tone(c, t, { f: 700, to: 200, peak: .2, a: .001, d: .1, pan: o.pan }); hiss(c, t, { kind: "lowpass", f: 1200, to: 300, peak: .26, a: .01, d: .4, pan: o.pan, wet: .3, at: .03 }); },
  morph: (c, t, o) => { tone(c, t, { f: 300, to: 1400, peak: .1, a: .3, d: .3, vib: [22, .1], pan: o.pan, wet: .5 }); blips(c, t, { n: 8, over: .3, lo: 1500, hi: 3500, up: 0, peak: .06, d: .2, type: "triangle", pan: o.pan, wet: .5, at: .3 }); },
  glass: (c, t, o) => { hiss(c, t, { kind: "highpass", f: 3800, peak: .44, a: .001, d: .3, pan: o.pan, wet: .4 }); blips(c, t, { n: 16, over: .25, lo: 2800, hi: 7200, up: 0, peak: .1, d: .2, type: "triangle", pan: o.pan, wet: .4 }); thud(c, t, .5, o.pan); },

  /* ---------- the field ---------- */
  rain: (c, t) => { hiss(c, t, { f: 5000, q: .5, peak: .24, a: .3, hold: .7, d: .7, wet: .3 }); clicks(c, t, { n: 40, over: 1.4, f: 6000, kind: "highpass", peak: .06, wet: .1 }); hiss(c, t, { kind: "highpass", f: 1500, peak: .45, a: .001, d: .1, wet: .5, at: .32 }); hiss(c, t, { kind: "lowpass", f: 300, to: 55, peak: .6, a: .03, d: 1.3, wet: .6, at: .34 }); },
  sun: (c, t) => { [392, 587.3, 784, 1174.7].forEach((f, i) => tone(c, t, { f, peak: .07, a: .2 + i * .04, d: 1.1, wet: .6, at: i * .03 })); hiss(c, t, { kind: "highpass", f: 2000, to: 7000, peak: .18, a: .3, d: .6, wet: .5 }); },
  sand: (c, t) => { hiss(c, t, { f: 400, to: 1100, q: 2, peak: .36, a: .3, hold: .5, d: .6, am: [3, .4], wet: .4 }); clicks(c, t, { n: 50, over: 1.2, f: 3000, peak: .05, wet: .1 }); },
  snow: (c, t) => { hiss(c, t, { f: 800, to: 1800, q: 2.4, peak: .26, a: .3, hold: .5, d: .6, am: [2.4, .5], wet: .5 }); blips(c, t, { n: 9, over: 1, lo: 2200, hi: 4400, up: 0, peak: .06, d: .45, type: "triangle", wet: .6 }); },
  terrain: (c, t, o) => { const f = pitchOf(o.type); hiss(c, t, { f: 300, to: 3000, q: 1, peak: .2, a: .5, d: .5, wet: .4 }); notes(c, t, [f, f * 1.25, f * 1.5, f * 2], { gap: .09, peak: .07, d: .6, wet: .6, at: .2 }); if (o.type === "electric") clicks(c, t, { n: 14, over: .8, f: 5000, kind: "highpass", peak: .14 }); },
  room: (c, t) => { tone(c, t, { f: 440, to: 220, peak: .1, a: .2, d: .7, wet: .6 }); tone(c, t, { f: 446, to: 660, peak: .1, a: .2, d: .7, wet: .6 }); hiss(c, t, { f: 3000, to: 400, q: 2, peak: .16, a: .3, d: .6, wet: .5 }); },
  screen: (c, t, o) => { const f = o.f || 1175; [1, 2.01, 3.02].forEach((m, i) => tone(c, t, { type: "triangle", f: f * m, peak: .1 / (i + 1), a: .05, hold: .8, d: 2.6, fm: [1.5, .2], vib: [5, .004], pan: o.pan, wet: .6 })); tone(c, t, { f: f / 4, peak: .06, a: .2, hold: .8, d: 1.8, pan: o.pan, wet: .4 }); hiss(c, t, { kind: "highpass", f: 3000, to: 7000, peak: .24, a: .3, hold: 1, d: 1.5, pan: o.pan, wet: .5 }); hiss(c, t, { f: 2000, to: 9000, q: 3, peak: .2, a: .25, d: .25, pan: o.pan, wet: .5, at: .9 }); },
  rocks: (c, t, o) => clicks(c, t, { n: 10, over: .4, f: 1300, q: 2.2, peak: .34, pan: o.pan, d: [.02, .05] }),
  spikes: (c, t, o) => blips(c, t, { n: 6, over: .4, lo: 2400, hi: 3600, up: 0, peak: .1, d: .18, type: "triangle", pan: o.pan, wet: .3 }),
  web: (c, t, o) => tone(c, t, { type: "triangle", f: 330, to: 160, peak: .12, a: .01, d: .4, vib: [24, .06], pan: o.pan, wet: .3 }),
  wind: (c, t, o) => hiss(c, t, { f: 500, to: 1800, q: 1.6, peak: .3, a: .2, hold: .3, d: .5, am: [4, .4], pan: o.pan, wet: .4 }),
  fieldOff: (c, t) => hiss(c, t, { f: 2600, to: 400, q: 1, peak: .1, a: .05, d: .5, wet: .4 }),
  // a status move's own gesture (moveFx verbs whose drawing makes no sound of its own)
  shine: (c, t, o) => { const f = pitchOf(o.type); tone(c, t, { type: "triangle", f: f * 2, peak: .1, a: .01, d: .5, pan: o.pan, wet: .5 }); hiss(c, t, { kind: "highpass", f: 3000, to: 7000, peak: .1, a: .1, d: .3, pan: o.pan, wet: .4 }); },
  blades: (c, t, o) => [0, .2, .4].forEach(at => { hiss(c, t, { f: 3400, to: 6000, q: 2.4, peak: .3, a: .01, d: .14, pan: o.pan, at }); tone(c, t, { f: 2200, peak: .07, a: .001, d: .4, fm: [1.41, 1.2], pan: o.pan, wet: .4, at: at + .05 }); }),
  metal: (c, t, o) => tone(c, t, { f: 880, peak: .14, a: .001, d: .7, fm: [1.41, 2, .1], pan: o.pan, wet: .4 }),
  drum: (c, t, o) => [0, .16, .32, .48].forEach(at => thud(c, t, .8, o.pan, at)),
  gears: (c, t, o) => clicks(c, t, { n: 12, over: .6, f: 2000, q: 4, peak: .2, pan: o.pan, d: [.008, .02] }),
  crack: (c, t, o) => { hiss(c, t, { kind: "highpass", f: 2000, peak: .4, a: .001, d: .08, pan: o.pan }); clicks(c, t, { n: 6, over: .15, f: 2600, peak: .2, pan: o.pan }); },
  sweet: (c, t, o) => notes(c, t, [1568, 1319, 1760], { gap: .1, type: "sine", peak: .08, d: .3, pan: o.pan, wet: .5 }),
  sob: (c, t, o) => [0, .25].forEach(at => tone(c, t, { f: 900, to: 600, peak: .07, a: .03, d: .25, vib: [8, .03], pan: o.pan, wet: .4, at })),
  growl: (c, t, o) => tone(c, t, { type: "sawtooth", f: 90, to: 70, peak: .14, a: .05, hold: .25, d: .25, lp: 700, vib: [14, .08], pan: o.pan, wet: .3 }),
  stare: (c, t, o) => { tone(c, t, { f: 150, peak: .12, a: .2, d: .5, pan: o.pan, wet: .5 }); tone(c, t, { f: 3200, peak: .05, a: .001, d: .3, pan: o.pan, wet: .5, at: .1 }); },
  eerie: (c, t, o) => { tone(c, t, { f: 330, to: 220, peak: .1, a: .2, d: .8, vib: [5, .05], pan: o.pan, wet: .7 }); tone(c, t, { type: "triangle", f: 493, to: 330, peak: .06, a: .2, d: .8, vib: [5.5, .05], pan: o.pan, wet: .7 }); },
  song: (c, t, o) => notes(c, t, [784, 988, 1175, 988, 784], { gap: .16, type: "sine", peak: .09, d: .35, pan: o.pan, wet: .6, a: .02 }),
  chain: (c, t, o) => clicks(c, t, { n: 8, over: .35, f: 3200, q: 5, peak: .22, pan: o.pan, d: [.02, .05] }),
  clap: (c, t, o) => [0, .14].forEach(at => hiss(c, t, { f: 1300, q: 1.4, peak: .45, a: .001, d: .06, pan: o.pan, wet: .3, at })),
  squeeze: (c, t, o) => tone(c, t, { type: "triangle", f: 200, to: 120, peak: .14, a: .1, d: .4, vib: [9, .08], pan: o.pan, wet: .3 }),
  mist: (c, t, o) => hiss(c, t, { kind: "lowpass", f: 600, to: 2000, peak: .22, a: .3, d: .6, pan: o.pan, wet: .5 }),
  wish: (c, t, o) => { tone(c, t, { f: 2093, to: 1046, peak: .07, a: .02, d: .7, pan: o.pan, wet: .6 }); blips(c, t, { n: 8, over: .6, lo: 2000, hi: 4000, up: 0, peak: .05, d: .3, type: "triangle", pan: o.pan, wet: .6 }); },
};

/* the verbs of moveFx.js whose drawing makes no sound of its own, and the gestures whose drawing sounds only as light: each is given
   its gesture's sound as the phase begins. A weather, a terrain, a room, a screen and a hazard sound when the line that sets them
   is played (Stage.jsx), and Protect when its guard goes up (stageFx.shield). tests/battleSfx.test.mjs keeps every verb covered. */
const VERB = {
  possess: "eerie", drain: "motes", crack: "quake", guard: "protect", spotlight: "shine", sub: "puff", powder: "mist", hypnosis: "eerie",
  tears: "sob", anger: "growl", glare: "stare", cloud: "mist", curse: "eerie", gust: "wind", clear: "mist", hex: "eerie", lock: "chain",
  feathers: "swoosh", harden: "metal", focus: "shine", speed: "swoosh", sigil: "shine", charm: "sweet", flex: "growl", gears: "gears",
  shell: "crack", blades: "blades", drum: "drum", notes: "song", link: "eerie", chain: "chain", wish: "wish", endure: "growl", clap: "clap",
  squeeze: "squeeze", trap: "squeeze", web: "web",
};
// verbs that sound through the event they set or the drawing they make, named so the test can tell them from a forgotten one
export const EVENT_VERBS = ["protect", "weather", "terrain", "screen", "room", "hazard"];
export const VERB_SOUNDS = VERB;
export const LIBRARY = LIB;

/* ---------------------------------------------------------------- playing ---------------------------------------------------------------- */
const last = new Map();
/* name: a sound of the library; o.at: the stage's ms from now (played at the playback speed), o.dur: how long it lasts on the stage,
   o.pan: -1 left (ours) to 1 right (theirs), o.type: the move's type. The same sound is not stacked inside 45 ms. */
export function sfx(name, o = {}) {
  const make = LIB[name], ctx = make && ready(ALWAYS.has(name));
  if (!ctx) return;
  const t = ctx.currentTime + .008 + Math.max(0, o.at || 0) * (speed || 1) / 1000;
  const key = name + (o.type || "");
  if (Math.abs((last.get(key) ?? -1) - t) < .045) return;
  last.set(key, t);
  try { make(ctx, t, { ...o, type: o.type ? String(o.type).toLowerCase() : moveType, sec: o.dur ? o.dur * speed / 1000 : 0, k: speed }); } catch (err) { console.warn("sfx", name, err); /* a sound that fails is let go, never the battle */ }
}
export function verbSound(verb, o = {}) { const name = VERB[verb]; if (name) sfx(name, o); }
/* a field or a side's condition going up (Stage.jsx "field" and "side"): a terrain sings its type, a room bends, a screen rings, a
   hazard is laid stone by stone, Tailwind blows; one that ends falls away. Trick Room's own sound plays with its twist (stageFx). */
const TERRAIN = { electricterrain: "electric", grassyterrain: "grass", mistyterrain: "fairy", psychicterrain: "psychic" };
const SIDE = { reflect: ["screen", 988], lightscreen: ["screen", 1319], auroraveil: ["screen", 1175], safeguard: ["screen", 1568], mist: ["screen", 1568], luckychant: ["screen", 1568],
  tailwind: ["wind"], stealthrock: ["rocks"], spikes: ["spikes"], toxicspikes: ["st_psn"], stickyweb: ["web"], wideguard: ["protect"], quickguard: ["protect"], craftyshield: ["protect"], matblock: ["protect"] };
export function conditionSound(id, on, pan = 0) {
  if (!on) { sfx("fieldOff"); return; }
  if (TERRAIN[id]) sfx("terrain", { type: TERRAIN[id] });
  else if (/room$|^gravity$/.test(id)) { if (id !== "trickroom") sfx("room"); }
  else if (SIDE[id]) sfx(SIDE[id][0], { f: SIDE[id][1], pan, type: id === "toxicspikes" ? "poison" : undefined });
  else sfx("shine", { pan, type: "normal" });
}

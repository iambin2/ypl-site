/* 포켓몬의 울음소리 (DESIGN.md "Battle", Sound). 효과음(sfx.js)도 이 AudioContext 하나로 운다. 나올 때와 쓰러질 때 운다(쓰러질 때는 낮게). 소리는 PokeOS의 HOME 울음소리를
   scripts/build-cries.py가 public/cries/<도감 번호>.m4a로 받아 둔 것이고, Web Audio로 튼다. 브라우저는 손길 없이 소리를 내지 않으므로
   첫 탭이 소리를 깨운다. 그 전이나 파일이 없으면 조용히 넘어가고, 무대는 울음이 끝날 때까지 기다린다(cry가 그때 풀린다). */
const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
let ctx = null;
const buffers = new Map();
export const audio = () => (ctx ||= AC ? new AC() : null);
// the 소리 chip (BattlePage.jsx): cries and every effect sound go quiet together, remembered on the device
const SOUND_KEY = "ypl-battle:audio"; // not the old "ypl-battle:sound", which saved "off" for every visitor of the first sound
let on = (() => { try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch { return true; } })();
export const soundOn = () => on;
export function setSoundOn(value) { on = Boolean(value); try { localStorage.setItem(SOUND_KEY, on ? "on" : "off"); } catch { /* the next visit sounds */ } if (on) audio()?.resume?.().catch(() => {}); }
const wake = () => { if (audio()?.state !== "running") ctx.resume().catch(() => {}); };
if (AC) { addEventListener("pointerdown", wake, { capture: true, passive: true }); addEventListener("keydown", wake, { capture: true, passive: true }); }

// fetched and decoded once a number, when the team preview names the Pokémon
export function loadCry(num) {
  if (!num || !AC) return Promise.resolve(null);
  if (!buffers.has(num)) {
    buffers.set(num, fetch(`${import.meta.env?.BASE_URL ?? "/"}cries/${num}.m4a`)
      .then(res => (res.ok ? res.arrayBuffer() : null))
      .then(data => data && new Promise(resolve => audio().decodeAudioData(data, resolve, () => resolve(null))))
      .catch(() => null));
  }
  return buffers.get(num);
}

// plays the cry and resolves when it has been heard (rate under 1 is lower and longer); a cry not ready in a moment is let go
export async function cry(num, rate = 1) {
  const buffer = await Promise.race([loadCry(num), new Promise(resolve => setTimeout(resolve, 400))]);
  if (!buffer || !on || ctx?.state !== "running") return;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  src.connect(ctx.destination);
  await new Promise(resolve => { src.onended = resolve; src.start(); setTimeout(resolve, buffer.duration / rate * 1000 + 300); });
}

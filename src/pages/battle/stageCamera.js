/* 배틀 무대의 카메라와 무게 (DESIGN.md "Battle", The camera, Weight). 경기장과 연출층을 함께 감싼 .bs-cam 하나를
   transform으로만 움직인다(밀고 옮길 뿐, 자르거나 돌리지 않는다). 연출은 무대의 픽셀로 자리를 재므로, 그 자리를 카메라 안의
   자리로 바꾸는 toLocal이 함께 있다: 그 순간의 행렬(움직이는 도중이어도)을 거꾸로 적용한다.
   히트 스톱은 무대 위의 모든 애니메이션을 잠깐 멈췄다 다시 튼다. 동작 줄이기와 건너뛰기에서는 카메라가 넓은 그림에 머문다. */
import { reduced } from "../../components/common/motion.js";
import { vfxOf } from "./vfx.js";

const OUT = "cubic-bezier(.22,1,.36,1)";
const SWAY = "cubic-bezier(.45,0,.55,1)";
let speed = 1;
export const setCameraSpeed = s => { speed = s; };
const still = () => speed === 0 || reduced();

const camOf = stage => stage?.querySelector(".bs-cam");
const matrixOf = el => { try { return new DOMMatrix(getComputedStyle(el).transform); } catch { return new DOMMatrix(); } };

// a point in the stage's own pixels, as it stands inside the camera now (where an effect must be placed to land on it)
export function toLocal(stage, [x, y]) {
  const cam = camOf(stage);
  if (!cam) return [x, y];
  const m = matrixOf(cam);
  if (m.isIdentity) return [x, y];
  const p = m.inverse().transformPoint(new DOMPoint(x, y));
  return [p.x, p.y];
}
// an element's box in the stage's own pixels inside the camera (the camera only pushes and pans, so a box stays a box)
export function rectIn(stage, el) {
  const box = stage.getBoundingClientRect(), r = el.getBoundingClientRect(), z = zoomOf(stage);
  const [left, top] = toLocal(stage, [r.left - box.left, r.top - box.top]);
  const width = r.width / z, height = r.height / z;
  return { left, top, width, height, right: left + width, bottom: top + height };
}
// how much the camera magnifies now: a size measured on the screen is this much larger than inside the camera
export const zoomOf = stage => { const cam = camOf(stage); return cam ? matrixOf(cam).a || 1 : 1; };

/* where the camera rests, and where it is going: a push of `scale` that keeps `point` (stage pixels, inside the camera) where it
   lands on the screen at `focus` (a share of the stage), clamped so the stage never shows past its edges */
function shot(stage, [px, py], scale, focus = [.5, .55]) {
  const w = stage.clientWidth, h = stage.clientHeight;
  let tx = w * focus[0] - px * scale, ty = h * focus[1] - py * scale;
  tx = Math.min(0, Math.max(w - w * scale, tx));
  ty = Math.min(0, Math.max(h - h * scale, ty));
  return `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${scale})`;
}
function go(stage, to, duration, easing = SWAY) {
  const cam = camOf(stage);
  if (!cam) return Promise.resolve();
  const from = getComputedStyle(cam).transform;
  cam.getAnimations().forEach(a => a.cancel());
  cam.style.transform = to;
  if (still() || !duration) return Promise.resolve();
  const a = cam.animate([{ transform: from === "none" ? "translate(0px, 0px) scale(1)" : from }, { transform: to }], { duration: duration * speed, easing });
  return Promise.race([a.finished.catch(() => {}), new Promise(r => setTimeout(r, duration * speed + 120))]);
}

// frame a point (a Pokémon's centre, inside the camera): a push toward it
export function frame(stage, point, scale = 1.12, duration = 420) {
  if (!stage || still()) return Promise.resolve();
  return go(stage, shot(stage, point, scale), duration, OUT);
}
// pan to another point at the push the camera already has (the move travelling to its target)
export function pan(stage, point, duration = 520, scale = null) {
  if (!stage || still()) return Promise.resolve();
  return go(stage, shot(stage, point, scale ?? zoomOf(stage)), duration, SWAY);
}
// back to the wide shot: both sides in view
export function wide(stage, duration = 680) {
  if (!stage) return Promise.resolve();
  if (still()) { const cam = camOf(stage); if (cam) { cam.getAnimations().forEach(a => a.cancel()); cam.style.transform = ""; } return Promise.resolve(); }
  return go(stage, "translate(0px, 0px) scale(1)", duration, SWAY).then(() => { const cam = camOf(stage); if (cam) cam.style.transform = ""; });
}

/* hit-stop: everything on the stage holds still for a moment at the impact, then goes on (60, 90 on a critical or super effective
   blow, 120 on the blow that knocks a Pokémon out). The idle breathing holds too, so the whole picture stops, as a game's does. */
export function hitStop(stage, ms = 60) {
  if (!stage || still() || speed !== 1 && ms < 80) return Promise.resolve();
  const running = stage.getAnimations({ subtree: true }).filter(a => a.playState === "running");
  running.forEach(a => a.pause());
  vfxOf(stage)?.hold(ms);
  return new Promise(resolve => setTimeout(() => { running.forEach(a => { try { a.play(); } catch { /* it ended while held */ } }); resolve(); }, ms));
}
// a blow played at half speed from its impact (the one that knocks a Pokémon out): every animation on the stage slows for a while
export function slow(stage, duration = 700, rate = .5) {
  if (!stage || still()) return Promise.resolve();
  const list = stage.getAnimations({ subtree: true });
  list.forEach(a => { a.playbackRate = rate; });
  vfxOf(stage)?.slow(duration, rate);
  return new Promise(resolve => setTimeout(() => { stage.getAnimations({ subtree: true }).forEach(a => { a.playbackRate = 1; }); resolve(); }, duration));
}

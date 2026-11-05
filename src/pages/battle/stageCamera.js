/* 배틀 무대의 카메라 (DESIGN.md "Battle", The camera). 카메라는 GPU 무대(gl.js)의 것이다: 목표 자리와 확대만 정하면 임계 감쇠 스프링이
   그곳으로 데려가므로, 움직이는 도중에 목표가 바뀌어도 속도가 끊기지 않는다. 여기는 무대의 말(밀기, 옮기기, 넓게)을 그 목표로 바꾼다.
   히트 스톱은 무대의 시계를 잠깐 멈추고, 슬로 모션은 늦춘다. 동작 줄이기에서는 카메라가 넓은 그림에 머문다. */
import { glOf } from "./gl.js";

let speed = 1;
export const setCameraSpeed = s => { speed = s; };
// a duration in the old words is a spring that settles in about that long
const smoothOf = ms => Math.max(.08, ms / 1000 * .5 * (speed || 1));
export function frame(stage, [x, y], scale = 1.12, duration = 420) { glOf(stage)?.shot(x, y, scale, { smooth: smoothOf(duration) }); return Promise.resolve(); }
export function pan(stage, [x, y], duration = 520, scale = null) { const e = glOf(stage); e?.shot(x, y, scale ?? e.cam.tz, { smooth: smoothOf(duration) }); return Promise.resolve(); }
export function wide(stage, duration = 680) { glOf(stage)?.wide(smoothOf(duration)); return Promise.resolve(); }
export function hitStop(stage, ms = 60) {
  const e = glOf(stage);
  if (!e || speed === 0) return Promise.resolve();
  e.hold(ms);
  return new Promise(resolve => setTimeout(resolve, ms));
}
export function slow(stage, duration = 700, rate = .5) { glOf(stage)?.slow(duration, rate); return Promise.resolve(); }

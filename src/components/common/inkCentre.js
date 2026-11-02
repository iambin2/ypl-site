/* 그림의 중앙은 상자의 중앙이 아니라 잉크의 중앙이다. 스프라이트마다 투명 여백이 달라, 상자에 맞춰 놓으면 포켓몬이 창 아래로 내려앉는다.
   알파를 작게 읽어 잉크 상자를 찾고, 그만큼 그림을 옮긴다. 값은 그림의 폭과 높이에 대한 비율이라 크기가 바뀌어도 그대로다. */
const SIZE = 48, ALPHA = 40;

/* 알파 배열(w × h)에서 잉크 중심이 그림 중심에서 얼마나 벗어났는지의 반대 방향 이동, % 단위. 잉크가 없으면 null. */
export function inkShift(alpha, w, h) {
  let minX = w, maxX = -1, minY = h, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (alpha[y * w + x] < ALPHA) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX < 0) return null;
  return [(.5 - (minX + maxX + 1) / 2 / w) * 100, (.5 - (minY + maxY + 1) / 2 / h) * 100];
}

const seen = new Map();
let ctx = null;
export function centreInk(img) {
  const { src, naturalWidth: nw, naturalHeight: nh } = img;
  if (!nw || !nh) return;
  if (!seen.has(src)) {
    let shift = null;
    try {
      ctx ||= Object.assign(document.createElement("canvas"), { width: SIZE, height: SIZE }).getContext("2d", { willReadFrequently: true });
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      const rgba = ctx.getImageData(0, 0, SIZE, SIZE).data, alpha = new Uint8Array(SIZE * SIZE);
      for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
      shift = inkShift(alpha, SIZE, SIZE);
    } catch { /* 다른 출처의 그림은 읽을 수 없다: 상자의 중앙에 둔다 */ }
    seen.set(src, shift);
  }
  const shift = seen.get(src);
  if (shift) img.style.translate = `${shift[0].toFixed(1)}% ${shift[1].toFixed(1)}%`;
}

/* 바닥에 서는 포켓몬(DESIGN.md "Where a Pokémon stands"): 상자의 아래가 아니라 잉크의 아래 끝이 바닥 윗선에 닿는다.
   그림은 정사각 상자 안에 object-fit: contain, 아래 가운데로 놓인다. 잉크의 아래 여백만큼 내리고, 잉크의 가로 중심을 상자 가운데로 옮긴다.
   발끝은 1px 안에 맞아야 하므로 더 촘촘히(FOOT) 읽는다. 값은 상자에 대한 비율이라 크기가 바뀌어도 그대로다. */
const FOOT = 256;
export function inkFeet(alpha, w, h) {
  let minX = w, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (alpha[y * w + x] < ALPHA) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (maxX < 0) return null;
  return [(.5 - (minX + maxX + 1) / 2 / w) * 100, (1 - (maxY + 1) / h) * 100];
}
const feet = new Map();
let footCtx = null;
export function standInk(img) {
  const { src, naturalWidth: nw, naturalHeight: nh } = img;
  if (!nw || !nh) return;
  if (!feet.has(src)) {
    let shift = null;
    try {
      footCtx ||= Object.assign(document.createElement("canvas"), { width: FOOT, height: FOOT }).getContext("2d", { willReadFrequently: true });
      footCtx.clearRect(0, 0, FOOT, FOOT);
      footCtx.drawImage(img, 0, 0, FOOT, FOOT);
      const rgba = footCtx.getImageData(0, 0, FOOT, FOOT).data, alpha = new Uint8Array(FOOT * FOOT);
      for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
      shift = inkFeet(alpha, FOOT, FOOT);
    } catch { /* 다른 출처의 그림은 읽을 수 없다: 상자의 아래에 둔다 */ }
    // contain으로 줄어든 쪽은 상자보다 작게 그려진다: 그 비율만큼만 옮긴다
    feet.set(src, shift && [shift[0] * Math.min(1, nw / nh), shift[1] * Math.min(1, nh / nw)]);
  }
  const shift = feet.get(src);
  if (shift) img.style.translate = `${shift[0].toFixed(2)}% ${shift[1].toFixed(2)}%`;
}

import { WORDMARK_PATH } from "./layout/SiteHeader.jsx";
import { formatDate } from "../services/dateFormat.js";

/* 팀 시트 한 장을 PNG로 그린다(쇼다운 팀 이미지와 같은 쓰임). 사이트와 같은 무채색 재료, 같은 글꼴과 워드마크,
   지금 보고 있는 테마 그대로. 타입 색은 사이트처럼 점 하나로만 쓴다(B1, 타입 색은 내용). 스프라이트는 같은 출처라
   캔버스가 오염되지 않는다. */
const FONT = '"SUIT Variable", "SUIT", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const PALETTE = {
  dark: { bg: "#0A0A0A", glow: "rgba(255,255,255,.12)", card: "#161616", well: "#1F1F1F", fg: "#F5F5F5", fg2: "#B0B0B0", fg3: "#8C8C8C", bar: "rgba(255,255,255,.1)", barOn: "#F5F5F5", line: "rgba(255,255,255,.1)" },
  light: { bg: "#E7E7E7", glow: "rgba(255,255,255,.7)", card: "#FFFFFF", well: "#F3F3F3", fg: "#0A0A0A", fg2: "#525252", fg3: "#6B6B6B", bar: "rgba(0,0,0,.08)", barOn: "#0A0A0A", line: "rgba(0,0,0,.08)" },
};
// team-builder.css 의 타입 점 색과 같은 값
const TYPE_DOT = { normal: "#9FA19F", fire: "#E62829", water: "#2980EF", electric: "#FAC000", grass: "#3FA129", ice: "#3FD8FF", fighting: "#FF8000", poison: "#9141CB", ground: "#915121", flying: "#81B9EF", psychic: "#EF4179", bug: "#91A119", rock: "#AFA981", ghost: "#704170", dragon: "#5060E1", dark: "#624D4E", steel: "#60A1B8", fairy: "#EF70EF" };

const PAD = 48, GAP = 24, CARD_W = 540, CARD_H = 568, CARD_PAD = 24, HEAD_H = 132, FOOT_H = 64;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function clip(ctx, text, max) {
  const t = String(text || "");
  if (ctx.measureText(t).width <= max) return t;
  let s = t; while (s.length > 1 && ctx.measureText(s + "…").width > max) s = s.slice(0, -1);
  return s + "…";
}
function wordmark(ctx, x, y, h, color) {
  const k = h / 100;
  ctx.save(); ctx.translate(x, y - h); ctx.scale(k, k);
  ctx.transform(1, 0, Math.tan(-12 * Math.PI / 180), 1, 0, 0); ctx.translate(21, 0);
  ctx.fillStyle = color; ctx.fill(new Path2D(WORDMARK_PATH), "evenodd");
  ctx.restore();
  return 310 * k;
}
function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img); img.onerror = () => resolve(null);
    img.src = src;
  });
}
async function fontsReady() {
  try { await Promise.all(["800 32px", "700 16px", "400 16px"].map(f => document.fonts.load(`${f} "SUIT Variable"`))); await document.fonts.ready; } catch { /* system font */ }
}
function typePill(ctx, c, x, y, type) {
  ctx.font = `700 12px ${FONT}`;
  const w = ctx.measureText(type.label).width + 36;
  roundRect(ctx, x, y, w, 24, 12); ctx.fillStyle = c.well; ctx.fill();
  ctx.beginPath(); ctx.arc(x + 16, y + 12, 4, 0, Math.PI * 2); ctx.fillStyle = TYPE_DOT[type.id] || c.fg3; ctx.fill();
  ctx.fillStyle = c.fg; ctx.textBaseline = "middle"; ctx.fillText(type.label, x + 26, y + 12.5); ctx.textBaseline = "alphabetic";
  return w;
}

function drawCard(ctx, c, x, y, row, sprite) {
  roundRect(ctx, x, y, CARD_W, CARD_H, 32); ctx.fillStyle = c.card; ctx.fill();
  const ix = x + CARD_PAD, iw = CARD_W - CARD_PAD * 2;
  // 머리: 진열장 위의 스프라이트, 이름, 영문 이름과 도감 번호, 타입
  roundRect(ctx, ix, y + CARD_PAD, 104, 104, 12); ctx.fillStyle = c.well; ctx.fill();
  if (sprite) { const s = Math.min(96 / sprite.width, 96 / sprite.height); const w = sprite.width * s, h = sprite.height * s; ctx.drawImage(sprite, ix + 52 - w / 2, y + CARD_PAD + 52 - h / 2, w, h); }
  const tx = ix + 104 + 16, tw = iw - 120;
  ctx.textAlign = "left"; ctx.fillStyle = c.fg; ctx.font = `800 24px ${FONT}`;
  ctx.fillText(clip(ctx, row.name, tw), tx, y + CARD_PAD + 30);
  ctx.fillStyle = c.fg3; ctx.font = `400 13px ${FONT}`;
  const sub = [row.english !== row.name ? row.english : "", row.num != null ? `No. ${String(row.num).padStart(4, "0")}` : ""].filter(Boolean).join("   ");
  ctx.fillText(clip(ctx, sub, tw), tx, y + CARD_PAD + 52);
  let px = tx; for (const type of row.types) px += typePill(ctx, c, px, y + CARD_PAD + 66, type) + 4;

  // 특성, 도구, 성격
  let cy = y + CARD_PAD + 104 + 32;
  for (const [label, value] of [["특성", row.ability || "없음"], ["도구", row.item || "없음"], ["성격", row.nature ? `${row.nature}, ${row.natureEffect}` : "없음"]]) {
    ctx.fillStyle = c.fg3; ctx.font = `400 13px ${FONT}`; ctx.fillText(label, ix, cy);
    ctx.fillStyle = c.fg; ctx.font = `700 15px ${FONT}`; ctx.fillText(clip(ctx, value, iw - 56), ix + 56, cy);
    cy += 26;
  }

  // 능력치: 종족값, 능력 포인트 막대, 최종 능력치
  cy += 14;
  ctx.fillStyle = c.fg3; ctx.font = `400 12px ${FONT}`;
  ctx.fillText("능력", ix, cy); ctx.fillText("종족값", ix + 64, cy);
  ctx.fillText(`능력 포인트 ${row.spTotal} / 66`, ix + 132, cy);
  ctx.textAlign = "right"; ctx.fillText("최종", ix + iw, cy); ctx.textAlign = "left";
  cy += 10;
  const barX = ix + 132, barW = iw - 132 - 92;
  for (const stat of row.stats) {
    cy += 26;
    ctx.fillStyle = c.fg; ctx.font = `700 15px ${FONT}`;
    ctx.fillText(stat.label + (stat.mark === "+" ? " ↑" : stat.mark === "-" ? " ↓" : ""), ix, cy);
    ctx.fillStyle = c.fg2; ctx.font = `400 15px ${FONT}`; ctx.fillText(stat.base ?? "", ix + 64, cy);
    roundRect(ctx, barX, cy - 9, barW, 6, 3); ctx.fillStyle = c.bar; ctx.fill();
    if (stat.sp) { roundRect(ctx, barX, cy - 9, Math.max(6, barW * stat.sp / 32), 6, 3); ctx.fillStyle = c.barOn; ctx.fill(); }
    ctx.fillStyle = stat.sp ? c.fg : c.fg3; ctx.font = `${stat.sp ? 700 : 400} 13px ${FONT}`; ctx.fillText(String(stat.sp), barX + barW + 12, cy);
    ctx.textAlign = "right"; ctx.fillStyle = c.fg; ctx.font = `800 16px ${FONT}`; ctx.fillText(String(stat.final), ix + iw, cy); ctx.textAlign = "left";
  }

  // 기술 네 칸
  cy += 24;
  const mw = (iw - 8) / 2;
  for (let i = 0; i < 4; i += 1) {
    const move = row.moves[i];
    const mx = ix + (i % 2) * (mw + 8), my = cy + Math.floor(i / 2) * 52;
    roundRect(ctx, mx, my, mw, 44, 12); ctx.fillStyle = c.well; ctx.fill();
    if (!move) { ctx.fillStyle = c.fg3; ctx.font = `400 13px ${FONT}`; ctx.fillText("기술 없음", mx + 14, my + 27); continue; }
    ctx.beginPath(); ctx.arc(mx + 18, my + 22, 4, 0, Math.PI * 2); ctx.fillStyle = TYPE_DOT[move.type?.id] || c.fg3; ctx.fill();
    ctx.fillStyle = c.fg; ctx.font = `700 15px ${FONT}`;
    const cat = [move.type?.label, move.category].filter(Boolean).join(" ");
    ctx.font = `400 12px ${FONT}`; const cw = ctx.measureText(cat).width;
    ctx.fillStyle = c.fg3; ctx.textAlign = "right"; ctx.fillText(cat, mx + mw - 14, my + 27); ctx.textAlign = "left";
    ctx.fillStyle = c.fg; ctx.font = `700 15px ${FONT}`; ctx.fillText(clip(ctx, move.name, mw - 44 - cw), mx + 30, my + 27);
  }
}

export async function renderTeamSheetCanvas(sheet, { title = "", meta = "", author = "", date = new Date() } = {}) {
  await fontsReady();
  const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  const c = PALETTE[theme];
  const cols = sheet.length > 1 ? 2 : 1, rows = Math.max(1, Math.ceil(sheet.length / cols));
  const W = PAD * 2 + cols * CARD_W + (cols - 1) * GAP;
  const H = HEAD_H + rows * CARD_H + (rows - 1) * GAP + FOOT_H + PAD;
  const S = 2, cv = document.createElement("canvas");
  cv.width = W * S; cv.height = H * S;
  const ctx = cv.getContext("2d"); ctx.scale(S, S);
  // 무대: 흑연색(밝은 테마는 회색) 위에 바로 위에서 떨어지는 빛 하나
  ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, -H * 0.2, 0, W / 2, -H * 0.2, Math.max(W, H) * 0.75);
  g.addColorStop(0, c.glow); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left"; ctx.fillStyle = c.fg; ctx.font = `800 32px ${FONT}`;
  ctx.fillText(clip(ctx, title || "이름 없는 팀", W - PAD * 2), PAD, PAD + 32);
  ctx.fillStyle = c.fg3; ctx.font = `400 15px ${FONT}`;
  ctx.fillText(clip(ctx, meta, W - PAD * 2), PAD, PAD + 62);

  const sprites = await Promise.all(sheet.map(row => loadImage(row.sprite)));
  sheet.forEach((row, i) => drawCard(ctx, c, PAD + (i % cols) * (CARD_W + GAP), HEAD_H + Math.floor(i / cols) * (CARD_H + GAP), row, sprites[i]));

  const fy = H - PAD + 4;
  const wm = wordmark(ctx, PAD, fy, 14, c.fg);
  ctx.fillStyle = c.fg3; ctx.font = `400 13px ${FONT}`;
  ctx.fillText([author ? `${author} 작성` : "", formatDate(date.toISOString())].filter(Boolean).join(", "), PAD + wm + 12, fy - 1);
  ctx.textAlign = "right"; ctx.font = `700 12px ${FONT}`; ctx.fillText("YPL 팀 빌더", W - PAD, fy - 1); ctx.textAlign = "left";
  return cv;
}

/* 폰은 공유 시트(사진에 저장)를 먼저, 데스크톱과 공유가 안 되는 브라우저는 파일 다운로드 */
export async function saveTeamSheetImage(sheet, options = {}) {
  if (!sheet.length) throw new Error("포켓몬을 1마리 이상 추가해 주세요.");
  const canvas = await renderTeamSheetCanvas(sheet, options);
  const blob = await new Promise(done => canvas.toBlob(done, "image/png"));
  if (!blob) throw new Error("이미지를 만들지 못했습니다.");
  const filename = `${String(options.title || "YPL 팀").replace(/[\\/:*?"<>|]+/g, " ").trim()}.png`;
  const file = typeof File === "function" ? new File([blob], filename, { type: "image/png" }) : null;
  if (file && matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: options.title || "YPL 팀" }); return "shared"; }
    catch (error) { if (error?.name === "AbortError") return "cancelled"; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return "downloaded";
}

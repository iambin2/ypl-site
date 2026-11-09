/* 랜덤 파티의 균형 (docs/BATTLE_STREAK.md 11장, 2026-11-09 사용자: "보만다나 메타그로스 같은 사기 포켓몬 뽑으면 쭉쭉 밀어 ... 순수 실력으로
   올라가는 거였거든"). 포켓몬마다 파티의 승리에 보태는 몫을 컴퓨터끼리의 대전으로 재어 두고(scripts/rate-species.mjs가
   src/data/species-power.json을 쓴다), 그 값으로 종을 여섯 급으로 나눈다. 랜덤 파티는 급마다 하나씩, 여섯 몫의 합이 정해진 폭 안에
   들 때까지 뽑는다(engine.mjs randomTeam). 그래서 누가 뽑든 파티의 힘이 같고, 판을 가르는 것은 고르는 수다.
   화면(연승 도전의 교환)과 엔진이 함께 읽으므로 몫의 표만 들인다. */
import POWER from "../data/species-power.json" with { type: "json" };

export const TIERS = 6;
/* 보통 파티는 여섯 급에서 하나씩. 층의 주인은 가장 약한 급 대신 가운데 급을 하나 더 가진다: 몫의 합이 약 0.3 높아, 같은 실력이면
   주인이 약 57% 이긴다(11장에서 잼; 2026-11-08까지의 사용률 상위 24종 주인은 56.3%). 두 급을 당긴 계획(0, 0, 1, 1, 2, 3)은 1.2가
   높아 77%로, 실력보다 파티가 가르는 판이 되어 버렸다 */
export const PLAN = [0, 1, 2, 3, 4, 5];
export const MASTER_PLAN = [0, 1, 2, 3, 3, 4];
/* 여섯 몫의 합이 목표에서 이만큼(로짓) 안이면 받는다. 0.15는 같은 실력끼리 승률 약 46%에서 54% 사이: 파티 차이가 운으로 남는
   몫이 이 안이다(11장의 측정) */
export const BAND = 0.15;

/* 몫을 아직 재지 않은 형식은 가까운 형식의 몫을 빌린다: 같은 규정의 다른 형식보다 같은 형식의 다른 규정이 먼저다 */
const NEAR = {
  gen9championsbssregmb: ["gen9championsbssregmc", "gen9championsvgc2026regmc"],
  gen9championsvgc2026regmb: ["gen9championsvgc2026regmc", "gen9championsbssregmc"],
  gen9championsvgc2026regmc: ["gen9championsbssregmc"],
  gen9championsbssregmc: ["gen9championsvgc2026regmc"],
};
const tables = new Map();
function table(formatid) {
  if (tables.has(formatid)) return tables.get(formatid);
  const id = [formatid, ...(NEAR[formatid] || [])].find(f => POWER[f]?.rating);
  const rating = id ? POWER[id].rating : null;
  let out = null;
  if (rating) {
    const sorted = Object.values(rating).sort((a, b) => b - a);
    // the lowest rating of each tier but the last: a species is in the first tier whose floor it reaches
    const floors = Array.from({ length: TIERS - 1 }, (_, i) => sorted[Math.floor(((i + 1) * sorted.length) / TIERS) - 1]);
    const median = sorted[Math.floor(sorted.length / 2)];
    out = { rating, floors, median };
  }
  tables.set(formatid, out);
  return out;
}
// the form the team preview hides (Gourgeist-*) is found by its species, as streak.js swapParty finds it
// names as Showdown ids, so a form spelled "Squawkabilly Blue" (an input log) and "Squawkabilly-Blue" (the sample sets) is one species
const id = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const ids = new WeakMap();
const lookup = (rating, species) => {
  if (!ids.has(rating)) ids.set(rating, new Map(Object.entries(rating).map(([k, v]) => [id(k), [k, v]])));
  const byId = ids.get(rating), s = String(species);
  if (byId.has(id(s))) return byId.get(id(s))[1];
  if (s.endsWith("-*")) { const b = id(s.slice(0, -2)); const k = [...byId.keys()].find(x => x.startsWith(b)); if (k) return byId.get(k)[1]; }
  return undefined;
};

/* a species' share of a party's win, in logits (0 is the average species). A species never measured (one the weekly learning
   brought in since) stands at the middle. null when nothing for the format is measured: then parties are drawn as before */
export function ratingOf(formatid, species) {
  const t = table(formatid);
  if (!t) return null;
  return lookup(t.rating, species) ?? t.median;
}
// its tier, 0 the strongest to 5; null when nothing is measured
export function tierOf(formatid, species) {
  const t = table(formatid);
  if (!t) return null;
  const r = ratingOf(formatid, species);
  const i = t.floors.findIndex(f => r >= f);
  return i < 0 ? TIERS - 1 : i;
}
export const balanced = formatid => Boolean(table(formatid));

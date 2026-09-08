import assert from "node:assert/strict";
import test from "node:test";

// The database function is canonical at runtime. This small policy model keeps
// the half-year boundary examples executable without a database connection.
function resolveYplSeasonForSeoulDate(value) {
  const date = new Date(`${value}T00:00:00+09:00`);
  const anchor = new Date("2026-09-01T00:00:00+09:00");
  if (date < anchor) return null;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const startsYear = month <= 2 ? year - 1 : year;
  const startsMonth = month <= 2 || month >= 9 ? 9 : 3;
  const seasonNumber = 3 + ((startsYear - 2026) * 2) + (startsMonth === 3 ? -1 : 0);
  const startsOn = `${startsYear}-${String(startsMonth).padStart(2, "0")}-01`;
  const endsOn = new Date(`${startsOn}T00:00:00+09:00`);
  endsOn.setMonth(endsOn.getMonth() + 6);
  endsOn.setDate(endsOn.getDate() - 1);
  const endsOnSeoul = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(endsOn).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});

  return {
    seasonNumber,
    startsOn,
    endsOn: `${endsOnSeoul.year}-${endsOnSeoul.month}-${endsOnSeoul.day}`,
  };
}

test("YPL Season rollover policy uses Asia/Seoul half-year boundaries", () => {
  assert.equal(resolveYplSeasonForSeoulDate("2026-08-31"), null);
  assert.deepEqual(resolveYplSeasonForSeoulDate("2026-09-01"), { seasonNumber: 3, startsOn: "2026-09-01", endsOn: "2027-02-28" });
  assert.equal(resolveYplSeasonForSeoulDate("2027-02-28").seasonNumber, 3);
  assert.equal(resolveYplSeasonForSeoulDate("2027-03-01").seasonNumber, 4);
  assert.equal(resolveYplSeasonForSeoulDate("2027-08-31").seasonNumber, 4);
  assert.equal(resolveYplSeasonForSeoulDate("2027-09-01").seasonNumber, 5);
  assert.equal(resolveYplSeasonForSeoulDate("2028-02-29").seasonNumber, 5);
  assert.deepEqual(resolveYplSeasonForSeoulDate("2028-03-01"), { seasonNumber: 6, startsOn: "2028-03-01", endsOn: "2028-08-31" });
});

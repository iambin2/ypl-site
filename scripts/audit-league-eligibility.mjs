// Read-only audit. No ranking totals, name guessing, or database writes.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildLeagueEligibilityAudit } from "./lib/league-eligibility.mjs";

const env = Object.fromEntries(readFileSync(".env.production", "utf8").split(/\r?\n/)
  .filter(line => /^[A-Z_]+=/.test(line))
  .map(line => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]));
const schema = env.VITE_YPL_DATA_SCHEMA;
const headers = { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`, "Accept-Profile": schema };

async function read(table, select) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const url = new URL(`/rest/v1/${table}`, env.VITE_SUPABASE_URL);
    url.searchParams.set("select", select);
    url.searchParams.set("order", "id.asc");
    const response = await fetch(url, { headers: { ...headers, Range: `${from}-${from + 999}` } });
    if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const tables = {
  players: "id,display_name,status",
  events: "id,name,event_type,division,is_team_event,status,held_on,record_completeness,record_applied_at",
  entries: "id,event_id,entry_type,status",
  entry_participants: "id,event_id,entry_id,player_id",
  matches: "id,event_id,entry_a_id,entry_b_id,player_a_id,player_b_id,match_kind,resolution",
  results: "id,event_id,entry_id,placement_code,rank_min,rank_max,placement_label",
  event_registrations: "id,event_id",
  registration_submissions: "id,registration_id",
  bracket_runtimes: "id,event_id",
};
const facts = Object.fromEntries(await Promise.all(Object.entries(tables).map(async ([table, select]) => [table, await read(table, select)])));
const { summary, duplicateNames, issues, rows, unconfirmed } = buildLeagueEligibilityAudit(facts);
const activeMasterPreflight=facts.events.filter(event=>event.division==="master"&&!event.is_team_event&&event.status==="open").map(event=>{
  const registrationIds=new Set(facts.event_registrations.filter(row=>row.event_id===event.id).map(row=>row.id));
  const counts={registrations:registrationIds.size,submissions:facts.registration_submissions.filter(row=>registrationIds.has(row.registration_id)).length,
    entries:facts.entries.filter(row=>row.event_id===event.id).length,runtimes:facts.bracket_runtimes.filter(row=>row.event_id===event.id).length};
  return {eventId:event.id,name:event.name,counts,pristine:Object.values(counts).every(count=>count===0)};
});
// Historical UI labels can put Champions under tournamentKey=master. Compare
// exact Event identity/name and participants for omissions, never infer a league
// from that legacy display bucket or copy it into active runtime data.
const legacyUrl = new URL("/rest/v1/site_data", env.VITE_SUPABASE_URL);
legacyUrl.searchParams.set("key", "eq.ypl_data_v4");
legacyUrl.searchParams.set("select", "value");
const legacyResponse = await fetch(legacyUrl, { headers: { ...headers, "Accept-Profile": "public" } });
if (!legacyResponse.ok) throw new Error(`legacy comparison: ${legacyResponse.status}`);
const legacyData = (await legacyResponse.json())[0]?.value;
if (!legacyData || !Array.isArray(legacyData.brackets)) throw new Error("Historical bracket source is missing.");
const legacyComparison = legacyData.brackets.filter(bracket => bracket.applied && bracket.mode === "single").map(bracket => {
  const candidates = facts.events.filter(event => bracket.eventId ? event.id === bracket.eventId : event.name === bracket.name);
  const event = candidates.length === 1 ? candidates[0] : null;
  const participantNames = (bracket.participants || []).map(participant => participant.name);
  const missing = participantNames.filter(name => {
    const playerMatches = facts.players.filter(player => player.display_name === name);
    return !event || playerMatches.length !== 1 || !facts.entry_participants.some(participant => participant.event_id === event.id && participant.player_id === playerMatches[0].id);
  });
  return { bracketId: bracket.id, name: bracket.name, eventId: event?.id || null, eventType: event?.event_type || null,
    division: event?.division || null, participants: participantNames.length, missing };
});
const report = { generatedAt: new Date().toISOString(), project: new URL(env.VITE_SUPABASE_URL).hostname, schema,
  counts: Object.fromEntries(Object.entries(facts).map(([table, data]) => [table, data.length])), summary, duplicateNames, issues, rows, unconfirmed, legacyComparison,activeMasterPreflight };
const out = resolve(process.argv[2] || "../league-review-2026-10-29");
mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, "eligibility-audit.json"), JSON.stringify(report, null, 2) + "\n");
const cell = value => String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
const md = ["# 마스터 리그 자격 1차 검수", "", `조회 시각: ${report.generatedAt}`, "",
  "확정 기준: 개인 마스터 참가 또는 개인 루키/라이트 우승. 팀전 참가 및 팀전 우승은 개인 마스터 자격에 포함하지 않는다. 완료된 대회의 Player ID와 EntryParticipant를 기준으로 검수했다. 신청만 한 사람, 진행 중 대회, 챔피언스, 랭킹 점수는 자격 근거에서 제외했다. 과거 이관 대회는 record_applied_at이 비어 있어도 완료된 참가 및 우승 사실을 포함했다.", "",
  `확정 기준으로 근거가 있는 선수: ${summary.masterEligible}명. 라이트 우승을 추가하기 전 기준은 ${summary.individualOrRookieChampion}명이었다.`, "",
  `팀전 근거만 있어 개인 마스터 인정에서 제외하는 사람: ${summary.teamOnly.join(", ") || "없음"}.`, "",
  `개인 마스터 Entry만 있고 Match가 없는 추가 확인 대상: ${summary.entryOnlyIndividual.join(", ") || "없음"}.`, "",
  "| 이름 | 개인 마스터 인정 | 개인 마스터 참가 | 루키 우승 | 라이트 우승 | 팀전 참가 참고 | 근거 |", "| --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map(row => `| ${cell(row.name)} | ${row.masterEligible ? "인정" : "제외"} | ${row.individualMaster ? "있음" : ""} | ${row.rookieChampion ? "있음" : ""} | ${row.lightChampion ? "있음" : ""} | ${row.teamMaster ? "있음" : ""} | ${cell(row.evidence.map(item => `${item.event} (${item.kind}, ${item.detail})`).join("; "))} |`), "",
  `동명이인 그룹: ${duplicateNames.length}. 무결성 검토 사항: ${issues.length}.`, "",
  `자격 근거를 찾지 못한 기존 선수: ${unconfirmed.length}명. 기록이 없다는 사실만으로 루키 자격을 확정하지 않는다.`, "",
  `옛 개인전 대진표 ${legacyComparison.length}개의 명단을 정확한 Event 이름 및 선수 이름으로 대조했다. 대조 불일치: ${legacyComparison.reduce((sum, item) => sum + item.missing.length, 0)}명. 챔피언스가 과거 화면에서 master 분류에 들어간 경우도 있으므로 그 화면 분류는 자격 근거로 쓰지 않았다.`, "",
  ...activeMasterPreflight.map(event=>`현재 접수 중 ${event.name}: 신청 ${event.counts.registrations}명, 제출 ${event.counts.submissions}건, Entry ${event.counts.entries}개, 대진표 ${event.counts.runtimes}개. ${event.counts.submissions||event.counts.entries||event.counts.runtimes?"제출 또는 참가 데이터가 있어 자동 전환 대상이 아니다.":"신청만 있는 경우에는 ID와 응답을 보존하는 전환을 지원한다. 실제 전환은 DB의 전체 preflight와 선수 확인을 다시 거친다."}`), "",
  "이 목록은 조회 시점의 근거다. 영구적인 수동 선수 등급을 저장하지 않으며, 신청 및 실제 참가 확정 시 DB에서 같은 기준을 재검사한다.", ""];
writeFileSync(resolve(out, "마스터_자격_검수.md"), md.join("\n"));
console.log(JSON.stringify({ out, counts: report.counts, summary, duplicateNames, issues, legacyComparison, activeMasterPreflight }, null, 2));

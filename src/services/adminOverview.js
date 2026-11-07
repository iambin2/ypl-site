import { applicationsOpen } from "./announcementTimes.js";
import { listLiveBoards } from "./battleWatch.js";
import {
  listEventApplications, listEventRegistrationSubmissionStatuses, listEventsAwaitingRecord, listNormalizedBracketRuntimes, listSubmissionEvents,
} from "./normalizedCompetitionService.js";
import { liveMatches } from "./recordsAnalytics.js";
import { accountsReady, listLinkRequests } from "./visitorAuth.js";
import { eventStep } from "./adminTasks.js";
export { ADMIN_STEPS, adminTasks } from "./adminTasks.js";

/* 운영 (DESIGN.md "Admin", 2026-11-08): what waits on the operators now, read when the page opens. Every event still open or running
   and not yet recorded stands at one of four steps, from its notice and its bracket:
     1 접수: its application form is open;  2 대진: closed, no bracket yet;  3 경기: a bracket with matches undecided;
     4 기록: every match decided, the record not applied.
   A read that fails leaves its part out (null), never the page. */
const safe = promise => Promise.resolve(promise).then(value => value, () => null);

export async function readAdminOverview(announcements = []) {
  const [events, awaiting, runtimes, requests, live] = await Promise.all([
    safe(listSubmissionEvents()), safe(listEventsAwaitingRecord()), safe(listNormalizedBracketRuntimes()),
    safe(accountsReady().then(ok => (ok ? listLinkRequests() : []))), safe(listLiveBoards()),
  ]);
  const brackets = (runtimes || []).map(row => row.bracket).filter(Boolean);
  const progress = await Promise.all((events || []).map(async event => {
    const notice = announcements.find(a => a.form?.eventId === event.id) || null;
    const draft = notice?.form?.eventDraft || {};
    const bracket = brackets.find(b => b.eventId === event.id) || null;
    const [applicants, statuses] = await Promise.all([safe(listEventApplications(event.id)), safe(listEventRegistrationSubmissionStatuses(event.id))]);
    const play = bracket ? liveMatches(bracket) : null;
    const open = applicationsOpen(notice?.form);
    const left = play?.live.length || 0;
    const awaitingRecord = (awaiting || []).some(row => row.id === event.id);
    // a notice taking both leagues lists both leagues' applications: each league event counts its own
    const own = applicants && applicants.filter(row => !row.division || !event.division || row.division === event.division);
    return {
      id: event.id, name: draft.name || event.name, noticeId: notice?.id || null,
      heldOn: draft.heldOn || draft.qualifierHeldOn || null, startTime: draft.startTime || draft.qualifierStartTime || null, closesAt: notice?.form?.closesAt || null,
      step: eventStep({ open, bracket, left, awaiting: awaitingRecord }),
      applicants: own ? own.length : null,
      submitted: statuses ? statuses.filter(s => s.hasSubmission).length : null, entrants: statuses ? statuses.length : null,
      late: statuses ? statuses.reduce((n, s) => n + s.lateSubmittedAt.length, 0) : null,
      stage: play?.stage || "", done: play?.done || 0, total: play?.total || 0, left,
      battles: (live || []).filter(b => b.event_id === event.id).length,
      awaiting: awaitingRecord,
    };
  }));
  // the oldest first: an event days past waits longest
  progress.sort((a, b) => String(a.heldOn || "9").localeCompare(String(b.heldOn || "9")));
  return {
    events: progress,
    requests: requests ? requests.filter(row => row.status === "pending") : null,
    battles: live ? live.length : null,
  };
}

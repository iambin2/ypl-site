import { isEventLinked } from "./eventName.js";

/* The times a notice's application must state (2026-11-03): when applications close (form.closesAt, a datetime) and, for a notice
   linked to an event, when it starts (eventDraft.startTime, or qualifierStartTime and finalStartTime for the champions series, as
   "HH:MM"). They live in the notice's data only; the event's held_on stays a date. */

const dayOf = s => {
  const n = String(s || "").match(/\d+/g);
  return n?.length >= 3 ? new Date(+n[0], +n[1] - 1, +n[2]) : null;
};

/* the labels of what an editor still has to fill before saving. A notice whose event is over edits freely. */
export function missingAnnouncementTimes(form, now = new Date()) {
  if (!form?.enabled) return [];
  const d = form.eventDraft || {};
  const champions = d.eventType === "champions";
  const last = dayOf(champions ? d.finalHeldOn || d.qualifierHeldOn || d.heldOn : d.heldOn);
  if (last && last < new Date(now.getFullYear(), now.getMonth(), now.getDate())) return [];
  const out = [];
  if (!form.closesAt) out.push("신청 마감 시각");
  if (isEventLinked(form)) {
    if (champions) {
      if (!d.qualifierStartTime) out.push("선발전 시작 시각");
      if (!d.finalStartTime) out.push("본선 시작 시각");
    } else if (!d.startTime) out.push("시작 시각");
  }
  return out;
}

/* whether a notice's form takes applications right now: on, and its closing time still ahead. A form with no closing time (written
   before the field existed) is not called open, so the board never lights an amber lamp it cannot end. */
export function applicationsOpen(form, now = new Date()) {
  if (!form?.enabled || !form.closesAt) return false;
  const at = new Date(form.closesAt);
  return !Number.isNaN(at.getTime()) && at > now;
}

/* a notice's application has closed: it had a closing time and that time has passed */
export function applicationsClosed(form, now = new Date()) {
  if (!form?.closesAt) return false;
  const at = new Date(form.closesAt);
  return !Number.isNaN(at.getTime()) && at <= now;
}

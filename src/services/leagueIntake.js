export const MASTER_ELIGIBILITY_POLICY = "individual-master-or-rookie-light-champion-v1";

export function isLeagueIntakeDraft(draft = {}) {
  return (draft.eventType || "pokecup") === "pokecup" && !draft.isTeamEvent && draft.division === "both";
}

export function leagueIntakeId(event) {
  return event?.registration_settings?.leagueIntakeId || null;
}

export function leagueIntakeOptions(events = []) {
  const seen = new Set();
  return events.flatMap(event => {
    const intakeId = leagueIntakeId(event);
    if (!intakeId) return [{ value: event.id, event }];
    if (seen.has(intakeId)) return [];
    seen.add(intakeId);
    return [{ value: `intake:${intakeId}`, event, label: event.registration_settings.intakeName || "파이컵 통합 접수" }];
  });
}

export function normalizedAnnouncementDivision(form) {
  const draft = form?.eventDraft || {};
  if (draft.eventType === "champions") return null;
  // Keep historical Light team Events as they were. All new teams are Master.
  if (draft.isTeamEvent) return form?.eventId && draft.division === "light" ? "light" : "master";
  if (draft.division) return draft.division;
  return form?.eventId ? null : "both";
}

function hasEventId(bracket = {}) {
  return Boolean(bracket?.eventId || bracket?.event_id);
}

export function isHistoricalReadOnlyBracket(bracket = {}) {
  return !hasEventId(bracket)
    && bracket?.status === "done"
    && !bracket?.projection?.source;
}

// Historical site_data graphs are presentation-only and never take part in
// Event-linked create, winner, delete, sync, or record-application flows.
export function buildBracketPageList(normalizedBrackets = [], siteBrackets = []) {
  const normalized = (normalizedBrackets || []).filter(Boolean);
  const normalizedIds = new Set(normalized.map(bracket => bracket?.id).filter(Boolean));
  const normalizedEventIds = new Set(normalized.map(bracket => bracket?.eventId).filter(Boolean));
  const historical = (siteBrackets || [])
    .filter(isHistoricalReadOnlyBracket)
    .filter(bracket => !normalizedIds.has(bracket?.id) && !normalizedEventIds.has(bracket?.eventId))
    .map(bracket => ({ ...bracket, historical: true, readOnly: true }));
  return [...normalized, ...historical];
}

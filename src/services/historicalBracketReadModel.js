function hasEventId(bracket = {}) {
  return Boolean(bracket?.eventId || bracket?.event_id);
}

export function isHistoricalReadOnlyBracket(bracket = {}) {
  return !hasEventId(bracket)
    && bracket?.status === "done"
    && !bracket?.projection?.source;
}

function bracketRecency(bracket = {}) {
  return String(
    bracket?.runtimeCreatedAt ||
    bracket?.createdAt ||
    bracket?.created_at ||
    bracket?.applied?.recordAppliedAt ||
    bracket?.date ||
    ""
  );
}

function compareBracketRecency(left, right) {
  const leftRecency = bracketRecency(left);
  const rightRecency = bracketRecency(right);
  if (!leftRecency && !rightRecency) return 0;
  if (!leftRecency) return 1;
  if (!rightRecency) return -1;
  if (leftRecency !== rightRecency) return leftRecency < rightRecency ? 1 : -1;
  return 0;
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
  return [...normalized, ...historical].sort(compareBracketRecency);
}

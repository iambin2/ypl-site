// Evidence for operator review, deliberately not an automatic promotion rule.
export function buildLeagueEligibilityAudit(facts) {
  const players = new Map(facts.players.map(row => [row.id, row]));
  const events = new Map(facts.events.map(row => [row.id, row]));
  const entries = new Map(facts.entries.map(row => [row.id, row]));
  const evidence = new Map();
  const issues = [];
  const add = (playerId, event, kind, detail) => {
    if (!players.has(playerId)) {
      issues.push({ reason: "missing_player", playerId, eventId: event.id });
      return;
    }
    if (!evidence.has(playerId)) evidence.set(playerId, []);
    const list = evidence.get(playerId);
    if (!list.some(row => row.eventId === event.id && row.kind === kind)) {
      list.push({ eventId: event.id, event: event.name, kind, detail });
    }
  };
  for (const participant of facts.entry_participants) {
    const event = events.get(participant.event_id);
    const entry = entries.get(participant.entry_id);
    if (!entry || entry.event_id !== event?.id) {
      issues.push({ reason: "invalid_entry_ownership", participantId: participant.id });
      continue;
    }
    if (entry.entry_type !== (event.is_team_event ? "team" : "individual")) {
      issues.push({ reason: "invalid_entry_type", participantId: participant.id });
      continue;
    }
    if (event.status !== "completed" || event.event_type === "champions" || entry.status !== "active") continue;
    const matches = facts.matches.filter(match => match.event_id === event.id && match.resolution !== "cancelled" && (
      event.is_team_event
        ? ["team_bout", "ace"].includes(match.match_kind) && (match.player_a_id === participant.player_id || match.player_b_id === participant.player_id)
        : match.match_kind === "bracket" && (match.entry_a_id === entry.id || match.entry_b_id === entry.id)
    ));
    if (event.division === "master" && event.event_type !== "light") {
      add(participant.player_id, event, event.is_team_event ? "team_master" : "individual_master", matches.length ? "match" : "entry_only");
    }
    if ((["rookie", "light"].includes(event.division) || event.event_type === "light") && !event.is_team_event) {
      const champion = facts.results.some(result => result.event_id === event.id && result.entry_id === entry.id && result.placement_code === "champion");
      if (champion) add(participant.player_id, event, event.division === "rookie" && event.event_type !== "light" ? "rookie_champion" : "light_champion", "result");
    }
  }
  const duplicateNames = [...new Set(facts.players.map(row => row.display_name))]
    .map(name => ({ name, playerIds: facts.players.filter(row => row.display_name === name).map(row => row.id) }))
    .filter(row => row.playerIds.length > 1);
  const rows = [...evidence].map(([playerId, sources]) => ({
    playerId, name: players.get(playerId).display_name,
    individualMaster: sources.some(row => row.kind === "individual_master"),
    masterMatch: sources.some(row => row.kind === "individual_master" && row.detail === "match"),
    rookieChampion: sources.some(row => row.kind === "rookie_champion"),
    lightChampion: sources.some(row => row.kind === "light_champion"),
    masterEligible: sources.some(row => ["individual_master", "rookie_champion", "light_champion"].includes(row.kind)),
    teamMaster: sources.some(row => row.kind === "team_master"),
    evidence: sources.sort((a, b) => a.event.localeCompare(b.event, "ko") || a.kind.localeCompare(b.kind)),
  })).sort((a, b) => a.name.localeCompare(b.name, "ko") || a.playerId.localeCompare(b.playerId));
  const unconfirmed = facts.players.filter(row => !evidence.has(row.id))
    .map(row => ({ playerId: row.id, name: row.display_name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const summary = {
    masterEligible: rows.filter(row => row.masterEligible).length,
    individualOrRookieChampion: rows.filter(row => row.individualMaster || row.rookieChampion).length,
    masterMatchOrRookieChampion: rows.filter(row => row.masterMatch || row.rookieChampion).length,
    includingTeamMaster: rows.length,
    teamOnly: rows.filter(row => !row.masterEligible).map(row => row.name),
    entryOnlyIndividual: rows.filter(row => row.individualMaster && !row.masterMatch && !row.rookieChampion && !row.lightChampion).map(row => row.name),
    unconfirmed: unconfirmed.length,
  };
  return { summary, duplicateNames, issues, rows, unconfirmed };
}

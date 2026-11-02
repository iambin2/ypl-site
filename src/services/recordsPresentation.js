const asArray = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value || "").trim();
const LABELS = { win: "우승", ru: "준우승", sf: "4강", participant: "참가" };

export function buildTeamPartyPreviewRows(round) {
  if (!round?.team) return [];
  const rows = asArray(round.teamParticipants).map((participant) => {
    const placement = ["win", "ru", "sf"].includes(participant.placement) ? participant.placement : "participant";
    return {
      placement,
      label: `팀 ${LABELS[placement]}`,
      name: clean(participant.name),
      teamName: clean(participant.teamName),
      entryId: participant.entryId,
      playerId: participant.playerId,
      roster: participant.roster || null,
    };
  }).filter((row) => row.name);
  return ["win", "ru", "sf", "participant"].flatMap((placement) => rows.filter((row) => row.placement === placement));
}

export function buildIndividualPartyPreviewRows(round) {
  if (!round || round.team) return [];
  if (Array.isArray(round.individualParticipants)) {
    const rows = round.individualParticipants.map((participant) => {
      const placement = ["win", "ru", "sf"].includes(participant.placement)
        ? participant.placement
        : "participant";
      return {
        placement,
        label: LABELS[placement],
        name: clean(participant.name),
        entryId: participant.entryId || null,
        roster: participant.roster || null,
      };
    }).filter((row) => row.name);
    return ["win", "ru", "sf", "participant"].flatMap((placement) => rows.filter((row) => row.placement === placement));
  }

  const runnerUps = Array.isArray(round.ru)
    ? round.ru
    : String(round.ru || "").split("/").map(clean).filter(Boolean);
  const rows = [];
  if (clean(round.win)) rows.push({ placement: "win", label: "우승", name: clean(round.win), roster: round.partyPreviews?.win?.[0] || null });
  runnerUps.forEach((name, index) => {
    if (clean(name)) rows.push({ placement: "ru", label: "준우승", name: clean(name), roster: round.partyPreviews?.ru?.[index] || null });
  });
  asArray(round.sf).forEach((name, index) => {
    if (clean(name)) rows.push({ placement: "sf", label: "4강", name: clean(name), roster: round.partyPreviews?.sf?.[index] || null });
  });
  return rows;
}

/* The samples of one Pokémon in the official rosters that kept their sets, newest first. An old roster holds names only and has none. */
export function pokemonSamples(rosters, name) {
  return asArray(rosters).flatMap((roster) => {
    const set = asArray(roster.sets)[asArray(roster.pokemon).indexOf(name)];
    return set?.move_1_id ? [{ roster, set }] : [];
  }).sort((a, b) => String(b.roster.date || "").localeCompare(String(a.roster.date || "")));
}

/* How often each item, ability, nature and move appears across those samples, most used first. */
export function sampleUsage(samples) {
  const total = asArray(samples).length;
  const tally = (read) => {
    const counts = new Map();
    for (const { set } of asArray(samples)) for (const id of new Set(read(set).filter(Boolean))) counts.set(id, (counts.get(id) || 0) + 1);
    return [...counts.entries()].map(([id, count]) => ({ id, count, rate: Math.round((count / total) * 100) }))
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  };
  return {
    total,
    items: tally((set) => [set.item_id]),
    abilities: tally((set) => [set.ability_id]),
    natures: tally((set) => [set.nature_id]),
    moves: tally((set) => [set.move_1_id, set.move_2_id, set.move_3_id, set.move_4_id]),
  };
}

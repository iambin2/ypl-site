export function competitionFamily({ eventType, event_type, division } = {}) {
  const type=eventType||event_type||"pokecup";
  if(type==="champions") return "champions";
  if(type==="light"||division==="light") return "light";
  return type==="pokecup"&&(!division||["both","master","rookie"].includes(division))?"regular":null;
}

export function availableChampionshipEditions(editions=[],events=[],battleFormat) {
  if(!["singles","doubles"].includes(battleFormat)) return [];
  return editions.filter(edition=>edition.family==="champions"&&edition.round_number>=7&&
    !events.some(event=>event.competition_edition_id===edition.id&&event.battle_format===battleFormat))
    .sort((a,b)=>b.round_number-a.round_number);
}

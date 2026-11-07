export const APP_VIEWS = new Set(["home", "about", "news", "board", "records", "bracket", "builder", "titles", "champions", "calc", "more", "battle", "privacy", "admin",
  // the battle lab (BattleLabPage.jsx) runs the engine in the browser and exists on the dev server only
  ...(import.meta.env?.DEV ? ["lab"] : [])]);

/* 사이트는 base 경로 하나뿐이다. base 밖(개발 서버 외의 환경)은 판단하지 않는다. */
export function isUnknownPath(pathname, base) {
  return pathname.startsWith(base) && !["", "index.html"].includes(pathname.slice(base.length));
}

/* ?view= 에 없는 화면 이름(옛 링크, 잘못 친 주소)은 홈으로 조용히 바꾸지 않고 404 를 보인다. view 가 없으면 홈이다. */
export function isUnknownView(search = "") {
  const requested = new URLSearchParams(search).get("view");
  return requested != null && !APP_VIEWS.has(requested);
}

export function readInitialAppView(search = "") {
  const requested = new URLSearchParams(search).get("view");
  return APP_VIEWS.has(requested) ? requested : "home";
}

export function builderRouteSearch(eventId, search = "") {
  const params = new URLSearchParams(search);
  params.set("view", "builder");
  if (eventId) params.set("eventId", eventId);
  else params.delete("eventId");
  return `?${params.toString()}`;
}

export function bracketRouteSearch(eventId, search = "") {
  const params = new URLSearchParams(search);
  params.set("view", "bracket");
  if (eventId) params.set("eventId", eventId);
  else params.delete("eventId");
  return `?${params.toString()}`;
}

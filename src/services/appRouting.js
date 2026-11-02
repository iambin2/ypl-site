export const APP_VIEWS = new Set(["home", "about", "news", "board", "records", "bracket", "builder", "titles", "champions", "calc"]);

/* 사이트는 base 경로 하나뿐이다. base 밖(개발 서버 외의 환경)은 판단하지 않는다. */
export function isUnknownPath(pathname, base) {
  return pathname.startsWith(base) && !["", "index.html"].includes(pathname.slice(base.length));
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

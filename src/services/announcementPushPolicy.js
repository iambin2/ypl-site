// 공지 알림 버튼의 상태. ready: 켜고 끌 수 있다, install: iOS라 홈 화면에 추가해야 한다,
// unsupported: 앱 안의 브라우저처럼 푸시가 없는 곳이라 이유를 알려 준다, none: Supabase가 없어 보이지 않는다.
// iOS는 홈 화면에 추가한 앱에서만 PushManager가 생긴다.
export function pushMode({ connected, hasPush, ios, standalone }) {
  if (!connected) return "none";
  if (hasPush) return "ready";
  return ios && !standalone ? "install" : "unsupported";
}

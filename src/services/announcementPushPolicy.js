// 공지 알림 버튼의 세 상태. ready: 켜고 끌 수 있다, install: iOS라 홈 화면에 추가해야 한다, none: 보이지 않는다.
// iOS는 홈 화면에 추가한 앱에서만 PushManager가 생긴다.
export function pushMode({ connected, hasPush, ios, standalone }) {
  if (!connected) return "none";
  if (hasPush) return "ready";
  return ios && !standalone ? "install" : "none";
}

// 공지 알림만 맡는다. fetch를 가로채지 않으므로 캐시도, 배포 새로고침(version.json)과의 충돌도 없다.
self.addEventListener("push", event => {
  const { title, body, url } = event.data.json();
  event.waitUntil(self.registration.showNotification(title, { body, icon: "icon-192.png", data: { url } }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(new URL(event.notification.data.url, self.registration.scope).href));
});

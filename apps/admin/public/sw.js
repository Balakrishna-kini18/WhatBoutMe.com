// Service Worker for WhatBoutMe Admin Web Push Notifications
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = {
        title: 'WhatBoutMe Notification',
        body: event.data.text() || 'You have an important update.',
      };
    }
  }

  const title = data.title || 'WhatBoutMe Admin';
  const actionUrl = data.actionUrl || data.url || data.link || '/';
  const notificationTag = data.notificationTag || data.tag || 'whatboutme-admin-notification';

  const options = {
    body: data.body || data.message || 'You have a new administrative update.',
    icon: data.icon || '/brand/logo-dark.png',
    badge: data.badge || '/brand/icon.png',
    tag: notificationTag,
    data: {
      actionUrl,
      url: actionUrl,
      timestamp: data.timestamp || Date.now(),
    },
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl =
    (event.notification.data && (event.notification.data.actionUrl || event.notification.data.url)) || '/';
  const fullTargetUrl = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (
          client.url &&
          (client.url === fullTargetUrl || client.url.startsWith(fullTargetUrl)) &&
          'focus' in client
        ) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(fullTargetUrl);
      }
    })
  );
});

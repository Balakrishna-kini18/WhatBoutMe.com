// Service Worker for WhatBoutMe Admin Web Push Notifications
self.addEventListener('install', (event) => {
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
    } catch (e) {
      data = {
        title: 'WhatBoutMe Admin Notification',
        body: event.data.text() || 'You have an important update.',
      };
    }
  }

  const title = data.title || 'WhatBoutMe Admin';
  const targetUrl = data.url || data.link || '/';
  const options = {
    body: data.body || data.message || 'You have a new administrative update.',
    icon: data.icon || '/brand/logo-dark.png',
    badge: data.badge || '/brand/icon.png',
    tag: data.tag || 'whatboutme-admin-notification',
    data: {
      url: targetUrl,
      timestamp: data.timestamp || Date.now(),
    },
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/';
  const fullTargetUrl = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && (client.url === fullTargetUrl || client.url.startsWith(fullTargetUrl)) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(fullTargetUrl);
      }
    })
  );
});

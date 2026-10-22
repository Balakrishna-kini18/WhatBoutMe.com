// Service Worker for WhatBoutMe LMS Web Push Notifications
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
        title: 'WhatBoutMe Update',
        body: event.data.text() || 'You have a new notification.',
      };
    }
  }

  const title = data.title || 'WhatBoutMe LMS';
  const options = {
    body: data.body || data.message || 'You have an important update.',
    icon: data.icon || '/brand/logo-dark.png',
    badge: data.badge || '/brand/logo-dark.png',
    tag: data.tag || 'whatboutme-notification',
    data: {
      url: data.url || data.link || '/',
      timestamp: data.timestamp || Date.now(),
    },
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

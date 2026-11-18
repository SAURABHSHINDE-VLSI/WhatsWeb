/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

// Precache static assets built by Vite
precacheAndRoute(self.__WB_MANIFEST || []);

// Handle Web Push event (ZERO plaintext payload)
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || 'New Message';
    const options: NotificationOptions = {
      body: 'You have a new encrypted message',
      icon: '/pwa-192x192.png',
      badge: '/favicon.svg',
      tag: data.messageId || 'editorial-msg',
      data: { url: '/' },
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    event.waitUntil(
      self.registration.showNotification('New Message', {
        body: 'You have a new message',
        icon: '/pwa-192x192.png',
      })
    );
  }
});

// Focus or open window on notification tap
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});

// Skip waiting on skip-waiting signal
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

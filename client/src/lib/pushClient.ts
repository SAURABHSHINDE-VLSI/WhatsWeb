import { apiRequest } from './api';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function isPushNotificationSupported(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function requestAndSubscribePush(): Promise<boolean> {
  if (!(await isPushNotificationSupported())) {
    console.warn('[Push] Web Push is not supported in this environment');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[Push] Notification permission denied');
      return false;
    }

    const reg = await navigator.serviceWorker.ready;
    if (!reg) return false;

    // Fetch VAPID public key
    const { publicKey } = await apiRequest<{ publicKey: string }>('/api/push/vapid-public-key');
    if (!publicKey) return false;

    const applicationServerKey = urlBase64ToUint8Array(publicKey);
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
    });

    // Send subscription to server
    await apiRequest('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify(subscription),
    });

    console.log('[Push] Subscribed to Web Push with ZERO plaintext payload');
    return true;
  } catch (err) {
    console.error('[Push] Subscription failed', err);
    return false;
  }
}

export async function unsubscribePush(): Promise<boolean> {
  if (!(await isPushNotificationSupported())) return false;

  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (subscription) {
      await apiRequest('/api/push/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
    }
    return true;
  } catch (err) {
    console.error('[Push] Unsubscribe error', err);
    return false;
  }
}

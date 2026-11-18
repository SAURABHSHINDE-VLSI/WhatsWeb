import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Return type for useServiceWorkerUpdate hook
 */
export interface UseServiceWorkerUpdateReturn {
  needsUpdate: boolean;
  updateServiceWorker: () => Promise<void>;
}

/**
 * React hook to listen for service worker updates and trigger updates.
 * - Listens for service worker updates via the 'controllerchange' event
 * - Detects waiting service workers and newly installed workers
 * - Provides: { needsUpdate, updateServiceWorker }
 * - updateServiceWorker: calls registration.waiting.postMessage({type:'SKIP_WAITING'}) and reloads
 */
export function useServiceWorkerUpdate(): UseServiceWorkerUpdateReturn {
  const [needsUpdate, setNeedsUpdate] = useState<boolean>(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // Listens for service worker updates via the 'controllerchange' event
    const handleControllerChange = () => {
      setNeedsUpdate(true);
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // Check existing registration and listen for updates
    let updateFoundListener: (() => void) | null = null;
    let installingStateChangeListener: (() => void) | null = null;
    let currentRegistration: ServiceWorkerRegistration | null = null;
    let currentInstallingWorker: ServiceWorker | null = null;

    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return;
      currentRegistration = registration;
      registrationRef.current = registration;

      // If a service worker is already waiting, an update is ready
      if (registration.waiting) {
        setNeedsUpdate(true);
      }

      updateFoundListener = () => {
        const installingWorker = registration.installing;
        if (!installingWorker) return;
        currentInstallingWorker = installingWorker;

        installingStateChangeListener = () => {
          // If the worker has finished installing and there is an active controller,
          // a new update is ready to be activated
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setNeedsUpdate(true);
          }
        };

        installingWorker.addEventListener('statechange', installingStateChangeListener);
      };

      registration.addEventListener('updatefound', updateFoundListener);
    });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      if (currentRegistration && updateFoundListener) {
        currentRegistration.removeEventListener('updatefound', updateFoundListener);
      }
      if (currentInstallingWorker && installingStateChangeListener) {
        currentInstallingWorker.removeEventListener('statechange', installingStateChangeListener);
      }
    };
  }, []);

  const updateServiceWorker = useCallback(async (): Promise<void> => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    try {
      const registration =
        registrationRef.current || (await navigator.serviceWorker.getRegistration());

      if (registration?.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    } catch (error) {
      console.error('Failed to postMessage to waiting service worker:', error);
    }

    // Reload the page to activate the updated service worker and fetch new assets
    window.location.reload();
  }, []);

  return {
    needsUpdate,
    updateServiceWorker,
  };
}

export default useServiceWorkerUpdate;

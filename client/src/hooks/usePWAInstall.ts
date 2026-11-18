import { useState, useEffect, useCallback } from 'react';

/**
 * Standard BeforeInstallPromptEvent interface for Chromium-based browsers
 */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

/**
 * Return type for the usePWAInstall hook
 */
export interface UsePWAInstallReturn {
  canInstall: boolean;
  promptInstall: () => Promise<void>;
  isInstalled: boolean;
  isIOS: boolean;
  showIOSInstructions: boolean;
  iosInstructions: string;
}

export const IOS_INSTALL_INSTRUCTIONS =
  'To install this app on your iOS device, tap the Share button in Safari and select "Add to Home Screen".';

/**
 * Helper to detect iOS devices based on user agent (iPhone, iPad, iPod)
 */
export function checkIsIOS(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent || '';
  const isDirectIOS = /iPhone|iPad|iPod/i.test(ua);
  // Also detect iPadOS desktop mode safari
  const isIPadOS =
    navigator.platform === 'MacIntel' &&
    typeof navigator.maxTouchPoints === 'number' &&
    navigator.maxTouchPoints > 1;

  return isDirectIOS || isIPadOS;
}

/**
 * Helper to check if the app is currently running in standalone (PWA) mode
 */
export function checkIsInstalled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const isStandaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
  const isNavigatorStandalone = Boolean(
    (navigator as unknown as { standalone?: boolean }).standalone
  );
  return isStandaloneMedia || isNavigatorStandalone;
}

// Module-level cache to catch beforeinstallprompt even if dispatched before hook mounts
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
  });

  window.addEventListener('appinstalled', () => {
    globalDeferredPrompt = null;
  });
}

/**
 * React hook to manage PWA installation:
 * - Captures the beforeinstallprompt event on Android/Chrome
 * - Detects iOS devices (iPhone/iPad/iPod)
 * - Detects standalone display mode or navigator.standalone
 * - Provides iOS-specific instructions when on iOS
 * - Calls prompt() to trigger native installation dialog
 */
export function usePWAInstall(): UsePWAInstallReturn {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => globalDeferredPrompt
  );
  const [isIOS] = useState<boolean>(() => checkIsIOS());
  const [isInstalled, setIsInstalled] = useState<boolean>(() => checkIsInstalled());
  const [canInstall, setCanInstall] = useState<boolean>(() => {
    if (isIOS || checkIsInstalled()) return false;
    return globalDeferredPrompt !== null;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Handler for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      globalDeferredPrompt = promptEvent;
      setDeferredPrompt(promptEvent);
      if (!isIOS && !checkIsInstalled()) {
        setCanInstall(true);
      }
    };

    // Handler for appinstalled event
    const handleAppInstalled = () => {
      globalDeferredPrompt = null;
      setDeferredPrompt(null);
      setIsInstalled(true);
      setCanInstall(false);
    };

    // Track display-mode changes
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      const standalone = e.matches || Boolean((navigator as unknown as { standalone?: boolean }).standalone);
      setIsInstalled(standalone);
      if (standalone) {
        setCanInstall(false);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    mediaQuery.addEventListener('change', handleDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      mediaQuery.removeEventListener('change', handleDisplayModeChange);
    };
  }, [isIOS]);

  const promptInstall = useCallback(async (): Promise<void> => {
    if (!deferredPrompt) {
      return;
    }

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsInstalled(true);
        setCanInstall(false);
      }
    } catch (error) {
      console.error('Error invoking PWA installation prompt:', error);
    } finally {
      globalDeferredPrompt = null;
      setDeferredPrompt(null);
      setCanInstall(false);
    }
  }, [deferredPrompt]);

  return {
    canInstall,
    promptInstall,
    isInstalled,
    isIOS,
    showIOSInstructions: isIOS && !isInstalled,
    iosInstructions: IOS_INSTALL_INSTRUCTIONS,
  };
}

export default usePWAInstall;

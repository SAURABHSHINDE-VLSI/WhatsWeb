import { useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  ThemeContext,
  THEME_STORAGE_KEY,
  ThemeProvider,
  type ThemePreference,
  type ResolvedTheme,
  type ThemeContextValue,
} from '../contexts/ThemeContext';

export { THEME_STORAGE_KEY, ThemeProvider };
export type { ThemePreference, ResolvedTheme, ThemeContextValue };

/**
 * Custom hook to access or manage theme preferences.
 * - Re-exports the useTheme hook from ThemeContext for convenience
 * - Manages system preference via matchMedia('(prefers-color-scheme: dark)')
 * - Persists preference to localStorage key 'theme-preference'
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  // Standalone state when hook is used outside ThemeProvider
  const [standaloneTheme, setStandaloneTheme] = useState<ThemePreference>(() => {
    if (typeof window === 'undefined') return 'system';
    try {
      const stored =
        localStorage.getItem(THEME_STORAGE_KEY) ||
        localStorage.getItem('editorial_theme_preference');
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored;
      }
    } catch {
      // Ignore localStorage read errors
    }
    return 'system';
  });

  const [systemDark, setSystemDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Track system preference changes
  useEffect(() => {
    if (context || typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemDark(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [context]);

  const standaloneResolvedTheme: ResolvedTheme = useMemo(() => {
    if (standaloneTheme === 'system') {
      return systemDark ? 'dark' : 'light';
    }
    return standaloneTheme;
  }, [standaloneTheme, systemDark]);

  // Update HTML class, data-theme attribute, and meta theme-color tag for standalone mode
  useEffect(() => {
    if (context || typeof document === 'undefined') return;
    const root = document.documentElement;

    if (standaloneResolvedTheme === 'dark') {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
    }

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute(
        'content',
        standaloneResolvedTheme === 'dark' ? '#14120E' : '#F6F2EA'
      );
    }
  }, [context, standaloneResolvedTheme]);

  const setStandaloneThemeHandler = useCallback((newTheme: ThemePreference) => {
    setStandaloneTheme(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {
      // Ignore localStorage write errors
    }
  }, []);

  const toggleStandaloneTheme = useCallback(() => {
    setStandaloneThemeHandler(standaloneResolvedTheme === 'dark' ? 'light' : 'dark');
  }, [standaloneResolvedTheme, setStandaloneThemeHandler]);

  // When used inside ThemeProvider, return the context value
  if (context) {
    return context;
  }

  // Otherwise, return standalone theme management
  return {
    theme: standaloneTheme,
    resolvedTheme: standaloneResolvedTheme,
    setTheme: setStandaloneThemeHandler,
    toggleTheme: toggleStandaloneTheme,
  };
}

export default useTheme;

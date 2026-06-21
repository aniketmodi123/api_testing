import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { applyPreset, DEFAULT_PREFERENCES, loadPreferences } from '../themes/index.js';
import { loadCustomThemes } from '../themes/customTheme.js';
import { api } from '../api.js';

const ThemeCtx = createContext({
  preferences: DEFAULT_PREFERENCES,
  setPreference: () => {},
  // Legacy compat — components using useTheme().theme still work
  theme: 'dark',
  setTheme: () => {},
  isDarkMode: true,
  activeServerTheme: null,
  setActiveServerTheme: () => {},
});

export function ThemeProvider({ children }) {
  const [preferences, setPreferences] = useState(() => loadPreferences());
  // The currently active backend-saved theme's token_map (or null). Logged-out users
  // never populate this — they stay on the localStorage custom-theme path below.
  const [activeServerTheme, setActiveServerTheme] = useState(null);
  const fetchedActiveRef = useRef(false);

  // On mount, ask the backend for the user's active custom theme so it survives across
  // devices. A logged-out user has no `username`/`token` in localStorage — api.js still
  // sends the request, but the backend returns 400 "User not found"; we swallow that and
  // fall through to the existing localStorage custom-theme fallback, never breaking the UI.
  useEffect(() => {
    if (fetchedActiveRef.current) return;
    fetchedActiveRef.current = true;

    let cancelled = false;
    api.get('/themes/active', { _skipAuthRefresh: true })
      .then((res) => {
        if (cancelled) return;
        const theme = res?.data?.data?.theme;
        if (theme?.token_map) {
          setActiveServerTheme(theme.token_map);
          setPreferences((prev) => ({ ...prev, customTheme: theme.name }));
        }
      })
      .catch(() => {
        // Logged out, network error, or no active theme — localStorage fallback below
        // already covers this; nothing else to do.
      });

    return () => { cancelled = true; };
  }, []);

  // Re-resolve the base preset on every preference change, then re-apply the active
  // theme's token_map on top. Server-saved active theme takes priority (cross-device
  // source of truth); falls back to the localStorage custom theme when logged out or
  // when no server theme is active.
  useEffect(() => {
    applyPreset(preferences);

    if (activeServerTheme) {
      const root = document.documentElement;
      for (const [k, v] of Object.entries(activeServerTheme)) {
        root.style.setProperty(k, v);
      }
      return;
    }

    if (preferences.customTheme) {
      const customTheme = loadCustomThemes().find((t) => t.name === preferences.customTheme);
      if (customTheme) {
        const root = document.documentElement;
        for (const [k, v] of Object.entries(customTheme.token_map)) {
          root.style.setProperty(k, v);
        }
      }
    }
  }, [preferences, activeServerTheme]);

  const setPreference = useCallback((key, value) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  }, []);

  // Legacy shim so existing useTheme() callers keep working unchanged
  const setTheme = useCallback((theme) => setPreference('theme', theme), [setPreference]);

  return (
    <ThemeCtx.Provider
      value={{
        preferences,
        setPreference,
        theme: preferences.theme,
        setTheme,
        isDarkMode: preferences.theme !== 'light',
        activeServerTheme,
        setActiveServerTheme,
      }}
    >
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeCtx);
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'pims_theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The order the top-bar toggle steps through. */
export const THEMES = ['system', 'light', 'dark'];

function loadTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

/** Only an explicit choice is stored; "system" clears the key. */
function saveTheme(theme) {
  try {
    if (theme === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (private mode): the choice lasts for this page only.
  }
}

const systemPrefersDark = () => window.matchMedia(DARK_QUERY).matches;

const ThemeContext = createContext(null);

/**
 * Light / dark / system theme (GP2 addition).
 *
 * The palette lives entirely in styles.css: an explicit choice sets
 * data-theme on <html>, and "system" removes it so the stylesheet's
 * prefers-color-scheme block decides. The inline script in index.html applies a
 * stored choice before React mounts, so there is no flash of the light theme.
 */
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(loadTheme);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Follow the OS while on "system" (and keep the resolved value current).
  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    const onChange = (e) => setSystemDark(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);

    // The browser's own chrome (mobile address bar) takes the ground colour
    // of whichever palette is now showing, read back from the stylesheet.
    const ground = getComputedStyle(root).getPropertyValue('--ground').trim();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && ground) meta.setAttribute('content', ground);
  }, [theme, resolvedTheme]);

  const setTheme = useCallback((next) => {
    saveTheme(next);
    setThemeState(next);
  }, []);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

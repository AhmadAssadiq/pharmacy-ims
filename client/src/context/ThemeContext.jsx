// Light / dark / system colour theme (GP2 addition). Any component can read it with:
//   const { theme, resolvedTheme, setTheme } = useTheme();
//
// The colours themselves are all in styles.css. Choosing light or dark sets
// data-theme="light|dark" on <html>; "system" removes it, so the stylesheet follows the
// computer's own setting (prefers-color-scheme). index.html applies a saved choice before
// the page is drawn, so a dark-theme user never sees a flash of white.
import { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'pims_theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

// The order the top-bar button steps through
export const THEMES = ['system', 'light', 'dark'];

// The saved choice, or 'system' when nothing is saved
function loadSavedTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  } catch {
    // localStorage can be blocked (private mode)
  }
  return 'system';
}

// Saves the choice. "system" is the default, so it is saved by removing the key.
function saveTheme(theme) {
  try {
    if (theme === 'system') {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, theme);
    }
  } catch {
    // The choice lasts for this visit only
  }
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  // What the user chose: 'system', 'light' or 'dark'
  const [theme, setThemeState] = useState(loadSavedTheme);
  // Whether the computer itself is in dark mode
  const [computerIsDark, setComputerIsDark] = useState(() => window.matchMedia(DARK_QUERY).matches);

  // Follow the computer's setting when it changes
  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY);
    function handleChange(event) {
      setComputerIsDark(event.matches);
    }
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  // What is actually showing: 'light' or 'dark' ("system" becomes one of these)
  let resolvedTheme = theme;
  if (theme === 'system') {
    resolvedTheme = computerIsDark ? 'dark' : 'light';
  }

  // Apply the theme to the page
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }

    // Colour the browser's own bar (on phones) with the page's background colour
    const background = getComputedStyle(root).getPropertyValue('--ground').trim();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && background) {
      meta.setAttribute('content', background);
    }
  }, [theme, resolvedTheme]);

  function setTheme(newTheme) {
    saveTheme(newTheme);
    setThemeState(newTheme);
  }

  return <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>;
}

// Reads the theme from any component inside <ThemeProvider>
export function useTheme() {
  return useContext(ThemeContext);
}

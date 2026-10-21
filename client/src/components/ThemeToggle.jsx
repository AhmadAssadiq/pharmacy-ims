import { THEMES, useTheme } from '../context/ThemeContext';

const ICONS = {
  system: (
    <>
      <rect x="2" y="3" width="12" height="8.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 14h5M8 11.5V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  light: (
    <>
      <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </>
  ),
  dark: (
    <path
      d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  ),
};

const LABELS = { system: 'System', light: 'Light', dark: 'Dark' };

/**
 * Top-bar theme switch: one button that steps system -> light -> dark. Its
 * accessible name states the mode in force, including what "system" resolves
 * to, and the icon shows the same thing.
 */
export default function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  const current = theme === 'system' ? `${LABELS.system} (${LABELS[resolvedTheme].toLowerCase()})` : LABELS[theme];
  const label = `Theme: ${current}. Switch to ${LABELS[next].toLowerCase()}`;

  return (
    <button type="button" className="btn btn--ghost btn--icon" onClick={() => setTheme(next)} aria-label={label} title={label}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        {ICONS[theme]}
      </svg>
    </button>
  );
}

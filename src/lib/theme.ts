export type Theme = 'dark' | 'light';

export function getTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

export function isLightTheme(): boolean {
  return getTheme() === 'light';
}

export function setTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.remove('dark', 'light');
  document.documentElement.classList.add(theme);
  try {
    window.localStorage.setItem('voidterm-theme', theme);
  } catch {
    // Storage may be unavailable; the class change still applies.
  }
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

export function scanlinesEnabled(): boolean {
  if (typeof document === 'undefined') return true;
  return !document.documentElement.classList.contains('no-scanlines');
}

export function toggleScanlines(): boolean {
  if (typeof document === 'undefined') return true;
  const enabled = document.documentElement.classList.toggle('no-scanlines');
  try {
    window.localStorage.setItem('voidterm-scanlines', enabled ? 'off' : 'on');
  } catch {
    // Non-fatal.
  }
  return !enabled;
}

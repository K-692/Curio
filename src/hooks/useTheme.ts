import { useEffect, useState } from 'preact/hooks';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'curio.theme';

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(read);
  const [dark, setDark] = useState(() => (pref === 'system' ? systemDark() : pref === 'dark'));

  useEffect(() => {
    const root = document.documentElement;
    if (pref === 'system') delete root.dataset.theme;
    else root.dataset.theme = pref;
    try {
      if (pref === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, pref);
    } catch {
      /* storage unavailable */
    }
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const sync = () => setDark(pref === 'system' ? !!mq?.matches : pref === 'dark');
    sync();
    mq?.addEventListener?.('change', sync);
    return () => mq?.removeEventListener?.('change', sync);
  }, [pref]);

  useEffect(() => {
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#000000' : '#ffffff'));
  }, [dark]);

  /** Cycles to the opposite of what is currently shown. */
  const toggle = () => setPref(dark ? 'light' : 'dark');
  return { pref, dark, setPref, toggle };
}

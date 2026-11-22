import { useEffect, useState } from 'preact/hooks';

export type Route = 'feed' | 'history' | 'polymath' | 'add' | 'admin' | 'about';
const ROUTES: Route[] = ['feed', 'history', 'polymath', 'add', 'admin', 'about'];
const BASE = import.meta.env.BASE_URL; // '/Curio/'

/** Clean path URLs: /Curio/, /Curio/history, … (GitHub Pages serves 404.html = the app for deep links). */
export const href = (r: Route) => (r === 'feed' ? BASE : `${BASE}${r}`);

function parse(): Route {
  const rest = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : '';
  const r = rest.split('/')[0];
  return (ROUTES as string[]).includes(r) ? (r as Route) : 'feed';
}

const listeners = new Set<() => void>();
export function navigate(r: Route, replace = false) {
  const url = href(r);
  if (url !== location.pathname) history[replace ? 'replaceState' : 'pushState'](null, '', url);
  listeners.forEach((l) => l());
}

// Old hash links (#/history) → clean paths.
if (location.hash.startsWith('#/')) {
  const r = location.hash.slice(2).split(/[/?]/)[0];
  history.replaceState(null, '', (ROUTES as string[]).includes(r) ? href(r as Route) : BASE);
}

// Intercept same-app link clicks so navigation never reloads the page.
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element).closest?.('a');
  if (!a || a.target || a.hasAttribute('download') || a.origin !== location.origin || !a.pathname.startsWith(BASE)) return;
  if (a.hash && a.pathname === location.pathname) return; // in-page anchor
  e.preventDefault();
  if (a.pathname !== location.pathname) history.pushState(null, '', a.pathname);
  listeners.forEach((l) => l());
});

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => {
      setRoute(parse());
      window.dispatchEvent(new Event('curio:navigate'));
    };
    listeners.add(on);
    window.addEventListener('popstate', on);
    return () => {
      listeners.delete(on);
      window.removeEventListener('popstate', on);
    };
  }, []);
  return route;
}

import { useEffect, useState } from 'preact/hooks';

export type Route = 'feed' | 'history' | 'add' | 'admin' | 'about';
const ROUTES: Route[] = ['feed', 'history', 'add', 'admin', 'about'];

function parse(): Route {
  const r = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return (ROUTES as string[]).includes(r) ? (r as Route) : 'feed';
}

export const href = (r: Route) => (r === 'feed' ? '#/' : `#/${r}`);

/** Hash routing: works on GitHub Pages without a 404 fallback. */
export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

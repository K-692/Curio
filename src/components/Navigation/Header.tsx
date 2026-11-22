import { useEffect, useRef, useState } from 'preact/hooks';
import type { User } from 'firebase/auth';
import { href, type Route } from '../../hooks/useRoute';
import type { useTheme } from '../../hooks/useTheme';
import { signOut } from '../../services/auth';
import { Logo } from '../Logo';
import { IconFeed, IconHistory, IconSun, IconMoon, IconInfo, IconRadar } from '../Icons';

interface Props {
  route: Route;
  theme: ReturnType<typeof useTheme>;
  user?: User;
  isAdmin?: boolean;
}

/** Minimal header: brand on the left, theme + profile on the right. No bar, no tabs. */
export function Header({ route, theme, user }: Props) {
  return (
    <header class={`topbar${route === 'feed' ? ' over-feed' : ''}`}>
      <a class="brand" href={href('feed')} aria-label="Curio — back to the feed">
        <Logo size={30} />
        <span class="wordmark">Curio</span>
      </a>
      <div class="actions">
        <button type="button" class="iconbtn" onClick={theme.toggle} aria-label={theme.dark ? 'Switch to light mode' : 'Switch to dark mode'} title={theme.dark ? 'Light mode' : 'Dark mode'}>
          {theme.dark ? <IconSun /> : <IconMoon />}
        </button>
        {user ? <ProfileMenu user={user} /> : (
          <a href={href('about')} class="iconbtn" aria-label="About Curio"><IconInfo /></a>
        )}
      </div>
    </header>
  );
}

function ProfileMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); }
    };
    const onHash = () => setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('curio:navigate', onHash);
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('curio:navigate', onHash);
    };
  }, [open]);

  const onMenuKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <div class="menu-wrap" ref={root}>
      <button ref={btn} type="button" class="iconbtn avatar" aria-haspopup="menu" aria-expanded={open} aria-label="Profile menu" onClick={() => setOpen((o) => !o)}>
        {user.photoURL ? <img src={user.photoURL} alt="" width={30} height={30} referrerPolicy="no-referrer" /> : <IconInfo />}
      </button>
      {open && (
        <div class="menu" role="menu" aria-label="Profile" onKeyDown={onMenuKey}>
          <div class="menu-head">
            <strong>{user.displayName}</strong>
            <span class="muted">{user.email}</span>
          </div>
          <a role="menuitem" href={href('feed')}><IconFeed size={18} /> Discover</a>
          <a role="menuitem" href={href('history')}><IconHistory size={18} /> Watched history</a>
          <a role="menuitem" href={href('polymath')}><IconRadar size={18} /> Polymath</a>
          <a role="menuitem" href={href('about')}><IconInfo size={18} /> About & privacy</a>
          <button role="menuitem" type="button" onClick={() => signOut()}>Sign out</button>
        </div>
      )}
    </div>
  );
}

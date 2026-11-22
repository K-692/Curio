import type { User } from 'firebase/auth';
import { href, type Route } from '../../hooks/useRoute';
import type { useTheme } from '../../hooks/useTheme';
import { Logo } from '../Logo';
import { IconFeed, IconHistory, IconPlus, IconShield, IconSun, IconMoon, IconInfo } from '../Icons';

interface Props {
  route: Route;
  theme: ReturnType<typeof useTheme>;
  user?: User;
  isAdmin?: boolean;
}

export function Header({ route, theme, user, isAdmin }: Props) {
  const links: { r: Route; label: string; Icon: typeof IconFeed }[] = user
    ? [
        { r: 'feed', label: 'Discover', Icon: IconFeed },
        { r: 'history', label: 'History', Icon: IconHistory },
        { r: 'add', label: 'Suggest', Icon: IconPlus },
        ...(isAdmin ? [{ r: 'admin' as Route, label: 'Curate', Icon: IconShield }] : []),
      ]
    : [];
  return (
    <header class="topbar">
      <a class="brand" href={href('feed')} aria-label="Curio home">
        <Logo size={28} />
        <span class="wordmark">Curio</span>
      </a>
      <nav aria-label="Primary" class="nav">
        {links.map(({ r, label, Icon }) => (
          <a key={r} href={href(r)} class="navlink" aria-current={route === r ? 'page' : undefined}>
            <Icon />
            <span class="navlabel">{label}</span>
          </a>
        ))}
      </nav>
      <div class="actions">
        <button type="button" class="iconbtn" onClick={theme.toggle} aria-label={theme.dark ? 'Switch to light mode' : 'Switch to dark mode'} title={theme.dark ? 'Light mode' : 'Dark mode'}>
          {theme.dark ? <IconSun /> : <IconMoon />}
        </button>
        <a href={href('about')} class="iconbtn avatar" aria-label={user ? 'Account, privacy and about' : 'About Curio'} aria-current={route === 'about' ? 'page' : undefined}>
          {user?.photoURL ? <img src={user.photoURL} alt="" width={28} height={28} referrerPolicy="no-referrer" /> : <IconInfo />}
        </a>
      </div>
    </header>
  );
}

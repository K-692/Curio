import { useState } from 'preact/hooks';
import { signInWithGoogle } from '../services/auth';
import { friendlyAuthError } from '../app/App';
import type { useTheme } from '../hooks/useTheme';
import { Logo } from './Logo';
import { IconGoogle, IconSun, IconMoon } from './Icons';
import { href } from '../hooks/useRoute';

export function SignIn({ theme, initialError }: { theme: ReturnType<typeof useTheme>; initialError?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(initialError ?? '');
  const go = async () => {
    setBusy(true);
    setErr('');
    try {
      await signInWithGoogle();
    } catch (e) {
      setErr(friendlyAuthError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main class="signin" id="main">
      <button type="button" class="iconbtn corner" onClick={theme.toggle} aria-label={theme.dark ? 'Switch to light mode' : 'Switch to dark mode'}>
        {theme.dark ? <IconSun /> : <IconMoon />}
      </button>
      <div class="signin-card">
        <Logo size={120} label="Curio logo" />
        <h1 class="title">Curio</h1>
        <p class="tagline">Short videos from every corner of human knowledge.<br />Always a surprise.</p>
        <button type="button" class="btn btn-primary btn-lg" onClick={go} disabled={busy} aria-busy={busy}>
          <span class="gbadge"><IconGoogle /></span>
          {busy ? 'Signing in…' : 'Continue with Google'}
        </button>
        {err && <p class="error" role="alert">{err}</p>}
        <p class="fine">
          We store only your Google name, avatar and the videos you watch, so we don't repeat them. No likes, no profiles, no tracking.{' '}
          <a href={href('about')}>Privacy</a>
        </p>
      </div>
    </main>
  );
}

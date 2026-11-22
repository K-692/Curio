import { useEffect, useRef, useState } from 'preact/hooks';
import { signInWithGoogle } from '../services/auth';
import { friendlyAuthError } from '../app/App';
import type { useTheme } from '../hooks/useTheme';
import { Logo } from './Logo';
import { IconGoogle, IconSun, IconMoon } from './Icons';
import { href } from '../hooks/useRoute';

const BG = `${import.meta.env.BASE_URL}media/login-bg`;

/** Research-backed numbers (polymath psychology), kept to one line each. */
const STATS = [
  { n: '2+', t: 'extra fields the average Nobel laureate seriously pursued' },
  { n: '6,000+', t: 'athletes studied: the best sampled widely before specialising' },
  { n: '20 → 20', t: 'years to build narrow expertise, months for it to go stale' },
];

const EDGES = ['Borrow ideas across fields', 'Stay adaptable', 'Own a rare mix of skills'];

export function SignIn({ theme, initialError }: { theme: ReturnType<typeof useTheme>; initialError?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(initialError ?? '');
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Respect reduced-motion: show the still frame instead of the loop.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) video.current?.pause();
    else video.current?.play().catch(() => {});
  }, []);

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
      <video ref={video} class="signin-bg" src={`${BG}.mp4`} poster={`${BG}.jpg`} autoplay muted loop playsInline preload="auto" aria-hidden="true" tabIndex={-1} />
      <div class="signin-veil" aria-hidden="true" />
      <button type="button" class="iconbtn corner" onClick={theme.toggle} aria-label={theme.dark ? 'Switch to light mode' : 'Switch to dark mode'}>
        {theme.dark ? <IconSun /> : <IconMoon />}
      </button>

      <div class="signin-wrap">
        <section class="hero">
          <Logo size={88} label="Curio logo" />
          <h1 class="title">Curio</h1>
          <p class="tagline">Shorts that make you a polymath.</p>
          <button type="button" class="btn btn-primary btn-lg" onClick={go} disabled={busy} aria-busy={busy}>
            <span class="gbadge"><IconGoogle /></span>
            {busy ? 'Signing in…' : 'Continue with Google'}
          </button>
          {err && <p class="error" role="alert">{err}</p>}
        </section>

        <section class="pitch" aria-label="Why Curio">
          <p class="pitch-line">
            Same endless swipe as YouTube Shorts — <strong>minus the algorithm trap.</strong>
            <br />Every swipe is a new field, never the same one twice in a row.
          </p>
          <p class="pitch-def"><strong>Polymath</strong> · someone who masters many fields. Science says it’s an unfair advantage:</p>
          <ul class="stats">
            {STATS.map((s) => (
              <li key={s.n} class="stat">
                <span class="stat-n">{s.n}</span>
                <span class="stat-l">{s.t}</span>
              </li>
            ))}
          </ul>
          <ul class="edges" aria-label="Polymath advantages">
            {EDGES.map((e) => <li key={e}>{e}</li>)}
          </ul>
          <p class="fine">
            You’re not late. You’re loading. · Only your name, avatar and watch history are stored. <a href={href('about')}>Privacy</a>
          </p>
        </section>
      </div>
    </main>
  );
}

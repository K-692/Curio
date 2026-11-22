import { useState } from 'preact/hooks';
import { signInWithGoogle } from '../services/auth';
import { friendlyAuthError } from '../app/App';
import type { useTheme } from '../hooks/useTheme';
import { Logo } from './Logo';
import { IconGoogle, IconSun, IconMoon } from './Icons';
import { href } from '../hooks/useRoute';
import { TOPICS } from '../app/topics';

const STATS = [
  { n: '2+', label: 'separate fields the average Nobel laureate seriously pursued outside their prize-winning work', src: 'Root-Bernstein, study of Nobel laureates' },
  { n: '6,000+', label: 'athletes analysed: the world-class ones sampled several sports first and specialised later', src: 'Güllich, Macnamara & Hambrick, 2022' },
  { n: '20 → 20', label: 'a specialist’s map can take 20 years to build — and turn wrong in 20 months when the field shifts', src: 'Cognitive entrenchment, Erik Dane' },
  { n: '15', label: 'fields of knowledge Curio rotates through, so your next idea can come from anywhere', src: 'Curio' },
];

const ADVANTAGES = [
  { t: 'Import ideas', d: 'A principle from biology, a trick from game design, a structure from storytelling — carried across fields, it solves problems the specialists inside can’t see. Psychologists call it far transfer.' },
  { t: 'Immunity to rigidity', d: 'Deep expertise in one lane hardens into a cage. Every time you start fresh in a new field you train the rarest skill of all: adaptability.' },
  { t: 'Own an intersection', d: 'Being the world’s best at one thing is a race with millions. Being good at two or three and combining them is a race with one entrant — you.' },
];

const PRINCIPLES = [
  { t: 'Finish things', d: 'Don’t just collect interests. In each field, make one real thing.' },
  { t: 'Build bridges on purpose', d: 'After learning anything, ask: where else does this apply?' },
  { t: 'Go deep in seasons', d: 'Sample widely, then give one interest your focus at a time.' },
];

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
  const cta = (
    <button type="button" class="btn btn-primary btn-lg" onClick={go} disabled={busy} aria-busy={busy}>
      <span class="gbadge"><IconGoogle /></span>
      {busy ? 'Signing in…' : 'Continue with Google'}
    </button>
  );

  return (
    <main class="signin" id="main">
      <button type="button" class="iconbtn corner" onClick={theme.toggle} aria-label={theme.dark ? 'Switch to light mode' : 'Switch to dark mode'}>
        {theme.dark ? <IconSun /> : <IconMoon />}
      </button>

      <section class="hero">
        <Logo size={112} label="Curio logo" />
        <h1 class="title">Curio</h1>
        <p class="tagline">Become a polymath, one short video at a time.</p>
        {cta}
        {err && <p class="error" role="alert">{err}</p>}
        <button type="button" class="scroll-hint" onClick={() => document.getElementById('polymath')?.scrollIntoView({ behavior: 'smooth' })}>
          What’s a polymath? ↓
        </button>
      </section>

      <section class="story" id="polymath" aria-labelledby="pm-what">
        <p class="kicker">The polymath</p>
        <h2 id="pm-what">Your many interests aren’t a distraction. They’re an unfair advantage.</h2>
        <p class="lead">
          A <strong>polymath</strong> seriously pursues many fields across a lifetime. We’re told to pick one lane — but when researchers opened the
          biographies of the most creative people who ever lived, they found the opposite: minds that refused to close doors, and won <em>because</em> of it.
        </p>

        <ul class="stats">
          {STATS.map((s) => (
            <li key={s.n} class="stat">
              <span class="stat-n">{s.n}</span>
              <span class="stat-l">{s.label}</span>
              <span class="stat-s">{s.src}</span>
            </li>
          ))}
        </ul>

        <p class="quote">Slow early progress wasn’t the mark of those who fell behind — it was the signature of those playing the longest game.<br /><strong>You are not late. You are loading.</strong></p>

        <h3>Three unfair advantages</h3>
        <ol class="cards3">
          {ADVANTAGES.map((a, i) => (
            <li key={a.t} class="card3">
              <span class="card3-n">0{i + 1}</span>
              <strong>{a.t}</strong>
              <p>{a.d}</p>
            </li>
          ))}
        </ol>

        <h3>Three habits that make breadth compound</h3>
        <ol class="cards3 compact">
          {PRINCIPLES.map((p, i) => (
            <li key={p.t} class="card3">
              <span class="card3-n">0{i + 1}</span>
              <strong>{p.t}</strong>
              <p>{p.d}</p>
            </li>
          ))}
        </ol>

        <h3>How Curio makes you one</h3>
        <ul class="bullets how">
          <li><strong>Always a surprise.</strong> A shuffled cycle through all {TOPICS.length} fields — never more than 2 videos in a row from one.</li>
          <li><strong>No algorithmic bubble.</strong> No likes, no interest profile, nothing that narrows what you see.</li>
          <li><strong>See your range grow.</strong> Your Polymath chart maps how your watch time spreads across every field.</li>
        </ul>
        <div class="chips" aria-label="Fields in Curio">
          {TOPICS.map((t) => <span key={t.slug} class="chip">{t.name}</span>)}
        </div>

        <div class="final">
          <Logo size={56} />
          <p>The world will keep asking you to shrink into a label. You’re allowed to decline.</p>
          {cta}
          <p class="fine">
            We store only your Google name, avatar and the videos you watch, so we don't repeat them. No likes, no profiles, no tracking.{' '}
            <a href={href('about')}>Privacy</a>
          </p>
        </div>
      </section>
    </main>
  );
}

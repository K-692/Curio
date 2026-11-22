import { useEffect, useState } from 'preact/hooks';
import { auth } from '../services/firebase';
import { onAuthStateChanged, ensureProfile, completeRedirect, type User } from '../services/auth';
import { useRoute } from '../hooks/useRoute';
import { useTheme } from '../hooks/useTheme';
import { Header } from '../components/Navigation/Header';
import { SignIn } from '../components/SignIn';
import { Feed } from '../components/Feed/Feed';
import { History } from '../components/History/History';
import { AddVideo } from '../components/Add/AddVideo';
import { Admin } from '../components/Admin/Admin';
import { About } from '../components/About';
import { Polymath } from '../components/Polymath';
import { Logo } from '../components/Logo';

type AuthState = { status: 'loading' } | { status: 'out'; error?: string } | { status: 'in'; user: User; isAdmin: boolean };

export function App() {
  const [st, setSt] = useState<AuthState>({ status: 'loading' });
  const route = useRoute();
  const theme = useTheme();

  useEffect(() => {
    completeRedirect().catch((e) => setSt({ status: 'out', error: friendlyAuthError(e) }));
    return onAuthStateChanged(auth, async (user) => {
      if (!user) return setSt((s) => (s.status === 'out' ? s : { status: 'out' }));
      setSt({ status: 'in', user, isAdmin: false });
      try {
        const { isAdmin } = await ensureProfile(user);
        setSt({ status: 'in', user, isAdmin });
      } catch {
        /* profile write failure must not block the feed */
      }
    });
  }, []);

  if (st.status === 'loading') {
    return (
      <div class="splash" role="status" aria-live="polite">
        <Logo size={72} />
        <span class="sr-only">Loading Curio…</span>
      </div>
    );
  }
  if (st.status === 'out') {
    return route === 'about' ? (
      <div class="shell">
        <Header route={route} theme={theme} />
        <main id="main" class="page"><About user={null} /></main>
      </div>
    ) : (
      <SignIn theme={theme} initialError={st.error} />
    );
  }

  const { user, isAdmin } = st;
  return (
    <div class="shell">
      <a class="skip" href="#main">Skip to content</a>
      <Header route={route} theme={theme} user={user} isAdmin={isAdmin} />
      <main id="main" class={route === 'feed' ? 'main-feed' : 'page'} tabIndex={-1}>
        {route === 'feed' && <Feed key={user.uid} uid={user.uid} />}
        {route === 'history' && <History uid={user.uid} />}
        {route === 'polymath' && <Polymath uid={user.uid} />}
        {route === 'add' && <AddVideo uid={user.uid} isAdmin={isAdmin} />}
        {route === 'admin' && (isAdmin ? <Admin uid={user.uid} /> : <p>Curators only.</p>)}
        {route === 'about' && <About user={user} />}
      </main>
    </div>
  );
}

export function friendlyAuthError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return 'Sign-in was cancelled.';
  if (code === 'auth/unauthorized-domain') return 'This site is not yet authorised for Google sign-in.';
  if (code === 'auth/network-request-failed') return 'Network error. Check your connection and try again.';
  if (code === 'auth/user-disabled') return 'This account has been disabled.';
  return 'Could not sign in. Please try again.';
}

import { useState } from 'preact/hooks';
import type { User } from 'firebase/auth';
import { signOut, deleteAccount } from '../services/auth';
import { Logo } from './Logo';

export function About({ user }: { user: User | null }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const del = async () => {
    if (!user) return;
    setBusy(true);
    setErr('');
    try {
      await deleteAccount(user);
      location.hash = '#/';
    } catch {
      setErr('Could not delete your account. Sign in again and retry.');
      setBusy(false);
    }
  };
  return (
    <section class="about" aria-labelledby="about-title">
      <div class="about-head">
        <Logo size={56} />
        <h1 id="about-title">About Curio</h1>
      </div>
      <p>Curio is a discovery feed for short educational videos. Instead of learning what you like and showing you more of it, Curio deliberately rotates through every field of knowledge — physics to poetry, history to harmony — so each video is a surprise.</p>
      <ul class="bullets">
        <li>Every topic is visited once per shuffled cycle before any repeats.</li>
        <li>Never more than two videos in a row from the same field.</li>
        <li>No likes, follows, comments or interest profiles.</li>
      </ul>

      {user && (
        <div class="account">
          <h2>Your account</h2>
          <p class="row">
            {user.photoURL && <img src={user.photoURL} alt="" width={36} height={36} class="avatar-lg" referrerPolicy="no-referrer" />}
            <span>{user.displayName}<br /><span class="muted">{user.email}</span></span>
          </p>
          <div class="row">
            <button type="button" class="btn" onClick={() => signOut()}>Sign out</button>
            {!confirm && <button type="button" class="btn btn-ghost" onClick={() => setConfirm(true)}>Delete account & data</button>}
          </div>
          {confirm && (
            <div class="confirm" role="alertdialog" aria-labelledby="del-t">
              <p id="del-t">This permanently deletes your watched history, feed state and account. It cannot be undone.</p>
              <div class="row">
                <button type="button" class="btn btn-primary" onClick={del} disabled={busy}>{busy ? 'Deleting…' : 'Delete permanently'}</button>
                <button type="button" class="btn btn-ghost" onClick={() => setConfirm(false)}>Cancel</button>
              </div>
            </div>
          )}
          {err && <p class="error" role="alert">{err}</p>}
        </div>
      )}

      <h2 id="privacy">Privacy</h2>
      <p>When you sign in with Google, Curio stores:</p>
      <ul class="bullets">
        <li>Your account ID, display name and avatar URL (from Google).</li>
        <li>The IDs, titles and timestamps of videos you watched for at least 5 seconds — your <a href="#/history">Watched history</a>.</li>
        <li>Your feed position, so a refresh doesn't reshuffle your queue.</li>
        <li>Links you suggest, until a curator reviews them.</li>
      </ul>
      <p>Watched history is private to you, used only to avoid repeats, and never used to rank or narrow what you see. You can remove entries, clear it, or delete your account at any time. Videos play through the official YouTube and Instagram players, which are subject to those platforms' own privacy policies. Curio uses no analytics or ad trackers.</p>
      <p class="muted">Basic operational logs are kept by Google Firebase as part of running the service.</p>
    </section>
  );
}

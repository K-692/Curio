import { useEffect, useState } from 'preact/hooks';
import type { HistoryEntry } from '../../app/types';
import { topicName } from '../../app/topics';
import { getHistoryPage, deleteHistoryItem, clearAllHistory, type HistoryCursor } from '../../services/history';
import { loadFeedState, saveFeedState } from '../../services/feed';
import { providerLabel } from '../Feed/Slide';
import { IconTrash } from '../Icons';

const fmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function History({ uid }: { uid: string }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [cursor, setCursor] = useState<HistoryCursor>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [confirming, setConfirming] = useState(false);

  const load = async (from: HistoryCursor) => {
    setLoading(true);
    setErr('');
    try {
      const { entries: page, next } = await getHistoryPage(uid, from);
      setEntries((e) => (from ? [...e, ...page] : page));
      setCursor(next);
      setHasMore(!!next);
    } catch {
      setErr('Could not load your history.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(null); }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (id: string, title: string) => {
    const prev = entries;
    setEntries((e) => e.filter((x) => x.id !== id));
    try {
      await deleteHistoryItem(uid, id);
      setMsg(`Removed “${title}” from history.`);
    } catch {
      setEntries(prev);
      setErr('Could not remove that entry.');
    }
  };

  const clearAll = async () => {
    setConfirming(false);
    setLoading(true);
    try {
      await clearAllHistory(uid);
      const s = await loadFeedState(uid);
      s.recent = [];
      await saveFeedState(uid, s);
      setEntries([]);
      setHasMore(false);
      setMsg('Watched history cleared.');
    } catch {
      setErr('Could not clear history. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section class="history" aria-labelledby="h-title">
      <div class="page-head">
        <h1 id="h-title">Watched history</h1>
        {entries.length > 0 && !confirming && (
          <button type="button" class="btn btn-ghost" onClick={() => setConfirming(true)}><IconTrash size={18} /> Clear all</button>
        )}
      </div>
      <p class="muted">Private to you. Used only so Curio doesn't repeat videos — never to narrow what you see.</p>
      {confirming && (
        <div class="confirm" role="alertdialog" aria-labelledby="c-t">
          <p id="c-t">Delete your entire watched history? This cannot be undone.</p>
          <div class="row">
            <button type="button" class="btn btn-primary" onClick={clearAll}>Delete all</button>
            <button type="button" class="btn btn-ghost" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </div>
      )}
      <div class="sr-only" aria-live="polite">{msg}</div>
      {err && <p class="error" role="alert">{err}</p>}
      {!loading && !entries.length && !err && <p class="empty">Nothing yet. Videos you watch for 5 seconds or more show up here.</p>}
      <ul class="hgrid">
        {entries.map((e) => (
          <li key={e.id} class="hcard">
            <a href={e.canonicalUrl} target="_blank" rel="noopener noreferrer" class="hcard-link" aria-label={`${e.title} — open on ${providerLabel(e.provider)} (new tab)`}>
              {e.thumbnailUrl ? <img src={e.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span class="hcard-blank">{providerLabel(e.provider)}</span>}
              <span class="hcard-info">
                <span class="hcard-topic">{topicName(e.topic)}</span>
                <span class="hcard-title">{e.title}</span>
                {e.watchedAt && <time class="hcard-time" dateTime={e.watchedAt.toISOString()}>{fmt.format(e.watchedAt)}</time>}
              </span>
            </a>
            <button type="button" class="hcard-remove" onClick={() => remove(e.id, e.title)} aria-label={`Remove “${e.title}” from history`}><IconTrash size={16} /></button>
          </li>
        ))}
      </ul>
      {loading && <p role="status" class="muted">Loading…</p>}
      {hasMore && !loading && <button type="button" class="btn" onClick={() => load(cursor)}>Load more</button>}
    </section>
  );
}

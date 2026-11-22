import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { FeedItem } from '../../app/types';
import { loadFeedState, saveFeedState, nextBatch, rememberWatched, type FeedState } from '../../services/feed';
import { recordWatched } from '../../services/history';
import { BATCH_SIZE } from '../../services/engine';
import { Slide } from './Slide';
import { IconUp, IconDown, IconSoundOn, IconSoundOff, IconShuffle } from '../Icons';

/** Queue thresholds (blueprint §6). */
const REFILL_AT = 5;
const MAX_RETRIES = 6;

type Status = 'loading' | 'ready' | 'empty' | 'error';

export function Feed({ uid }: { uid: string }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<Status>('loading');
  const [refilling, setRefilling] = useState(false);
  const [muted, setMuted] = useState(true);
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [announce, setAnnounce] = useState('');

  const stateRef = useRef<FeedState | null>(null);
  const itemsRef = useRef<FeedItem[]>([]);
  const activeRef = useRef(0);
  const fetching = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const retries = useRef(0);
  const retryTimer = useRef<number | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);
  const exhausted = useRef(false);
  const watched = useRef(new Set<string>());
  const scroller = useRef<HTMLDivElement>(null);

  itemsRef.current = items;
  activeRef.current = active;

  const persist = useCallback((delay = 3000) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const s = stateRef.current;
      if (!s) return;
      s.queue = itemsRef.current.slice(activeRef.current);
      saveFeedState(uid, s).catch(() => {});
    }, delay);
  }, [uid]);

  const refill = useCallback(async (force = false) => {
    const s = stateRef.current;
    if (!s || fetching.current) return;
    const upcoming = itemsRef.current.length - 1 - activeRef.current;
    if (!force && upcoming > REFILL_AT) return;
    if (!force && exhausted.current) return;
    fetching.current = true;
    setRefilling(true);
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const res = await nextBatch(s, itemsRef.current.map((i) => i.id), ctl.signal);
      if (ctl.signal.aborted) return;
      retries.current = 0;
      exhausted.current = res.items.length === 0;
      const known = new Set(itemsRef.current.map((i) => i.id));
      const fresh = res.items.filter((i) => !known.has(i.id));
      const next = [...itemsRef.current, ...fresh];
      itemsRef.current = next;
      setItems(next);
      setStatus(next.length ? 'ready' : 'empty');
      persist(0);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      if (!itemsRef.current.length) setStatus('error');
      // Bounded exponential backoff with jitter.
      if (retries.current < MAX_RETRIES) {
        const wait = Math.min(30000, 1000 * 2 ** retries.current++) * (0.75 + Math.random() * 0.5);
        clearTimeout(retryTimer.current);
        retryTimer.current = window.setTimeout(() => refill(true), wait);
      }
    } finally {
      fetching.current = false;
      setRefilling(false);
    }
  }, [persist]);

  // Initial load: restore the persisted queue so a refresh doesn't reshuffle it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await loadFeedState(uid);
        if (cancelled) return;
        stateRef.current = s;
        const restored = s.queue.filter((i) => i && i.id && i.provider);
        itemsRef.current = restored;
        setItems(restored);
        if (restored.length) setStatus('ready');
        if (restored.length < BATCH_SIZE + 1) await refill(true);
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      abort.current?.abort();
      clearTimeout(retryTimer.current);
      // Flush the queue pointer on leave (sign-out/navigation clears in-memory state).
      if (saveTimer.current !== undefined && stateRef.current) {
        clearTimeout(saveTimer.current);
        stateRef.current.queue = itemsRef.current.slice(activeRef.current);
        saveFeedState(uid, stateRef.current).catch(() => {});
      }
    };
  }, [uid, refill]);

  // Track the active slide via IntersectionObserver.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.6) {
            const idx = Number((e.target as HTMLElement).dataset.index);
            if (!Number.isNaN(idx)) setActive(idx);
          }
        }
      },
      { root, threshold: [0.6] },
    );
    root.querySelectorAll('.slide').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items.length]);

  // On advance: refill in background, persist pointer.
  useEffect(() => {
    if (!items.length) return;
    refill();
    persist();
    const it = items[active];
    if (it) setAnnounce(`Video ${active + 1}: ${it.title}`);
  }, [active, items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Foreground / connectivity checks.
  useEffect(() => {
    const onVis = () => document.visibilityState === 'visible' && refill();
    const onOnline = () => { setOnline(true); retries.current = 0; refill(true); };
    const onOffline = () => setOnline(false);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refill]);

  const go = useCallback((delta: number) => {
    const root = scroller.current;
    if (!root) return;
    const target = Math.max(0, Math.min(itemsRef.current.length, activeRef.current + delta));
    const el = root.querySelector<HTMLElement>(`.slide[data-index="${target}"]`);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, []);

  // Keyboard navigation (not while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'j') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'k') { e.preventDefault(); go(-1); }
      else if (e.key === 'm') setMuted((m) => !m);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const onWatched = useCallback((item: FeedItem, seconds: number) => {
    if (watched.current.has(item.id)) return;
    watched.current.add(item.id);
    if (stateRef.current) rememberWatched(stateRef.current, item.id);
    recordWatched(uid, item, seconds).catch(() => watched.current.delete(item.id));
  }, [uid]);

  const upcoming = Math.max(0, items.length - 1 - active);
  const atEnd = active >= items.length;

  if (status === 'loading' && !items.length) {
    return (
      <div class="feed-state" role="status" aria-live="polite">
        <div class="skeleton-card" aria-hidden="true" />
        <p>Picking ten surprises…</p>
      </div>
    );
  }
  if (status === 'error' && !items.length) {
    return (
      <div class="feed-state" role="alert">
        <p>{online ? 'Could not load the feed.' : 'You are offline.'}</p>
        <button class="btn" type="button" onClick={() => { retries.current = 0; refill(true); }}>Try again</button>
      </div>
    );
  }
  if (status === 'empty' && !items.length) {
    return (
      <div class="feed-state" role="status">
        <p>The catalogue is empty for now.</p>
        <p class="muted">Suggest a video to get Curio started.</p>
        <a class="btn" href="#/add">Suggest a video</a>
      </div>
    );
  }

  return (
    <div class="feed">
      <div class="sr-only" aria-live="polite">{announce}</div>
      <div class="feed-scroller" ref={scroller} aria-label="Discovery feed" role="region">
        {items.map((it, i) => (
          <Slide
            key={it.id}
            item={it}
            index={i}
            total={items.length}
            active={i === active}
            warm={i === active + 1}
            muted={muted}
            onWatched={onWatched}
            onSkip={() => go(1)}
            onUnmute={() => setMuted(false)}
          />
        ))}
        {(
          <section class="slide slide-end" data-index={items.length} aria-label="End of queue">
            {refilling ? (
              <p role="status">Finding more surprises…</p>
            ) : !online ? (
              <p role="alert">You're offline. Reconnect to keep exploring.</p>
            ) : (
              <div class="end-box">
                <p>You've seen everything available right now.</p>
                <button class="btn" type="button" onClick={() => { exhausted.current = false; retries.current = 0; refill(true); }}>
                  <IconShuffle size={18} /> Surprise me again
                </button>
              </div>
            )}
          </section>
        )}
      </div>
      <div class="feed-controls" role="group" aria-label="Feed controls">
        <button type="button" class="iconbtn round" onClick={() => go(-1)} disabled={active === 0} aria-label="Previous video"><IconUp /></button>
        <button type="button" class="iconbtn round" onClick={() => setMuted((m) => !m)} aria-pressed={!muted} aria-label={muted ? 'Unmute' : 'Mute'}>
          {muted ? <IconSoundOff /> : <IconSoundOn />}
        </button>
        <button type="button" class="iconbtn round" onClick={() => go(1)} disabled={atEnd} aria-label="Next video"><IconDown /></button>
        <span class="queue-pill" title="Recommendations ready" aria-label={`${upcoming} recommendations ready`}>{Math.min(upcoming, 99)}</span>
      </div>
      {!online && <div class="toast" role="status">Offline — playing what's already queued</div>}
      {online && refilling && upcoming < 2 && !atEnd && <div class="toast" role="status">Loading more…</div>}
    </div>
  );
}

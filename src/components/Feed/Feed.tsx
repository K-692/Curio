import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { FeedItem } from '../../app/types';
import { loadFeedState, saveFeedState, nextBatch, rememberWatched, getCatalog, alignWithCatalog, type FeedState } from '../../services/feed';
import { recordWatched } from '../../services/history';
import { createStatsBuffer } from '../../services/stats';
import { sharedIdFromPath, loadSharedItem, shareItem } from '../../services/share';
import { BATCH_SIZE } from '../../services/engine';
import { Slide } from './Slide';
import { IconUp, IconDown, IconShuffle, IconShare } from '../Icons';

/** Queue thresholds (blueprint §6). */
const REFILL_AT = 5;
/** How many upcoming items get a buffered (paused, muted) player. */
const PRELOAD = 3;
const MAX_RETRIES = 6;

type Status = 'loading' | 'ready' | 'empty' | 'error';

export function Feed({ uid }: { uid: string }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<Status>('loading');
  const [refilling, setRefilling] = useState(false);
  const [muted, setMuted] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
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
  const stats = useMemo(() => createStatsBuffer(uid), [uid]);
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && stats.flush();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      stats.flush();
    };
  }, [stats]);
  const onTopicSecond = useCallback((item: FeedItem, first: boolean) => {
    if (first) stats.countVideo();
    stats.addSecond(item.topic, item.topicName);
  }, [stats]);

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
  const init = useCallback(async () => {
    retries.current = 0;
    exhausted.current = false;
    setStatus((st) => (itemsRef.current.length ? st : 'loading'));
    try {
      if (!stateRef.current) {
        const [s, catalog] = await Promise.all([loadFeedState(uid), getCatalog()]);
        alignWithCatalog(s, catalog.version);
        stateRef.current = s;
        let restored = s.queue.filter((i) => i && i.id && i.provider);
        // Opened from a shared Curio link: play that video first, then continue the feed.
        const sharedId = sharedIdFromPath();
        if (sharedId) {
          const shared = await loadSharedItem(sharedId);
          if (shared) restored = [shared, ...restored.filter((i) => i.id !== shared.id)];
          history.replaceState(null, '', import.meta.env.BASE_URL);
        }
        itemsRef.current = restored;
        setItems(restored);
        if (restored.length) setStatus('ready');
      }
      // Active item + 10 upcoming: a second batch tops up the first.
      if (itemsRef.current.length < BATCH_SIZE + 1) await refill(true);
      if (itemsRef.current.length < BATCH_SIZE + 1 && !exhausted.current) await refill(true);
    } catch {
      setStatus('error');
    }
  }, [uid, refill]);

  useEffect(() => {
    init();
    return () => {
      abort.current?.abort();
      clearTimeout(retryTimer.current);
      // Flush the queue pointer on leave (sign-out/navigation clears in-memory state).
      if (saveTimer.current !== undefined && stateRef.current) {
        clearTimeout(saveTimer.current);
        stateRef.current.queue = itemsRef.current.slice(activeRef.current);
        saveFeedState(uid, stateRef.current).catch(() => {});
      }
    };
  }, [uid, init]);

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
    // Snap-position check: on phones the observer can lag behind fast swipes, so also
    // activate the slide the feed has snapped to as soon as scrolling settles.
    let raf = 0;
    const snapCheck = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = root.clientHeight || 1;
        const idx = Math.round(root.scrollTop / h);
        if (Math.abs(root.scrollTop - idx * h) < h * 0.08) setActive(idx);
      });
    };
    root.addEventListener('scroll', snapCheck, { passive: true });
    root.addEventListener('scrollend', snapCheck);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      root.removeEventListener('scroll', snapCheck);
      root.removeEventListener('scrollend', snapCheck);
    };
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
    // Scroll only the feed container (scrollIntoView would also scroll the page shell).
    if (el) root.scrollTo({ top: el.offsetTop, behavior: reduce ? 'auto' : 'smooth' });
  }, []);

  // Keyboard navigation (not while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'j') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'k') { e.preventDefault(); go(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  // Sound is on by default. If the browser blocked it (no interaction yet), the first tap/key unlocks it.
  useEffect(() => {
    if (!soundBlocked) return;
    const unlock = () => { setSoundBlocked(false); setMuted(false); };
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    window.addEventListener('keydown', unlock, { once: true, capture: true });
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true });
      window.removeEventListener('keydown', unlock, { capture: true });
    };
  }, [soundBlocked]);
  const onSoundBlocked = useCallback(() => { setMuted(true); setSoundBlocked(true); }, []);
  const unmute = useCallback(() => { setSoundBlocked(false); setMuted(false); }, []);
  const onMutedChange = useCallback((m: boolean) => {
    setMuted(m);
    if (!m) setSoundBlocked(false);
  }, []);

  const onWatched = useCallback((item: FeedItem, seconds: number) => {
    if (watched.current.has(item.id)) return;
    watched.current.add(item.id);
    if (stateRef.current) rememberWatched(stateRef.current, item.id);
    recordWatched(uid, item, seconds).catch(() => watched.current.delete(item.id));
    persist();
  }, [uid, persist]);

  const [toast, setToast] = useState('');
  const toastTimer = useRef<number | undefined>(undefined);
  const onShare = useCallback(async () => {
    const it = itemsRef.current[activeRef.current];
    if (!it) return;
    const r = await shareItem(it);
    const msg = r === 'copied' ? 'Link copied — paste it anywhere' : r === 'failed' ? 'Could not share this video' : '';
    if (!msg) return;
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2500);
  }, []);

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
        <button class="btn" type="button" onClick={() => init()}>Try again</button>
      </div>
    );
  }
  if (status === 'empty' && !items.length) {
    return (
      <div class="feed-state" role="status">
        <p>The catalogue is empty for now.</p>
        <p class="muted">New videos arrive from YouTube a few times a day.</p>
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
            preload={i > active && i <= active + PRELOAD}
            muted={muted}
            onWatched={onWatched}
            onSkip={() => go(1)}
            onSoundBlocked={onSoundBlocked}
            onMutedChange={onMutedChange}
            onUnmute={unmute}
            onTopicSecond={onTopicSecond}
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
        <button type="button" class="iconbtn round" onClick={() => go(1)} disabled={atEnd} aria-label="Next video"><IconDown /></button>
        <button type="button" class="iconbtn round" onClick={onShare} disabled={atEnd} aria-label="Share this video"><IconShare /></button>
        <span class="sr-only" aria-live="polite">{`${upcoming} recommendations ready`}</span>
      </div>
      {!atEnd && (
        <button type="button" class="share-fab" onClick={onShare} aria-label="Share this video"><IconShare size={22} /></button>
      )}
      {toast && <div class="toast" role="status">{toast}</div>}
      {!online && <div class="toast" role="status">Offline — playing what's already queued</div>}
      {online && refilling && upcoming < 2 && !atEnd && <div class="toast" role="status">Loading more…</div>}
    </div>
  );
}

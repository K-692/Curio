import { useEffect, useRef, useState } from 'preact/hooks';
import type { FeedItem } from '../../app/types';
import { loadAdapter, type PlayerHandle } from '../../providers/types';

interface Props {
  item: FeedItem;
  /** On screen. When false the player is preloaded: buffered, paused and muted. */
  active: boolean;
  muted: boolean;
  onUnavailable(reason: string): void;
  onEnded(): void;
  onSoundBlocked(): void;
}

/**
 * One official provider player. The feed mounts it for the active item and the next few
 * (preload window) and destroys it when the item leaves that window.
 */
export function Player({ item, active, muted, onUnavailable, onEnded, onSoundBlocked }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<PlayerHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [gesture, setGesture] = useState(false);
  const live = useRef({ active, muted, onUnavailable, onEnded, onSoundBlocked });
  live.current = { active, muted, onUnavailable, onEnded, onSoundBlocked };

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    const el = host.current!;
    loadAdapter(item.provider)
      .then((a) =>
        a.mount(el, item, {
          onReady: () => !cancelled && setReady(true),
          onUnavailable: (r) => !cancelled && live.current.onUnavailable(r),
          onEnded: () => !cancelled && live.current.onEnded(),
          onSoundBlocked: () => !cancelled && live.current.onSoundBlocked(),
        }, { active: live.current.active, withSound: !live.current.muted }),
      )
      .then((h) => {
        if (cancelled) return h.destroy();
        handle.current = h;
        setGesture(h.supportsGestureLayer);
      })
      .catch(() => !cancelled && live.current.onUnavailable('The player could not load'));
    return () => {
      cancelled = true;
      handle.current?.destroy();
      handle.current = null;
    };
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Becoming visible / leaving the screen.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (active) handle.current?.activate(!live.current.muted);
    else handle.current?.deactivate();
  }, [active]);

  useEffect(() => {
    if (active) handle.current?.setMuted(muted);
  }, [muted, active, ready]);

  return (
    <div class="player">
      {!ready && item.thumbnailUrl && <img class="poster under" src={item.thumbnailUrl} alt="" referrerPolicy="no-referrer" />}
      {!ready && active && <div class="spinner" role="status"><span class="sr-only">Loading video</span></div>}
      <div class="player-host" ref={host} aria-hidden={active ? undefined : 'true'} />
      {gesture && ready && active && (
        // Transparent layer so swipes/wheel scroll the feed; leaves the provider's control bar uncovered.
        <button type="button" class="gesture" aria-label="Play or pause" onClick={() => handle.current?.togglePlay()} />
      )}
    </div>
  );
}

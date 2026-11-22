import { useEffect, useRef, useState } from 'preact/hooks';
import type { FeedItem } from '../../app/types';
import { loadAdapter, type PlayerHandle } from '../../providers/types';
import { IconSoundOff } from '../Icons';

interface Props {
  item: FeedItem;
  muted: boolean;
  onUnavailable(reason: string): void;
  onEnded(): void;
  onUnmute(): void;
}

/**
 * Mounts exactly one official provider player for the active item and disposes it on leave.
 * Only the active slide renders this component, so at most one third-party player exists.
 */
export function Player({ item, muted, onUnavailable, onEnded, onUnmute }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<PlayerHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [gesture, setGesture] = useState(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    const el = host.current!;
    loadAdapter(item.provider)
      .then((a) =>
        a.mount(el, item, {
          onReady: () => !cancelled && setReady(true),
          onUnavailable: (r) => !cancelled && onUnavailable(r),
          onEnded: () => !cancelled && onEnded(),
        }, { muted: mutedRef.current }),
      )
      .then((h) => {
        if (cancelled) return h.destroy();
        handle.current = h;
        setGesture(h.supportsGestureLayer);
      })
      .catch(() => !cancelled && onUnavailable('The player could not load'));
    return () => {
      cancelled = true;
      handle.current?.destroy();
      handle.current = null;
    };
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    handle.current?.setMuted?.(muted);
  }, [muted, ready]);

  return (
    <div class="player">
      {!ready && item.thumbnailUrl && <img class="poster under" src={item.thumbnailUrl} alt="" referrerPolicy="no-referrer" />}
      {!ready && <div class="spinner" role="status"><span class="sr-only">Loading video</span></div>}
      <div class="player-host" ref={host} />
      {gesture && ready && (
        // Transparent layer so swipes/wheel scroll the feed; leaves the provider's control bar uncovered.
        <button type="button" class="gesture" aria-label="Play or pause" onClick={() => handle.current?.togglePlay?.()} />
      )}
      {gesture && ready && muted && (
        <button type="button" class="unmute" onClick={onUnmute}>
          <IconSoundOff size={18} /> Tap for sound
        </button>
      )}
    </div>
  );
}

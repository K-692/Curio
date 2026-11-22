import { useEffect, useRef, useState } from 'preact/hooks';
import type { FeedItem } from '../../app/types';
import { topicName } from '../../app/topics';
import { WATCH_THRESHOLD_SECONDS } from '../../services/history';
import { Player } from '../Player/Player';
import { IconExternal } from '../Icons';

interface Props {
  item: FeedItem;
  index: number;
  total: number;
  active: boolean;
  /** Next item: preload only its lightweight thumbnail. */
  warm: boolean;
  muted: boolean;
  onWatched(item: FeedItem, seconds: number): void;
  onSkip(): void;
  onUnmute(): void;
}

export const providerLabel = (p: FeedItem['provider']) => (p === 'youtube' ? 'YouTube' : 'Instagram');

export function Slide({ item, index, total, active, warm, muted, onWatched, onSkip, onUnmute }: Props) {
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const seconds = useRef(0);

  // Count visible, active seconds; record a watch at the threshold (blueprint §7).
  useEffect(() => {
    if (!active || unavailable) return;
    seconds.current = 0;
    const t = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      seconds.current += 1;
      if (seconds.current === WATCH_THRESHOLD_SECONDS) onWatched(item, seconds.current);
    }, 1000);
    return () => clearInterval(t);
  }, [active, unavailable, item, onWatched]);

  const eager = active || warm;
  return (
    <section class={`slide${active ? ' is-active' : ''}`} data-index={index} aria-roledescription="video" aria-label={`${index + 1} of ${total}: ${item.title}`}>
      <div class="frame">
        <div class="stage">
          {active && !unavailable ? (
            <Player item={item} muted={muted} onUnavailable={setUnavailable} onEnded={() => onWatched(item, seconds.current)} onUnmute={onUnmute} />
          ) : unavailable ? (
            <div class="fallback" role="alert">
              <p>{unavailable}.</p>
              <a class="btn" href={item.canonicalUrl} target="_blank" rel="noopener noreferrer">
                Open on {providerLabel(item.provider)} <IconExternal size={16} />
              </a>
              <button type="button" class="btn btn-ghost" onClick={onSkip}>Skip</button>
            </div>
          ) : (
            <Poster item={item} eager={eager} />
          )}
        </div>
        <div class="meta">
          <span class="chip">{topicName(item.topic)}</span>
          <h2 class="vtitle">{item.title}</h2>
          <p class="vsub">
            {item.creatorName && <span>{item.creatorName}</span>}
            <a href={item.canonicalUrl} target="_blank" rel="noopener noreferrer" class="srclink">
              {providerLabel(item.provider)} <IconExternal size={14} />
              <span class="sr-only">(opens in new tab)</span>
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}

function Poster({ item, eager }: { item: FeedItem; eager: boolean }) {
  return item.thumbnailUrl ? (
    <img class="poster" src={item.thumbnailUrl} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" />
  ) : (
    <div class="poster poster-blank" aria-hidden="true">{providerLabel(item.provider)}</div>
  );
}

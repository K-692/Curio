import { useEffect, useRef, useState } from 'preact/hooks';
import type { FeedItem } from '../../app/types';
import { WATCH_THRESHOLD_SECONDS } from '../../services/history';
import { Player } from '../Player/Player';
import { IconExternal } from '../Icons';

interface Props {
  item: FeedItem;
  index: number;
  total: number;
  active: boolean;
  /** Within the preload window: mount a paused, buffering player. */
  preload: boolean;
  muted: boolean;
  onWatched(item: FeedItem, seconds: number): void;
  onSkip(): void;
  onSoundBlocked(): void;
  onMutedChange(muted: boolean): void;
  onUnmute(): void;
  /** One second of real (playing, visible) watch time for this item. */
  onTopicSecond(item: FeedItem, first: boolean): void;
}

export const providerLabel = (p: FeedItem['provider']) => (p === 'youtube' ? 'YouTube' : 'Instagram');

export function Slide({ item, index, total, active, preload, muted, onWatched, onSkip, onSoundBlocked, onMutedChange, onUnmute, onTopicSecond }: Props) {
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const seconds = useRef(0);

  useEffect(() => {
    if (active) seconds.current = 0;
    else setPlaying(false);
  }, [active]);

  // Count seconds that are actually playing on a visible tab: drives the watched-history
  // threshold (blueprint §7) and per-topic watch time for the Polymath chart.
  useEffect(() => {
    if (!active || unavailable || !playing) return;
    const t = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      seconds.current += 1;
      onTopicSecond(item, seconds.current === 1);
      if (seconds.current === WATCH_THRESHOLD_SECONDS) onWatched(item, seconds.current);
    }, 1000);
    return () => clearInterval(t);
  }, [active, unavailable, playing, item, onWatched, onTopicSecond]);

  return (
    <section class={`slide${active ? ' is-active' : ''}`} data-index={index} aria-roledescription="video" aria-label={`${index + 1} of ${total}: ${item.title}`}>
      <div class="stage">
        {unavailable ? (
          <div class="fallback" role={active ? 'alert' : undefined}>
            <p>{unavailable}.</p>
            <a class="btn" href={item.canonicalUrl} target="_blank" rel="noopener noreferrer">
              Open on {providerLabel(item.provider)} <IconExternal size={16} />
            </a>
            <button type="button" class="btn btn-ghost" onClick={onSkip}>Skip</button>
          </div>
        ) : active || preload ? (
          <Player item={item} active={active} muted={muted} onUnavailable={setUnavailable} onEnded={() => onWatched(item, seconds.current)} onSoundBlocked={onSoundBlocked} onMutedChange={onMutedChange} onUnmute={onUnmute} onPlayingChange={setPlaying} />
        ) : item.thumbnailUrl ? (
          <img class="poster" src={item.thumbnailUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
        ) : (
          <div class="poster poster-blank" aria-hidden="true">{providerLabel(item.provider)}</div>
        )}
      </div>
    </section>
  );
}

import type { FeedItem } from '../app/types';

export interface PlayerEvents {
  onReady(): void;
  /** Content cannot be embedded / was removed / failed to load. */
  onUnavailable(reason: string): void;
  onEnded(): void;
  onPlayingChange?(playing: boolean): void;
}

export interface PlayerHandle {
  destroy(): void;
  togglePlay?(): void;
  setMuted?(muted: boolean): void;
  /** Whether the app may overlay a gesture layer (provider exposes play/pause control). */
  readonly supportsGestureLayer: boolean;
}

export interface ProviderAdapter {
  mount(host: HTMLElement, item: FeedItem, events: PlayerEvents, opts: { muted: boolean }): Promise<PlayerHandle>;
}

/** Provider code is loaded on demand (dynamic import) only when an item of that kind becomes active. */
export async function loadAdapter(provider: FeedItem['provider']): Promise<ProviderAdapter> {
  if (provider === 'youtube') return (await import('./youtube')).default;
  return (await import('./instagram')).default;
}

import type { FeedItem } from '../app/types';

export interface PlayerEvents {
  onReady(): void;
  /** Content cannot be embedded / was removed / failed to load. */
  onUnavailable(reason: string): void;
  onEnded(): void;
  /** The browser refused to start playback with sound; playing muted instead. */
  onSoundBlocked(): void;
}

export interface PlayerHandle {
  /** Start (or resume from the top) as the visible item. */
  activate(withSound: boolean): void;
  /** Pause and mute: used for preloaded (buffered) items that are not on screen. */
  deactivate(): void;
  setMuted(muted: boolean): void;
  togglePlay(): void;
  destroy(): void;
  /** Whether the app may overlay a gesture layer (provider exposes play/pause control). */
  readonly supportsGestureLayer: boolean;
}

export interface ProviderAdapter {
  /** `active=false` mounts the player in preload mode: it buffers the start of the video, paused and muted. */
  mount(host: HTMLElement, item: FeedItem, events: PlayerEvents, opts: { active: boolean; withSound: boolean }): Promise<PlayerHandle>;
}

/** Provider code is loaded on demand (dynamic import) only when an item of that kind is mounted. */
export async function loadAdapter(provider: FeedItem['provider']): Promise<ProviderAdapter> {
  if (provider === 'youtube') return (await import('./youtube')).default;
  return (await import('./instagram')).default;
}

import type { ProviderAdapter, PlayerHandle } from '../types';

/* Minimal typings for the official YouTube IFrame Player API. */
interface YTPlayer {
  destroy(): void;
  playVideo(): void;
  pauseVideo(): void;
  mute(): void;
  unMute(): void;
  getPlayerState(): number;
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: unknown) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;
function loadApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      reject(new Error('YouTube player failed to load'));
    };
    document.head.appendChild(s);
  });
  return apiPromise;
}

const ERRORS: Record<number, string> = {
  2: 'Invalid video',
  5: 'This video cannot play in the browser player',
  100: 'Video removed or private',
  101: 'The creator does not allow embedding',
  150: 'The creator does not allow embedding',
};

const youtube: ProviderAdapter = {
  async mount(host, item, events, { muted }) {
    const YT = await loadApi();
    const el = document.createElement('div');
    host.appendChild(el);
    let destroyed = false;
    const player = new YT.Player(el, {
      host: 'https://www.youtube-nocookie.com',
      videoId: item.providerVideoId,
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 1,
        mute: muted ? 1 : 0,
        playsinline: 1,
        controls: 1,
        rel: 0,
        loop: 1,
        playlist: item.providerVideoId,
        cc_load_policy: 1,
        origin: location.origin,
      },
      events: {
        onReady: () => {
          if (destroyed) return;
          if (muted) player.mute();
          player.playVideo();
          events.onReady();
        },
        onError: (e: { data: number }) => !destroyed && events.onUnavailable(ERRORS[e.data] ?? 'Video unavailable'),
        onStateChange: (e: { data: number }) => {
          if (destroyed) return;
          if (e.data === 0) events.onEnded();
          if (e.data === 1) events.onPlayingChange?.(true);
          if (e.data === 2) events.onPlayingChange?.(false);
        },
      },
    });
    const handle: PlayerHandle = {
      supportsGestureLayer: true,
      destroy() {
        destroyed = true;
        try {
          player.destroy();
        } catch {
          /* already gone */
        }
        host.replaceChildren();
      },
      togglePlay() {
        try {
          if (player.getPlayerState() === 1) player.pauseVideo();
          else player.playVideo();
        } catch {
          /* not ready */
        }
      },
      setMuted(m) {
        try {
          if (m) player.mute();
          else player.unMute();
        } catch {
          /* not ready */
        }
      },
    };
    return handle;
  },
};

export default youtube;

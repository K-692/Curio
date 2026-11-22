import type { ProviderAdapter, PlayerHandle } from '../types';

/* Minimal typings for the official YouTube IFrame Player API. */
interface YTPlayer {
  destroy(): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(s: number, allowSeekAhead: boolean): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
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

const PLAYING = 1;
const BUFFERING = 3;

const youtube: ProviderAdapter = {
  async mount(host, item, events, opts) {
    const YT = await loadApi();
    const el = document.createElement('div');
    host.appendChild(el);

    let destroyed = false;
    let ready = false;
    let active = opts.active;
    let wantSound = opts.withSound;
    let primed = false; // preload: paused once buffering has started
    let blockTimer: number | undefined;
    let guardUntil = 0; // window after an unmuted start in which an unexpected pause means "blocked"
    let userPaused = false;

    const fallbackMuted = () =>
      safe(() => {
        guardUntil = 0;
        clearTimeout(blockTimer);
        player.mute();
        player.playVideo();
        events.onSoundBlocked();
      });

    const safe = (fn: () => void) => {
      if (destroyed || !ready) return;
      try {
        fn();
      } catch {
        /* player went away */
      }
    };

    const startActive = () =>
      safe(() => {
        clearTimeout(blockTimer);
        player.seekTo(0, true);
        if (wantSound) player.unMute();
        else player.mute();
        player.playVideo();
        userPaused = false;
        if (!wantSound) return;
        // Browsers refuse unmuted autoplay until the user has interacted with the page:
        // the player then pauses itself or never starts. Fall back to muted playback.
        guardUntil = Date.now() + 3000;
        blockTimer = window.setTimeout(() => {
          safe(() => {
            const st = player.getPlayerState();
            if (st !== PLAYING && st !== BUFFERING && !userPaused) fallbackMuted();
          });
        }, 2000);
      });

    const player = new YT.Player(el, {
      host: 'https://www.youtube-nocookie.com',
      videoId: item.providerVideoId,
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 1,
        mute: 1, // always start muted; sound is enabled in startActive()
        playsinline: 1,
        controls: 1,
        rel: 0,
        loop: 1,
        playlist: item.providerVideoId,
        origin: location.origin,
      },
      events: {
        onReady: () => {
          if (destroyed) return;
          ready = true;
          if (active) startActive();
          else safe(() => { player.mute(); player.playVideo(); });
          events.onReady();
        },
        onError: (e: { data: number }) => !destroyed && events.onUnavailable(ERRORS[e.data] ?? 'Video unavailable'),
        onStateChange: (e: { data: number }) => {
          if (destroyed) return;
          if (e.data === 0 && active) events.onEnded();
          if (e.data === 2 && active && !userPaused && Date.now() < guardUntil && !player.isMuted()) fallbackMuted();
          // Preload: let it start buffering muted, then hold at the first frame.
          if (e.data === PLAYING && !active) {
            primed = true;
            safe(() => player.pauseVideo());
          }
        },
      },
    });

    const handle: PlayerHandle = {
      supportsGestureLayer: true,
      activate(withSound) {
        active = true;
        wantSound = withSound;
        startActive();
      },
      deactivate() {
        active = false;
        clearTimeout(blockTimer);
        safe(() => {
          player.mute();
          if (primed) player.pauseVideo();
        });
      },
      setMuted(m) {
        wantSound = !m;
        safe(() => (m ? player.mute() : player.unMute()));
      },
      togglePlay() {
        safe(() => {
          if (player.getPlayerState() === PLAYING) {
            userPaused = true;
            player.pauseVideo();
          } else {
            userPaused = false;
            player.playVideo();
          }
        });
      },
      destroy() {
        destroyed = true;
        clearTimeout(blockTimer);
        try {
          player.destroy();
        } catch {
          /* already gone */
        }
        host.replaceChildren();
      },
    };
    return handle;
  },
};

export default youtube;

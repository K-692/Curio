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
  unloadModule(name: string): void;
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

/**
 * Browsers only allow autoplay *with sound* after the user has interacted with the page
 * (or for installed apps / sites with high media engagement). Without that, start muted
 * straight away instead of stalling on a blocked play.
 */
function soundAllowedNow(): boolean {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (!ua) return true; // unknown: try, the guard below falls back to muted
  if (ua.hasBeenActive) return true;
  return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
}

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
    let blockTimer: number | undefined;
    let userPaused = false;
    let captionsOff = false; // captions must be switched off at this activation's playback start
    let lastMuted: boolean | null = null;
    let muteWatch: number | undefined;
    let settleUntil = 0; // after (un)muting, YouTube needs a moment before isMuted() is reliable

    const hideCaptions = () =>
      safe(() => {
        player.unloadModule('captions');
        player.unloadModule('cc');
      });

    // Mirror mute changes made with YouTube's own speaker button back to the app,
    // ignoring the settling period right after we changed it ourselves.
    const watchMute = () => {
      clearInterval(muteWatch);
      muteWatch = window.setInterval(() => {
        if (!active || Date.now() < settleUntil) return;
        safe(() => {
          if (player.getPlayerState() !== PLAYING) return;
          const m = player.isMuted();
          if (m !== lastMuted) {
            lastMuted = m;
            wantSound = !m;
            events.onMutedChange(m);
          }
        });
      }, 700);
    };

    const fallbackMuted = () =>
      safe(() => {
        clearTimeout(blockTimer);
        player.mute();
        player.playVideo();
        lastMuted = true;
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

    let pendingUnmute = false;

    /**
     * Start instantly: muted playback is always allowed (also on mobile), so play muted first,
     * then switch sound on as soon as playback is confirmed. Waiting for an unmuted start made
     * phones sit on a paused frame for seconds after every swipe.
     */
    const startActive = () =>
      safe(() => {
        clearTimeout(blockTimer);
        userPaused = false;
        captionsOff = true;
        hideCaptions();
        settleUntil = Date.now() + 2500;
        player.mute();
        lastMuted = true;
        player.seekTo(0, true);
        player.playVideo();
        pendingUnmute = wantSound && soundAllowedNow();
        if (wantSound && !pendingUnmute) events.onSoundBlocked();
        watchMute();
        // Safety net: nudge again if the player hasn't started.
        blockTimer = window.setTimeout(() => {
          safe(() => {
            const st = player.getPlayerState();
            if (st !== PLAYING && st !== BUFFERING && !userPaused) player.playVideo();
          });
        }, 1200);
      });

    const applySound = () =>
      safe(() => {
        pendingUnmute = false;
        player.unMute();
        lastMuted = false;
        settleUntil = Date.now() + 1500;
        // Some mobile browsers pause the video when it gains sound without a gesture: revert to muted.
        window.setTimeout(() => {
          safe(() => {
            if (active && player.getPlayerState() !== PLAYING && player.getPlayerState() !== BUFFERING && !userPaused) fallbackMuted();
          });
        }, 700);
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
        fs: 0, // no fullscreen button
        rel: 0,
        loop: 1,
        playlist: item.providerVideoId,
        cc_load_policy: 0,
        iv_load_policy: 3,
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
        // Captions off by default on every video: drop the captions module whenever it loads
        // around playback start. If the user presses CC later, it stays on for that video.
        onApiChange: () => {
          if (!active || captionsOff) hideCaptions();
        },
        onError: (e: { data: number }) => !destroyed && events.onUnavailable(ERRORS[e.data] ?? 'Video unavailable'),
        onStateChange: (e: { data: number }) => {
          if (destroyed) return;
          if (e.data === 0 && active) events.onEnded();
          if (active) events.onPlayingChange(e.data === PLAYING);
          if (e.data === PLAYING && active) {
            // Playback really started: enforce this video's sound + caption state.
            if (captionsOff) {
              hideCaptions();
              window.setTimeout(() => { captionsOff = false; }, 1500);
            }
            if (pendingUnmute) applySound();
          }
          // Preload: let it start buffering muted, then hold at the first frame.
          if (e.data === PLAYING && !active) {
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
        clearInterval(muteWatch);
        safe(() => player.pauseVideo());
      },
      setMuted(m) {
        wantSound = !m;
        lastMuted = m;
        settleUntil = Date.now() + 1500;
        safe(() => (m ? player.mute() : player.unMute()));
      },
      play() {
        userPaused = false;
        safe(() => player.playVideo());
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
        clearInterval(muteWatch);
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

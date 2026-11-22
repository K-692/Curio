import type { ProviderAdapter } from '../types';

/**
 * Official Instagram embed iframe for public Reels. Instagram exposes no player API,
 * so playback starts on the user's tap inside the embed; we keep its UI fully interactive.
 */
const instagram: ProviderAdapter = {
  async mount(host, item, events) {
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.instagram.com/reel/${encodeURIComponent(item.providerVideoId)}/embed/`;
    iframe.title = `Instagram Reel: ${item.title}`;
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.setAttribute('scrolling', 'no');
    iframe.style.cssText = 'width:100%;height:100%;border:0;background:#fff';
    let done = false;
    const timer = setTimeout(() => !done && events.onUnavailable('Instagram took too long to respond'), 15000);
    iframe.onload = () => {
      done = true;
      clearTimeout(timer);
      events.onReady();
      events.onPlayingChange(true); // no player API: count time while on screen
    };
    host.appendChild(iframe);
    return {
      supportsGestureLayer: false,
      activate() {},
      deactivate() {},
      setMuted() {},
      togglePlay() {},
      play() {},
      destroy() {
        clearTimeout(timer);
        iframe.src = 'about:blank';
        host.replaceChildren();
      },
    };
  },
};

export default instagram;

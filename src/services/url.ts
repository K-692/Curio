import type { Provider } from '../app/types';

export interface ParsedVideoUrl {
  provider: Provider;
  providerVideoId: string;
  canonicalUrl: string;
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const IG_CODE = /^[A-Za-z0-9_-]{5,40}$/;
const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com']);
const IG_HOSTS = new Set(['instagram.com', 'www.instagram.com']);

/**
 * Strict allow-list parser for submitted video URLs (prevents arbitrary embeds/SSRF).
 * Accepts YouTube Shorts/watch/youtu.be links and public Instagram Reel links only.
 */
export function parseVideoUrl(input: string): ParsedVideoUrl | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);

  if (YT_HOSTS.has(host)) {
    let id: string | null = null;
    if (host === 'youtu.be') id = parts[0] ?? null;
    else if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') id = parts[1] ?? null;
    else if (parts[0] === 'watch') id = u.searchParams.get('v');
    if (!id || !YT_ID.test(id)) return null;
    return { provider: 'youtube', providerVideoId: id, canonicalUrl: `https://www.youtube.com/shorts/${id}` };
  }
  if (IG_HOSTS.has(host)) {
    const kind = parts[0];
    const code = parts[1];
    if ((kind !== 'reel' && kind !== 'reels' && kind !== 'p') || !code || !IG_CODE.test(code)) return null;
    return { provider: 'instagram', providerVideoId: code, canonicalUrl: `https://www.instagram.com/reel/${code}/` };
  }
  return null;
}

export const videoDocId = (provider: Provider, providerVideoId: string) => `${provider}_${providerVideoId}`;

export const youtubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

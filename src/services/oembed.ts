import type { ParsedVideoUrl } from './url';

export interface OEmbedInfo {
  title: string;
  creatorName: string;
  thumbnailUrl: string;
  embeddable: boolean;
}

/**
 * Official YouTube oEmbed (CORS-enabled, no API key). 401 = embedding disabled, 404 = gone.
 * Instagram oEmbed needs a Meta app token, so Reels fall back to curator-entered metadata.
 */
export async function lookupOEmbed(v: ParsedVideoUrl, signal?: AbortSignal): Promise<OEmbedInfo | null> {
  if (v.provider !== 'youtube') return null;
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${v.providerVideoId}`)}`;
  const res = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (res.status === 401 || res.status === 403) return { title: '', creatorName: '', thumbnailUrl: '', embeddable: false };
  if (!res.ok) return null;
  const j = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
  return {
    title: String(j.title ?? '').slice(0, 200),
    creatorName: String(j.author_name ?? '').slice(0, 100),
    thumbnailUrl: `https://i.ytimg.com/vi/${v.providerVideoId}/hqdefault.jpg`,
    embeddable: true,
  };
}

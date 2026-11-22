import { doc, getDoc } from 'firebase/firestore/lite';
import { db } from './firebase';
import type { FeedItem, VideoDoc } from '../app/types';

const BASE = import.meta.env.BASE_URL; // '/Curio/'
const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** Public Curio link that opens this exact video in the app: https://…/Curio/v/<youtubeId> */
export const shareUrl = (item: FeedItem) => `${location.origin}${BASE}v/${item.providerVideoId}`;

/** YouTube id from a /Curio/v/<id> link, if the page was opened from one. */
export function sharedIdFromPath(): string | null {
  const rest = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : '';
  const [seg, id] = rest.split('/');
  return seg === 'v' && id && YT_ID.test(id) ? id : null;
}

/** Load the shared video: from the catalogue if present, otherwise via YouTube's official oEmbed. */
export async function loadSharedItem(id: string): Promise<FeedItem | null> {
  try {
    const snap = await getDoc(doc(db, 'videos', `youtube_${id}`));
    if (snap.exists()) {
      const d = snap.data() as VideoDoc;
      return {
        id: snap.id, provider: 'youtube', providerVideoId: id, canonicalUrl: d.canonicalUrl,
        title: d.title, creatorName: d.creatorName, thumbnailUrl: d.thumbnailUrl, topic: d.topic, topicName: d.topicName || d.topic,
      };
    }
  } catch {
    /* not in the catalogue (or no longer approved) */
  }
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { credentials: 'omit' });
    if (!r.ok) return null;
    const j = (await r.json()) as { title?: string; author_name?: string };
    return {
      id: `youtube_${id}`, provider: 'youtube', providerVideoId: id, canonicalUrl: `https://www.youtube.com/shorts/${id}`,
      title: String(j.title ?? 'Shared video').slice(0, 200), creatorName: String(j.author_name ?? '').slice(0, 100),
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, topic: 'shared', topicName: 'Shared',
    };
  } catch {
    return null;
  }
}

/** Native share sheet where available (phones), otherwise copy the link. */
export async function shareItem(item: FeedItem): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const url = shareUrl(item);
  const data = { title: `${item.title} · Curio`, text: `${item.title} — watch it on Curio`, url };
  if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

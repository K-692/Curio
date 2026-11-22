import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore/lite';
import { db } from './firebase';
import { secureRandom } from './random';
import { buildBatch, emptyCycle, type CycleState } from './engine';
import type { FeedItem, VideoDoc } from '../app/types';
import { TOPIC_SLUGS } from '../app/topics';

const RECENT_KEPT = 400;
const QUEUE_KEPT = 25;

/** Persisted per-user discovery state: one small doc, one read per session. */
export interface FeedState extends CycleState {
  queue: FeedItem[];
  recent: string[];
}

const stateRef = (uid: string) => doc(db, 'users', uid, 'state', 'feed');

export async function loadFeedState(uid: string): Promise<FeedState> {
  const snap = await getDoc(stateRef(uid));
  const d = (snap.exists() ? snap.data() : {}) as Partial<FeedState>;
  const base = emptyCycle();
  return {
    cycle: Array.isArray(d.cycle) ? d.cycle : base.cycle,
    pos: typeof d.pos === 'number' ? d.pos : 0,
    exhausted: Array.isArray(d.exhausted) ? d.exhausted : [],
    lastTopics: Array.isArray(d.lastTopics) ? d.lastTopics : [],
    queue: Array.isArray(d.queue) ? d.queue : [],
    recent: Array.isArray(d.recent) ? d.recent : [],
  };
}

export async function saveFeedState(uid: string, s: FeedState): Promise<void> {
  await setDoc(stateRef(uid), {
    cycle: s.cycle.slice(0, 60),
    pos: s.pos,
    exhausted: s.exhausted.slice(0, 60),
    lastTopics: s.lastTopics.slice(-6),
    queue: s.queue.slice(0, QUEUE_KEPT),
    recent: s.recent.slice(-RECENT_KEPT),
    updatedAt: serverTimestamp(),
  });
}

export const deleteFeedState = (uid: string) => deleteDoc(stateRef(uid));

export function rememberWatched(s: FeedState, id: string): void {
  s.recent = [...s.recent.filter((x) => x !== id), id].slice(-RECENT_KEPT);
}

function toItem(id: string, d: VideoDoc): FeedItem {
  return {
    id,
    provider: d.provider,
    providerVideoId: d.providerVideoId,
    canonicalUrl: d.canonicalUrl,
    title: d.title,
    creatorName: d.creatorName,
    thumbnailUrl: d.thumbnailUrl,
    topic: d.topic,
  };
}

/** Random approved video in a topic via a random pivot on the `rand` field (2 small reads max). */
async function fetchCandidate(topic: string, exclude: ReadonlySet<string>, signal?: AbortSignal): Promise<FeedItem | null> {
  const pivot = secureRandom();
  const videos = collection(db, 'videos');
  const base = [where('topic', '==', topic), where('status', '==', 'approved')] as const;
  for (const cmp of ['>=', '<'] as const) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const snap = await getDocs(query(videos, ...base, where('rand', cmp, pivot), orderBy('rand'), limit(8)));
    const pool = snap.docs.filter((d) => !exclude.has(d.id) && (d.data() as VideoDoc).embedAllowed !== false);
    if (pool.length) {
      const pick = pool[Math.floor(secureRandom() * pool.length)];
      return toItem(pick.id, pick.data() as VideoDoc);
    }
  }
  return null;
}

/** Discovery client: produces the next batch of 10 and updates cycle state in place. */
export async function nextBatch(s: FeedState, queuedIds: Iterable<string>, signal?: AbortSignal) {
  const res = await buildBatch({
    topics: TOPIC_SLUGS,
    state: s,
    queued: new Set(queuedIds),
    recentlyWatched: new Set(s.recent),
    fetchCandidate: (t, ex) => fetchCandidate(t, ex, signal),
  });
  Object.assign(s, res.state);
  return res;
}

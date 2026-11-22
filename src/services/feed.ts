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
import { buildBatch, emptyCycle, type CycleState } from './engine';
import type { FeedItem, VideoDoc } from '../app/types';

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
    cycle: s.cycle.slice(0, 120),
    pos: s.pos,
    exhausted: s.exhausted.slice(0, 120),
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

/** Topics that currently have videos (maintained by the ingestion job). */
export async function loadTopics(): Promise<string[]> {
  const snap = await getDoc(doc(db, 'meta', 'topics'));
  const t = (snap.exists() ? snap.data().topics : {}) as Record<string, { count: number }>;
  return Object.entries(t ?? {}).filter(([, v]) => (v?.count ?? 0) > 0).map(([k]) => k);
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
    topicName: d.topicName || d.topic,
  };
}

/** Most-trending unseen video in a topic (highest views-per-hour first). */
async function fetchCandidate(topic: string, exclude: ReadonlySet<string>, signal?: AbortSignal): Promise<FeedItem | null> {
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
  const snap = await getDocs(
    query(collection(db, 'videos'), where('topic', '==', topic), where('status', '==', 'approved'), orderBy('score', 'desc'), limit(25)),
  );
  const pick = snap.docs.find((d) => !exclude.has(d.id) && (d.data() as VideoDoc).embedAllowed !== false);
  return pick ? toItem(pick.id, pick.data() as VideoDoc) : null;
}

/** Discovery client: produces the next batch of 10 and updates cycle state in place. */
let topicsCache: { at: number; list: string[] } | null = null;

export async function nextBatch(s: FeedState, queuedIds: Iterable<string>, signal?: AbortSignal) {
  if (!topicsCache || Date.now() - topicsCache.at > 10 * 60_000) topicsCache = { at: Date.now(), list: await loadTopics() };
  const res = await buildBatch({
    topics: topicsCache.list,
    state: s,
    queued: new Set(queuedIds),
    recentlyWatched: new Set(s.recent),
    fetchCandidate: (t, ex) => fetchCandidate(t, ex, signal),
  });
  Object.assign(s, res.state);
  return res;
}

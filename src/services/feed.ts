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
  /** Catalogue version the queue was built from (see meta/topics.version). */
  catalogVersion: number;
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
    catalogVersion: typeof d.catalogVersion === 'number' ? d.catalogVersion : 0,
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
    catalogVersion: s.catalogVersion,
    updatedAt: serverTimestamp(),
  });
}

export const deleteFeedState = (uid: string) => deleteDoc(stateRef(uid));

export function rememberWatched(s: FeedState, id: string): void {
  s.recent = [...s.recent.filter((x) => x !== id), id].slice(-RECENT_KEPT);
}

let topicsCache: { at: number; list: string[]; version: number } | null = null;

/** Topics that currently have videos + catalogue version (maintained by the ingestion job). */
export async function getCatalog(): Promise<{ list: string[]; version: number }> {
  if (topicsCache && Date.now() - topicsCache.at < 10 * 60_000) return topicsCache;
  const snap = await getDoc(doc(db, 'meta', 'topics'));
  const d = snap.exists() ? snap.data() : {};
  const t = (d.topics ?? {}) as Record<string, { count: number }>;
  topicsCache = {
    at: Date.now(),
    list: Object.entries(t).filter(([, v]) => (v?.count ?? 0) > 0).map(([k]) => k),
    version: typeof d.version === 'number' ? d.version : 0,
  };
  return topicsCache;
}

/** Drop a persisted queue that was built from an older catalogue. */
export function alignWithCatalog(s: FeedState, version: number): void {
  if (s.catalogVersion === version) return;
  s.queue = [];
  s.cycle = [];
  s.pos = 0;
  s.exhausted = [];
  s.catalogVersion = version;
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
export async function nextBatch(s: FeedState, queuedIds: Iterable<string>, signal?: AbortSignal) {
  const catalog = await getCatalog();
  const res = await buildBatch({
    topics: catalog.list,
    state: s,
    queued: new Set(queuedIds),
    recentlyWatched: new Set(s.recent),
    fetchCandidate: (t, ex) => fetchCandidate(t, ex, signal),
  });
  Object.assign(s, res.state);
  return res;
}

import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  type QueryDocumentSnapshot,
} from 'firebase/firestore/lite';
import { db } from './firebase';
import type { FeedItem, HistoryEntry } from '../app/types';

export const WATCH_THRESHOLD_SECONDS = 5;
export const PAGE_SIZE = 20;

const histCol = (uid: string) => collection(db, 'users', uid, 'history');

/** One doc per video (doc id = video id) gives natural dedupe; watchedAt keeps the latest time. */
export async function recordWatched(uid: string, item: FeedItem, watchSeconds: number): Promise<void> {
  await setDoc(doc(histCol(uid), item.id), {
    provider: item.provider,
    providerVideoId: item.providerVideoId,
    canonicalUrl: item.canonicalUrl,
    title: item.title.slice(0, 200),
    creatorName: item.creatorName.slice(0, 100),
    thumbnailUrl: item.thumbnailUrl.slice(0, 500),
    topic: item.topic,
    watchSeconds: Math.max(0, Math.min(86400, Math.round(watchSeconds))),
    watchedAt: serverTimestamp(),
  });
}

export type HistoryCursor = QueryDocumentSnapshot | null;

export async function getHistoryPage(uid: string, cursor: HistoryCursor) {
  const q = cursor
    ? query(histCol(uid), orderBy('watchedAt', 'desc'), startAfter(cursor), limit(PAGE_SIZE))
    : query(histCol(uid), orderBy('watchedAt', 'desc'), limit(PAGE_SIZE));
  const snap = await getDocs(q);
  const entries: HistoryEntry[] = snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      provider: x.provider,
      providerVideoId: x.providerVideoId,
      canonicalUrl: x.canonicalUrl,
      title: x.title,
      creatorName: x.creatorName,
      thumbnailUrl: x.thumbnailUrl,
      topic: x.topic,
      watchSeconds: x.watchSeconds ?? 0,
      watchedAt: x.watchedAt?.toDate?.() ?? null,
    };
  });
  return { entries, next: snap.docs.length === PAGE_SIZE ? snap.docs[snap.docs.length - 1] : null };
}

export const deleteHistoryItem = (uid: string, id: string) => deleteDoc(doc(histCol(uid), id));

export async function clearAllHistory(uid: string): Promise<void> {
  for (;;) {
    const snap = await getDocs(query(histCol(uid), limit(400)));
    if (snap.empty) return;
    const b = writeBatch(db);
    snap.docs.forEach((d) => b.delete(d.ref));
    await b.commit();
  }
}

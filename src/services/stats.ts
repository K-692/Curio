import { doc, getDoc, setDoc, deleteDoc, increment, serverTimestamp } from 'firebase/firestore/lite';
import { db } from './firebase';

/**
 * Per-topic watch time (seconds actually playing on screen). Shown only to the user on the
 * Polymath page; never used to rank or narrow the feed.
 */
const statsRef = (uid: string) => doc(db, 'users', uid, 'state', 'stats');

export async function loadTopicSeconds(uid: string): Promise<Record<string, number>> {
  const snap = await getDoc(statsRef(uid));
  const t = (snap.exists() ? snap.data().topics : null) as Record<string, number> | null;
  return t && typeof t === 'object' ? t : {};
}

export async function addTopicSeconds(uid: string, delta: Record<string, number>): Promise<void> {
  const topics: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(delta)) if (v > 0) topics[k] = increment(Math.round(v));
  if (!Object.keys(topics).length) return;
  await setDoc(statsRef(uid), { topics, updatedAt: serverTimestamp() }, { merge: true });
}

export const deleteTopicStats = (uid: string) => deleteDoc(statsRef(uid));

/** Batches seconds in memory and flushes at most every 30 s (rules allow one write per 10 s). */
export function createStatsBuffer(uid: string) {
  let pending: Record<string, number> = {};
  let last = 0;
  let timer: number | undefined;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    const delta = pending;
    if (!Object.keys(delta).length) return;
    if (Date.now() - last < 11000) {
      timer = window.setTimeout(flush, 11000 - (Date.now() - last));
      return;
    }
    pending = {};
    last = Date.now();
    addTopicSeconds(uid, delta).catch(() => {
      // Put the seconds back for the next attempt.
      for (const [k, v] of Object.entries(delta)) pending[k] = (pending[k] ?? 0) + v;
    });
  };
  return {
    add(topic: string, seconds: number) {
      pending[topic] = (pending[topic] ?? 0) + seconds;
      if (timer === undefined) timer = window.setTimeout(flush, 30000);
    },
    flush,
  };
}

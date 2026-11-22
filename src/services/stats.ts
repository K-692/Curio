import { doc, getDoc, setDoc, deleteDoc, increment, serverTimestamp } from 'firebase/firestore/lite';
import { db } from './firebase';

/**
 * Per-topic watch time (seconds actually playing on screen) + number of videos watched.
 * Shown only to the user on the Polymath page; never used to rank or narrow the feed.
 */
const statsRef = (uid: string) => doc(db, 'users', uid, 'state', 'stats');

export interface TopicStats {
  topics: Record<string, number>;
  names: Record<string, string>;
  videos: number;
}

export async function loadStats(uid: string): Promise<TopicStats> {
  const snap = await getDoc(statsRef(uid));
  const d = (snap.exists() ? snap.data() : {}) as Partial<TopicStats>;
  return { topics: d.topics ?? {}, names: d.names ?? {}, videos: typeof d.videos === 'number' ? d.videos : 0 };
}

export const deleteTopicStats = (uid: string) => deleteDoc(statsRef(uid));

/** Batches seconds in memory and flushes at most every 30 s (rules allow one write per 10 s). */
export function createStatsBuffer(uid: string) {
  let secs: Record<string, number> = {};
  let names: Record<string, string> = {};
  let videos = 0;
  let last = 0;
  let timer: number | undefined;

  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (!Object.keys(secs).length && !videos) return;
    const wait = 11000 - (Date.now() - last);
    if (wait > 0) {
      timer = window.setTimeout(flush, wait);
      return;
    }
    const s = secs, n = names, v = videos;
    secs = {};
    names = {};
    videos = 0;
    last = Date.now();
    const topics: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(s)) topics[k] = increment(Math.round(x));
    setDoc(statsRef(uid), { topics, names: n, videos: increment(v), updatedAt: serverTimestamp() }, { merge: true }).catch(() => {
      for (const [k, x] of Object.entries(s)) secs[k] = (secs[k] ?? 0) + x;
      names = { ...n, ...names };
      videos += v;
    });
  };
  const schedule = () => {
    if (timer === undefined) timer = window.setTimeout(flush, 30000);
  };
  return {
    addSecond(topic: string, name: string) {
      secs[topic] = (secs[topic] ?? 0) + 1;
      names[topic] = name;
      schedule();
    },
    countVideo() {
      videos += 1;
      schedule();
    },
    flush,
  };
}

/**
 * Topics for the radar: those whose watch time is above the average watch time per video.
 * Pads with the next-highest topics so the chart always has at least 3 axes when possible.
 */
export function radarTopics(s: TopicStats, maxAxes = 12): { slug: string; name: string; seconds: number }[] {
  const all = Object.entries(s.topics)
    .filter(([, v]) => v > 0)
    .map(([slug, seconds]) => ({ slug, seconds, name: s.names[slug] ?? slug }))
    .sort((a, b) => b.seconds - a.seconds);
  if (!all.length) return [];
  const total = all.reduce((a, b) => a + b.seconds, 0);
  const avgPerVideo = total / Math.max(1, s.videos);
  const above = all.filter((t) => t.seconds > avgPerVideo);
  const chosen = above.length >= 3 ? above : all.slice(0, Math.min(3, all.length));
  return chosen.slice(0, maxAxes);
}

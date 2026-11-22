/**
 * Curio ingestion (runs free in GitHub Actions; YouTube key + service account stay server-side).
 *
 * Only content that teaches, shares facts or reports news is kept: YouTube categories
 * Education, Science & Technology, News & Politics and Howto & Style, in English.
 *
 * Each run:
 *  1. Trending: YouTube's most-popular chart for each of those categories (1 unit per page)
 *     → keep Shorts (≤ 3 min); topic taken from the video's own YouTube topic details.
 *  2. Random topics from YouTube's whole topic taxonomy: for each, the most-viewed fact /
 *     explainer / news Shorts of the last 14 days (search.list, 100 units each).
 *  3. Every video gets a trending score = views per hour since publishing, so the feed can
 *     serve trending videos first.
 *  4. Re-checks the oldest catalogue entries and drops removed / non-embeddable ones.
 *  5. Rebuilds meta/topics (topic → name, count) that the app reads to know what exists.
 *
 * Quota: TOPICS_PER_RUN × 100 + a few units. 40 topics × 2 runs/day ≈ 8,000 of the free 10,000.
 * Secrets: YOUTUBE_API_KEY, FIREBASE_SERVICE_ACCOUNT (JSON).
 */
import { randomInt } from 'node:crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { YOUTUBE_TOPICS, topicFromDetails } from './youtube-topics.mjs';

const KEY = process.env.YOUTUBE_API_KEY;
const SA = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!KEY || !SA) {
  console.log('YOUTUBE_API_KEY / FIREBASE_SERVICE_ACCOUNT not set — skipping ingestion.');
  process.exit(0);
}
const TOPICS_PER_RUN = Number(process.env.TOPICS_PER_RUN || 40);
const MAX_SECONDS = 180;
const REGION = process.env.REGION || 'US';
const REVALIDATE = 100;
const RESET = process.env.RESET === '1';
/** YouTube video categories that carry knowledge: Education, Science & Tech, News & Politics, Howto & Style. */
const KNOWLEDGE_CATEGORIES = ['27', '28', '25', '26'];
/** Search terms (OR-ed) that favour facts, explainers and news within any topic. */
const KNOWLEDGE_QUERY = 'facts|explained|"did you know"|science|history|news|why|how';

initializeApp({ credential: cert(JSON.parse(SA)) });
const db = getFirestore();
let quota = 0;

async function yt(path, params, cost) {
  quota += cost;
  const u = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [k, v] of Object.entries({ ...params, key: KEY })) if (v !== undefined) u.searchParams.set(k, String(v));
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${path} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const seconds = (iso) => {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? '');
  return m ? (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0) : Infinity;
};
const clean = (s, n) => String(s ?? '').replace(/\s*#\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const rand = () => randomInt(0, 2 ** 47) / 2 ** 47;

const english = (v) => {
  const lang = (v.snippet?.defaultAudioLanguage || v.snippet?.defaultLanguage || 'en').toLowerCase();
  const title = v.snippet?.title ?? '';
  const latin = title.replace(/[^\p{L}]/gu, '');
  const ascii = latin.replace(/[^A-Za-z]/g, '');
  return lang.startsWith('en') && (latin.length === 0 || ascii.length / latin.length > 0.8);
};

const eligible = (v) =>
  KNOWLEDGE_CATEGORIES.includes(v.snippet?.categoryId) && english(v) &&
  v.status?.embeddable && v.status?.privacyStatus === 'public' && !v.status?.madeForKids &&
  !v.contentDetails?.contentRating?.ytRating && seconds(v.contentDetails?.duration) <= MAX_SECONDS &&
  v.snippet?.liveBroadcastContent === 'none';

function score(v) {
  const views = Number(v.statistics?.viewCount ?? 0);
  const hours = Math.max(6, (Date.now() - Date.parse(v.snippet.publishedAt)) / 3.6e6);
  return Math.round((views / hours) * 100) / 100; // views per hour
}

async function details(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const j = await yt('videos', { part: 'snippet,contentDetails,status,statistics,topicDetails', id: ids.slice(i, i + 50).join(',') }, 1);
    out.push(...(j.items ?? []));
  }
  return out;
}

async function save(videos, fallbackTopic) {
  const batch = db.batch();
  let n = 0;
  for (const v of videos) {
    const topic = topicFromDetails(v.topicDetails) ?? fallbackTopic;
    if (!topic) continue;
    batch.set(db.collection('videos').doc(`youtube_${v.id}`), {
      provider: 'youtube', providerVideoId: v.id, canonicalUrl: `https://www.youtube.com/shorts/${v.id}`,
      title: clean(v.snippet.title, 200) || 'Untitled', creatorName: clean(v.snippet.channelTitle, 100),
      thumbnailUrl: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      topic: topic.slug, topicName: topic.name, tags: [],
      status: 'approved', embedAllowed: true, rand: rand(),
      score: score(v), views: Number(v.statistics?.viewCount ?? 0), publishedAt: v.snippet.publishedAt,
      source: 'ingest', createdAt: FieldValue.serverTimestamp(), checkedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    n++;
  }
  if (n) await batch.commit();
  return n;
}

async function trending() {
  let added = 0;
  for (const cat of KNOWLEDGE_CATEGORIES) {
    let pageToken;
    for (let page = 0; page < 2; page++) {
      try {
        const j = await yt('videos', { part: 'snippet,contentDetails,status,statistics,topicDetails', chart: 'mostPopular', videoCategoryId: cat, regionCode: REGION, maxResults: 50, pageToken }, 1);
        added += await save((j.items ?? []).filter(eligible), null);
        pageToken = j.nextPageToken;
        if (!pageToken) break;
      } catch (e) {
        console.warn(`chart ${cat}: ${e.message}`);
        break;
      }
    }
  }
  console.log(`trending charts: +${added}`);
  return added;
}

async function byTopic() {
  const picks = [...YOUTUBE_TOPICS].sort(() => rand() - 0.5).slice(0, TOPICS_PER_RUN);
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  let added = 0;
  for (const t of picks) {
    try {
      const s = await yt('search', {
        part: 'id', type: 'video', topicId: t.id, q: KNOWLEDGE_QUERY, videoDuration: 'short', videoEmbeddable: 'true',
        safeSearch: 'strict', order: 'viewCount', publishedAfter: since, maxResults: 25, regionCode: REGION, relevanceLanguage: 'en',
      }, 100);
      const ids = (s.items ?? []).map((i) => i.id?.videoId).filter(Boolean);
      const n = await save((await details(ids)).filter(eligible), t);
      added += n;
      console.log(`${t.name}: +${n}`);
    } catch (e) {
      console.warn(`${t.name}: ${e.message}`);
      if (/quota/i.test(e.message)) break;
    }
  }
  return added;
}

async function revalidate() {
  const snap = await db.collection('videos').orderBy('checkedAt').limit(REVALIDATE).get();
  if (snap.empty) return 0;
  const live = new Map((await details(snap.docs.map((d) => d.data().providerVideoId))).map((v) => [v.id, v]));
  const batch = db.batch();
  let removed = 0;
  for (const d of snap.docs) {
    const v = live.get(d.data().providerVideoId);
    if (!v || !v.status?.embeddable || v.status?.privacyStatus === 'private') {
      batch.delete(d.ref);
      removed++;
    } else {
      batch.update(d.ref, { checkedAt: FieldValue.serverTimestamp(), score: score(v), views: Number(v.statistics?.viewCount ?? 0) });
    }
  }
  await batch.commit();
  return removed;
}

async function wipeCatalogue() {
  let n = 0;
  for (;;) {
    const snap = await db.collection('videos').limit(400).get();
    if (snap.empty) break;
    const b = db.batch();
    snap.docs.forEach((d) => b.delete(d.ref));
    await b.commit();
    n += snap.size;
  }
  console.log(`reset: removed ${n} old videos`);
}

async function rebuildTopicIndex() {
  const topics = {};
  for (const t of YOUTUBE_TOPICS) {
    const c = await db.collection('videos').where('topic', '==', t.slug).where('status', '==', 'approved').count().get();
    const count = c.data().count;
    if (count > 0) topics[t.slug] = { name: t.name, count };
  }
  // `version` changes only on a reset, telling apps to drop queues built from the old catalogue.
  const prev = (await db.doc('meta/topics').get()).data();
  const version = RESET || !prev?.version ? Date.now() : prev.version;
  await db.doc('meta/topics').set({ topics, version, updatedAt: FieldValue.serverTimestamp() });
  return Object.keys(topics).length;
}

const run = db.collection('ingestionRuns').doc();
await run.set({ provider: 'youtube', startedAt: FieldValue.serverTimestamp(), status: 'running' });
try {
  if (RESET) await wipeCatalogue();
  const t = await trending();
  const a = await byTopic();
  const removed = await revalidate();
  const topics = await rebuildTopicIndex();
  await run.update({ finishedAt: FieldValue.serverTimestamp(), status: 'ok', added: t + a, removed, topics, quotaUnits: quota });
  console.log(`done: +${t + a} videos, -${removed}, ${topics} topics, ~${quota} quota units`);
} catch (e) {
  await run.update({ finishedAt: FieldValue.serverTimestamp(), status: 'error', error: String(e.message).slice(0, 300), quotaUnits: quota });
  console.error(e);
  process.exit(1);
}

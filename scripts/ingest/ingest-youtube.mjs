/**
 * Curio YouTube ingestion (server-side, runs in GitHub Actions — free).
 *
 *  - Discovers short educational videos per topic with the YouTube Data API (quota-aware:
 *    one search.list per topic per run = 100 units; 15 topics ≈ 1,500 of the 10,000 free daily units).
 *  - Keeps only embeddable, public, not-made-for-kids videos up to MAX_SECONDS long.
 *  - Re-validates the oldest catalogue entries and marks removed/non-embeddable ones unavailable.
 *  - Writes an ingestionRuns record.
 *
 * Secrets (GitHub → Settings → Secrets → Actions):
 *   YOUTUBE_API_KEY            – YouTube Data API v3 key (free)
 *   FIREBASE_SERVICE_ACCOUNT   – JSON of a Firebase service-account key
 * Env:
 *   INGEST_STATUS=approved|pending  (default pending → curators approve in the app)
 */
import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const KEY = process.env.YOUTUBE_API_KEY;
const SA = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!KEY || !SA) {
  console.log('YOUTUBE_API_KEY / FIREBASE_SERVICE_ACCOUNT not set — skipping ingestion.');
  process.exit(0);
}
const STATUS = process.env.INGEST_STATUS === 'approved' ? 'approved' : 'pending';
const MAX_SECONDS = 180;
const PER_TOPIC = 15;
const REVALIDATE = 50;

initializeApp({ credential: cert(JSON.parse(SA)) });
const db = getFirestore();
const taxonomy = JSON.parse(readFileSync(new URL('../../src/app/taxonomy.json', import.meta.url), 'utf8'));

let quota = 0;
async function yt(path, params) {
  const u = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [k, v] of Object.entries({ ...params, key: KEY })) u.searchParams.set(k, String(v));
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${path} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const seconds = (iso) => {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? '');
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : Infinity;
};
const rand = () => randomInt(0, 2 ** 48) / 2 ** 48;
const clean = (s, n) => String(s ?? '').replace(/\s*#\S+/g, '').trim().slice(0, n);

async function details(ids) {
  if (!ids.length) return [];
  quota += 1;
  const j = await yt('videos', { part: 'snippet,contentDetails,status', id: ids.join(','), maxResults: 50 });
  return j.items ?? [];
}

const eligible = (v) =>
  v.status?.embeddable && v.status?.privacyStatus === 'public' && !v.status?.madeForKids &&
  seconds(v.contentDetails?.duration) <= MAX_SECONDS && !v.contentDetails?.contentRating?.ytRating;

async function discover() {
  let added = 0;
  for (const t of taxonomy) {
    const q = t.queries[randomInt(0, t.queries.length)];
    quota += 100;
    const s = await yt('search', {
      part: 'id', type: 'video', q, maxResults: 25, videoDuration: 'short', videoEmbeddable: 'true',
      safeSearch: 'strict', relevanceLanguage: 'en', order: ['relevance', 'viewCount', 'rating'][randomInt(0, 3)],
    });
    const ids = (s.items ?? []).map((i) => i.id?.videoId).filter(Boolean);
    const vids = (await details(ids)).filter(eligible).slice(0, PER_TOPIC);
    const batch = db.batch();
    let n = 0;
    for (const v of vids) {
      const ref = db.collection('videos').doc(`youtube_${v.id}`);
      if ((await ref.get()).exists) continue; // never overwrite curator decisions
      batch.set(ref, {
        provider: 'youtube', providerVideoId: v.id, canonicalUrl: `https://www.youtube.com/shorts/${v.id}`,
        title: clean(v.snippet.title, 200) || 'Untitled', creatorName: clean(v.snippet.channelTitle, 100),
        thumbnailUrl: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`, topic: t.slug, tags: [],
        status: STATUS, embedAllowed: true, rand: rand(), source: 'ingest',
        createdAt: FieldValue.serverTimestamp(), checkedAt: FieldValue.serverTimestamp(),
      });
      n++;
    }
    if (n) await batch.commit();
    added += n;
    console.log(`${t.slug}: +${n}`);
  }
  return added;
}

async function revalidate() {
  const snap = await db.collection('videos').where('provider', '==', 'youtube').orderBy('checkedAt').limit(REVALIDATE).get();
  if (snap.empty) return 0;
  const live = new Map((await details(snap.docs.map((d) => d.data().providerVideoId))).map((v) => [v.id, v]));
  const batch = db.batch();
  let flagged = 0;
  for (const d of snap.docs) {
    const v = live.get(d.data().providerVideoId);
    const ok = v && v.status?.embeddable && v.status?.privacyStatus !== 'private';
    const patch = { checkedAt: FieldValue.serverTimestamp() };
    if (!ok && d.data().status === 'approved') { patch.status = 'unavailable'; patch.embedAllowed = false; flagged++; }
    batch.update(d.ref, patch);
  }
  await batch.commit();
  return flagged;
}

const run = db.collection('ingestionRuns').doc();
await run.set({ provider: 'youtube', startedAt: FieldValue.serverTimestamp(), status: 'running' });
try {
  const added = await discover();
  const flagged = await revalidate();
  await run.update({ finishedAt: FieldValue.serverTimestamp(), status: 'ok', added, flagged, quotaUnits: quota });
  console.log(`done: added ${added}, flagged ${flagged}, ~${quota} quota units`);
} catch (e) {
  await run.update({ finishedAt: FieldValue.serverTimestamp(), status: 'error', error: String(e.message).slice(0, 300), quotaUnits: quota });
  console.error(e);
  process.exit(1);
}

<p align="center"><img src="public/icons/icon-192.png" width="96" alt="Curio logo"></p>

# Curio

Short videos from every corner of human knowledge. **Always a surprise.**

Curio is a browser-first discovery feed for short educational videos (YouTube Shorts and public Instagram Reels). Instead of learning what you like and narrowing your feed, it rotates through a shuffled cycle of 15 fields of knowledge, never shows more than two videos in a row from one field, and keeps only one piece of personal data: your private watched history.

Live: https://k-692.github.io/Curio/

## Stack (100% free tier)

| Layer | Choice | Cost |
| --- | --- | --- |
| Frontend | Preact + TypeScript + Vite, plain CSS | — |
| Hosting | GitHub Pages (Actions deploy) | Free |
| Auth | Firebase Auth — Google sign-in | Free (Spark) |
| Database | Cloud Firestore + Security Rules | Free (Spark quotas) |
| Ingestion | GitHub Actions cron + YouTube Data API | Free |
| Playback | Official YouTube IFrame player / Instagram embed | Free |

The Firebase project stays on the **Spark plan** (no billing account), so it cannot incur charges — when a daily quota is reached, requests simply fail until the next day. Cloud Functions need the paid Blaze plan, so:

- the **discovery engine runs in the browser** against Firestore (the catalogue is public to signed-in users anyway), with all writes guarded by Security Rules;
- **privileged work** (YouTube API key, service account) runs in a scheduled **GitHub Action**, never in the browser.

## How the feed works

- `src/services/engine.ts` — pure, unit-tested selection logic: shuffled topic cycle (crypto RNG), topic-first selection (a topic with 5,000 videos never dominates one with 50), max 2 consecutive per topic, excludes queued + recently-watched videos while possible, marks empty topics exhausted for the cycle.
- `src/services/feed.ts` — fetches a random approved video per topic via a random pivot on an indexed `rand` field (≤2 small reads), persists cycle + queue in `users/{uid}/state/feed` so a refresh doesn't reshuffle.
- `src/components/Feed` — keeps the active item + **10 upcoming** metadata records; refills in the background when 5 remain; retries with bounded exponential backoff; continues offline with what's queued.
- `src/components/Player` — official players via dynamically imported provider adapters. The active item plays **with sound by default** (falls back to muted + "Tap for sound" if the browser blocks unmuted autoplay before the first interaction). The **next 3 items are preloaded**: their players buffer the opening seconds muted and paused, so advancing is instant. Players outside that window are destroyed.
- UI: brand top-left, theme + profile top-right; History, Suggest, Curate and About live in the profile menu.
- A watch is recorded after 5 visible seconds (or on completion), deduplicated per video.

## Data model (Firestore)

| Path | Purpose | Access |
| --- | --- | --- |
| `videos/{provider_id}` | Catalogue (`topic`, `status`, `rand`, …) | read: signed-in (approved only); write: curators |
| `users/{uid}` | display name, avatar, `lastSubmitAt` | owner |
| `users/{uid}/history/{videoId}` | watched history | owner only |
| `users/{uid}/state/feed` | topic cycle, queue, recent ids | owner only |
| `submissions/{id}` | community suggestions (30 s cooldown) | create: signed-in; review: curators |
| `admins/{uid}` | curator flag (set in console) | owner can read own flag |
| `ingestionRuns/{id}` | ingestion logs | curators read; Action writes |

Taxonomy lives in `src/app/taxonomy.json` (shared with the ingestion job).

## Development

```bash
npm install
npm run dev        # http://localhost:5173/Curio/
npm test           # engine + URL validation tests
npm run build
```

Deploy rules/indexes: `npx firebase-tools deploy --only firestore`.

## One-time setup

1. **Authorize the Pages domain** — Firebase console → Authentication → Settings → Authorized domains → add `k-692.github.io`.
2. **Enable Pages** — GitHub repo → Settings → Pages → Source: *GitHub Actions*.
3. **Make yourself a curator** — sign in once, copy your UID from Firebase console → Authentication → Users, then Firestore → start collection `admins` → document ID = your UID (any field, e.g. `role: "admin"`).
4. **Seed the catalogue** — in the app open **Curate → Starter set → Import** (70 oEmbed-verified Shorts across all 15 topics).
5. *(Optional)* **Automatic ingestion** — add repo secrets `YOUTUBE_API_KEY` (Google Cloud → enable *YouTube Data API v3* → API key) and `FIREBASE_SERVICE_ACCOUNT` (Firebase → Project settings → Service accounts → Generate key, paste JSON). Ingested videos land as `pending` unless repo variable `INGEST_STATUS=approved`.
6. *(Recommended)* Restrict the browser API key to HTTP referrers `k-692.github.io/*` and `localhost:5173/*` in Google Cloud → Credentials.

## Privacy

Stored per user: Google UID, display name, avatar URL, watched video IDs/titles/timestamps, feed position and pending suggestions. No analytics, likes, follows or interest profiles. Users can remove history entries, clear history, or delete their account and data from the About page.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  writeBatch,
  updateDoc,
  serverTimestamp,
  type QueryDocumentSnapshot,
} from 'firebase/firestore/lite';
import { db } from './firebase';
import { secureRandom } from './random';
import { videoDocId, youtubeThumb, type ParsedVideoUrl } from './url';
import type { VideoDoc, VideoStatus } from '../app/types';

export interface Submission {
  id: string;
  provider: ParsedVideoUrl['provider'];
  providerVideoId: string;
  canonicalUrl: string;
  proposedTopic: string;
  title: string;
  creatorName: string;
  submittedBy: string;
  reviewStatus: 'pending' | 'approved' | 'rejected';
}

/**
 * Community submission. The user doc's lastSubmitAt is bumped in the same batch so the
 * security rules can enforce a per-user cooldown (rate limit) without a server.
 */
export async function submitVideo(uid: string, v: ParsedVideoUrl, topic: string, meta: { title: string; creatorName: string }) {
  const b = writeBatch(db);
  const ref = doc(collection(db, 'submissions'));
  b.set(ref, {
    provider: v.provider,
    providerVideoId: v.providerVideoId,
    canonicalUrl: v.canonicalUrl,
    proposedTopic: topic,
    title: meta.title.slice(0, 200),
    creatorName: meta.creatorName.slice(0, 100),
    submittedBy: uid,
    reviewStatus: 'pending',
    createdAt: serverTimestamp(),
  });
  b.update(doc(db, 'users', uid), { lastSubmitAt: serverTimestamp() });
  await b.commit();
}

export async function videoExists(v: ParsedVideoUrl): Promise<boolean> {
  try {
    return (await getDoc(doc(db, 'videos', videoDocId(v.provider, v.providerVideoId)))).exists();
  } catch {
    // Non-approved videos are not readable by non-admins; treat as unknown.
    return false;
  }
}

/* ----------------------------- Admin-only ----------------------------- */

export async function listPendingSubmissions(): Promise<Submission[]> {
  const snap = await getDocs(query(collection(db, 'submissions'), where('reviewStatus', '==', 'pending'), orderBy('createdAt', 'asc'), limit(50)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Submission, 'id'>) }));
}

export function buildVideoDoc(v: ParsedVideoUrl, topic: string, meta: { title: string; creatorName: string; thumbnailUrl?: string }, source: VideoDoc['source']): VideoDoc {
  return {
    provider: v.provider,
    providerVideoId: v.providerVideoId,
    canonicalUrl: v.canonicalUrl,
    title: meta.title.slice(0, 200) || 'Untitled',
    creatorName: meta.creatorName.slice(0, 100),
    thumbnailUrl: meta.thumbnailUrl || (v.provider === 'youtube' ? youtubeThumb(v.providerVideoId) : ''),
    topic,
    tags: [],
    status: 'approved',
    embedAllowed: true,
    rand: secureRandom(),
    source,
  };
}

/** Upserts approved videos (admin). Chunked to stay below batch limits. */
export async function addVideos(entries: { v: ParsedVideoUrl; doc: VideoDoc }[]): Promise<void> {
  for (let i = 0; i < entries.length; i += 400) {
    const b = writeBatch(db);
    for (const e of entries.slice(i, i + 400)) {
      b.set(doc(db, 'videos', videoDocId(e.v.provider, e.v.providerVideoId)), { ...e.doc, createdAt: serverTimestamp(), checkedAt: serverTimestamp() });
    }
    await b.commit();
  }
}

export async function reviewSubmission(s: Submission, reviewerId: string, decision: 'approved' | 'rejected', edits?: { topic: string; title: string; creatorName: string }) {
  const b = writeBatch(db);
  if (decision === 'approved' && edits) {
    const v: ParsedVideoUrl = { provider: s.provider, providerVideoId: s.providerVideoId, canonicalUrl: s.canonicalUrl };
    b.set(doc(db, 'videos', videoDocId(s.provider, s.providerVideoId)), {
      ...buildVideoDoc(v, edits.topic, edits, 'submission'),
      createdAt: serverTimestamp(),
      checkedAt: serverTimestamp(),
    });
  }
  b.update(doc(db, 'submissions', s.id), { reviewStatus: decision, reviewerId, reviewedAt: serverTimestamp() });
  await b.commit();
}

export interface AdminVideo extends VideoDoc { id: string }

export async function listVideos(topic: string, status: VideoStatus | 'all', cursor: QueryDocumentSnapshot | null) {
  const parts = [where('topic', '==', topic), ...(status === 'all' ? [] : [where('status', '==', status)]), orderBy('createdAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(25)];
  const snap = await getDocs(query(collection(db, 'videos'), ...parts));
  return {
    videos: snap.docs.map((d) => ({ id: d.id, ...(d.data() as VideoDoc) })),
    next: snap.docs.length === 25 ? snap.docs[snap.docs.length - 1] : null,
  };
}

export const setVideoStatus = (id: string, status: VideoStatus) => updateDoc(doc(db, 'videos', id), { status, checkedAt: serverTimestamp() });

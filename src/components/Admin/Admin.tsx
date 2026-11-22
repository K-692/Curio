import { useEffect, useState } from 'preact/hooks';
import type { QueryDocumentSnapshot } from 'firebase/firestore/lite';
import { TOPICS, topicName, isTopic } from '../../app/topics';
import type { VideoStatus } from '../../app/types';
import {
  listPendingSubmissions,
  reviewSubmission,
  listVideos,
  setVideoStatus,
  addVideos,
  buildVideoDoc,
  type Submission,
  type AdminVideo,
} from '../../services/catalog';
import { parseVideoUrl } from '../../services/url';
import { IconExternal } from '../Icons';

export function Admin({ uid }: { uid: string }) {
  const [tab, setTab] = useState<'queue' | 'catalogue' | 'starter'>('queue');
  return (
    <section aria-labelledby="adm-title" class="admin">
      <h1 id="adm-title">Curate</h1>
      <div class="tabs" role="tablist" aria-label="Curator tools">
        {(['queue', 'catalogue', 'starter'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} class="tab" onClick={() => setTab(t)}>
            {t === 'queue' ? 'Submissions' : t === 'catalogue' ? 'Catalogue' : 'Starter set'}
          </button>
        ))}
      </div>
      {tab === 'queue' && <Queue uid={uid} />}
      {tab === 'catalogue' && <Catalogue />}
      {tab === 'starter' && <Starter />}
    </section>
  );
}

function Queue({ uid }: { uid: string }) {
  const [subs, setSubs] = useState<Submission[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    listPendingSubmissions().then(setSubs).catch(() => setErr('Could not load submissions.'));
  }, []);
  const decide = async (s: Submission, d: 'approved' | 'rejected', edits?: { topic: string; title: string; creatorName: string }) => {
    try {
      await reviewSubmission(s, uid, d, edits);
      setSubs((x) => x?.filter((y) => y.id !== s.id) ?? null);
    } catch {
      setErr('Action failed.');
    }
  };
  if (err) return <p class="error" role="alert">{err}</p>;
  if (!subs) return <p role="status" class="muted">Loading…</p>;
  if (!subs.length) return <p class="empty">No pending submissions.</p>;
  return (
    <ul class="cards">
      {subs.map((s) => <SubmissionCard key={s.id} s={s} onDecide={decide} />)}
    </ul>
  );
}

function SubmissionCard({ s, onDecide }: { s: Submission; onDecide: (s: Submission, d: 'approved' | 'rejected', e?: { topic: string; title: string; creatorName: string }) => void }) {
  const [topic, setTopic] = useState(isTopic(s.proposedTopic) ? s.proposedTopic : '');
  const [title, setTitle] = useState(s.title);
  const [creator, setCreator] = useState(s.creatorName);
  return (
    <li class="card">
      <a href={s.canonicalUrl} target="_blank" rel="noopener noreferrer">{s.provider} · {s.providerVideoId} <IconExternal size={14} /></a>
      <label><span>Title</span><input value={title} maxLength={200} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} /></label>
      <label><span>Creator</span><input value={creator} maxLength={100} onInput={(e) => setCreator((e.target as HTMLInputElement).value)} /></label>
      <label>
        <span>Topic</span>
        <select value={topic} onChange={(e) => setTopic((e.target as HTMLSelectElement).value)}>
          <option value="">Choose…</option>
          {TOPICS.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
        </select>
      </label>
      <div class="row">
        <button type="button" class="btn btn-primary" disabled={!topic || !title.trim()} onClick={() => onDecide(s, 'approved', { topic, title: title.trim(), creatorName: creator.trim() })}>Approve</button>
        <button type="button" class="btn btn-ghost" onClick={() => onDecide(s, 'rejected')}>Reject</button>
      </div>
    </li>
  );
}

function Catalogue() {
  const [topic, setTopic] = useState(TOPICS[0].slug);
  const [status, setStatus] = useState<VideoStatus | 'all'>('approved');
  const [videos, setVideos] = useState<AdminVideo[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const load = async (from: QueryDocumentSnapshot | null) => {
    setLoading(true);
    setErr('');
    try {
      const r = await listVideos(topic, status, from);
      setVideos((v) => (from ? [...v, ...r.videos] : r.videos));
      setCursor(r.next);
    } catch {
      setErr('Could not load videos (the index may still be building).');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(null); }, [topic, status]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = async (v: AdminVideo) => {
    const next: VideoStatus = v.status === 'approved' ? 'disabled' : 'approved';
    await setVideoStatus(v.id, next).then(() => setVideos((xs) => xs.map((x) => (x.id === v.id ? { ...x, status: next } : x)))).catch(() => setErr('Update failed.'));
  };
  return (
    <div>
      <div class="row filters">
        <label><span>Topic</span>
          <select value={topic} onChange={(e) => setTopic((e.target as HTMLSelectElement).value)}>
            {TOPICS.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
          </select>
        </label>
        <label><span>Status</span>
          <select value={status} onChange={(e) => setStatus((e.target as HTMLSelectElement).value as VideoStatus | 'all')}>
            {['approved', 'disabled', 'unavailable', 'all'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      {err && <p class="error" role="alert">{err}</p>}
      <ul class="hlist">
        {videos.map((v) => (
          <li key={v.id} class="hitem">
            <a class="hthumb" href={v.canonicalUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${v.title}`}>
              {v.thumbnailUrl ? <img src={v.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span>{v.provider}</span>}
            </a>
            <div class="hbody">
              <span class="chip">{v.status}</span>
              <span class="htitle">{v.title}</span>
              <p class="vsub"><span>{v.creatorName}</span><span>{v.source}</span></p>
            </div>
            <button type="button" class="btn btn-ghost" onClick={() => toggle(v)}>{v.status === 'approved' ? 'Disable' : 'Enable'}</button>
          </li>
        ))}
      </ul>
      {!loading && !videos.length && <p class="empty">No videos in {topicName(topic)} with this status.</p>}
      {loading && <p role="status" class="muted">Loading…</p>}
      {cursor && !loading && <button type="button" class="btn" onClick={() => load(cursor)}>Load more</button>}
    </div>
  );
}

interface SeedEntry { url: string; topic: string; title: string; creatorName: string }

function Starter() {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    setMsg('');
    try {
      const seed = (await import('../../app/seed.json')).default as SeedEntry[];
      const entries = seed.flatMap((s) => {
        const v = parseVideoUrl(s.url);
        return v && isTopic(s.topic) ? [{ v, doc: buildVideoDoc(v, s.topic, { title: s.title, creatorName: s.creatorName }, 'admin') }] : [];
      });
      await addVideos(entries);
      setMsg(`Imported ${entries.length} videos.`);
    } catch {
      setMsg('Import failed.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="form-page">
      <p class="muted">Imports a hand-picked, oEmbed-verified starter set of educational Shorts across every topic. Safe to run again (it upserts).</p>
      <button type="button" class="btn btn-primary" onClick={run} disabled={busy}>{busy ? 'Importing…' : 'Import starter set'}</button>
      {msg && <p role="status">{msg}</p>}
    </div>
  );
}

import { useEffect, useState } from 'preact/hooks';
import { TOPICS } from '../../app/topics';
import { parseVideoUrl } from '../../services/url';
import { lookupOEmbed, type OEmbedInfo } from '../../services/oembed';
import { submitVideo, addVideos, buildVideoDoc, videoExists } from '../../services/catalog';

export function AddVideo({ uid, isAdmin }: { uid: string; isAdmin: boolean }) {
  const [url, setUrl] = useState('');
  const [topic, setTopic] = useState('');
  const [title, setTitle] = useState('');
  const [creator, setCreator] = useState('');
  const [info, setInfo] = useState<OEmbedInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const parsed = parseVideoUrl(url);

  // Validate with the provider's official oEmbed as the user types.
  useEffect(() => {
    setInfo(null);
    if (!parsed) return;
    const ctl = new AbortController();
    setChecking(true);
    lookupOEmbed(parsed, ctl.signal)
      .then((i) => {
        setInfo(i);
        if (i?.title) setTitle(i.title);
        if (i?.creatorName) setCreator(i.creatorName);
      })
      .catch(() => {})
      .finally(() => !ctl.signal.aborted && setChecking(false));
    return () => ctl.abort();
  }, [parsed?.canonicalUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: Event) => {
    e.preventDefault();
    setErr('');
    setOk('');
    if (!parsed) return setErr('Paste a YouTube Shorts/video link or a public Instagram Reel link.');
    if (!topic) return setErr('Choose the topic that fits best.');
    if (info && !info.embeddable) return setErr("This video's creator doesn't allow embedding, so it can't play in Curio.");
    if (!title.trim()) return setErr('Add a short title.');
    setBusy(true);
    try {
      if (isAdmin) {
        await addVideos([{ v: parsed, doc: buildVideoDoc(parsed, topic, { title: title.trim(), creatorName: creator.trim(), thumbnailUrl: info?.thumbnailUrl }, 'admin') }]);
        setOk('Added to the catalogue.');
      } else {
        if (await videoExists(parsed)) {
          setOk('Already in Curio — thanks!');
        } else {
          await submitVideo(uid, parsed, topic, { title: title.trim(), creatorName: creator.trim() });
          setOk('Thanks! A curator will review it soon.');
        }
      }
      setUrl('');
      setTitle('');
      setCreator('');
      setTopic('');
    } catch (e2) {
      const code = (e2 as { code?: string }).code;
      setErr(code === 'permission-denied' ? 'Please wait a minute between suggestions.' : 'Could not submit. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="add-title" class="form-page">
      <h1 id="add-title">{isAdmin ? 'Add a video' : 'Suggest a video'}</h1>
      <p class="muted">Short educational videos from YouTube or public Instagram Reels. {isAdmin ? 'As a curator, it goes live immediately.' : 'Curators review every suggestion.'}</p>
      <form onSubmit={submit} class="form" noValidate>
        <label>
          <span>Link</span>
          <input type="url" inputMode="url" required value={url} onInput={(e) => setUrl((e.target as HTMLInputElement).value)} placeholder="https://www.youtube.com/shorts/…" aria-invalid={url !== '' && !parsed} aria-describedby="url-hint" />
        </label>
        <p id="url-hint" class="hint" aria-live="polite">
          {url && !parsed ? 'Only YouTube and Instagram Reel links are supported.' : checking ? 'Checking…' : info ? (info.embeddable ? `✓ ${info.title}` : '✕ Embedding disabled by the creator') : parsed?.provider === 'instagram' ? 'Instagram Reel — add the title below.' : ' '}
        </p>
        <label>
          <span>Topic</span>
          <select required value={topic} onChange={(e) => setTopic((e.target as HTMLSelectElement).value)}>
            <option value="">Choose a topic…</option>
            {TOPICS.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
          </select>
        </label>
        <label>
          <span>Title</span>
          <input type="text" maxLength={200} value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} />
        </label>
        <label>
          <span>Creator <em class="muted">(optional)</em></span>
          <input type="text" maxLength={100} value={creator} onInput={(e) => setCreator((e.target as HTMLInputElement).value)} />
        </label>
        {err && <p class="error" role="alert">{err}</p>}
        {ok && <p class="success" role="status">{ok}</p>}
        <button class="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Sending…' : isAdmin ? 'Add video' : 'Send suggestion'}</button>
      </form>
    </section>
  );
}

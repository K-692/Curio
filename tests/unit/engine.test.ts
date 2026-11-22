import { describe, it, expect } from 'vitest';
import { buildBatch, emptyCycle, streakOf, newCycle, MAX_STREAK } from '../../src/services/engine';
import type { FeedItem } from '../../src/app/types';

/** Deterministic PRNG for reproducible tests. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function catalogue(spec: Record<string, number>) {
  const map = new Map<string, FeedItem[]>();
  for (const [topic, n] of Object.entries(spec)) {
    map.set(topic, Array.from({ length: n }, (_, i) => ({
      id: `youtube_${topic}-${i}`, provider: 'youtube', providerVideoId: `${topic}${i}`,
      canonicalUrl: '', title: `${topic} ${i}`, creatorName: '', thumbnailUrl: '', topic,
    } as FeedItem)));
  }
  const rng = mulberry32(99);
  const fetch = async (t: string, ex: ReadonlySet<string>) => {
    const pool = (map.get(t) ?? []).filter((v) => !ex.has(v.id));
    return pool.length ? pool[Math.floor(rng() * pool.length)] : null;
  };
  return fetch;
}

const TOPICS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'];

describe('engine', () => {
  it('streakOf counts trailing repeats', () => {
    expect(streakOf(['a', 'b', 'b'], 'b')).toBe(2);
    expect(streakOf(['a', 'b', 'b'], 'a')).toBe(0);
  });

  it('returns 10 unique items and visits every topic before repeating', async () => {
    const fetch = catalogue(Object.fromEntries(TOPICS.map((t) => [t, 50])));
    const r = await buildBatch({ topics: TOPICS, state: emptyCycle(), fetchCandidate: fetch, queued: new Set(), recentlyWatched: new Set(), rng: mulberry32(1) });
    expect(r.items).toHaveLength(10);
    expect(new Set(r.items.map((i) => i.id)).size).toBe(10);
    expect(new Set(r.items.map((i) => i.topic)).size).toBe(10); // 10 of 12 topics, none repeated within a cycle
    const r2 = await buildBatch({ topics: TOPICS, state: r.state, fetchCandidate: fetch, queued: new Set(r.items.map((i) => i.id)), recentlyWatched: new Set(), rng: mulberry32(2) });
    const firstCycle = [...r.items, ...r2.items].slice(0, 12).map((i) => i.topic);
    expect(new Set(firstCycle).size).toBe(12);
  });

  it('never exceeds the consecutive-topic limit across many batches', async () => {
    const fetch = catalogue({ a: 200, b: 200, c: 200 });
    let state = emptyCycle();
    const seen: string[] = [];
    const queued = new Set<string>();
    for (let k = 0; k < 20; k++) {
      const r = await buildBatch({ topics: ['a', 'b', 'c'], state, fetchCandidate: fetch, queued, recentlyWatched: new Set(), rng: mulberry32(k + 10) });
      state = r.state;
      r.items.forEach((i) => { seen.push(i.topic); queued.add(i.id); });
    }
    for (let i = MAX_STREAK; i < seen.length; i++) {
      expect(seen.slice(i - MAX_STREAK, i + 1).every((t) => t === seen[i])).toBe(false);
    }
  });

  it('is fair across topics regardless of catalogue size', async () => {
    const fetch = catalogue({ big: 5000, small: 50, mid: 500 });
    let state = emptyCycle();
    const counts: Record<string, number> = {};
    const queued = new Set<string>();
    for (let k = 0; k < 9; k++) {
      const r = await buildBatch({ topics: ['big', 'small', 'mid'], state, fetchCandidate: fetch, queued, recentlyWatched: new Set(), rng: mulberry32(k) });
      state = r.state;
      r.items.forEach((i) => { counts[i.topic] = (counts[i.topic] ?? 0) + 1; queued.add(i.id); });
    }
    expect(counts.big).toBe(30);
    expect(counts.small).toBe(30);
    expect(counts.mid).toBe(30);
  });

  it('skips exhausted topics without stalling and avoids recently watched where possible', async () => {
    const fetch = catalogue({ a: 3, b: 0, c: 3 });
    const recent = new Set(['youtube_a-0']);
    const r = await buildBatch({ topics: ['a', 'b', 'c'], state: emptyCycle(), fetchCandidate: fetch, queued: new Set(), recentlyWatched: recent, rng: mulberry32(5) });
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.every((i) => i.topic !== 'b')).toBe(true);
    const unseenFirst = r.items.slice(0, 4).map((i) => i.id);
    expect(unseenFirst).not.toContain('youtube_a-0');
    expect(r.short).toBe(true);
  });

  it('returns an empty short batch for an empty catalogue', async () => {
    const r = await buildBatch({ topics: TOPICS, state: emptyCycle(), fetchCandidate: async () => null, queued: new Set(), recentlyWatched: new Set() });
    expect(r.items).toHaveLength(0);
    expect(r.short).toBe(true);
  });

  it('new cycle does not open with the previous topic', () => {
    for (let s = 0; s < 50; s++) expect(newCycle(['a', 'b', 'c'], ['x', 'a'], mulberry32(s))[0]).not.toBe('a');
  });
});

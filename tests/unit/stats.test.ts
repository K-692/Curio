import { describe, it, expect } from 'vitest';
import { radarTopics } from '../../src/services/stats';

describe('radarTopics', () => {
  it('keeps only topics above the average watch time per video', () => {
    // 10 videos, 600 s total → 60 s average per video.
    const r = radarTopics({ topics: { a: 200, b: 150, c: 100, d: 50, e: 100 }, names: { a: 'A' }, videos: 10 });
    expect(r.map((t) => t.slug)).toEqual(['a', 'b', 'c', 'e']);
    expect(r[0].name).toBe('A');
  });
  it('pads to three axes when fewer qualify', () => {
    const r = radarTopics({ topics: { a: 500, b: 10, c: 5, d: 1 }, names: {}, videos: 4 });
    expect(r.map((t) => t.slug)).toEqual(['a', 'b', 'c']);
  });
  it('is empty with no data', () => {
    expect(radarTopics({ topics: {}, names: {}, videos: 0 })).toEqual([]);
  });
});

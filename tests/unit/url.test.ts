import { describe, it, expect } from 'vitest';
import { parseVideoUrl } from '../../src/services/url';

describe('parseVideoUrl', () => {
  it.each([
    ['https://www.youtube.com/shorts/aqz-KE-bpKQ', 'aqz-KE-bpKQ'],
    ['https://youtube.com/shorts/aqz-KE-bpKQ?si=abc', 'aqz-KE-bpKQ'],
    ['https://youtu.be/aqz-KE-bpKQ', 'aqz-KE-bpKQ'],
    ['https://m.youtube.com/watch?v=aqz-KE-bpKQ&t=3', 'aqz-KE-bpKQ'],
  ])('accepts YouTube %s', (u, id) => {
    expect(parseVideoUrl(u)).toEqual({ provider: 'youtube', providerVideoId: id, canonicalUrl: `https://www.youtube.com/shorts/${id}` });
  });
  it('accepts Instagram reels', () => {
    expect(parseVideoUrl('https://www.instagram.com/reel/C1a2B3c4D5e/?igsh=x')?.providerVideoId).toBe('C1a2B3c4D5e');
  });
  it.each([
    'https://evil.com/shorts/aqz-KE-bpKQ',
    'https://youtube.com.evil.com/shorts/aqz-KE-bpKQ',
    'javascript:alert(1)',
    'https://www.youtube.com/shorts/short',
    'https://www.instagram.com/someuser/',
    'not a url',
  ])('rejects %s', (u) => expect(parseVideoUrl(u)).toBeNull());
});

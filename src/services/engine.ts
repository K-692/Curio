/**
 * Always-surprise selection engine (pure logic, no I/O).
 *
 * Rules (blueprint §5.2):
 *  - Shuffled topic cycle: visit every eligible topic before a new cycle starts.
 *  - Fair across topics, not across videos: pick a topic first, then a random video in it.
 *  - Never more than MAX_STREAK consecutive items from one primary topic.
 *  - Exclude already-queued and recently-watched videos while an unseen pool exists.
 *  - A topic with no candidate is marked exhausted for the cycle; the feed never stalls.
 *  - No engagement, watch-time or interest signal is used anywhere.
 */
import { shuffle, secureRandom, type Rng } from './random';
import type { FeedItem } from '../app/types';

export const BATCH_SIZE = 10;
export const MAX_STREAK = 2;
export const LAST_TOPICS_KEPT = 6;

export interface CycleState {
  cycle: string[];
  pos: number;
  exhausted: string[];
  lastTopics: string[];
}

export const emptyCycle = (): CycleState => ({ cycle: [], pos: 0, exhausted: [], lastTopics: [] });

/** How many trailing entries of `last` equal `topic`. */
export function streakOf(last: readonly string[], topic: string): number {
  let n = 0;
  for (let i = last.length - 1; i >= 0 && last[i] === topic; i--) n++;
  return n;
}

/** Start a new shuffled cycle; avoid opening it with the topic that just played. */
export function newCycle(topics: readonly string[], lastTopics: readonly string[], rng: Rng = secureRandom): string[] {
  const c = shuffle(topics, rng);
  const prev = lastTopics[lastTopics.length - 1];
  if (c.length > 1 && c[0] === prev) {
    const j = 1 + Math.floor(rng() * (c.length - 1));
    [c[0], c[j]] = [c[j], c[0]];
  }
  return c;
}

export type CandidateFetcher = (topic: string, exclude: ReadonlySet<string>) => Promise<FeedItem | null>;

export interface BatchResult {
  items: FeedItem[];
  state: CycleState;
  /** True when the catalogue could not supply a full batch. */
  short: boolean;
}

export async function buildBatch(opts: {
  topics: readonly string[];
  state: CycleState;
  fetchCandidate: CandidateFetcher;
  queued: ReadonlySet<string>;
  recentlyWatched: ReadonlySet<string>;
  size?: number;
  rng?: Rng;
}): Promise<BatchResult> {
  const { topics, fetchCandidate, rng = secureRandom } = opts;
  const size = opts.size ?? BATCH_SIZE;
  const st: CycleState = {
    cycle: opts.state.cycle.filter((t) => topics.includes(t)),
    pos: opts.state.pos,
    exhausted: opts.state.exhausted.slice(),
    lastTopics: opts.state.lastTopics.slice(),
  };
  const items: FeedItem[] = [];
  const queued = new Set(opts.queued);
  // Phase 1 excludes recently watched; phase 2 relaxes that ("where possible").
  let relaxed = false;
  let misses = 0;
  let guard = topics.length * 6 + size * 4;

  while (items.length < size && topics.length > 0 && guard-- > 0) {
    if (st.pos >= st.cycle.length) {
      st.cycle = newCycle(topics, st.lastTopics, rng);
      st.pos = 0;
      st.exhausted = [];
    }
    const topic = st.cycle[st.pos++];

    if (st.exhausted.includes(topic)) {
      if (++misses >= topics.length) {
        if (relaxed) break;
        relaxed = true;
        misses = 0;
        st.exhausted = [];
      }
      continue;
    }
    if (streakOf(st.lastTopics, topic) >= MAX_STREAK) {
      // Defer to the end of this cycle rather than dropping it.
      st.cycle.push(topic);
      if (++misses >= topics.length * 2) break;
      continue;
    }

    const exclude = relaxed ? queued : new Set([...queued, ...opts.recentlyWatched]);
    const item = await fetchCandidate(topic, exclude);
    if (!item) {
      st.exhausted.push(topic);
      if (++misses >= topics.length) {
        if (relaxed) break;
        relaxed = true;
        misses = 0;
        st.exhausted = [];
      }
      continue;
    }
    misses = 0;
    items.push(item);
    queued.add(item.id);
    st.lastTopics = [...st.lastTopics, topic].slice(-LAST_TOPICS_KEPT);
  }
  // Keep the cycle array bounded after deferrals.
  if (st.cycle.length > topics.length * 2) {
    st.cycle = st.cycle.slice(st.pos);
    st.pos = 0;
  }
  return { items, state: st, short: items.length < size };
}

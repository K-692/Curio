import { useEffect, useState } from 'preact/hooks';
import { TOPICS } from '../app/topics';
import { loadTopicSeconds } from '../services/stats';

const SIZE = 520;
const C = SIZE / 2;
const R = 170;
const LABEL_R = R + 44;
const RINGS = [0.25, 0.5, 0.75, 1];

const point = (i: number, n: number, r: number) => {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
  return [C + r * Math.cos(a), C + r * Math.sin(a)] as const;
};
const poly = (n: number, r: (i: number) => number) => Array.from({ length: n }, (_, i) => point(i, n, r(i)).join(',')).join(' ');

/**
 * Polymath radar: share of real watch time per topic. Only the chart and its legends
 * (value + topic at every vertex), like a player-performance pentagon.
 */
export function Polymath({ uid }: { uid: string }) {
  const [secs, setSecs] = useState<Record<string, number> | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    loadTopicSeconds(uid).then(setSecs).catch(() => setErr(true));
  }, [uid]);

  const n = TOPICS.length;
  const values = TOPICS.map((t) => Math.max(0, secs?.[t.slug] ?? 0));
  const total = values.reduce((a, b) => a + b, 0);
  const max = Math.max(...values, 1);
  const share = values.map((v) => (total ? (v / total) * 100 : 0));
  const fmt = (v: number) => (v >= 10 ? v.toFixed(1) : v.toFixed(1));

  return (
    <section class="polymath" aria-labelledby="pm-title">
      <h1 id="pm-title" class="sr-only">Polymath</h1>
      {err && <p class="error" role="alert">Could not load your stats.</p>}
      <svg class="radar" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Share of watch time by topic: ${TOPICS.map((t, i) => `${t.name} ${fmt(share[i])}%`).join(', ')}`}>
        <g class="radar-grid">
          {RINGS.map((k) => <polygon key={k} points={poly(n, () => R * k)} />)}
          {TOPICS.map((t, i) => {
            const [x, y] = point(i, n, R);
            return <line key={t.slug} x1={C} y1={C} x2={x} y2={y} />;
          })}
        </g>
        {secs && (
          <polygon
            class="radar-shape"
            points={poly(n, (i) => Math.max(R * 0.04, (R * values[i]) / max))}
          />
        )}
        {TOPICS.map((t, i) => {
          const [x, y] = point(i, n, LABEL_R);
          const anchor = Math.abs(x - C) < 8 ? 'middle' : x > C ? 'start' : 'end';
          return (
            <g key={t.slug} class="radar-label" aria-hidden="true">
              <text x={x} y={y - 4} text-anchor={anchor} class="radar-value">{secs ? fmt(share[i]) : '–'}</text>
              <text x={x} y={y + 14} text-anchor={anchor} class="radar-topic">{t.short}</text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}

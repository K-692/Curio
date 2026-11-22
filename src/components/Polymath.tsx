import { useEffect, useState } from 'preact/hooks';
import { loadStats, radarTopics } from '../services/stats';

const SIZE = 520;
const C = SIZE / 2;
const R = 165;
const LABEL_R = R + 42;
const RINGS = [0.25, 0.5, 0.75, 1];

const point = (i: number, n: number, r: number) => {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
  return [C + r * Math.cos(a), C + r * Math.sin(a)] as const;
};
const poly = (n: number, r: (i: number) => number) => Array.from({ length: n }, (_, i) => point(i, n, r(i)).join(',')).join(' ');

/**
 * Polymath radar: share of real watch time for the topics you watch more than your
 * average per video. Only the chart and its legends (value + topic at each vertex).
 */
export function Polymath({ uid }: { uid: string }) {
  const [axes, setAxes] = useState<{ slug: string; name: string; seconds: number }[] | null>(null);
  useEffect(() => {
    loadStats(uid).then((s) => setAxes(radarTopics(s))).catch(() => setAxes([]));
  }, [uid]);

  // Empty state: a neutral pentagon grid with no values.
  const n = axes && axes.length >= 3 ? axes.length : 5;
  const total = axes?.reduce((a, b) => a + b.seconds, 0) ?? 0;
  const max = Math.max(1, ...(axes ?? []).map((a) => a.seconds));
  const has = !!axes && axes.length >= 3;

  return (
    <section class="polymath" aria-labelledby="pm-title">
      <h1 id="pm-title" class="sr-only">Polymath</h1>
      <svg
        class="radar"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={has ? `Share of watch time: ${axes!.map((a) => `${a.name} ${((a.seconds / total) * 100).toFixed(1)}%`).join(', ')}` : 'No watch time yet'}
      >
        <g class="radar-grid">
          {RINGS.map((k) => <polygon key={k} points={poly(n, () => R * k)} />)}
          {Array.from({ length: n }, (_, i) => {
            const [x, y] = point(i, n, R);
            return <line key={i} x1={C} y1={C} x2={x} y2={y} />;
          })}
        </g>
        {has && <polygon class="radar-shape" points={poly(n, (i) => Math.max(R * 0.05, (R * axes![i].seconds) / max))} />}
        {has &&
          axes!.map((a, i) => {
            const [x, y] = point(i, n, LABEL_R);
            const anchor = Math.abs(x - C) < 8 ? 'middle' : x > C ? 'start' : 'end';
            return (
              <g key={a.slug} aria-hidden="true">
                <text x={x} y={y - 4} text-anchor={anchor} class="radar-value">{((a.seconds / total) * 100).toFixed(1)}</text>
                <text x={x} y={y + 14} text-anchor={anchor} class="radar-topic">{a.name}</text>
              </g>
            );
          })}
      </svg>
    </section>
  );
}

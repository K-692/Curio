import raw from './taxonomy.json';
import type { Topic } from './types';

/** Editable taxonomy (change taxonomy.json). Shared with the ingestion script. */
export const TOPICS: Topic[] = raw.map(({ slug, name, description, short }) => ({ slug, name, description, short }));
export const TOPIC_SLUGS = TOPICS.map((t) => t.slug);
const byslug = new Map(TOPICS.map((t) => [t.slug, t]));
export const topicName = (slug: string) => byslug.get(slug)?.name ?? slug;
export const isTopic = (slug: string) => byslug.has(slug);

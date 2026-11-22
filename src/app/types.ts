export type Provider = 'youtube' | 'instagram';
export type VideoStatus = 'approved' | 'pending' | 'unavailable' | 'disabled';

/** Compact feed record: everything needed to render an item without another read. */
export interface FeedItem {
  /** Firestore doc id: `${provider}_${providerVideoId}` */
  id: string;
  provider: Provider;
  providerVideoId: string;
  canonicalUrl: string;
  title: string;
  creatorName: string;
  thumbnailUrl: string;
  topic: string;
}

export interface VideoDoc extends Omit<FeedItem, 'id'> {
  status: VideoStatus;
  embedAllowed: boolean;
  rand: number;
  tags: string[];
  source: 'admin' | 'submission' | 'ingest';
  createdAt?: unknown;
  checkedAt?: unknown;
}

export interface Topic {
  slug: string;
  name: string;
  /** One-word label for the Polymath chart. */
  short: string;
  description: string;
}

export interface HistoryEntry extends FeedItem {
  watchedAt: Date | null;
  watchSeconds: number;
}

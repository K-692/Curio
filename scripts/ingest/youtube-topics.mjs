/**
 * YouTube's own topic taxonomy (Freebase topic IDs accepted by search.list `topicId`,
 * documented in the YouTube Data API). Curio draws random topics from the whole of YouTube
 * rather than a fixed list of its own.
 */
export const YOUTUBE_TOPICS = [
  // Knowledge & society
  ['/m/01k8wb', 'Knowledge'], ['/m/07c1v', 'Technology'], ['/m/09s1f', 'Business'], ['/m/05qt0', 'Politics'],
  ['/m/06bvp', 'Religion'], ['/m/01h6rj', 'Military'], ['/m/098wr', 'Society'], ['/m/0kt51', 'Health'],
  // Lifestyle
  ['/m/032tl', 'Fashion'], ['/m/027x7n', 'Fitness'], ['/m/02wbm', 'Food'], ['/m/03glg', 'Hobby'], ['/m/068hy', 'Pets'],
  ['/m/041xxh', 'Beauty'], ['/m/07bxq', 'Tourism'], ['/m/07yv9', 'Vehicles'], ['/m/019_rr', 'Lifestyle'],
  // Entertainment
  ['/m/095bb', 'Animation'], ['/m/09kqc', 'Humor'], ['/m/02vxn', 'Movies'], ['/m/05qjc', 'Performing arts'], ['/m/02jjt', 'Entertainment'],
  // Music
  ['/m/0ggq0m', 'Classical music'], ['/m/01lyv', 'Country music'], ['/m/02lkt', 'Electronic music'], ['/m/0glt670', 'Hip hop'],
  ['/m/05rwpb', 'Indie music'], ['/m/03_d0', 'Jazz'], ['/m/028sqc', 'Music of Asia'], ['/m/0g293', 'Latin music'],
  ['/m/064t9', 'Pop music'], ['/m/06cqb', 'Reggae'], ['/m/06j6l', 'R&B'], ['/m/06by7', 'Rock music'], ['/m/0gywn', 'Soul music'],
  ['/m/02mscn', 'Christian music'],
  // Gaming
  ['/m/025zzc', 'Action games'], ['/m/02ntfj', 'Adventure games'], ['/m/0b1vjn', 'Casual games'], ['/m/04q1x3q', 'Puzzle games'],
  ['/m/01sjng', 'Racing games'], ['/m/0403l3g', 'RPGs'], ['/m/021bp2', 'Simulation games'], ['/m/03hf_rm', 'Strategy games'],
  // Sports
  ['/m/0jm_', 'American football'], ['/m/018jz', 'Baseball'], ['/m/018w8', 'Basketball'], ['/m/01cgz', 'Boxing'],
  ['/m/09xp_', 'Cricket'], ['/m/02vx4', 'Football'], ['/m/037hz', 'Golf'], ['/m/03tmr', 'Ice hockey'],
  ['/m/01h7lh', 'MMA'], ['/m/0410tth', 'Motorsport'], ['/m/07bs0', 'Tennis'], ['/m/07_53', 'Volleyball'],
].map(([id, name]) => ({ id, name, slug: name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }));

const byId = new Map(YOUTUBE_TOPICS.map((t) => [t.id, t]));
const byWiki = new Map(YOUTUBE_TOPICS.map((t) => [t.name.toLowerCase(), t]));

/** Map a video's topicDetails (ids or Wikipedia URLs) to the most specific known topic. */
export function topicFromDetails(details) {
  for (const id of details?.relevantTopicIds ?? details?.topicIds ?? []) if (byId.has(id)) return byId.get(id);
  for (const url of details?.topicCategories ?? []) {
    const name = decodeURIComponent(url.split('/').pop() ?? '').replace(/_\(.*\)$/, '').replace(/_/g, ' ').toLowerCase();
    if (byWiki.has(name)) return byWiki.get(name);
  }
  return null;
}

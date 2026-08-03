import { getCollection, type CollectionEntry } from 'astro:content';
export interface PublishedArticle { entry: CollectionEntry<'articles'>; routeSlug: string; tags: string[]; }
export function normalizeTags(tags: string[]): string[] {
  const normalized = tags.map((tag) => tag.trim().toLocaleLowerCase('en').replace(/\s+/gu, ' '));
  if (normalized.some((tag) => tag.length === 0)) throw new Error('Article tags cannot normalize to an empty value.');
  return [...new Set(normalized)].sort((left, right) => left.localeCompare(right, 'en'));
}
export async function getPublishedArticles(now = new Date()): Promise<PublishedArticle[]> {
  const entries = await getCollection('articles');
  const routeSlugs = new Map<string, string>();
  for (const entry of entries) {
    const routeSlug = entry.data.routeSlug;
    const previousId = routeSlugs.get(routeSlug);
    if (previousId) throw new Error(`Duplicate article routeSlug "${routeSlug}" in entries "${previousId}" and "${entry.id}".`);
    routeSlugs.set(routeSlug, entry.id);
  }
  return entries.filter((entry) => !entry.data.draft && entry.data.publishedAt <= now)
    .map((entry) => ({ entry, routeSlug: entry.data.routeSlug, tags: normalizeTags(entry.data.tags) }))
    .sort((left, right) => right.entry.data.publishedAt.getTime() - left.entry.data.publishedAt.getTime() || left.routeSlug.localeCompare(right.routeSlug, 'en'));
}

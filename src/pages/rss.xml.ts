import rss from '@astrojs/rss';
import { getPublishedArticles } from '../lib/articles';
export async function GET(context: { site?: URL }) {
  const articles = await getPublishedArticles();
  return rss({
    title: 'Bartosz Burda - Educational Articles',
    description: 'Notes on what I happen to be working on. Often embedded systems and diagnostics, not always.',
    site: context.site ?? new URL('https://bburda.github.io'),
    items: articles.map(({ entry, routeSlug }) => ({ title: entry.data.title, description: entry.data.description, pubDate: entry.data.publishedAt, link: `/articles/${routeSlug}/` })),
  });
}

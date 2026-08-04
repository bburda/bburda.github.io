import rss from '@astrojs/rss';
import { getPublishedArticles } from '../lib/articles';
export async function GET(context: { site?: URL }) {
  const articles = await getPublishedArticles();
  return rss({
    title: 'Bartosz Burda - Educational Articles',
    description: 'Notes on automotive diagnostics, SOVD, ROS 2, reliable embedded systems and engineering workflows.',
    site: context.site ?? new URL('https://bburda.github.io'),
    items: articles.map(({ entry, routeSlug }) => ({ title: entry.data.title, description: entry.data.description, pubDate: entry.data.publishedAt, link: `/articles/${routeSlug}/` })),
  });
}

// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
// lastmod is the build time. The site only builds on a push to main, so it tracks real edits.
export default defineConfig({
  site: 'https://bburda.github.io',
  integrations: [sitemap({ lastmod: new Date() })],
});

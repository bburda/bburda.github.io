// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
// lastmod is the build time, stamped identically on every URL. It says "this deploy", not "this
// page changed", so a README-only push moves it too.
export default defineConfig({
  site: 'https://bburda.github.io',
  integrations: [sitemap({ lastmod: new Date() })],
});

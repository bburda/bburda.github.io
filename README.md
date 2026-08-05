# Bartosz Burda personal site

This repository publishes [bburda.github.io](https://bburda.github.io), the personal site and educational article archive of Bartosz Burda.

## Local development

Node 24 and npm are required.

```sh
npm ci
npm run check
npm run build
npx playwright install --with-deps chromium
npm run test:content-contract
npm run test:deployed-feed-contract
npm run test:e2e
```

GitHub Actions deploys the static site from `main` to GitHub Pages, then automatically runs the deployed browser and feed contracts against the returned deployment URL. The same checks can be run manually with `npm run test:e2e:deployed` and `npm run test:deployed-feed`. The local deployed-feed contract verifies well-formed RSS and sitemap structure, restricted entity decoding, normalized canonical article URL rules, and exact RSS-to-sitemap membership across alternate content domains.

## Design

The page is a document, not a dashboard. Name and face first, then the work with real screenshots,
then the timeline. The tokens are in `src/styles/global.css`: ink `#0F1A2E` on ground `#F5F7FA`,
accent `#1B4FD8`, and no border radius anywhere. Accent marks what does not change.

Display type is Chivo, labels are Chivo Mono. Both are self-hosted through `@fontsource-variable`,
so the page does not call another host at runtime. Three.js is a normal npm dependency for the same
reason.

`src/scripts/morph3d.ts` draws the one graphic on the page: a vehicle that becomes a humanoid while
the timeline scrolls. Only rigid transforms interpolate. Each part is drawn once and never reshaped.
`homepage.spec.ts` sweeps the whole travel and fails if any state in between splits the body more
than the two end states do. If JavaScript is off, or WebGL is missing, the text inside the stage
stays visible and says the same thing.

Rebuild the 1200x630 link preview card after changing the palette, the display type or the hero
line:

```sh
npm run build:og
```

## Articles

Native Markdown articles live in `src/data/articles`. Bartosz Burda is the global author. Use this frontmatter:

```yaml
---
title: "Article title"
description: "A concise description."
routeSlug: "immutable-article-slug"
publishedAt: "2026-08-03"
updatedAt: "2026-08-03"
tags:
  - SOVD
draft: false
---
```

Published route slugs are immutable. Drafts and future publication dates are excluded from the homepage, archive, routes, sitemap and RSS. Native articles are canonical on this site. Product content published on selfpatch.ai is linked rather than copied. `ARTICLE_FIXTURE_BASE` is reserved for the production-build content contract tests.

## License

MIT

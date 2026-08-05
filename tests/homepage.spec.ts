import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const sizes = [{ width: 320, height: 800 }, { width: 360, height: 800 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }];

for (const viewport of sizes) test(`homepage ${viewport.width}`, async ({ page }) => {
  await page.setViewportSize(viewport); await page.goto('/');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('header, nav, main, footer')).toHaveCount(4);
  // textContent, not innerText: a <br> between the names renders fine but extracts as one fused
  // token, and the whole point of the page is that this exact phrase is findable
  expect(await page.locator('h1').evaluate((node) => node.textContent)).toBe('Bartosz Burda');
  for (const id of ['#about', '#experience', '#work', '#writing', '#contact']) await expect(page.locator(id)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('the first viewport carries the whole identity on the narrowest phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 }); await page.goto('/');
  const hero = page.locator('.hero');
  await expect(hero).toContainText('Bartosz');
  await expect(hero).toContainText('Embedded Software Architect');
  await expect(hero).toContainText('Co-founder of selfpatch.ai');
  await expect(hero).toContainText('diagnostic and recovery layer for robots');
  // the searchable title and the current role are two lines in two colours, not one blur
  const [role, founder] = await page.locator('.hero__line').evaluateAll((nodes) =>
    nodes.map((node) => getComputedStyle(node).color));
  expect(role).not.toBe(founder);
  // name, role and a way out of the page all sit above the fold - not the heading alone
  for (const locator of [page.locator('.hero h1'), page.locator('.hero__sub'), page.locator('.hero__links a').first()]) {
    const box = await locator.boundingBox();
    expect(box && box.y + box.height).toBeLessThanOrEqual(800);
  }
});

test('every claim survives with JavaScript off and motion reduced', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'reduce' });
  const page = await context.newPage(); await page.goto('/');
  // the argument must be text in the DOM, never only inside the drawing
  await expect(page.locator('.stage__fallback')).toBeVisible();
  await expect(page.locator('.stage__fallback')).toContainText('the same rigid parts');
  await expect(page.locator('img[alt="Portrait of Bartosz Burda"]')).toHaveCount(1);
  await expect(page.locator('[data-role]')).toHaveCount(13);
  await expect(page.locator('.project__shot')).toHaveCount(1);
  // the selected work has to be reachable, not just pictured
  await expect(page.locator('#work a[href="https://github.com/selfpatch/ros2_medkit"]').first()).toBeVisible();
  await expect(page.locator('#work a[href="https://selfpatch.github.io/ros2_medkit/"]')).toHaveCount(1);
  // work published on someone else's site is linked from here, so it is not lost
  for (const href of ['https://foxglove.dev/blog/sovd-diagnostics-and-ota-updates-in-foxglove-via-ros2-medkit', 'https://www.selfpatch.ai/articles/en/ros2-medkit-040-release']) {
    await expect(page.locator(`#writing a[href="${href}"]`)).toHaveCount(1);
  }
  await context.close();
});

// Covers every painted CSS colour: html and body, both pseudo-elements, all four borders and the
// outline. It does NOT see canvas pixels, so a red model inside the WebGL scene would pass here.
test('the palette stays cool: nothing on the page renders red', async ({ page }) => {
  await page.goto('/');
  const reds = await page.evaluate(() => {
    const isRed = (value: string): boolean => {
      // computed colours are not guaranteed to use ", " separators, and modern Chromium can emit
      // the space-separated form. A regex that matches nothing would make this test unfailable.
      const nums = value.match(/-?[\d.]+/g);
      if (!nums || !/^(rgba?|color)\b/.test(value) || nums.length < 3) return false;
      const [r, g, b] = nums.slice(value.startsWith('color') ? 1 : 0, 4).map(Number);
      const alpha = /rgba/.test(value) && nums.length > 3 ? Number(nums[3]) : 1;
      if (alpha === 0) return false;
      const scale = r <= 1 && g <= 1 && b <= 1 ? 255 : 1;
      return r * scale > 150 && g * scale < 120 && b * scale < 120;
    };
    const props = ['color', 'backgroundColor', 'outlineColor',
      'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor'] as const;
    const hit: string[] = [];
    for (const node of [document.documentElement, document.body, ...Array.from(document.querySelectorAll<HTMLElement>('body *'))]) {
      for (const pseudo of [null, '::before', '::after']) {
        const style = getComputedStyle(node, pseudo);
        if (pseudo && style.content === 'none') continue;
        for (const prop of props) if (isRed(style[prop])) hit.push(`${node.tagName}.${String(node.className)}${pseudo ?? ''}:${prop}`);
      }
    }
    return [...new Set(hit)];
  });
  expect(reds).toEqual([]);
});

test('metadata, generated endpoints and article archive', async ({ page, request }) => {
  await page.goto('/');
  expect(await page.locator('link[rel=canonical]').getAttribute('href')).toBe('https://bburda.github.io/');
  expect(await page.locator('meta[property="og:type"]').getAttribute('content')).toBe('profile');
  expect(await page.locator('meta[property="og:image"]').getAttribute('content')).toBe('https://bburda.github.io/og.png');
  expect(await page.locator('meta[property="og:image:width"]').getAttribute('content')).toBe('1200');
  expect(await page.locator('meta[property="og:image:height"]').getAttribute('content')).toBe('630');
  expect(await page.locator('meta[property="og:image:alt"]').getAttribute('content')).toContain('Bartosz Burda');
  expect(await page.locator('meta[name="twitter:card"]').getAttribute('content')).toBe('summary_large_image');
  expect(await page.locator('meta[property="og:site_name"]').getAttribute('content')).toBe('Bartosz Burda');
  expect(await page.locator('meta[property="profile:first_name"]').getAttribute('content')).toBe('Bartosz');
  expect(await page.locator('meta[property="profile:last_name"]').getAttribute('content')).toBe('Burda');
  const person = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent() ?? '').mainEntity;
  // sameAs asserts identity, so it carries profiles of the person and never the company
  expect(person.sameAs).toEqual(['https://github.com/bburda', 'https://www.linkedin.com/in/bartosz-burda/', 'https://github.com/bburda42dot']);
  expect(person.sameAs.some((url: string) => url.includes('selfpatch'))).toBe(false);
  expect(person.worksFor['@id']).toBe('https://www.selfpatch.ai/#organization');
  expect([person.givenName, person.familyName]).toEqual(['Bartosz', 'Burda']);
  // nothing on the page may point at the other spelling of the profile
  expect(await page.locator('a[href*="linkedin.com/in/bartoszburda"]').count()).toBe(0);
  // every claimed profile is also asserted in HTML with rel=me, and the company is not
  for (const href of ['https://github.com/bburda', 'https://www.linkedin.com/in/bartosz-burda/']) {
    expect(await page.locator(`a[href="${href}"][rel~="me"]`).count(), href).toBeGreaterThan(0);
  }
  // ~= not =: rel is a token list, so rel="me noopener" would slip past an exact-value match
  expect(await page.locator('a[rel~="me"][href*="selfpatch"]').count()).toBe(0);
  // a link that 308-redirects wastes the hop and breaks exact-URL matching against the target
  expect(await page.locator('a[href^="https://selfpatch.ai"]').count()).toBe(0);
  // no address anywhere in the markup: a plain mailto is harvested within days
  expect(await page.locator('a[href^="mailto:"]').count()).toBe(0);
  expect(await page.content()).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
  // the contact channel is reachable in one click from the top of the page
  await expect(page.locator('.hero__links a[href="https://www.linkedin.com/in/bartosz-burda/"]')).toHaveCount(1);
  await page.goto('/articles/');
  await expect(page.getByRole('heading', { name: 'Articles' })).toBeVisible();
  const rss = await request.get('/rss.xml');
  expect(rss.ok()).toBe(true); expect(await rss.text()).toContain('<rss');
  for (const path of ['/robots.txt', '/sitemap-index.xml', '/favicon.svg', '/404.html', '/og.png', '/portrait.jpg', '/work/ros2-medkit-ui.png']) {
    expect((await request.get(path)).ok(), path).toBe(true);
  }
});

test('the 404 is not an indexable ordinary page', async ({ page }) => {
  await page.goto('/404.html');
  expect(await page.locator('meta[name="robots"]').getAttribute('content')).toBe('noindex, follow');
  expect(await page.locator('meta[property="og:type"]').getAttribute('content')).toBe('website');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('archive uses website Open Graph type', async ({ page }) => {
  await page.goto('/articles/');
  expect(await page.locator('meta[property="og:type"]').getAttribute('content')).toBe('website');
});

test('keyboard order reaches home and every section', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 }); await page.goto('/');
  await page.keyboard.press('Tab'); await expect(page.locator('.skip-link')).toBeFocused();
  for (const href of ['/', '/#about', '/#experience', '/#work', '/#writing', '/#contact']) {
    await page.keyboard.press('Tab');
    await expect(page.locator(`a[href="${href}"]`).first()).toBeFocused();
    // a transparent 2px outline still computes as "2px", so the colour has to be checked too
    const ring = await page.locator(':focus').evaluate((node) => {
      const style = getComputedStyle(node);
      return { width: style.outlineWidth, colour: style.outlineColor, style: style.outlineStyle };
    });
    expect(ring.width, href).not.toBe('0px');
    expect(ring.style, href).not.toBe('none');
    expect(ring.colour, href).not.toMatch(/rgba\([^)]*,\s*0\s*\)|transparent/);
  }
});

test('following the nav never parks a section behind the sticky header', async ({ page }) => {
  // The header stacks and the nav wraps on a phone, growing from 53px to 119px. A fixed
  // scroll-margin-top tuned on the desktop header hides the section label on every jump.
  for (const width of [320, 360, 600, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    for (const id of ['about', 'experience', 'work', 'writing', 'contact']) {
      await page.locator(`header a[href="/#${id}"]`).click();
      await page.waitForTimeout(700);
      const gap = await page.evaluate((section) => {
        const header = document.querySelector('header')!.getBoundingClientRect();
        const label = document.querySelector(`#${section} .sec-head`)!.getBoundingClientRect();
        return label.top - header.bottom;
      }, id);
      expect(gap, `${id} at ${width}px`).toBeGreaterThanOrEqual(0);
    }
  }
});

test('reduced motion holds the drawing still but keeps the timeline marker honest', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('/');
  const marked: string[] = [];
  for (const fraction of [0.25, 0.5, 0.75]) {
    await page.evaluate((f) => window.scrollTo(0, document.body.scrollHeight * f), fraction);
    await page.waitForTimeout(400);
    marked.push(await page.locator('[data-role][data-on="true"] .role__title').first().innerText());
  }
  // the marker is a colour and a scale, not motion, so it must still track the scroll
  expect(new Set(marked).size, `marker stuck on ${marked[0]}`).toBeGreaterThan(1);
  await context.close();
});

test('the transformation is one connected machine at every intermediate value', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await page.goto('/');
  await page.locator('[data-stage3d]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-stage3d] canvas')).toHaveCount(1);
  await expect(page.locator('[data-stage3d]')).toHaveClass(/is-live/);

  // Two measurements, because one axis is not enough. `hole` is the largest vertical gap between
  // neighbouring part centres and catches the body tearing into an upper and a lower cluster.
  // `link` is the longest edge of the minimum spanning tree over the centres in 3D, so a part
  // drifting away sideways raises it even when every height stays put.
  //
  // The two ceilings are deliberately different. `hole` is measured against the end states,
  // because a car and a humanoid legitimately differ in how their mass stacks up. `link` is
  // absolute, set to the longest part in the rig: two centres further apart than that cannot be
  // touching whatever the pose. An end-relative ceiling would not catch a broken end state, since
  // the defect would raise the ceiling with it.
  //
  // Nothing is asserted about the camera. It refits to whatever the body currently is, so every
  // framing number it produces is true by construction and could never fail.
  const sweep = await page.evaluate(() => {
    const hole = (points: { y: number }[]): number => {
      const ys = points.map((p) => p.y).sort((a, b) => a - b);
      let gap = 0;
      for (let i = 1; i < ys.length; i++) gap = Math.max(gap, ys[i] - ys[i - 1]);
      return gap;
    };
    const link = (points: { x: number; y: number; z: number }[]): number => {
      const reached = [points[0]];
      const rest = points.slice(1);
      let longest = 0;
      while (rest.length > 0) {
        let best = 0;
        let bestDistance = Infinity;
        for (let i = 0; i < rest.length; i++) {
          for (const inside of reached) {
            const d = Math.hypot(rest[i].x - inside.x, rest[i].y - inside.y, rest[i].z - inside.z);
            if (d < bestDistance) { bestDistance = d; best = i; }
          }
        }
        longest = Math.max(longest, bestDistance);
        reached.push(rest.splice(best, 1)[0]);
      }
      return longest;
    };
    const steps: { t: number; hole: number; link: number }[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const points = window.__morph!.parts(t);
      steps.push({ t, hole: hole(points), link: link(points) });
    }
    return steps;
  });

  const LONGEST_PART = 2.2; // floorL/floorR in src/scripts/morph3d.ts; the rig peaks at 1.46
  const holeCeiling = Math.max(sweep[0].hole, sweep[sweep.length - 1].hole) * 1.05;
  for (const step of sweep) {
    expect(step.hole, `body tears apart vertically at t=${step.t}`).toBeLessThanOrEqual(holeCeiling);
    expect(step.link, `a part drifts off the body at t=${step.t}`).toBeLessThanOrEqual(LONGEST_PART);
  }
});

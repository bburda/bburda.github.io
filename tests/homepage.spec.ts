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
  for (const id of ['#about', '#experience', '#work', '#writing', '#elsewhere']) await expect(page.locator(id)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('the first viewport carries the whole identity on the narrowest phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 }); await page.goto('/');
  const hero = page.locator('.hero');
  await expect(hero).toContainText('Bartosz');
  await expect(hero).toContainText('Embedded Software Architect');
  await expect(hero).toContainText('diagnostic and recovery layer for robots');
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

test('the palette stays cool: nothing on the page renders red', async ({ page }) => {
  await page.goto('/');
  const reds = await page.evaluate(() => {
    const hit: string[] = [];
    for (const node of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const style = getComputedStyle(node);
      for (const value of [style.color, style.borderTopColor, style.backgroundColor]) {
        const match = /^rgba?\((\d+), (\d+), (\d+)/.exec(value);
        if (!match) continue;
        const [r, g, b] = [Number(match[1]), Number(match[2]), Number(match[3])];
        if (r > 150 && g < 110 && b < 110) hit.push(String(node.className) || node.tagName);
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
    expect(await page.locator(`a[href="${href}"][rel="me"]`).count(), href).toBeGreaterThan(0);
  }
  expect(await page.locator('a[rel="me"][href*="selfpatch"]').count()).toBe(0);
  // a link that 308-redirects wastes the hop and breaks exact-URL matching against the target
  expect(await page.locator('a[href^="https://selfpatch.ai"]').count()).toBe(0);
  await page.goto('/articles/');
  await expect(page.getByRole('heading', { name: 'Educational articles' })).toBeVisible();
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
  for (const href of ['/', '/#about', '/#experience', '/#work', '/#writing', '/#elsewhere']) {
    await page.keyboard.press('Tab');
    await expect(page.locator(`a[href="${href}"]`).first()).toBeFocused();
    expect(await page.locator(':focus').evaluate((node) => getComputedStyle(node).outlineWidth)).not.toBe('0px');
  }
});

test('the transformation is one connected machine at every intermediate value', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await page.goto('/');
  await page.locator('[data-stage3d]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-stage3d] canvas')).toHaveCount(1);
  await expect(page.locator('[data-stage3d]')).toHaveClass(/is-live/);

  // The biggest vertical hole between neighbouring parts, measured across the whole travel. The
  // car and the humanoid are both fine as compositions, so no state in between may be more broken
  // up than the worse of those two ends. A rig with wide staggered spans splits into a car half
  // and a robot half near t=0.5 and scores 1.57 against the 1.37 ceiling this produces.
  const sweep = await page.evaluate(() => {
    const hole = (t: number): number => {
      const ys = window.__morph!.parts(t).map((part) => part.y).sort((a, b) => a - b);
      let gap = 0;
      for (let i = 1; i < ys.length; i++) gap = Math.max(gap, ys[i] - ys[i - 1]);
      return gap;
    };
    const steps: { t: number; hole: number; ndc: number }[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const framed = window.__morph!.probe(t);
      steps.push({ t, hole: hole(t), ndc: Math.max(framed.ndcX, framed.ndcY) });
    }
    return steps;
  });

  const ceiling = Math.max(sweep[0].hole, sweep[sweep.length - 1].hole) * 1.05;
  for (const step of sweep) {
    expect(step.hole, `body splits open at t=${step.t}`).toBeLessThanOrEqual(ceiling);
    expect(step.ndc, `machine leaves the frame at t=${step.t}`).toBeLessThanOrEqual(0.9);
  }
});

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const sizes = [{ width:320,height:800 },{ width:360,height:800 },{ width:768,height:1024 },{ width:1440,height:900 }];
for (const viewport of sizes) test(`homepage ${viewport.width}`, async ({ page }) => {
  await page.setViewportSize(viewport); await page.goto('/');
  await expect(page.locator('h1')).toHaveCount(1); await expect(page.locator('header, nav, main, footer')).toHaveCount(4);
  await expect(page.getByRole('heading',{name:/Embedded architect/})).toBeVisible();
  await expect(page.locator('#articles')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  if (viewport.width === 1440) {
    const lede = await page.locator('.hero .lede').boundingBox();
    const cta = await page.getByRole('link', { name: 'Explore ros2_medkit' }).boundingBox();
    expect(lede && lede.y + lede.height).toBeLessThanOrEqual(900);
    expect(cta && cta.y + cta.height).toBeLessThanOrEqual(900);
  }
});
test('identity and historical separation survive degraded modes', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled:false, reducedMotion:'reduce' });
  const page = await context.newPage(); await page.route(/avatars\.githubusercontent/, (route) => route.abort()); await page.goto('/');
  await expect(page.getByText('This work is separate from selfpatch and ros2_medkit.')).toBeVisible();
  await expect(page.locator('img[alt="Portrait of Bartosz Burda"]')).toHaveCount(1); await context.close();
});
test('metadata, generated endpoints and article archive', async ({ page, request }) => {
  await page.goto('/'); expect(await page.locator('link[rel=canonical]').getAttribute('href')).toBe('https://bburda.github.io/');
  expect(await page.locator('meta[property="og:type"]').getAttribute('content')).toBe('profile');
  const data = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent() ?? '');
  expect(data.mainEntity.sameAs).toEqual(['https://github.com/bburda','https://www.linkedin.com/in/bartosz-burda']);
  await page.goto('/articles/'); await expect(page.getByRole('heading',{name:'Educational articles'})).toBeVisible();
  const rssResponse = await request.get('/rss.xml'); expect(rssResponse.ok()).toBe(true);
  expect(await rssResponse.text()).toContain('<rss');
  for (const path of ['/robots.txt','/sitemap-index.xml','/favicon.svg','/404.html']) expect((await request.get(path)).ok()).toBe(true);
  await page.goto('/404.html'); expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.locator('meta[property="og:type"]').getAttribute('content')).toBe('website');
});
test('archive uses website Open Graph type', async ({ page }) => {
  await page.goto('/articles/'); expect(await page.locator('meta[property="og:type"]').getAttribute('content')).toBe('website');
});
test('first viewport and keyboard order expose the complete identity', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 }); await page.goto('/');
  const heroCopy = page.locator('.hero > div');
  await expect(heroCopy).toContainText('Bartosz Burda'); await expect(heroCopy).toContainText('Embedded architect');
  await expect(heroCopy).toContainText('diagnostics'); await expect(heroCopy).toContainText(/vehicles and robots|vehicle software/);
  await expect(heroCopy).toContainText('selfpatch'); await expect(heroCopy).toContainText('ros2_medkit');
  expect((await heroCopy.boundingBox())?.y).toBeLessThan(800);
  await page.keyboard.press('Tab'); await expect(page.locator('.skip-link')).toBeFocused();
  const expected = ['#top','/#work','/#articles','/#expertise','/#evidence','/#about','/#contact'];
  for (const href of expected) {
    await page.keyboard.press('Tab'); await expect(page.locator(`a[href="${href}"]`).first()).toBeFocused();
    expect(await page.locator(':focus').evaluate((node) => getComputedStyle(node).outlineWidth)).not.toBe('0px');
  }
});

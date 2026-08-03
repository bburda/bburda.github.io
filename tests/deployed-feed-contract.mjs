import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const root = new URL('..', import.meta.url);
const canonical = 'https://canonical.example';
const item = (linkMarkup) => `<item><title>Article</title>${linkMarkup}</item>`;
const feed = (items) => `<?xml version="1.0"?><rss><channel>${items.join('')}</channel></rss>`;
const sitemap = (urls) => `<?xml version="1.0"?><urlset>${urls.map((url) => `<url><loc>${url}</loc></url>`).join('')}</urlset>`;
const sitemapIndex = '<?xml version="1.0"?><sitemapindex><sitemap><loc>https://deployment.example/sitemap-0.xml</loc></sitemap></sitemapindex>';

async function invoke({ rss, urls, trailingSlash = false }) {
  const server = createServer((request, response) => {
    const bodies = { '/rss.xml': rss, '/sitemap-index.xml': sitemapIndex, '/sitemap-0.xml': sitemap(urls) };
    const body = bodies[request.url];
    response.writeHead(body === undefined ? 404 : 200, { 'content-type': 'application/xml' });
    response.end(body ?? 'not found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}${trailingSlash ? '/' : ''}`;
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['tests/deployed-feed.mjs'], {
      cwd: root, env: { ...process.env, PLAYWRIGHT_BASE_URL: base }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, output: `${stdout}${stderr}` }));
  });
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return result;
}

async function succeeds(name, fixture, count) {
  const result = await invoke(fixture);
  assert.equal(result.status, 0, `${name} should pass:\n${result.output}`);
  assert.match(result.output, new RegExp(`agree for ${count} published article\\(s\\)\\.`), `${name} reported the wrong item count`);
}

async function fails(name, fixture, message) {
  const result = await invoke(fixture);
  assert.notEqual(result.status, 0, `${name} should fail but passed:\n${result.output}`);
  assert.match(result.output, message, `${name} failed for the wrong reason:\n${result.output}`);
}

const oneUrl = `${canonical}/articles/one-article/`;
const manyUrls = ['alpha', 'beta-two', 'gamma-3'].map((slug) => `${canonical}/articles/${slug}/`);

await succeeds('empty feed', { rss: feed([]), urls: [] }, 0);
await succeeds('alternate canonical domain and trailing-slash fetch base', {
  rss: feed([item(`<link>${oneUrl}</link>`)]), urls: [oneUrl], trailingSlash: true,
}, 1);
await succeeds('three articles', { rss: feed(manyUrls.map((url) => item(`<link>${url}</link>`))), urls: manyUrls }, 3);
await fails('malformed item', {
  rss: '<rss><channel><item><link>https://canonical.example/articles/one/</link></channel></rss>', urls: [],
}, /malformed or unextractable items/i);
await fails('missing item link', { rss: feed([item('')]), urls: [] }, /exactly one link/i);
await fails('multiple item links', {
  rss: feed([item(`<link>${oneUrl}</link><link>${canonical}/articles/two/</link>`)]), urls: [oneUrl],
}, /exactly one link/i);
await fails('relative item link', { rss: feed([item('<link>/articles/one-article/</link>')]), urls: [] }, /absolute URL/i);
await fails('invalid article route', { rss: feed([item(`<link>${canonical}/articles/Bad_Slug/</link>`)]), urls: [] }, /article URL/i);
await fails('duplicate item URL', {
  rss: feed([item(`<link>${oneUrl}</link>`), item(`<link>${oneUrl}</link>`)]), urls: [oneUrl],
}, /duplicate article URLs/i);
await fails('missing exact sitemap URL', {
  rss: feed([item(`<link>${oneUrl}</link>`)]), urls: ['https://other.example/articles/one-article/'],
}, /missing from sitemap/i);

console.log('Deployed feed validator contract matrix passed.');

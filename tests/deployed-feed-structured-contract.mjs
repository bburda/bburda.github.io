import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const root = new URL('..', import.meta.url);
const canonical = 'https://canonical.example/articles/one/';
const pageUrl = 'https://canonical.example/';
const validIndex = '<sitemapindex><sitemap><loc>https://deployment.example/sitemap-0.xml</loc></sitemap></sitemapindex>';
const validSitemap = `<urlset><url><loc>${pageUrl}</loc></url><url><loc>${canonical}</loc></url></urlset>`;
const validFeed = (linkMarkup) => `<rss><channel><item>${linkMarkup}</item></channel></rss>`;

async function invoke(rss, sitemap = validSitemap) {
  const server = createServer((request, response) => {
    const bodies = { '/rss.xml': rss, '/sitemap-index.xml': validIndex, '/sitemap-0.xml': sitemap };
    response.writeHead(200, { 'content-type': 'application/xml' });
    response.end(bodies[request.url]);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['tests/deployed-feed.mjs'], {
      cwd: root,
      env: { ...process.env, PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${port}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, output }));
  });
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return result;
}

const cases = [
  ['self-closing extra direct link', validFeed(`<link/><link>${canonical}</link>`), validSitemap, /exactly one.*link/i],
  ['sitemap comment decoy', validFeed(`<link>${canonical}</link>`), `<urlset><url><loc>${pageUrl}</loc></url><!--<url><loc>${canonical}</loc></url>--></urlset>`, /missing from sitemap/i],
  ['unclosed RSS channel and root', `<rss><channel><item><link>${canonical}</link></item>`, validSitemap, /invalid RSS XML/i],
  ['RSS comment link decoy', validFeed(`<!--<link>${canonical}</link>-->`), validSitemap, /exactly one.*link/i],
  ['RSS CDATA link decoy', validFeed(`<![CDATA[<link>${canonical}</link>]]>`), validSitemap, /exactly one.*link/i],
  ['credential-bearing article URL', validFeed('<link>https://user:secret@canonical.example/articles/one/</link>'), '<urlset><url><loc>https://user:secret@canonical.example/articles/one/</loc></url></urlset>', /credentials/i],
  ['query-bearing article URL', validFeed(`<link>${canonical}?source=rss</link>`), `<urlset><url><loc>${canonical}?source=rss</loc></url></urlset>`, /query/i],
  ['fragment-bearing article URL', validFeed(`<link>${canonical}#section</link>`), `<urlset><url><loc>${canonical}#section</loc></url></urlset>`, /fragment/i],
];

const accepted = [];
for (const [name, rss, sitemap, expected] of cases) {
  const result = await invoke(rss, sitemap);
  if (result.status === 0) accepted.push(name);
  else assert.match(result.output, expected, `${name} failed for the wrong reason:\n${result.output}`);
}
assert.deepEqual(accepted, [], `Structurally invalid XML cases were accepted: ${accepted.join(', ')}`);
console.log('Structured XML rejection contract matrix passed.');

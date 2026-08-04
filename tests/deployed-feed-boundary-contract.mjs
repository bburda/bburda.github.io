import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const root = new URL('..', import.meta.url);
const page = 'https://canonical.example/';
const canonical = 'https://canonical.example/articles/one/';
const index = '<sitemapindex><sitemap><loc>https://deployment.example/sitemap-0.xml</loc></sitemap></sitemapindex>';
const feed = (links, prolog = '') => `${prolog}<rss><channel>${links.map((link) => `<item><link>${link}</link></item>`).join('')}</channel></rss>`;
const sitemap = (links) => `<urlset><url><loc>${page}</loc></url>${links.map((link) => `<url><loc>${link}</loc></url>`).join('')}</urlset>`;

async function invoke(rss, map) {
  const server = createServer((request, response) => {
    const bodies = { '/rss.xml': rss, '/sitemap-index.xml': index, '/sitemap-0.xml': map };
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

async function succeeds(name, rss, map) {
  const result = await invoke(rss, map);
  assert.equal(result.status, 0, `${name} should pass:\n${result.output}`);
}

const atExpansionLimit = `https://canonical.example/articles/${'&#111;'.repeat(1_000)}/`;
const overExpansionLimit = `https://canonical.example/articles/${'&#111;'.repeat(1_001)}/`;
const rejected = [
  ['bare query delimiter', feed([`${canonical}?`]), sitemap([`${canonical}?`]), /query delimiter/i],
  ['bare fragment delimiter', feed([`${canonical}#`]), sitemap([`${canonical}#`]), /fragment delimiter/i],
  ['normalized duplicate', feed(['https://CANONICAL.example:443/articles/one/', canonical]), sitemap(['https://CANONICAL.example:443/articles/one/', canonical]), /duplicate article URLs/i],
  ['input DOCTYPE entity', feed(['&article;'], '<!DOCTYPE rss [<!ENTITY article "https://canonical.example/articles/one/">]>'), sitemap([canonical]), /input entity/i],
  ['external entity', feed(['&external;'], '<!DOCTYPE rss [<!ENTITY external SYSTEM "https://attacker.example/article">]>'), sitemap([canonical]), /external entity|invalid RSS XML/i],
  ['entity expansion count limit', feed([overExpansionLimit]), sitemap([canonical]), /expansion count limit/i],
];
const accepted = [];
for (const [name, rss, map, expected] of rejected) {
  const result = await invoke(rss, map);
  if (result.status === 0) accepted.push(name);
  else assert.match(result.output, expected, `${name} failed for the wrong reason:\n${result.output}`);
}

const decimal = 'https://canonical.example/articles/&#111;ne/';
const hexadecimal = 'https://canonical.example/articles/o&#x6e;e/';
await succeeds('decimal numeric character reference', feed([decimal]), sitemap([decimal]));
await succeeds('hex numeric character reference', feed([hexadecimal]), sitemap([hexadecimal]));
await succeeds('entity expansion count endpoint', feed([atExpansionLimit]), sitemap([atExpansionLimit]));
assert.deepEqual(accepted, [], `Canonical/entity boundary cases were accepted: ${accepted.join(', ')}`);
console.log('Canonical URL and entity boundary contract matrix passed.');

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const root = process.cwd();
const fixtures = resolve(root, 'tests/fixtures/articles');
function build(name, success = true) {
  const env = { ...process.env };
  if (name) env.ARTICLE_FIXTURE_BASE = resolve(fixtures, name);
  else delete env.ARTICLE_FIXTURE_BASE;
  const result = spawnSync('npm', ['run', 'build', '--', '--force'], { cwd: root, env, encoding: 'utf8' });
  const output = `${result.stdout}\n${result.stderr}`;
  if ((result.status === 0) !== success) throw new Error(`${name || 'empty'} build expectation failed:\n${output}`);
  return output;
}
const html = (path) => readFileSync(resolve(root, 'dist', path), 'utf8');
build();
if (!html('articles/index.html').includes('No articles published yet.') || html('rss.xml').includes('<item>')) throw new Error('Real collection is not empty.');
build('one');
for (const path of ['index.html','articles/index.html','articles/one-article/index.html','rss.xml']) if (!html(path).includes('One article')) throw new Error(`One fixture missing from ${path}`);
if (!html('sitemap-0.xml').includes('/articles/one-article/')) throw new Error('One fixture missing from sitemap.');
const article = html('articles/one-article/index.html');
if (!article.includes('Written by') || !article.includes('BlogPosting') || !article.includes('https://bburda.github.io/articles/one-article/')) throw new Error('Article identity metadata mismatch.');
if (!article.includes('property="og:type" content="article"')) throw new Error('Article Open Graph type mismatch.');
build('many');
const many = html('articles/index.html');
if (!(many.indexOf('Newest') < many.indexOf('Alpha') && many.indexOf('Alpha') < many.indexOf('Beta'))) throw new Error('Article ordering is not deterministic.');
if ((many.match(/mixed tag/g) ?? []).length !== 2) throw new Error('Tags were not normalized and deduplicated per article.');
build('draft-future');
const surfaces = ['index.html','articles/index.html','rss.xml','sitemap-0.xml'].map(html).join('\n');
if (!surfaces.includes('Published fixture') || surfaces.includes('Draft fixture') || surfaces.includes('Future fixture') || existsSync(resolve(root,'dist/articles/draft-fixture'))) throw new Error('Publication filtering failed.');
for (const [name, token] of [['invalid-unknown','author'],['invalid-date-order','updatedAt'],['invalid-slug','routeSlug']]) {
  const output = build(name, false); if (!output.includes(token)) throw new Error(`${name} failure did not identify ${token}`);
}
for (const name of ['invalid-date-format', 'invalid-calendar-date', 'invalid-non-leap-date', 'invalid-century-date']) {
  const output = build(name, false); if (!output.includes('YYYY-MM-DD')) throw new Error(`${name} failure did not identify the date contract`);
}
build('valid-leap-date');
if (!existsSync(resolve(root, 'dist/articles/valid-leap-date/index.html'))) throw new Error('Valid leap date was rejected.');
build('valid-century-leap-date');
if (!existsSync(resolve(root, 'dist/articles/valid-century-leap-date/index.html'))) throw new Error('Valid century leap date was rejected.');
const duplicate = build('duplicate-slug', false);
for (const token of ['same-slug','entries "first" and "second"']) if (!duplicate.includes(token)) throw new Error(`Duplicate failure missing ${token}`);
for (const name of ['renamed-a','renamed-b']) { build(name); if (!existsSync(resolve(root,'dist/articles/stable-route/index.html'))) throw new Error(`Stable route failed for ${name}`); }
build();
if (existsSync(resolve(root, 'dist/articles/stable-route')) || html('rss.xml').includes('<item>')) throw new Error('Fixture state leaked into the production collection.');
console.log('Content contract production-build matrix passed.');

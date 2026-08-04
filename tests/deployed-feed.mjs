import { EntityDecoder, ENTITY_ACTION } from '@nodable/entities';
import { XMLParser } from 'fast-xml-parser';
import { SyntaxValidator } from 'fast-xml-validator';

const base = (process.env.PLAYWRIGHT_BASE_URL ?? 'https://bburda.github.io').replace(/\/$/, '');
const get = (path) => fetch(`${base}${path}`).then((response) => {
  if (!response.ok) throw new Error(`${path} unavailable`);
  return response.text();
});
const [rss, sitemapIndex, sitemap] = await Promise.all([get('/rss.xml'), get('/sitemap-index.xml'), get('/sitemap-0.xml')]);

const entityDecoder = new EntityDecoder({
  limit: { applyLimitsTo: 'all', maxExpandedLength: 65_536, maxTotalExpansions: 1_000 },
  ncr: { nullNCR: 'throw', onNCR: 'allow', xmlVersion: 1.0 },
  numericAllowed: true,
  onExternalEntity: () => ENTITY_ACTION.THROW,
  onInputEntity: () => ENTITY_ACTION.THROW,
});
const arrays = new Set([
  'rss.channel', 'rss.channel.item', 'rss.channel.item.link',
  'sitemapindex.sitemap', 'sitemapindex.sitemap.loc',
  'urlset.url', 'urlset.url.loc',
]);
const parser = new XMLParser({
  alwaysCreateTextNode: true,
  cdataPropName: '#cdata',
  commentPropName: '#comment',
  entityDecoder,
  ignoreAttributes: false,
  isArray: (_tagName, path) => arrays.has(path),
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
});
function parseXml(xml, label) {
  try {
    SyntaxValidator.validate(xml, { multipleRoots: false });
    return parser.parse(xml);
  } catch (error) {
    throw new Error(`Invalid ${label} XML: ${error.message}`);
  }
}
const rssDocument = parseXml(rss, 'RSS');
const sitemapIndexDocument = parseXml(sitemapIndex, 'sitemap index');
const sitemapDocument = parseXml(sitemap, 'sitemap');

function requireObject(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value;
}
function requireOne(values, message) {
  if (!Array.isArray(values) || values.length !== 1) throw new Error(message);
  return values[0];
}
function requirePlainText(node, message) {
  const value = requireObject(node, message);
  if (Object.keys(value).length !== 1 || typeof value['#text'] !== 'string' || value['#text'].length === 0) throw new Error(message);
  return value['#text'];
}
function requireAbsoluteHttpUrl(value, label) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`${label} must be a valid absolute URL.`); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${label} must be an HTTP absolute URL.`);
  return parsed;
}

const rssRoot = requireObject(rssDocument?.rss, 'RSS must contain an rss root.');
const channel = requireObject(requireOne(rssRoot.channel, 'RSS must contain exactly one direct channel.'), 'RSS channel must be an element.');
const articleUrls = (channel.item ?? []).map((item, index) => {
  const itemElement = requireObject(item, `RSS item ${index + 1} must be an element.`);
  const link = requirePlainText(requireOne(itemElement.link, `RSS item ${index + 1} must contain exactly one direct plain-text link.`), `RSS item ${index + 1} link must contain only plain text.`);
  const parsed = requireAbsoluteHttpUrl(link, `RSS item ${index + 1} link`);
  if (parsed.username || parsed.password) throw new Error(`RSS item ${index + 1} link must not contain credentials.`);
  if (link.includes('?')) throw new Error(`RSS item ${index + 1} link must not contain a query delimiter.`);
  if (link.includes('#')) throw new Error(`RSS item ${index + 1} link must not contain a fragment delimiter.`);
  if (!/^\/articles\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/.test(parsed.pathname)) throw new Error(`RSS item ${index + 1} link is not a valid article URL: ${link}`);
  return parsed.href;
});
if (new Set(articleUrls).size !== articleUrls.length) throw new Error('RSS contains duplicate article URLs.');

const sitemapIndexRoot = requireObject(sitemapIndexDocument?.sitemapindex, 'Sitemap index must contain a sitemapindex root.');
if (!Array.isArray(sitemapIndexRoot.sitemap) || sitemapIndexRoot.sitemap.length === 0) throw new Error('Sitemap index must contain a direct sitemap entry.');
const indexedSitemaps = sitemapIndexRoot.sitemap.map((entry, index) => {
  const sitemapEntry = requireObject(entry, `Sitemap index entry ${index + 1} must be an element.`);
  const loc = requirePlainText(requireOne(sitemapEntry.loc, `Sitemap index entry ${index + 1} must contain exactly one direct loc.`), `Sitemap index entry ${index + 1} loc must contain only plain text.`);
  return requireAbsoluteHttpUrl(loc, `Sitemap index entry ${index + 1} loc`);
});
if (!indexedSitemaps.some((url) => url.pathname === '/sitemap-0.xml' && !url.search && !url.hash)) throw new Error('Sitemap index does not contain /sitemap-0.xml.');

const sitemapRoot = requireObject(sitemapDocument?.urlset, 'Sitemap must contain a urlset root.');
if (!Array.isArray(sitemapRoot.url) || sitemapRoot.url.length === 0) throw new Error('Sitemap urlset must contain a direct url entry with loc.');
const sitemapUrls = new Set(sitemapRoot.url.map((entry, index) => {
  const urlEntry = requireObject(entry, `Sitemap URL entry ${index + 1} must be an element.`);
  const loc = requirePlainText(requireOne(urlEntry.loc, `Sitemap URL entry ${index + 1} must contain exactly one direct loc.`), `Sitemap URL entry ${index + 1} loc must contain only plain text.`);
  return requireAbsoluteHttpUrl(loc, `Sitemap URL entry ${index + 1} loc`).href;
}));
for (const articleUrl of articleUrls) if (!sitemapUrls.has(articleUrl)) throw new Error(`RSS article missing from sitemap: ${articleUrl}`);
if ([...sitemapUrls].some((url) => url.includes('fixtures'))) throw new Error('Fixture route leaked into sitemap.');
console.log(`Deployed feed and sitemap agree for ${articleUrls.length} published article(s).`);

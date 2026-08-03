const base = (process.env.PLAYWRIGHT_BASE_URL ?? 'https://bburda.github.io').replace(/\/$/, '');
const get = (path) => fetch(`${base}${path}`).then((r) => { if (!r.ok) throw new Error(`${path} unavailable`); return r.text(); });
const [rss, sitemapIndex, sitemap] = await Promise.all([get('/rss.xml'), get('/sitemap-index.xml'), get('/sitemap-0.xml')]);
if (!rss.includes('<rss')) throw new Error('Invalid RSS feed.');
if (!sitemapIndex.includes('<sitemapindex') || !sitemapIndex.includes('/sitemap-0.xml')) throw new Error('Invalid sitemap index.');
const decodeXml = (value) => value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (_entity, code) => {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  if (code[0] !== '#') return named[code.toLowerCase()];
  const hexadecimal = code[1].toLowerCase() === 'x';
  return String.fromCodePoint(Number.parseInt(code.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10));
});
const items = [...rss.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((match) => match[1]);
const itemOpenings = [...rss.matchAll(/<item(?:\s[^>]*)?>/gi)].length;
const itemClosings = [...rss.matchAll(/<\/item>/gi)].length;
if (items.length !== itemOpenings || items.length !== itemClosings) throw new Error('RSS contains malformed or unextractable items.');
const articleUrls = items.map((item, index) => {
  const links = [...item.matchAll(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/gi)];
  if (links.length !== 1) throw new Error(`RSS item ${index + 1} must contain exactly one link.`);
  const articleUrl = decodeXml(links[0][1].trim());
  let parsed;
  try { parsed = new URL(articleUrl); } catch { throw new Error(`RSS item ${index + 1} link must be a valid absolute URL.`); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`RSS item ${index + 1} link must be an HTTP absolute URL.`);
  if (!/^\/articles\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/.test(parsed.pathname)) throw new Error(`RSS item ${index + 1} link is not a valid article URL: ${articleUrl}`);
  return articleUrl;
});
if (new Set(articleUrls).size !== articleUrls.length) throw new Error('RSS contains duplicate article URLs.');
const sitemapUrls = new Set([...sitemap.matchAll(/<loc(?:\s[^>]*)?>([\s\S]*?)<\/loc>/gi)].map((match) => decodeXml(match[1].trim())));
for (const articleUrl of articleUrls) if (!sitemapUrls.has(articleUrl)) throw new Error(`RSS article missing from sitemap: ${articleUrl}`);
if (sitemap.includes('fixtures')) throw new Error('Fixture route leaked into sitemap.');
console.log(`Deployed feed and sitemap agree for ${articleUrls.length} published article(s).`);

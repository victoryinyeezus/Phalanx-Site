// Search engine checks: every page in sitemap.xml has a meta description
// Bing accepts (110 to 155 characters), every image has alt text, and pages
// left out of the sitemap tell search engines not to index them.
// Run: node --test tests/seo.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from './minidom.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (name) => readFileSync(new URL(name, ROOT), 'utf8');
const PAGES = readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort();

const SITEMAP = [...read('sitemap.xml').matchAll(/<loc>https:\/\/inboxocd\.com\/([^<]*)<\/loc>/g)]
  .map((m) => (m[1] === '' ? 'index.html' : m[1] + '.html'));

const meta = (doc, attr, value) => {
  const el = doc.querySelectorAll('meta').find((m) => m.getAttribute(attr) === value);
  return el ? el.getAttribute('content') : null;
};

test('the sitemap lists real pages', () => {
  assert.ok(SITEMAP.length >= 10, 'sitemap has ' + SITEMAP.length + ' pages');
  for (const name of SITEMAP) assert.ok(PAGES.includes(name), name + ' exists');
});

test('every sitemap page has a 110 to 155 character meta description', () => {
  for (const name of SITEMAP) {
    const doc = parse(read(name), name);
    const d = meta(doc, 'name', 'description');
    assert.ok(d, name + ' has a meta description');
    assert.ok(d.length >= 110 && d.length <= 155, name + ' description is ' + d.length + ' characters');
    assert.ok(!/\$\d/.test(d), name + ' description has no price (prices live in pricing.js)');
    for (const [attr, value] of [['property', 'og:description'], ['name', 'twitter:description']]) {
      const other = meta(doc, attr, value);
      if (other !== null) assert.equal(other, d, name + ' ' + value + ' matches the description');
    }
  }
});

test('pages left out of the sitemap are marked noindex', () => {
  for (const name of PAGES.filter((f) => !SITEMAP.includes(f))) {
    const doc = parse(read(name), name);
    assert.match(meta(doc, 'name', 'robots') || '', /noindex/, name + ' has <meta name="robots" content="noindex">');
  }
});

test('every image has alt text', () => {
  for (const name of PAGES) {
    const doc = parse(read(name), name);
    for (const img of doc.querySelectorAll('img')) {
      const alt = (img.getAttribute('alt') || '').trim();
      assert.ok(alt, name + ': <img src="' + img.getAttribute('src') + '"> has alt text');
    }
    // Images added by page scripts would skip the check above.
    for (const s of doc.querySelectorAll('script')) {
      assert.ok(!/createElement\(\s*['"]img['"]|new Image\(|<img/i.test(s.textContent), name + ' script adds no images');
    }
  }
});

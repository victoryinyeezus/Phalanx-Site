// Every page with a price reads pricing.js. These tests load each page with
// the clock set before and after the launch price ends (January 23, 2027)
// and check what a reader would see. Run: node --test tests/pricing.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parse, visibleText, runPage } from './minidom.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (name) => readFileSync(new URL(name, ROOT), 'utf8');
const PRICING_SRC = read('pricing.js');
const P = createRequire(import.meta.url)('../pricing.js');

const BEFORE = Date.UTC(2026, 10, 28, 12);        // during the launch
const LAST_SECOND = Date.UTC(2027, 0, 23, 23, 59, 59);
const AFTER = Date.UTC(2027, 0, 24);              // the moment it ends
const LATER = Date.UTC(2027, 5, 1);

const PAGES = readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort();
// Pages that show an individual license price.
const PRICED = [
  'index.html', 'upgrade.html', 'outlook-storage-full.html', 'delete-old-emails-outlook.html',
  'outlook-emails-by-sender.html', 'unsubscribe-outlook.html', 'clean-outlook-inbox-iphone.html',
  'clean-email-alternative.html',
];

function load(name, now, search = '') {
  const doc = parse(read(name), name);
  runPage(doc, { now, search, files: { 'pricing.js': PRICING_SRC } });
  return doc;
}
const squash = (s) => s.replace(/\s+/g, ' ');
const seen = (doc) => squash(visibleText(doc.body));

test('pricing.js holds the launch and regular prices and the end date', () => {
  assert.deepEqual(P.regular, { Outlook: 25, Standard: 59, AddGmail: 34 });
  assert.deepEqual(P.launch, { Outlook: 19, Standard: 39, AddGmail: 20 });
  assert.equal(P.launchEnds, Date.UTC(2027, 0, 24));
  assert.equal(P.launchEndText, 'January 23, 2027');
  assert.equal(P.isLaunch(LAST_SECOND), true);
  assert.equal(P.isLaunch(AFTER), false);
  assert.equal(P.price('Outlook', BEFORE), '$19');
  assert.equal(P.price('Outlook', AFTER), '$25');
  assert.equal(P.price('Standard', BEFORE), '$39');
  assert.equal(P.price('Standard', AFTER), '$59');
  assert.equal(P.price('AddGmail', BEFORE), '$20');
  assert.equal(P.price('AddGmail', AFTER), '$34');
  assert.equal(P.codesFor('reddit').Outlook, 'REDDIT19');
  assert.equal(P.codesFor('nope'), P.codes.APP);
  assert.equal(P.codesFor(null), P.codes.APP);
});

test('every page is well formed and its JSON-LD parses', () => {
  for (const name of PAGES) {
    const doc = parse(read(name), name);
    for (const s of doc.querySelectorAll('script[type=application/ld+json]')) {
      assert.doesNotThrow(() => JSON.parse(s.textContent), name);
    }
  }
});

test('every priced page loads pricing.js and its no-JS text matches it', () => {
  for (const name of PRICED) {
    const doc = parse(read(name), name);
    assert.ok(doc.querySelector('script[src=pricing.js]'), name + ' loads pricing.js');
    for (const el of doc.querySelectorAll('[data-price-regular]')) {
      assert.equal(el.textContent, '$' + P.regular[el.getAttribute('data-price-regular')], name);
    }
    for (const el of doc.querySelectorAll('[data-price-launch]')) {
      assert.equal(el.textContent, '$' + P.launch[el.getAttribute('data-price-launch')], name);
    }
    for (const el of doc.querySelectorAll('[data-price]')) {
      assert.equal(el.textContent, '$' + P.regular[el.getAttribute('data-price')], name + ' shows the regular price without JS');
    }
    for (const el of doc.querySelectorAll('[data-launch-end]')) assert.equal(el.textContent, P.launchEndText, name);
  }
});

test('no page states a license price by hand outside pricing.js markup', () => {
  // Prices in visible text must sit inside a data-price* span, except
  // Business seats ($20, $45) and other companies' prices in the comparison table.
  for (const name of PRICED) {
    const doc = parse(read(name), name);
    for (const el of doc.querySelectorAll('[data-price-regular]')) el.textContent = '';
    for (const el of doc.querySelectorAll('[data-price-launch]')) el.textContent = '';
    for (const el of doc.querySelectorAll('[data-price]')) el.textContent = '';
    const text = squash(visibleText(doc.body));
    const left = (text.match(/\$\d+(\.\d+)?/g) || []).filter((p) => !['$20', '$45', '$10', '$30', '$4.54', '$9'].includes(p));
    assert.deepEqual(left, [], name);
  }
});

test('home page during the launch: launch prices, banner and notes show', () => {
  for (const now of [BEFORE, LAST_SECOND]) {
    const doc = load('index.html', now);
    assert.equal(doc.getElementById('priceOutlook').textContent, '$19');
    assert.equal(doc.getElementById('priceStandard').textContent, '$39');
    assert.equal(doc.getElementById('saleBanner').hidden, false);
    const text = seen(doc);
    assert.match(text, /Launch price: Inbox OCD for Outlook is \$19 through January 23, 2027\./);
    assert.match(text, /Then pay once, yours to keep: \$25 for Outlook, or \$19 at the launch price through January 23, 2027\./);
    assert.match(text, /Launch price through January 23, 2027\. Then \$25\./);
    assert.match(text, /Launch price through January 23, 2027\. Then \$59\./);
    assert.match(text, /Launch price applied at checkout\. Ends January 23, 2027\./);
    assert.doesNotMatch(text, /normally|Black Friday|Cyber Monday/i);
  }
});

test('home page after the launch: regular prices, no launch text', () => {
  for (const now of [AFTER, LATER]) {
    const doc = load('index.html', now, '?offer=IG');
    assert.equal(doc.getElementById('priceOutlook').textContent, '$25');
    assert.equal(doc.getElementById('priceStandard').textContent, '$59');
    const text = seen(doc);
    assert.doesNotMatch(text, /launch/i);
    assert.doesNotMatch(text, /\$19|\$39/);
    assert.match(text, /Then pay once, yours to keep: \$25 for Outlook\./);
    assert.equal(doc.getElementById('buyOutlook').href, 'https://buy.stripe.com/3cI8wPfqkgb8aFCasV5sA02');
    assert.equal(doc.getElementById('buyStandard').href, 'https://buy.stripe.com/9B65kD5PKaQOaFC58B5sA00');
  }
});

test('home page checkout links keep their launch codes per ?offer=', () => {
  const cases = { '': 'APP', '?offer=ig': 'IG', '?offer=FB': 'FB', '?offer=xcom': 'XCOM', '?offer=TikTok': 'TIKTOK', '?offer=REDDIT': 'REDDIT', '?offer=APP': 'APP', '?offer=bogus': 'APP' };
  for (const [search, channel] of Object.entries(cases)) {
    const doc = load('index.html', BEFORE, search);
    assert.equal(doc.getElementById('buyOutlook').href, 'https://buy.stripe.com/5kQbJ1emge3000YeJb5sA03?prefilled_promo_code=' + channel + '19', search);
    assert.equal(doc.getElementById('buyStandard').href, 'https://buy.stripe.com/00w7sLa608IGdROasV5sA01?prefilled_promo_code=' + channel + '39', search);
    // Business seats never take the launch codes.
    assert.equal(doc.getElementById('bizOutlook').href, 'https://buy.stripe.com/6oU6oH91W7EC6pmfNf5sA06');
    assert.equal(doc.getElementById('bizGmail').href, 'https://buy.stripe.com/bJe5kD0vq8IGdRO0Sl5sA07');
  }
});

test('Add Gmail page flips from $20 to $34 with the same checkout links', () => {
  const lic = 'lic_0123456789abcdef01234567';
  let doc = load('upgrade.html', BEFORE, '?license=' + lic);
  assert.equal(doc.getElementById('upgradePrice').textContent, '$20 (launch price, ends January 23, 2027)');
  assert.equal(doc.getElementById('upgradeBuy').href, 'https://buy.stripe.com/aFa14n0vqbUSfZWeJb5sA05?client_reference_id=' + lic + '&prefilled_promo_code=APP20');
  doc = load('upgrade.html', AFTER, '?license=' + lic);
  assert.equal(doc.getElementById('upgradePrice').textContent, '$34');
  assert.equal(doc.getElementById('upgradeBuy').href, 'https://buy.stripe.com/fZu9ATguo7EC3daasV5sA04?client_reference_id=' + lic);
  doc = load('upgrade.html', BEFORE, '?license=nope');
  assert.equal(doc.getElementById('bad').hidden, false);
  assert.equal(doc.getElementById('ok').hidden, true);
});

test('guide pages show the launch price until January 23, then only the regular price', () => {
  for (const name of PRICED.filter((n) => n !== 'index.html' && n !== 'upgrade.html')) {
    const before = seen(load(name, BEFORE));
    assert.match(before, /\$25 for Outlook/, name);
    assert.match(before, /\$19 (and \$39 )?at the launch price through January 23, 2027/, name);
    const after = seen(load(name, AFTER));
    assert.match(after, /\$25 for Outlook/, name);
    assert.doesNotMatch(after, /launch|\$19|\$39/i, name);
  }
});

test('the same iPhone, Mac and Gmail wording on every page that has it', () => {
  const STORE = 'https://apps.apple.com/us/app/inbox-ocd/id6821295529';
  for (const name of PAGES) {
    const html = read(name);
    const doc = parse(html, name);
    const text = squash(visibleText(doc.body));
    for (const a of doc.querySelectorAll('a')) {
      if (/apps\.apple\.com/.test(a.href)) assert.equal(a.href, STORE, name);
    }
    if (html.includes(STORE)) assert.match(text, /free on the App Store/, name + ' says the iPhone app is free on the App Store');
    assert.doesNotMatch(text, /macOS 11\+/, name);
    for (const m of text.matchAll(/Apple silicon \(M1 or newer\)[^.]*/g)) assert.match(m[0], /macOS 11 or later/, name);
    if (/\$59 for Standard/.test(text)) assert.match(text, /only a limited number of Gmail accounts can connect for now/, name);
    // Standard is always "Gmail + Outlook in one inbox"; Add Gmail is the upgrade.
    assert.doesNotMatch(text, /Gmail and Outlook (together|in one inbox)|Standard license \(Gmail and Outlook\)/, name);
    for (const m of text.matchAll(/Standard \(([^)]*)\)/g)) assert.equal(m[1], 'Gmail + Outlook in one inbox', name);
  }
});

test('the home page names the shipped desktop features', () => {
  const text = seen(load('index.html', BEFORE));
  for (const phrase of ['Inbox X-Ray', 'New senders wait at the door', 'Follow-ups', 'Watching for', 'Accounts vault', 'Storage rescue', 'Standard (Gmail + Outlook in one inbox)', 'Add Gmail later', 'Touch ID or Windows Hello', 'clears from the clipboard', 'Every batch it files is written down in a list', 'biggest emails']) {
    assert.ok(text.includes(phrase), phrase);
  }
});

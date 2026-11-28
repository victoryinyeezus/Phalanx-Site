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
// The launch ends at 11:00 PM Central on January 23, before the Stripe
// launch codes expire (2027-01-24T05:03Z).
const LAST_SECOND = Date.UTC(2027, 0, 24, 4, 59, 59); // 22:59:59 CST Jan 23
const AFTER = Date.UTC(2027, 0, 24, 5);           // the moment it ends
const STRIPE_CODES_EXPIRE = Date.parse('2027-01-24T05:03:00Z');
const LATER = Date.UTC(2027, 5, 1);

const PAGES = readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort();
// Pages about the iPhone app. The iPhone app sells nothing, so these pages
// show no license price, no pricing link and don't load pricing.js.
const IPHONE = PAGES.filter((f) => /iphone/i.test(f));
// Pages that show an individual license price.
const PRICED = [
  'index.html', 'upgrade.html', 'outlook-storage-full.html', 'outlook-full-after-deleting.html',
  'outlook-cant-send-receive-storage-full.html',
  'delete-old-emails-outlook.html', 'outlook-emails-by-sender.html', 'unsubscribe-outlook.html',
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
  assert.equal(P.launchEnds, Date.parse('2027-01-24T05:00:00Z'));
  assert.ok(P.launchEnds < STRIPE_CODES_EXPIRE, 'launch must end before the Stripe codes expire');
  assert.equal(P.isLaunch(Date.UTC(2027, 0, 24, 0)), true, 'still January 23 in the US at 00:00 UTC');
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
    assert.match(text, /Then pay once, yours to keep: \$19 for Outlook at the launch price through January 23, 2027 \(then \$25\)\./);
    // The struck-through regular price sits next to the launch price.
    assert.equal(doc.getElementById('wasOutlook').hidden, false);
    assert.equal(doc.getElementById('wasOutlook').textContent, '$25');
    assert.equal(doc.getElementById('wasStandard').hidden, false);
    assert.equal(doc.getElementById('wasStandard').textContent, '$59');
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
    assert.equal(doc.getElementById('wasOutlook').hidden, true);
    assert.equal(doc.getElementById('wasStandard').hidden, true);
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

test('launch-only text is hidden in the HTML, so no-JS readers never see it', () => {
  for (const name of PAGES) {
    const doc = parse(read(name), name);
    for (const el of doc.querySelectorAll('[data-launch-only]')) {
      assert.ok(el.hasAttribute('hidden'), name + ': data-launch-only without hidden');
    }
    // Without JavaScript, nothing about the launch shows.
    if (PRICED.includes(name)) assert.doesNotMatch(seen(doc), /launch price|\$19|\$39/, name);
  }
});

test('iPhone pages show no license price, no pricing link and skip pricing.js', () => {
  assert.ok(IPHONE.length > 0);
  for (const name of IPHONE) {
    const html = read(name);
    const doc = parse(html, name);
    assert.equal(doc.querySelector('script[src=pricing.js]'), null, name);
    assert.equal(doc.querySelectorAll('[data-price]').length + doc.querySelectorAll('[data-price-regular]').length + doc.querySelectorAll('[data-price-launch]').length, 0, name);
    for (const a of doc.querySelectorAll('a')) assert.doesNotMatch(a.href, /#pricing|upgrade\.html|buy\.stripe\.com/, name);
    for (const now of [BEFORE, AFTER]) assert.doesNotMatch(seen(load(name, now)), /\$\d/, name);
    for (const s of doc.querySelectorAll('script[type=application/ld+json]')) assert.doesNotMatch(s.textContent, /\$\d/, name);
  }
});

test('App Store boxes on any page carry no license price', () => {
  for (const name of PAGES) {
    const doc = parse(read(name), name);
    const boxes = doc.querySelectorAll('section').filter((el) => /\bcta-box\b/.test(el.getAttribute('class') || ''));
    for (const box of boxes) {
      const store = box.querySelectorAll('a').some((a) => /apps\.apple\.com/.test(a.href));
      if (!store) continue;
      assert.doesNotMatch(squash(box.textContent), /\$\d/, name + ': App Store box shows a price');
      assert.equal(box.querySelectorAll('a').filter((a) => /#pricing|buy\.stripe\.com/.test(a.href)).length, 0, name);
    }
  }
});

test('FAQ JSON-LD states only regular prices, so it stays true after the launch', () => {
  for (const name of PAGES) {
    const doc = parse(read(name), name);
    for (const s of doc.querySelectorAll('script[type=application/ld+json]')) {
      const data = JSON.parse(s.textContent);
      for (const item of [].concat(data)) {
        if (item['@type'] !== 'FAQPage') continue;
        for (const q of item.mainEntity) {
          const text = q.acceptedAnswer.text;
          assert.doesNotMatch(text, /launch/i, name);
          for (const m of text.matchAll(/\$(\d+)/g)) {
            assert.ok(Object.values(P.regular).includes(Number(m[1])), name + ': ' + m[0] + ' is not a regular price');
          }
        }
      }
    }
  }
});

test('home page JSON-LD offers match pricing.js prices and end date', () => {
  const doc = parse(read('index.html'), 'index.html');
  const data = JSON.parse(doc.querySelector('script[type=application/ld+json]').textContent);
  const app = data.find((d) => d['@type'] === 'SoftwareApplication');
  const kinds = { 'Outlook-only': 'Outlook', Standard: 'Standard' };
  assert.equal(app.offers.length, 2);
  for (const offer of app.offers) {
    const kind = kinds[offer.name];
    assert.ok(kind, offer.name);
    const [launch, regular] = offer.priceSpecification;
    assert.equal(Number(launch.price), P.launch[kind], offer.name);
    assert.equal(Number(regular.price), P.regular[kind], offer.name);
    assert.equal(Date.parse(launch.validThrough), P.launchEnds, offer.name + ' launch price valid through the end moment');
    assert.equal(Date.parse(regular.validFrom), P.launchEnds, offer.name + ' regular starts when the launch ends');
  }
});

test('price cards say who they are for, the trial, and who sells', () => {
  const doc = load('index.html', BEFORE);
  for (const id of ['planOutlook', 'planStandard']) {
    assert.match(squash(doc.getElementById(id).textContent), /For Mac and Windows\. Try it free for 14 days first/, id);
  }
  // The trial works with Outlook only, so the Standard card says so.
  assert.match(squash(doc.getElementById('planStandard').textContent), /For Mac and Windows\. Try it free for 14 days first with Outlook, no card\./);
  const trust = squash(doc.getElementById('trustLine').textContent);
  assert.match(trust, /Sold by Inbox OCD\. Payments are processed by Stripe\./);
  assert.match(trust, /support@inboxocd\.com/);
  assert.ok(doc.getElementById('trustLine').querySelectorAll('a').some((a) => a.href === 'terms.html'));
  assert.ok(doc.getElementById('trustLine').querySelectorAll('a').some((a) => a.href === 'terms.html#refunds' && /14-day full refund/.test(a.textContent)));
});

test('every refund promise says 14 days, a full refund, and to email support', () => {
  const PROMISE = /within 14 days of buying for a full refund/;
  const terms = parse(read('terms.html'), 'terms.html');
  const anchor = terms.getElementById('refunds');
  assert.ok(anchor, 'terms.html has #refunds');
  assert.match(squash(anchor.textContent), /One-time licenses\./);
  assert.match(squash(anchor.textContent), /email support@inboxocd\.com within 14 days of buying for a full refund/);
  for (const name of PAGES) {
    const doc = parse(read(name), name);
    const text = squash(visibleText(doc.body));
    assert.doesNotMatch(text, /money-back/i, name + ' uses the refund wording from the terms');
    // Sentences that promise a refund (privacy.html only says Stripe reports refunds,
    // and terms.html's subscription bullets cover unused time and chargebacks).
    // Sentences end at . ? or ! followed by a space, so the email address stays whole.
    for (const sentence of text.split(/(?<=[.?!])\s+/)) {
      // "14-day full refund." alone is the link to the terms, checked below.
      if (!/full refund/i.test(sentence) || sentence === '14-day full refund.') continue;
      assert.match(sentence, PROMISE, name + ': ' + sentence);
      assert.match(sentence, /support@inboxocd\.com/, name + ': ' + sentence);
    }
    if (/14-day full refund/.test(text)) assert.ok(doc.querySelectorAll('a').some((a) => a.href === 'terms.html#refunds'), name);
  }
});

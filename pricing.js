// Inbox OCD prices: the one place they live. Every page that shows a price
// loads this file. Change a price or the launch end date here only; the
// HTML around it holds the same numbers as text for readers without
// JavaScript, and tests/pricing.test.mjs fails if the two drift apart.
//
// On a page, this file fills in:
//   data-price="Outlook"          today's price: launch price, then regular
//   data-price-regular="Outlook"  the regular price
//   data-price-launch="Outlook"   the launch price
//   data-launch-end               the last day of the launch price
//   data-launch-only              shown during the launch, hidden after it
//                                 (give it `hidden` in the HTML, so readers
//                                 without JavaScript never see launch text)
// Kinds: Outlook, Standard, AddGmail.
(function (root) {
  'use strict';

  var PRICING = {
    // The launch price runs through January 23, 2027, Pacific time: it ends
    // at midnight at the end of January 23 in California (08:00 UTC on
    // January 24), so it lasts all of January 23 everywhere in the US.
    // index.html's JSON-LD uses the same moment; tests check they agree.
    launchEnds: Date.UTC(2027, 0, 24, 8),
    launchEndText: 'January 23, 2027',
    regular: { Outlook: 25, Standard: 59, AddGmail: 34 },
    launch: { Outlook: 19, Standard: 39, AddGmail: 20 },
    // Stripe promotion codes for the launch price, one set per ad channel.
    // Ad links land on /?offer=<CHANNEL>; anything else uses APP.
    codes: {
      IG:     { Standard: 'IG39',     Outlook: 'IG19' },
      FB:     { Standard: 'FB39',     Outlook: 'FB19' },
      XCOM:   { Standard: 'XCOM39',   Outlook: 'XCOM19' },
      TIKTOK: { Standard: 'TIKTOK39', Outlook: 'TIKTOK19' },
      REDDIT: { Standard: 'REDDIT39', Outlook: 'REDDIT19' },
      APP:    { Standard: 'APP39',    Outlook: 'APP19', AddGmail: 'APP20' }
    }
  };

  PRICING.isLaunch = function (now) {
    return (now === undefined ? Date.now() : now) < PRICING.launchEnds;
  };

  // "$19" during the launch, "$25" after it.
  PRICING.price = function (kind, now) {
    var table = PRICING.isLaunch(now) ? PRICING.launch : PRICING.regular;
    return '$' + table[kind];
  };

  // The Stripe codes for ?offer=<channel>, or APP's for an unknown channel.
  PRICING.codesFor = function (offer) {
    var key = String(offer || '').toUpperCase();
    return Object.prototype.hasOwnProperty.call(PRICING.codes, key) ? PRICING.codes[key] : PRICING.codes.APP;
  };

  PRICING.fill = function (doc, now) {
    var launch = PRICING.isLaunch(now);
    function each(selector, fn) {
      var list = doc.querySelectorAll(selector);
      for (var i = 0; i < list.length; i++) fn(list[i]);
    }
    function known(table, kind) {
      return Object.prototype.hasOwnProperty.call(table, kind);
    }
    each('[data-price]', function (el) {
      var kind = el.getAttribute('data-price');
      if (known(PRICING.regular, kind)) el.textContent = PRICING.price(kind, now);
    });
    each('[data-price-regular]', function (el) {
      var kind = el.getAttribute('data-price-regular');
      if (known(PRICING.regular, kind)) el.textContent = '$' + PRICING.regular[kind];
    });
    each('[data-price-launch]', function (el) {
      var kind = el.getAttribute('data-price-launch');
      if (known(PRICING.launch, kind)) el.textContent = '$' + PRICING.launch[kind];
    });
    each('[data-launch-end]', function (el) {
      el.textContent = PRICING.launchEndText;
    });
    each('[data-launch-only]', function (el) {
      el.hidden = !launch;
    });
  };

  root.InboxOCDPricing = PRICING;
  if (typeof module !== 'undefined' && module.exports) module.exports = PRICING;
  // Script tags sit at the end of <body>, so the page is already there.
  if (root.document && root.document.querySelectorAll) PRICING.fill(root.document);
})(typeof window !== 'undefined' ? window : globalThis);

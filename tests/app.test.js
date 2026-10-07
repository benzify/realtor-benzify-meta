const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.js'), 'utf8');
const eventTypeUuid = '11111111-1111-4111-8111-111111111111';
const inviteeUuid = '22222222-2222-4222-8222-222222222222';

class MemoryStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
  }

  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const makeElement = () => ({
  hidden: false,
  dataset: {},
  addEventListener(type, listener) { this.listeners = { ...(this.listeners || {}), [type]: listener }; },
  dispatch(type, event = {}) { if (this.listeners && this.listeners[type]) this.listeners[type](event); },
  querySelector() { return { textContent: '' }; }
});

const runApp = ({
  url = 'https://realtors.benzify.us/',
  configuredEventTypeUuid = eventTypeUuid,
  localStorage = new MemoryStorage(),
  sessionStorage = new MemoryStorage(),
  includeConfirmation = false,
  includeBookingLink = false,
  cryptoAvailable = true,
  calendlyAvailable = false,
  clarityAvailable = false
} = {}) => {
  let currentUrl = new URL(url);
  const scripts = [];
  const scriptElements = [];
  const windowListeners = {};
  const popupCalls = [];
  const badgeCalls = [];
  const clarityCalls = [];
  const confirmedContent = makeElement();
  const unconfirmedContent = makeElement();
  const bookingLink = makeElement();
  bookingLink.dataset.ctaLocation = 'hero';
  const badge = makeElement();
  const confirmationRoot = includeConfirmation ? makeElement() : null;

  const location = {};
  const updateLocation = nextUrl => {
    currentUrl = new URL(nextUrl, currentUrl.origin);
    Object.assign(location, {
      href: currentUrl.href,
      search: currentUrl.search,
      hash: currentUrl.hash,
      pathname: currentUrl.pathname
    });
  };
  updateLocation(currentUrl.href);

  const document = {
    title: 'Test',
    referrer: '',
    head: { appendChild: element => { scripts.push(element.src); scriptElements.push(element); } },
    createElement: () => makeElement(),
    querySelector(selector) {
      if (selector === '[data-booking-confirmation]') return confirmationRoot;
      if (selector === '[data-confirmed-content]') return confirmedContent;
      if (selector === '[data-unconfirmed-content]') return unconfirmedContent;
      if (selector === '.calendly-badge-widget') return badge;
      return null;
    },
    querySelectorAll(selector) {
      return selector === '[data-booking]' && includeBookingLink ? [bookingLink] : [];
    },
    getElementById() { return null; }
  };

  const window = {
    BENZIFY_CONFIG: {
      bookingUrl: 'https://calendly.com/rak-benzify/meta-ads-setup',
      calendlyEventTypeUuid: configuredEventTypeUuid,
      youtubeVideoId: '',
      videoSrc: '',
      videoPoster: '',
      analytics: {
        googleAdsId: 'AW-18369421554',
        googleAdsBookingConversionLabel: 'KJ60CICBqtscEPLBnLdE',
        microsoftClarityId: 'yjsbxks26d'
      }
    },
    location,
    history: { replaceState: (_state, _title, nextUrl) => updateLocation(nextUrl) },
    localStorage,
    sessionStorage,
    addEventListener(type, listener) { windowListeners[type] = listener; }
  };
  if (calendlyAvailable) {
    window.Calendly = {
      initPopupWidget: options => popupCalls.push(options),
      initBadgeWidget: options => badgeCalls.push(options)
    };
  }
  if (clarityAvailable) window.clarity = (...args) => clarityCalls.push(args);
  if (cryptoAvailable) {
    window.crypto = { randomUUID: () => '44444444-4444-4444-8444-444444444444' };
  }
  window.window = window;

  vm.runInNewContext(appSource, {
    window,
    document,
    URL,
    URLSearchParams,
    Date,
    Math,
    JSON,
    Number,
    Object,
    String,
    Boolean,
    Array
  });

  const conversions = window.dataLayer
    .filter(entry => Object.prototype.toString.call(entry) === '[object Arguments]')
    .map(entry => Array.from(entry))
    .filter(entry => entry[0] === 'event' && entry[1] === 'conversion');

  return {
    bookingLink,
    confirmedContent,
    conversions,
    location,
    scripts,
    scriptElements,
    popupCalls,
    badge,
    badgeCalls,
    clarityCalls,
    unconfirmedContent,
    window,
    dispatchMessage(event) { windowListeners.message(event); }
  };
};

test('a matching Calendly redirect is sanitized and converted once', () => {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const url = `https://realtors.benzify.us/booking-confirmed/?scheduled=1&event_type_uuid=${eventTypeUuid}&invitee_uuid=${inviteeUuid}&invitee_email=private%40example.com&invitee_full_name=Private%20Person`;
  const first = runApp({ url, localStorage, sessionStorage, includeConfirmation: true });

  assert.equal(first.location.href, 'https://realtors.benzify.us/booking-confirmed/');
  assert.equal(first.conversions.length, 1);
  assert.equal(first.conversions[0][2].transaction_id, inviteeUuid);
  assert.equal(first.conversions[0][2].page_location, 'https://realtors.benzify.us/booking-confirmed/');
  assert.equal(first.confirmedContent.hidden, false);
  assert.equal(first.unconfirmedContent.hidden, true);
  assert.doesNotMatch(JSON.stringify([...localStorage.values, ...sessionStorage.values]), /private@example\.com|Private Person/i);

  const refresh = runApp({
    url: first.location.href,
    localStorage,
    sessionStorage,
    includeConfirmation: true
  });
  assert.equal(refresh.conversions.length, 0);
  assert.equal(refresh.confirmedContent.hidden, false);
  assert.equal(refresh.unconfirmedContent.hidden, true);
});

test('missing, malformed, and mismatched redirect details fail closed', () => {
  const cases = [
    'https://realtors.benzify.us/booking-confirmed/?scheduled=1',
    `https://realtors.benzify.us/booking-confirmed/?scheduled=1&event_type_uuid=${eventTypeUuid}&invitee_uuid=not-a-uuid`,
    `https://realtors.benzify.us/booking-confirmed/?scheduled=1&event_type_uuid=33333333-3333-4333-8333-333333333333&invitee_uuid=${inviteeUuid}`
  ];

  cases.forEach(url => {
    const result = runApp({ url, includeConfirmation: true });
    assert.equal(result.conversions.length, 0);
    assert.equal(result.confirmedContent.hidden, true);
    assert.equal(result.unconfirmedContent.hidden, false);
  });
});

test('an empty event-type configuration stores only the setup candidate', () => {
  const sessionStorage = new MemoryStorage();
  const url = `https://realtors.benzify.us/booking-confirmed/?scheduled=1&event_type_uuid=${eventTypeUuid}&invitee_uuid=${inviteeUuid}&invitee_email=private%40example.com`;
  const result = runApp({
    url,
    configuredEventTypeUuid: '',
    sessionStorage,
    includeConfirmation: true
  });

  assert.equal(result.conversions.length, 0);
  assert.equal(JSON.parse(sessionStorage.getItem('benzify_calendly_event_type_uuid_candidate')), eventTypeUuid);
  assert.doesNotMatch(JSON.stringify([...sessionStorage.values]), /private@example\.com/i);
});

test('session deduplication works when local storage is unavailable', () => {
  const sessionStorage = new MemoryStorage();
  const url = `https://realtors.benzify.us/booking-confirmed/?scheduled=1&event_type_uuid=${eventTypeUuid}&invitee_uuid=${inviteeUuid}`;
  const first = runApp({ url, localStorage: null, sessionStorage, includeConfirmation: true });
  const refresh = runApp({
    url: first.location.href,
    localStorage: null,
    sessionStorage,
    includeConfirmation: true
  });

  assert.equal(first.conversions.length, 1);
  assert.equal(refresh.conversions.length, 0);
  assert.equal(refresh.confirmedContent.hidden, false);
});

test('last-touch attribution is reused for 30 days and then expires', () => {
  const localStorage = new MemoryStorage();
  const first = runApp({
    url: 'https://realtors.benzify.us/?utm_source=google&utm_campaign=seller-leads&gclid=test-click',
    localStorage,
    includeBookingLink: true
  });
  assert.match(first.bookingLink.href, /utm_source=google/);
  assert.match(first.bookingLink.href, /gclid=test-click/);

  const directReturn = runApp({ localStorage, includeBookingLink: true });
  assert.match(directReturn.bookingLink.href, /utm_campaign=seller-leads/);

  const stored = JSON.parse(localStorage.getItem('benzify_attribution_v2'));
  stored.captured_at = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  localStorage.setItem('benzify_attribution_v2', JSON.stringify(stored));
  const expiredReturn = runApp({ localStorage, includeBookingLink: true });
  assert.doesNotMatch(expiredReturn.bookingLink.href, /utm_source|gclid/);
  assert.equal(localStorage.getItem('benzify_attribution_v2'), null);
});

test('separate tabs convert distinct invitees without a shared journey key', () => {
  const localStorage = new MemoryStorage();
  const firstUrl = `https://realtors.benzify.us/booking-confirmed/?scheduled=1&event_type_uuid=${eventTypeUuid}&invitee_uuid=${inviteeUuid}`;
  const secondInviteeUuid = '55555555-5555-4555-8555-555555555555';
  const secondUrl = `https://realtors.benzify.us/booking-confirmed/?scheduled=1&event_type_uuid=${eventTypeUuid}&invitee_uuid=${secondInviteeUuid}`;

  const first = runApp({ url: firstUrl, localStorage, sessionStorage: new MemoryStorage(), includeConfirmation: true });
  const second = runApp({ url: secondUrl, localStorage, sessionStorage: new MemoryStorage(), includeConfirmation: true });

  assert.equal(first.conversions.length, 1);
  assert.equal(second.conversions.length, 1);
  const ledger = JSON.parse(localStorage.getItem('benzify_converted_bookings_v2'));
  assert.deepEqual(ledger.map(entry => entry.id), [inviteeUuid, secondInviteeUuid]);
  assert.equal(localStorage.getItem('benzify_booking_journey_v1'), null);
});

test('CTA opens the Calendly popup and emits dataLayer and Clarity diagnostics', () => {
  const result = runApp({
    includeBookingLink: true,
    cryptoAvailable: false,
    calendlyAvailable: true,
    clarityAvailable: true
  });
  let prevented = false;
  result.bookingLink.listeners.click({ preventDefault: () => { prevented = true; } });
  const diagnostics = result.window.dataLayer.filter(entry => entry && entry.event);

  assert.equal(prevented, true);
  assert.equal(result.popupCalls.length, 1);
  assert.match(result.popupCalls[0].url, /meta-ads-setup/);
  assert.deepEqual(Array.from(diagnostics, entry => entry.event), ['cta_click', 'calendly_visit']);
  assert.equal(diagnostics[0].cta_location, 'hero');
  assert.match(diagnostics[0].diagnostic_id, /^cta-[0-9]+-[a-z0-9]+$/);
  assert.deepEqual(result.clarityCalls, [
    ['set', 'calendly_cta_location', 'hero'],
    ['event', 'calendly_open']
  ]);
});

test('CTA remains a normal attributed link before Calendly loads', () => {
  const result = runApp({
    url: 'https://realtors.benzify.us/?utm_source=google&gclid=test-click',
    includeBookingLink: true
  });
  let prevented = false;
  result.bookingLink.listeners.click({ preventDefault: () => { prevented = true; } });

  assert.equal(prevented, false);
  assert.match(result.bookingLink.href, /utm_source=google/);
  assert.match(result.bookingLink.href, /gclid=test-click/);
  assert.equal(result.popupCalls.length, 0);
});

test('Calendly script initializes one attributed badge and tracks its source', () => {
  const result = runApp({
    url: 'https://realtors.benzify.us/?utm_campaign=seller-leads',
    includeBookingLink: true
  });
  result.window.Calendly = {
    initPopupWidget: options => result.popupCalls.push(options),
    initBadgeWidget: options => result.badgeCalls.push(options)
  };
  const calendlyScript = result.scriptElements.find(element => /calendly/.test(element.src));
  calendlyScript.dispatch('load');
  result.badge.dispatch('click');

  assert.equal(result.badgeCalls.length, 1);
  assert.equal(result.badgeCalls[0].text, 'Book a free strategy call');
  assert.match(result.badgeCalls[0].url, /utm_campaign=seller-leads/);
  const diagnostics = result.window.dataLayer.filter(entry => entry && entry.event);
  assert.equal(diagnostics[0].cta_location, 'calendly_badge');
});

test('trusted Calendly scheduled events convert once and reject invalid messages', () => {
  const localStorage = new MemoryStorage();
  const result = runApp({ localStorage });
  const scheduledEvent = {
    data: {
      event: 'calendly.event_scheduled',
      payload: { invitee: { uri: `https://api.calendly.com/scheduled_events/event/invitees/${inviteeUuid}` } }
    }
  };

  result.dispatchMessage({ ...scheduledEvent, origin: 'https://attacker.example' });
  result.dispatchMessage({ origin: 'https://calendly.com', data: { event: 'calendly.event_scheduled', payload: {} } });
  assert.equal(result.conversions.length, 0);

  result.dispatchMessage({ ...scheduledEvent, origin: 'https://calendly.com' });
  result.dispatchMessage({ ...scheduledEvent, origin: 'https://calendly.com' });
  const conversions = result.window.dataLayer
    .filter(entry => Object.prototype.toString.call(entry) === '[object Arguments]')
    .map(entry => Array.from(entry))
    .filter(entry => entry[0] === 'event' && entry[1] === 'conversion');
  assert.equal(conversions.length, 1);
  assert.equal(conversions[0][2].transaction_id, inviteeUuid);
});

test('legacy tracking storage is removed', () => {
  const localStorage = new MemoryStorage({
    benzify_attribution_v1: JSON.stringify({ last_landing_page: 'https://example.test/?invitee_email=private@example.com' }),
    benzify_booking_journey_v1: 'old-journey',
    benzify_converted_journey_v1: 'old-conversion'
  });
  runApp({ localStorage });

  assert.equal(localStorage.getItem('benzify_attribution_v1'), null);
  assert.equal(localStorage.getItem('benzify_booking_journey_v1'), null);
  assert.equal(localStorage.getItem('benzify_converted_journey_v1'), null);
});

test('only Google Ads, Clarity, and Calendly scripts are requested', () => {
  const result = runApp();
  assert.deepEqual(result.scripts, [
    'https://www.googletagmanager.com/gtag/js?id=AW-18369421554',
    'https://www.clarity.ms/tag/yjsbxks26d',
    'https://assets.calendly.com/assets/external/widget.js'
  ]);
});

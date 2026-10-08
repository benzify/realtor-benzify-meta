const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.js'), 'utf8');
const configSource = fs.readFileSync(path.join(__dirname, '..', 'dist', 'config.js'), 'utf8');
const landingPageSource = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
const confirmationPageSource = fs.readFileSync(path.join(__dirname, '..', 'dist', 'booking-confirmed', 'index.html'), 'utf8');
const inviteeUuid = '22222222-2222-4222-8222-222222222222';

class MemoryStorage {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); }
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
  localStorage = new MemoryStorage(),
  sessionStorage = new MemoryStorage(),
  includeConfirmation = false,
  includeBookingLink = false,
  cryptoAvailable = true,
  calendlyAvailable = false,
  clarityAvailable = false,
  openAiPixelId = 'AePTapRBZACszVQxvzZ727'
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
      youtubeVideoId: '',
      videoSrc: '',
      videoPoster: '',
      analytics: {
        googleAdsId: 'AW-18369421554',
        openAiPixelId,
        openAiPixelDebug: false,
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
  if (cryptoAvailable) window.crypto = { randomUUID: () => '44444444-4444-4444-8444-444444444444' };
  window.window = window;

  vm.runInNewContext(appSource, {
    window, document, URL, URLSearchParams, Date, Math, JSON, Number, Object, String, Boolean, Array
  });

  const googleConversions = window.dataLayer
    .filter(entry => Object.prototype.toString.call(entry) === '[object Arguments]')
    .map(entry => Array.from(entry))
    .filter(entry => entry[0] === 'event' && entry[1] === 'conversion');
  const openAiCalls = (window.oaiq && window.oaiq.q ? window.oaiq.q : [])
    .map(entry => JSON.parse(JSON.stringify(Array.from(entry))));

  return {
    bookingLink, confirmedContent, googleConversions, location, openAiCalls, scripts,
    scriptElements, popupCalls, badge, badgeCalls, clarityCalls, unconfirmedContent, window,
    dispatchMessage(event) { windowListeners.message(event); }
  };
};

const scheduledEvent = id => ({
  origin: 'https://calendly.com',
  data: {
    event: 'calendly.event_scheduled',
    payload: { invitee: { uri: `https://api.calendly.com/scheduled_events/event/invitees/${id}` } }
  }
});

test('legacy confirmation query data is sanitized but never treated as a booking', () => {
  const result = runApp({
    url: `https://realtors.benzify.us/booking-confirmed/?scheduled=1&invitee_uuid=${inviteeUuid}&invitee_email=private%40example.com#details`,
    includeConfirmation: true
  });
  assert.equal(result.location.href, 'https://realtors.benzify.us/booking-confirmed/');
  assert.equal(result.googleConversions.length, 0);
  assert.equal(result.openAiCalls.filter(call => call[0] === 'measure').length, 0);
  assert.equal(result.confirmedContent.hidden, true);
  assert.equal(result.unconfirmedContent.hidden, false);
});

test('last-touch attribution is reused for 30 days and then expires', () => {
  const localStorage = new MemoryStorage();
  const first = runApp({
    url: 'https://realtors.benzify.us/?utm_source=chatgpt&utm_campaign=seller-leads',
    localStorage,
    includeBookingLink: true
  });
  assert.match(first.bookingLink.href, /utm_source=chatgpt/);
  const directReturn = runApp({ localStorage, includeBookingLink: true });
  assert.match(directReturn.bookingLink.href, /utm_campaign=seller-leads/);

  const stored = JSON.parse(localStorage.getItem('benzify_attribution_v2'));
  stored.captured_at = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
  localStorage.setItem('benzify_attribution_v2', JSON.stringify(stored));
  const expiredReturn = runApp({ localStorage, includeBookingLink: true });
  assert.doesNotMatch(expiredReturn.bookingLink.href, /utm_source|utm_campaign/);
  assert.equal(localStorage.getItem('benzify_attribution_v2'), null);
});

test('CTA opens Calendly and emits only dataLayer and Clarity diagnostics', () => {
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
  assert.deepEqual(Array.from(diagnostics, entry => entry.event), ['cta_click', 'calendly_visit']);
  assert.equal(result.openAiCalls.filter(call => call[0] === 'measure').length, 0);
  assert.deepEqual(result.clarityCalls, [
    ['set', 'calendly_cta_location', 'hero'],
    ['event', 'calendly_open']
  ]);
});

test('CTA remains a normal attributed link before Calendly loads', () => {
  const result = runApp({
    url: 'https://realtors.benzify.us/?utm_source=chatgpt',
    includeBookingLink: true
  });
  let prevented = false;
  result.bookingLink.listeners.click({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, false);
  assert.match(result.bookingLink.href, /utm_source=chatgpt/);
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
  assert.match(result.badgeCalls[0].url, /utm_campaign=seller-leads/);
  const diagnostics = result.window.dataLayer.filter(entry => entry && entry.event);
  assert.equal(diagnostics[0].cta_location, 'calendly_badge');
});

test('trusted Calendly completion sends one OpenAI event and no direct Google conversion', () => {
  const result = runApp();
  result.dispatchMessage(scheduledEvent(inviteeUuid));
  result.dispatchMessage(scheduledEvent(inviteeUuid));

  const conversions = result.window.oaiq.q
    .map(entry => Array.from(entry))
    .filter(entry => entry[0] === 'measure');
  assert.equal(conversions.length, 1);
  assert.deepEqual(Array.from(conversions[0].slice(0, 2)), ['measure', 'appointment_scheduled']);
  assert.equal(conversions[0][2].type, 'customer_action');
  assert.equal(conversions[0][3].event_id, inviteeUuid);
  assert.equal(result.googleConversions.length, 0);
});

test('invalid Calendly messages do not send OpenAI events', () => {
  const result = runApp();
  result.dispatchMessage({ ...scheduledEvent(inviteeUuid), origin: 'https://attacker.example' });
  result.dispatchMessage({ origin: 'https://calendly.com', data: { event: 'calendly.event_scheduled', payload: {} } });
  result.dispatchMessage({ origin: 'https://calendly.com', data: { event: 'calendly.date_and_time_selected', payload: {} } });
  result.dispatchMessage(scheduledEvent('not-a-uuid'));
  assert.equal(result.openAiCalls.filter(call => call[0] === 'measure').length, 0);
  assert.equal(result.googleConversions.length, 0);
});

test('session deduplication works when local storage is unavailable', () => {
  const sessionStorage = new MemoryStorage();
  const result = runApp({ localStorage: null, sessionStorage });
  result.dispatchMessage(scheduledEvent(inviteeUuid));
  result.dispatchMessage(scheduledEvent(inviteeUuid));
  const conversions = result.window.oaiq.q
    .map(entry => Array.from(entry))
    .filter(entry => entry[0] === 'measure');
  assert.equal(conversions.length, 1);
  assert.equal(JSON.parse(sessionStorage.getItem('benzify_openai_booking_confirmation_v1')).id, inviteeUuid);
});

test('local ledger deduplicates across page instances and permits distinct bookings', () => {
  const localStorage = new MemoryStorage();
  const first = runApp({ localStorage, sessionStorage: new MemoryStorage() });
  first.dispatchMessage(scheduledEvent(inviteeUuid));

  const repeat = runApp({ localStorage, sessionStorage: new MemoryStorage() });
  repeat.dispatchMessage(scheduledEvent(inviteeUuid));
  assert.equal(repeat.window.oaiq.q.filter(entry => Array.from(entry)[0] === 'measure').length, 0);

  const secondId = '55555555-5555-4555-8555-555555555555';
  const second = runApp({ localStorage, sessionStorage: new MemoryStorage() });
  second.dispatchMessage(scheduledEvent(secondId));
  assert.equal(second.window.oaiq.q.filter(entry => Array.from(entry)[0] === 'measure').length, 1);
  assert.deepEqual(
    JSON.parse(localStorage.getItem('benzify_openai_converted_bookings_v1')).map(entry => entry.id),
    [inviteeUuid, secondId]
  );
});

test('an invalid OpenAI pixel configuration fails closed', () => {
  const localStorage = new MemoryStorage();
  const result = runApp({ localStorage, openAiPixelId: '' });
  result.dispatchMessage(scheduledEvent(inviteeUuid));
  assert.equal(result.openAiCalls.length, 0);
  assert.equal(localStorage.getItem('benzify_openai_converted_bookings_v1'), null);
});

test('OpenAI initializes once with production debug logging disabled', () => {
  const result = runApp();
  assert.deepEqual(result.openAiCalls[0], [
    'init',
    { pixelId: 'AePTapRBZACszVQxvzZ727', debug: false }
  ]);
  assert.equal(result.openAiCalls.filter(call => call[0] === 'init').length, 1);
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

test('obsolete Calendly UUID and direct Google booking configuration are removed', () => {
  assert.doesNotMatch(appSource, /calendlyEventTypeUuid|event_type_uuid|googleAdsBookingConversionLabel/);
  assert.doesNotMatch(configSource, /calendlyEventTypeUuid|googleAdsBookingConversionLabel/);
});

test('only Google base, OpenAI, Clarity, and Calendly scripts are requested', () => {
  const result = runApp();
  assert.deepEqual(result.scripts, [
    'https://www.googletagmanager.com/gtag/js?id=AW-18369421554',
    'https://bzrcdn.openai.com/sdk/oaiq.min.js',
    'https://www.clarity.ms/tag/yjsbxks26d',
    'https://assets.calendly.com/assets/external/widget.js'
  ]);
});

test('both pages include one complete Google Tag Manager installation', () => {
  [landingPageSource, confirmationPageSource].forEach(source => {
    assert.equal((source.match(/googletagmanager\.com\/gtm\.js\?id=/g) || []).length, 1);
    assert.equal((source.match(/googletagmanager\.com\/ns\.html\?id=GTM-KR7GR7C9/g) || []).length, 1);
    assert.equal((source.match(/'GTM-KR7GR7C9'/g) || []).length, 1);
    assert.match(source, /<head>\s*<!-- Google Tag Manager -->/);
    assert.match(source, /<body(?:\s[^>]*)?>\s*<!-- Google Tag Manager \(noscript\) -->/);
  });
});

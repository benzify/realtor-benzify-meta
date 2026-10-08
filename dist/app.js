(() => {
  'use strict';

  const config = window.BENZIFY_CONFIG || {};
  const analytics = config.analytics || {};
  const attributionKeys = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'gclid',
    'gbraid',
    'wbraid'
  ];
  const attributionStorageKey = 'benzify_attribution_v2';
  const openAiConvertedBookingsStorageKey = 'benzify_openai_converted_bookings_v1';
  const openAiConfirmationSessionKey = 'benzify_openai_booking_confirmation_v1';
  const attributionTtlMs = 30 * 24 * 60 * 60 * 1000;
  const conversionTtlMs = 90 * 24 * 60 * 60 * 1000;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const addScript = src => {
    const script = document.createElement('script');
    script.async = true;
    script.src = src;
    document.head.appendChild(script);
    return script;
  };

  const safeHttps = value => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  };

  const getStorage = type => {
    try { return window[type]; }
    catch { return null; }
  };

  const parseStoredJson = (storage, key, fallback) => {
    if (!storage) return fallback;
    try {
      const parsed = JSON.parse(storage.getItem(key) || 'null');
      return parsed === null ? fallback : parsed;
    } catch {
      return fallback;
    }
  };

  const writeStoredJson = (storage, key, value) => {
    if (!storage) return false;
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };

  const removeStoredValue = (storage, key) => {
    if (!storage) return;
    try { storage.removeItem(key); }
    catch { /* Storage can be unavailable in private or restricted contexts. */ }
  };

  const localStorage = getStorage('localStorage');
  const sessionStorage = getStorage('sessionStorage');
  const confirmationRoot = document.querySelector('[data-booking-confirmation]');

  // Remove data written by the previous tracking implementation, including old
  // landing-page URLs that may have contained Calendly redirect parameters.
  ['benzify_attribution_v1', 'benzify_booking_journey_v1', 'benzify_converted_journey_v1']
    .forEach(key => removeStoredValue(localStorage, key));

  // The free Calendly plan does not use a booking redirect. Sanitize this legacy
  // page without trusting query parameters as evidence that a booking occurred.
  if (confirmationRoot && (window.location.search || window.location.hash)) {
    window.history.replaceState(null, document.title, window.location.pathname);
  }

  const captureAttribution = () => {
    const now = Date.now();
    const stored = parseStoredJson(localStorage, attributionStorageKey, null);
    const storedAt = stored ? Date.parse(stored.captured_at || '') : NaN;
    const storedIsFresh = Number.isFinite(storedAt) && storedAt <= now && now - storedAt <= attributionTtlMs;
    const search = new URLSearchParams(window.location.search);
    const incoming = {};

    attributionKeys.forEach(key => {
      const value = search.get(key);
      if (value) incoming[key] = value.slice(0, 500);
    });

    if (Object.keys(incoming).length) {
      const attribution = {
        ...incoming,
        landing_page: window.location.href.slice(0, 1200),
        referrer: document.referrer.slice(0, 1200),
        captured_at: new Date(now).toISOString()
      };
      writeStoredJson(localStorage, attributionStorageKey, attribution);
      return attribution;
    }

    if (storedIsFresh) return stored;
    removeStoredValue(localStorage, attributionStorageKey);
    return {};
  };

  const attribution = captureAttribution();

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

  const adsId = String(analytics.googleAdsId || '').toUpperCase();
  if (/^AW-[0-9]+$/.test(adsId)) {
    addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(adsId)}`);
    window.gtag('js', new Date());
    window.gtag('config', adsId);
  }

  const openAiPixelId = String(analytics.openAiPixelId || '').trim();
  if (/^[A-Za-z0-9_-]+$/.test(openAiPixelId)) {
    if (!window.oaiq) {
      window.oaiq = function () { window.oaiq.q.push(arguments); };
      window.oaiq.q = [];
      addScript('https://bzrcdn.openai.com/sdk/oaiq.min.js');
    }
    window.oaiq('init', {
      pixelId: openAiPixelId,
      debug: analytics.openAiPixelDebug === true
    });
  }

  if (/^[a-z0-9]+$/i.test(analytics.microsoftClarityId || '')) {
    const clarityId = analytics.microsoftClarityId;
    window.clarity = window.clarity || function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
    addScript(`https://www.clarity.ms/tag/${encodeURIComponent(clarityId)}`);
  }

  const createDiagnosticId = () => {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return `cta-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  };

  const pushInternalEvent = (event, parameters = {}) => {
    window.dataLayer.push({
      event,
      ...parameters,
      page_location: window.location.href
    });
  };

  const bookingUrl = safeHttps(config.bookingUrl);
  const buildBookingUrl = () => {
    if (!bookingUrl) return '';
    const url = new URL(bookingUrl);
    attributionKeys.forEach(key => {
      if (attribution[key]) url.searchParams.set(key, attribution[key]);
    });
    return url.href;
  };

  const recordCalendlyOpen = location => {
    const details = {
      cta_location: location || 'unknown',
      diagnostic_id: createDiagnosticId()
    };
    pushInternalEvent('cta_click', details);
    pushInternalEvent('calendly_visit', details);
    if (typeof window.clarity === 'function') {
      window.clarity('set', 'calendly_cta_location', details.cta_location);
      window.clarity('event', 'calendly_open');
    }
  };

  const openCalendlyPopup = (event, location) => {
    recordCalendlyOpen(location);
    if (!window.Calendly || typeof window.Calendly.initPopupWidget !== 'function') return;
    event.preventDefault();
    window.Calendly.initPopupWidget({ url: buildBookingUrl() });
  };

  const initializeCalendlyBadge = () => {
    if (!window.Calendly || typeof window.Calendly.initBadgeWidget !== 'function') return;
    window.Calendly.initBadgeWidget({
      url: buildBookingUrl(),
      text: 'Book a free strategy call',
      color: '#0069ff',
      textColor: '#ffffff',
      branding: true
    });
    const badge = document.querySelector('.calendly-badge-widget');
    if (badge) badge.addEventListener('click', () => recordCalendlyOpen('calendly_badge'));
  };

  if (bookingUrl && !confirmationRoot) {
    document.querySelectorAll('[data-booking]').forEach(link => {
      link.href = buildBookingUrl();
      link.addEventListener('click', event => openCalendlyPopup(event, link.dataset.ctaLocation));
    });

    if (window.Calendly) {
      initializeCalendlyBadge();
    } else {
      const calendlyScript = addScript('https://assets.calendly.com/assets/external/widget.js');
      calendlyScript.addEventListener('load', initializeCalendlyBadge, { once: true });
    }
  }

  const youtubeVideoId = /^[A-Za-z0-9_-]{11}$/.test(config.youtubeVideoId || '') ? config.youtubeVideoId : '';
  const videoSrc = safeHttps(config.videoSrc);
  const youtube = document.getElementById('testimonial-youtube');
  const placeholder = document.getElementById('video-placeholder');

  if (youtube && placeholder && youtubeVideoId) {
    youtube.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeVideoId)}?rel=0&playsinline=1`;
    youtube.hidden = false;
    placeholder.hidden = true;
  } else if (placeholder && videoSrc) {
    const video = document.getElementById('testimonial-video');
    video.src = videoSrc;
    const poster = safeHttps(config.videoPoster);
    if (poster) video.poster = poster;
    video.hidden = false;
    placeholder.hidden = true;
    video.addEventListener('error', () => {
      video.hidden = true;
      placeholder.hidden = false;
      placeholder.querySelector('.coming-soon').textContent = 'Video temporarily unavailable';
    });
  }

  const readOpenAiConvertedBookings = () => {
    const now = Date.now();
    const stored = parseStoredJson(localStorage, openAiConvertedBookingsStorageKey, []);
    if (!Array.isArray(stored)) return [];
    return stored.filter(entry => entry
      && uuidPattern.test(entry.id || '')
      && Number.isFinite(entry.convertedAt)
      && entry.convertedAt <= now
      && now - entry.convertedAt <= conversionTtlMs)
      .slice(-100);
  };

  const trackOpenAiBooking = inviteeUuid => {
    if (!uuidPattern.test(inviteeUuid || '')) return false;

    const sessionBooking = parseStoredJson(sessionStorage, openAiConfirmationSessionKey, null);
    if (sessionBooking
      && String(sessionBooking.id || '').toLowerCase() === inviteeUuid.toLowerCase()
      && Number.isFinite(sessionBooking.convertedAt)) return true;

    const convertedBookings = readOpenAiConvertedBookings();
    if (convertedBookings.some(entry => entry.id.toLowerCase() === inviteeUuid.toLowerCase())) {
      writeStoredJson(sessionStorage, openAiConfirmationSessionKey, { id: inviteeUuid, convertedAt: Date.now() });
      return true;
    }

    if (!/^[A-Za-z0-9_-]+$/.test(openAiPixelId) || typeof window.oaiq !== 'function') return false;
    try {
      window.oaiq(
        'measure',
        'appointment_scheduled',
        { type: 'customer_action' },
        { event_id: inviteeUuid }
      );
    } catch { return false; }

    const convertedAt = Date.now();
    convertedBookings.push({ id: inviteeUuid, convertedAt });
    writeStoredJson(localStorage, openAiConvertedBookingsStorageKey, convertedBookings.slice(-100));
    writeStoredJson(sessionStorage, openAiConfirmationSessionKey, { id: inviteeUuid, convertedAt });
    return true;
  };

  const uuidFromCalendlyUri = value => {
    const match = String(value || '').match(/\/([0-9a-f-]{36})(?:\/?(?:\?.*)?)$/i);
    return match && uuidPattern.test(match[1]) ? match[1] : '';
  };

  window.addEventListener('message', event => {
    if (event.origin !== 'https://calendly.com') return;
    if (!event.data || event.data.event !== 'calendly.event_scheduled') return;

    const inviteeUuid = uuidFromCalendlyUri(event.data.payload
      && event.data.payload.invitee
      && event.data.payload.invitee.uri);
    if (!inviteeUuid) return;
    trackOpenAiBooking(inviteeUuid);
  });

  if (confirmationRoot) {
    const confirmedContent = document.querySelector('[data-confirmed-content]');
    const unconfirmedContent = document.querySelector('[data-unconfirmed-content]');
    if (confirmedContent) confirmedContent.hidden = true;
    if (unconfirmedContent) unconfirmedContent.hidden = false;
  }

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();

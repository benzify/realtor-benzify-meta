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
  const convertedBookingsStorageKey = 'benzify_converted_bookings_v2';
  const confirmationSessionKey = 'benzify_booking_confirmation_v2';
  const eventTypeCandidateSessionKey = 'benzify_calendly_event_type_uuid_candidate';
  const attributionTtlMs = 30 * 24 * 60 * 60 * 1000;
  const conversionTtlMs = 90 * 24 * 60 * 60 * 1000;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const addScript = src => {
    const script = document.createElement('script');
    script.async = true;
    script.src = src;
    document.head.appendChild(script);
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

  const readConfirmation = () => {
    if (!confirmationRoot) return null;

    const params = new URLSearchParams(window.location.search);
    const expectedEventTypeUuid = String(config.calendlyEventTypeUuid || '').trim();
    const eventTypeUuid = String(params.get('event_type_uuid') || '').trim();
    const inviteeUuid = String(params.get('invitee_uuid') || '').trim();
    const isConfigured = uuidPattern.test(expectedEventTypeUuid);
    const hasValidRedirectDetails = params.get('scheduled') === '1'
      && uuidPattern.test(eventTypeUuid)
      && uuidPattern.test(inviteeUuid);
    const isValidRedirect = hasValidRedirectDetails
      && isConfigured
      && eventTypeUuid.toLowerCase() === expectedEventTypeUuid.toLowerCase();

    let confirmation = null;
    if (hasValidRedirectDetails) {
      writeStoredJson(sessionStorage, eventTypeCandidateSessionKey, eventTypeUuid);
    }
    if (isValidRedirect) {
      confirmation = { eventTypeUuid, inviteeUuid };
      writeStoredJson(sessionStorage, confirmationSessionKey, confirmation);
    } else if (!window.location.search) {
      const stored = parseStoredJson(sessionStorage, confirmationSessionKey, null);
      if (stored && uuidPattern.test(stored.inviteeUuid || '')
        && String(stored.eventTypeUuid || '').toLowerCase() === expectedEventTypeUuid.toLowerCase()) {
        confirmation = stored;
      }
    }

    if (window.location.search || window.location.hash) {
      window.history.replaceState(null, document.title, window.location.pathname);
    }

    return confirmation;
  };

  // Calendly can append invitee PII to the redirect URL. Parse only the UUIDs
  // needed for deduplication, then sanitize the address before tags load.
  const confirmation = readConfirmation();

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

  if (bookingUrl) {
    document.querySelectorAll('[data-booking]').forEach(link => {
      link.href = buildBookingUrl();
      link.addEventListener('click', () => {
        const details = {
          cta_location: link.dataset.ctaLocation || 'unknown',
          diagnostic_id: createDiagnosticId()
        };
        pushInternalEvent('cta_click', details);
        pushInternalEvent('calendly_visit', details);
      });
    });
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

  const readConvertedBookings = () => {
    const now = Date.now();
    const stored = parseStoredJson(localStorage, convertedBookingsStorageKey, []);
    if (!Array.isArray(stored)) return [];
    return stored.filter(entry => entry
      && uuidPattern.test(entry.id || '')
      && Number.isFinite(entry.convertedAt)
      && entry.convertedAt <= now
      && now - entry.convertedAt <= conversionTtlMs)
      .slice(-100);
  };

  const trackConfirmedBooking = booking => {
    if (!booking) return false;
    if (Number.isFinite(booking.convertedAt)) return true;

    const convertedBookings = readConvertedBookings();
    if (convertedBookings.some(entry => entry.id.toLowerCase() === booking.inviteeUuid.toLowerCase())) {
      writeStoredJson(sessionStorage, confirmationSessionKey, { ...booking, convertedAt: Date.now() });
      return true;
    }

    const conversionLabel = analytics.googleAdsBookingConversionLabel || '';
    if (!/^AW-[0-9]+$/.test(adsId) || !/^[A-Za-z0-9_-]+$/.test(conversionLabel)) return false;

    window.gtag('event', 'conversion', {
      send_to: `${adsId}/${conversionLabel}`,
      value: 1.0,
      currency: 'USD',
      transaction_id: booking.inviteeUuid,
      page_location: window.location.href,
      transport_type: 'beacon'
    });

    convertedBookings.push({ id: booking.inviteeUuid, convertedAt: Date.now() });
    writeStoredJson(localStorage, convertedBookingsStorageKey, convertedBookings.slice(-100));
    writeStoredJson(sessionStorage, confirmationSessionKey, { ...booking, convertedAt: Date.now() });
    return true;
  };

  if (confirmationRoot) {
    const scheduled = trackConfirmedBooking(confirmation);
    const confirmedContent = document.querySelector('[data-confirmed-content]');
    const unconfirmedContent = document.querySelector('[data-unconfirmed-content]');
    if (confirmedContent) confirmedContent.hidden = !scheduled;
    if (unconfirmedContent) unconfirmedContent.hidden = scheduled;
  }

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();

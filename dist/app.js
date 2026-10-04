(() => {
  'use strict';

  const config = window.BENZIFY_CONFIG || {};
  const analytics = config.analytics || {};
  const attributionKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid'];
  const attributionStorageKey = 'benzify_attribution_v1';
  const journeyStorageKey = 'benzify_booking_journey_v1';
  const convertedJourneyStorageKey = 'benzify_converted_journey_v1';

  const addScript = (src, attributes = {}) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = src;
    Object.entries(attributes).forEach(([name, value]) => script.setAttribute(name, value));
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

  const parseStoredJson = key => {
    try { return JSON.parse(window.localStorage.getItem(key) || '{}'); }
    catch { return {}; }
  };

  const readStorage = key => {
    try { return window.localStorage.getItem(key) || ''; }
    catch { return ''; }
  };

  const writeStorage = (key, value) => {
    try { window.localStorage.setItem(key, value); return true; }
    catch { return false; }
  };

  const captureAttribution = () => {
    const stored = parseStoredJson(attributionStorageKey);
    const search = new URLSearchParams(window.location.search);
    const attribution = { ...stored };

    attributionKeys.forEach(key => {
      const value = search.get(key);
      if (value) attribution[key] = value.slice(0, 500);
    });

    if (!attribution.first_landing_page) attribution.first_landing_page = window.location.href.slice(0, 1200);
    if (!attribution.first_referrer && document.referrer) attribution.first_referrer = document.referrer.slice(0, 1200);
    attribution.last_landing_page = window.location.href.slice(0, 1200);
    attribution.updated_at = new Date().toISOString();

    writeStorage(attributionStorageKey, JSON.stringify(attribution));
    return attribution;
  };

  const attribution = captureAttribution();

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

  const directGoogleIds = [analytics.googleAnalyticsId, analytics.googleAdsId]
    .filter(id => /^(G|AW)-[A-Z0-9]+$/i.test(id || ''))
    .map(id => id.toUpperCase());

  if (directGoogleIds.length) {
    addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(directGoogleIds[0])}`);
    window.gtag('js', new Date());
    directGoogleIds.forEach(id => window.gtag('config', id));
  }

  if (/^GTM-[A-Z0-9]+$/i.test(analytics.googleTagManagerId || '')) {
    const id = analytics.googleTagManagerId.toUpperCase();
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    addScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`);
    const frame = document.createElement('iframe');
    frame.src = `https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(id)}`;
    frame.title = 'Google Tag Manager';
    frame.width = '0';
    frame.height = '0';
    frame.hidden = true;
    document.body.prepend(frame);
  }

  if (/^[0-9]+$/.test(analytics.metaPixelId || '')) {
    const pixelId = analytics.metaPixelId;
    window.fbq = window.fbq || function () {
      window.fbq.callMethod ? window.fbq.callMethod.apply(window.fbq, arguments) : window.fbq.queue.push(arguments);
    };
    if (!window._fbq) window._fbq = window.fbq;
    window.fbq.push = window.fbq;
    window.fbq.loaded = true;
    window.fbq.version = '2.0';
    window.fbq.queue = [];
    addScript('https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', pixelId);
    window.fbq('track', 'PageView');
  }

  if (/^[a-z0-9]+$/i.test(analytics.microsoftClarityId || '')) {
    const clarityId = analytics.microsoftClarityId;
    window.clarity = window.clarity || function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
    addScript(`https://www.clarity.ms/tag/${encodeURIComponent(clarityId)}`);
  }

  const trackEvent = (name, parameters = {}) => {
    const eventParameters = {
      ...parameters,
      page_location: window.location.href,
      transport_type: 'beacon'
    };
    window.gtag('event', name, eventParameters);
  };

  const createJourneyId = () => {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return `booking-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
        const journeyId = createJourneyId();
        writeStorage(journeyStorageKey, journeyId);

        const ctaLocation = link.dataset.ctaLocation || 'unknown';
        trackEvent('cta_click', { cta_location: ctaLocation, booking_journey_id: journeyId });
        trackEvent('calendly_visit', { cta_location: ctaLocation, booking_journey_id: journeyId });
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

  const trackConfirmedBooking = () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('scheduled') !== '1') return false;

    const journeyId = readStorage(journeyStorageKey) || params.get('event_uuid') || 'direct-booking-confirmation';
    if (readStorage(convertedJourneyStorageKey) === journeyId) return true;

    const conversionParameters = {
      booking_journey_id: journeyId,
      lead_source: attribution.utm_source || 'direct',
      lead_medium: attribution.utm_medium || 'none',
      lead_campaign: attribution.utm_campaign || 'not_set',
      gclid_present: Boolean(attribution.gclid)
    };
    trackEvent('strategy_call_scheduled', conversionParameters);

    const adsId = analytics.googleAdsId || '';
    const conversionLabel = analytics.googleAdsBookingConversionLabel || '';
    if (/^AW-[0-9]+$/.test(adsId) && /^[A-Za-z0-9_-]+$/.test(conversionLabel)) {
      window.gtag('event', 'conversion', {
        send_to: `${adsId}/${conversionLabel}`,
        value: 1.0,
        currency: 'USD',
        transaction_id: journeyId,
        transport_type: 'beacon'
      });
    }

    writeStorage(convertedJourneyStorageKey, journeyId);
    return true;
  };

  const confirmationRoot = document.querySelector('[data-booking-confirmation]');
  if (confirmationRoot) {
    const scheduled = trackConfirmedBooking();
    const confirmedContent = document.querySelector('[data-confirmed-content]');
    const unconfirmedContent = document.querySelector('[data-unconfirmed-content]');
    if (confirmedContent) confirmedContent.hidden = !scheduled;
    if (unconfirmedContent) unconfirmedContent.hidden = scheduled;
  }

  // Integration hook for a trusted CRM or server-side workflow. These stages are
  // not inferred by the public page and should only be sent after staff validation.
  window.BenzifyTracking = Object.freeze({
    recordLeadStage(stage, details = {}) {
      if (!['qualified_strategy_call', 'strategy_call_attended'].includes(stage)) return false;
      trackEvent(stage, { ...details, source: 'crm_integration' });
      return true;
    },
    attribution: Object.freeze({ ...attribution })
  });

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();

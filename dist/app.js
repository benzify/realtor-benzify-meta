(() => {
  'use strict';
  const config = window.BENZIFY_CONFIG || {};
  const analytics = config.analytics || {};
  const addScript = (src, attributes = {}) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = src;
    Object.entries(attributes).forEach(([name, value]) => script.setAttribute(name, value));
    document.head.appendChild(script);
  };

  // Google Tag Manager placeholder: set googleTagManagerId in config.js to enable.
  if (/^GTM-[A-Z0-9]+$/i.test(analytics.googleTagManagerId || '')) {
    const id = analytics.googleTagManagerId.toUpperCase();
    window.dataLayer = window.dataLayer || [];
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

  // Meta Pixel placeholder: set metaPixelId in config.js to enable PageView tracking.
  if (/^[0-9]+$/.test(analytics.metaPixelId || '')) {
    const pixelId = analytics.metaPixelId;
    window.fbq = window.fbq || function () { window.fbq.callMethod ? window.fbq.callMethod.apply(window.fbq, arguments) : window.fbq.queue.push(arguments); };
    if (!window._fbq) window._fbq = window.fbq;
    window.fbq.push = window.fbq;
    window.fbq.loaded = true;
    window.fbq.version = '2.0';
    window.fbq.queue = [];
    addScript('https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', pixelId);
    window.fbq('track', 'PageView');
  }

  // Microsoft Clarity placeholder: set microsoftClarityId in config.js to enable.
  if (/^[a-z0-9]+$/i.test(analytics.microsoftClarityId || '')) {
    const clarityId = analytics.microsoftClarityId;
    window.clarity = window.clarity || function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
    addScript(`https://www.clarity.ms/tag/${encodeURIComponent(clarityId)}`);
  }

  // GA4 placeholder: set ga4MeasurementId in config.js to enable.
  if (/^G-[A-Z0-9]+$/i.test(analytics.ga4MeasurementId || '')) {
    const measurementId = analytics.ga4MeasurementId.toUpperCase();
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`);
    window.gtag('js', new Date());
    window.gtag('config', measurementId);
  }

  const safeHttps = value => {
    try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; }
    catch { return ''; }
  };
  const bookingUrl = safeHttps(config.bookingUrl);
  if (bookingUrl) {
    document.querySelectorAll('[data-booking]').forEach(link => { link.href = bookingUrl; });
    const liveLink = document.getElementById('booking-live');
    liveLink.href = bookingUrl;
    liveLink.hidden = false;
    document.getElementById('booking-status').hidden = true;
  }
  const videoSrc = safeHttps(config.videoSrc);
  if (videoSrc) {
    const video = document.getElementById('testimonial-video');
    const placeholder = document.getElementById('video-placeholder');
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
  document.getElementById('year').textContent = new Date().getFullYear();
})();

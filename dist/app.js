(() => {
  'use strict';
  const config = window.BENZIFY_CONFIG || {};
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

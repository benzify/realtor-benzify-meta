// Public site configuration. Leave an optional analytics ID empty to keep it disabled.
window.BENZIFY_CONFIG = Object.freeze({
  bookingUrl: 'https://calendly.com/rak-benzify/meta-ads-setup',
  bookingConfirmationPath: '/booking-confirmed/?scheduled=1',
  videoSrc: '',
  youtubeVideoId: 'Eegh_-6Znmk',
  videoPoster: '',
  analytics: Object.freeze({
    googleAdsId: 'AW-18369421554',
    // This existing conversion action must be named and configured in Google Ads
    // for a confirmed strategy-call booking, not for a Calendly-link click.
    googleAdsBookingConversionLabel: 'KJ60CICBqtscEPLBnLdE',
    googleAnalyticsId: '', // Example: G-XXXXXXXXXX
    googleTagManagerId: '', // Example: GTM-XXXXXXX
    metaPixelId: '', // Example: 123456789012345
    microsoftClarityId: 'yjsbxks26d'
  })
});

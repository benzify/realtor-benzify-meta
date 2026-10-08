// Public site configuration. Conversion tracking fails closed until the Calendly
// event-type UUID is copied here from a real test booking redirect.
window.BENZIFY_CONFIG = Object.freeze({
  bookingUrl: 'https://calendly.com/rak-benzify/meta-ads-setup',
  calendlyEventTypeUuid: '', // Example: 00000000-0000-4000-8000-000000000000
  videoSrc: '',
  youtubeVideoId: 'Eegh_-6Znmk',
  videoPoster: '',
  analytics: Object.freeze({
    googleAdsId: 'AW-18369421554',
    // This existing conversion action must be named and configured in Google Ads
    // for a confirmed strategy-call booking, not for a Calendly-link click.
    googleAdsBookingConversionLabel: 'KJ60CICBqtscEPLBnLdE',
    openAiPixelId: 'AePTapRBZACszVQxvzZ727',
    // Enable only while verifying the OpenAI Measurement Pixel in a test deployment.
    openAiPixelDebug: false,
    microsoftClarityId: 'yjsbxks26d'
  })
});

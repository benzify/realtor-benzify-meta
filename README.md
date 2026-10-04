# Benzify realtor landing page

Mobile-first static landing page. Authored site files live in `dist/`; no build or dependencies are required.

Preview locally: `python3 -m http.server 8080 --directory dist`

Edit `dist/config.js` to set `bookingUrl` to your HTTPS scheduling page. For the testimonial, set `youtubeVideoId` to the 11-character ID from a YouTube or Shorts URL, or use `videoSrc` with a direct HTTPS MP4/WebM URL. YouTube takes priority when both are present. Optional `videoPoster` applies to direct video files. Empty video configuration values keep the honest preview placeholder visible.

The browser loads one direct Google Ads destination plus Microsoft Clarity from `dist/config.js`; GA4, Google Tag Manager, and Meta Pixel are not installed. CTA interactions are pushed to `dataLayer` for diagnostics only. The primary Ads conversion fires on the sanitized booking-confirmation page only when Calendly supplies valid `event_type_uuid` and `invitee_uuid` values and the event type matches `calendlyEventTypeUuid`.

Tracking intentionally fails closed while `calendlyEventTypeUuid` is empty. Follow [the conversion setup](docs/conversion-setup.md) to capture the event-type UUID from a test booking, configure it, and verify the conversion before sending paid traffic. This is browser-only hardening, not server-side proof of a Calendly booking.

Layout breakpoints: 370px, 700px, 1000px, and 1600px. The mobile booking bar accounts for device safe areas. Fonts use Google Fonts with system fallbacks.

Hostinger automation: see [deployment setup](docs/hostinger-deployment.md). The GitHub Actions workflow stays disabled until connection settings and SSH secrets are configured.

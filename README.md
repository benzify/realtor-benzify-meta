# Benzify realtor landing page

Mobile-first static landing page. Authored site files live in `dist/`; no build or dependencies are required.

Preview locally: `python3 -m http.server 8080 --directory dist`

Edit `dist/config.js` to set `bookingUrl` to your HTTPS scheduling page. For the testimonial, set `youtubeVideoId` to the 11-character ID from a YouTube or Shorts URL, or use `videoSrc` with a direct HTTPS MP4/WebM URL. YouTube takes priority when both are present. Optional `videoPoster` applies to direct video files. Empty video configuration values keep the honest preview placeholder visible.

Analytics placeholders also live in `dist/config.js`. Add the relevant IDs to enable Google Tag Manager (`GTM-...`), Meta Pixel (numeric ID), Microsoft Clarity, or GA4 (`G-...`). Empty IDs load no tracking scripts. If GA4 is configured inside Google Tag Manager, leave the direct GA4 field empty to avoid duplicate page views.

Layout breakpoints: 370px, 700px, 1000px, and 1600px. The mobile booking bar accounts for device safe areas. Fonts use Google Fonts with system fallbacks.

Hostinger automation: see [deployment setup](docs/hostinger-deployment.md). The GitHub Actions workflow stays disabled until connection settings and SSH secrets are configured.

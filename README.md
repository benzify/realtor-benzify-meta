# Benzify realtor landing page

Mobile-first static landing page. Authored site files live in `dist/`; no build or dependencies are required.

Preview locally: `python3 -m http.server 8080 --directory dist`

Edit `dist/config.js` to set `bookingUrl` to your HTTPS scheduling page and `videoSrc` to a direct HTTPS MP4/WebM URL. Optional `videoPoster` accepts an HTTPS poster image URL. Instagram page URLs are not direct video sources. The testimonial uses native controls without autoplay. Empty configuration values keep the honest preview placeholders visible.

Layout breakpoints: 370px, 700px, 1000px, and 1600px. The mobile booking bar accounts for device safe areas. Fonts use Google Fonts with system fallbacks.

Hostinger automation: see [deployment setup](docs/hostinger-deployment.md). The GitHub Actions workflow stays disabled until connection settings and SSH secrets are configured.

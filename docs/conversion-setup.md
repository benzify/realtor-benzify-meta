# Conversion and account setup

The site implementation is complete in `dist/`. The following account-level settings must be applied before paid traffic is sent to the page.

## Calendly

Update `https://calendly.com/rak-benzify/meta-ads-setup` with:

- Event name: **Realtor Meta Ads Strategy Call**
- Duration: **30 minutes**
- Description: **A free 30-minute review of your market, current acquisition approach, advertising readiness, and possible seller-focused Meta campaign direction. No obligation.**
- Required questions:
  1. What is your primary city and state?
  2. Are you an individual agent or part of a team?
  3. What monthly Meta ad-spend range are you prepared for? Use: Under $1,500; $1,500–$2,499; $2,500–$4,999; $5,000+.
  4. What is your website or primary professional profile URL?
- Post-booking redirect: `https://realtors.benzify.us/booking-confirmed/?scheduled=1`
- Enable **Pass event details to your redirected page**. The conversion requires Calendly's `event_type_uuid` and `invitee_uuid` redirect parameters.

The landing page forwards `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `gclid`, `gbraid`, and `wbraid` to Calendly. Last-touch attribution is retained in first-party storage for 30 days and then removed.

### Capture the Calendly event-type UUID

Tracking fails closed until the expected event type is configured:

1. Deploy the page with the redirect and **Pass event details** enabled.
2. Complete a test booking. The first test will show the unconfirmed state because the expected UUID is intentionally empty.
3. On the sanitized confirmation page, open the browser console and run:
   `JSON.parse(sessionStorage.getItem('benzify_calendly_event_type_uuid_candidate'))`
4. Copy the returned UUID into `calendlyEventTypeUuid` in `dist/config.js`, deploy again, and complete a new test booking.

Only the non-personal event-type UUID is saved for this setup step. Calendly-provided names, email addresses, phone numbers, answers, and the original redirect URL are not retained.

## Google Ads and analytics

- Treat `cta_click` and `calendly_visit` as internal `dataLayer` diagnostics only. They are not reportable without a deliberately configured analytics destination.
- Keep the scheduled-call conversion as the only primary Google Ads conversion from this page.
- The existing Google Ads destination is `AW-18369421554/KJ60CICBqtscEPLBnLdE`. Rename or verify that this conversion action represents a confirmed scheduled call—not a Calendly-link click.
- Do not install GA4 or Google Tag Manager alongside the direct Ads tag without an explicit analytics migration and duplicate-tag review.
- Qualified and attended-call conversions remain deferred while Calendly is the only lead system.
- Microsoft Clarity remains enabled. Review applicable consent and privacy requirements before launch.

The conversion uses Calendly's unique `invitee_uuid` as the Google Ads transaction ID. A local ledger retains up to 100 converted invitee UUIDs for 90 days, and the same-tab confirmation state prevents a refresh from firing a second local conversion when local storage is unavailable.

This is browser-only hardening. The URL checks reduce accidental and basic false conversions but do not prove that Calendly created a booking. Verified bookings, cancellations, reschedules, qualification, and attendance require a later Calendly webhook or trusted CRM integration.

## Search campaign alignment

Use realtor-service intent in ads and keywords, including variations of:

- Facebook ads for realtors
- Meta ads for real estate agents
- Real estate lead generation agency
- Seller lead generation for realtors
- Realtor advertising agency

Add homeowner and consumer intent as negative keywords, including:

- sell my house
- home valuation
- what is my house worth
- realtor near me
- listing agent near me
- homes for sale
- buy a house

Ads should repeat the page’s core promise and qualification: seller-focused Meta campaigns for U.S. agents and teams, with recommended ad spend starting at $1,500 per month.

## Verification before launch

1. Open the landing page with test UTM parameters and a test GCLID.
2. Confirm every CTA opens Calendly with those parameters attached.
3. Complete the UUID-capture procedure above, configure the event-type UUID, and deploy again.
4. Complete a new test booking. Confirm the address is immediately sanitized to `/booking-confirmed/`, the confirmed content appears, and one Google Ads conversion fires with `transaction_id` equal to Calendly's `invitee_uuid`.
5. Refresh the page and confirm the success state remains without another conversion.
6. Confirm that `?scheduled=1` alone, malformed UUIDs, missing UUIDs, and a different event-type UUID show the unconfirmed state and fire no conversion.
7. Test bookings in two tabs and confirm each distinct invitee UUID is recorded once.
8. Inspect local/session storage and tag requests. Confirm no invitee name, email, phone number, answers, or unsanitized URL is retained or transmitted.
9. Confirm the page loads the direct Google Ads tag and Clarity, with no GA4, GTM container, or Meta Pixel request.
10. Verify the case-study figures and public-use approvals, then test desktop, tablet, and mobile before enabling paid traffic.

# Frontend redesign — Phase 1

Organic/editorial public homepage only. Authentication pages, dashboards, frontend routes, API client, protected navigation, environment configuration and backend are unchanged.

## Styling boundary

`Layout.jsx` uses `PublicSite` only for pathname `/`. Login, registration and not-found pages retain the original layout. The original `Brand` export remains unchanged because dashboards import it. No existing global stylesheet, root tokens, Tailwind configuration or application architecture is replaced.

`public-site.css` defines its tokens on `.public-site`; unique public component selectors and scoped heading rules avoid changing forms, buttons, fonts or workspace styles. Fonts have unique CSS family aliases and are only requested when used. Tailwind v4 remains installed and unmodified. No new dependencies.

| Token                | Value   | Use                                  |
| -------------------- | ------- | ------------------------------------ |
| --public-ivory       | #F7F4EC | Page background                      |
| --public-forest      | #233D2D | Titles, primary buttons, footer      |
| --public-sage        | #899A6D | Organic details and supporting tones |
| --public-terracotta  | #C8734E | Decorative accents                   |
| --public-sand        | #E9DFCC | Closing section, stamps, NGO panel   |
| --public-charcoal    | #282D25 | Body text                            |
| --public-muted       | #636859 | Readable supporting text             |
| --public-accent-text | #A64F2D | Darker terracotta for text/focus     |

Self-hosted variable **Fraunces** (normal + real italic) provides editorial headings; **DM Sans** provides body/navigation/buttons. Legacy auth/dashboard typography stays intact. Headings and section spacing use clamp; entrance motion is enabled only when reduced motion is not requested. Native links/buttons retain keyboard focus outlines; the mobile menu supports Escape and restores focus. It is an inline disclosure, not a modal dialog.

Reusable primitives: PublicBrand, PublicButton, SectionLabel and FoodPhoto in `components/PublicSite.jsx`. Responsive local WebP photos use srcSet/sizes and dimensions; the hero is eager/high priority, later photos are lazy. See [asset licenses](../client/public/ASSET-LICENSES.md) for source/creator/license information and retained font notices. Stock photography is illustrative and implies no FoodBridge users, partners or endorsement. No impact metrics or testimonials are invented.

## Verification

- 265 tests pass: 57 frontend, 208 backend; zero failures.
- ESLint, Prettier check and production build pass.
- Chrome at 375, 768, 1440px: no horizontal overflow; photos decode after normal scrolling; fonts render without errors.
- Mobile/tablet navigation opens/closes, Escape returns focus; donor and NGO links preserve role selection; login opens the existing form.
- Auth pages have no `.public-site` ancestor. Authenticated donor dashboard renders with unchanged sampled computed font/color/background/width when new public CSS is disabled; protected routes are unchanged and covered by the existing tests.
- Browser network uses test fixtures for session/API responses; no live accounts or production data are changed by this visual verification. The existing backend integration suite runs against its isolated replica set.
- No backend, API, cookie, CSRF, Socket.IO, environment, route definitions or package files changed.

Temporary review screenshots (not added as production assets):

- `/tmp/foodbridge-redesign-1440.png` — desktop full page
- `/tmp/foodbridge-redesign-768.png` — tablet full page
- `/tmp/foodbridge-redesign-375.png` — mobile full page
- `/tmp/foodbridge-dashboard-preserved.png` — original donor workspace

These temporary paths may be cleared by the operating system. No known blocking visual issues remain at the tested sizes. Broader device and screen-reader testing remains useful; this is not a full accessibility certification. Authentication/dashboard redesign is reserved for later phases.

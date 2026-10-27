# Shared dashboard shell and donor experience — Phase 3

## Scope and design decisions

Completed the existing Phase 3 working-tree draft with a shared authenticated shell and donor-scoped workflow surfaces. Phase 1 public pages and Phase 2 authentication remain preserved. No routes were removed, dependencies added, commits created or deployment performed. NGO, volunteer and admin retain their existing internal pages inside the shared shell. Phase 4 is not included.

Warm ivory (#F7F4EC), forest (#233D2D), sage (#899A6D), terracotta (#C8734E), sand (#E9DFCC) and charcoal (#282D25) use the existing editorial tokens and self-hosted Fraunces/DM Sans fonts. A forest first metric, restrained borders, compact operational rows and clear primary actions establish hierarchy. Smaller secondary text was enlarged and darkened for readability. No stock donation images, sample metrics, testimonials or simulated activity are injected into the application.

## Components and screens

| Files                                                                      | Result                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client/src/pages/DashboardPage.jsx`, `workspace-shell.css`                | Shared sidebar, grouped navigation, active parent routes, breadcrumb, profile disclosure, existing notification bell, logout, skip link, sticky header and modal mobile drawer. Other roles retain their legacy overview content.               |
| `client/src/pages/DonorOverview.jsx`                                       | Personalized welcome, create CTA, verification note, genuine analytics, live pending-request count, monthly activity with accessible table, recent donations and requests, independent retry states and onboarding.                             |
| `client/src/pages/DonationsPage.jsx`, `components/DonorDonationCard.jsx`   | Image/fallback listing cards, category/status, remaining/total/reserved/received inventory, collection deadline, view/edit/cancel, API search/filter/pagination and actionable empty states. Existing ownership and status restrictions remain. |
| `client/src/pages/DonationFormPage.jsx`                                    | Create/edit sections for food, quantity, preparation/storage declarations, pickup, optional coordinates and imagery; unchanged field constraints, typed submission values, local-to-ISO timestamps, pending controls and focused server errors. |
| `client/src/pages/DonationDetailsPage.jsx`                                 | Donor image presentation and existing inventory, declarations, upload management and owner controls.                                                                                                                                            |
| `client/src/pages/RequestsPage.jsx`                                        | Incoming request management, NGO identity, quantity, reference, dates, status filters, confirmations and mutation feedback. History uses recorded event timestamps and status-based filters. Useful donor-specific empty states.                |
| `client/src/pages/PickupsPage.jsx`                                         | Donor-only pickup progress presentation, existing authorized volunteer details, real events and links to the established donor handover workflow.                                                                                               |
| `client/src/components/ProfileForm.jsx`                                    | Existing profile anchor and safe editable fields, read-only account facts, verification, save/error feedback and focused validation. Extracted shared form retains other-role behavior.                                                         |
| `client/src/components/DonationShared.jsx`                                 | Optional custom empty-state content and configurable confirmation title/button styling. Default behavior retained for other roles.                                                                                                              |
| `client/src/donor-workspace.css`, `editorial-tokens.css`                   | Scoped donor typography, panels, forms, filters, charts, timelines, inventory and responsive rules; shared tokens include the workspace boundary.                                                                                               |
| `client/src/Donations.test.jsx`, `DonorWorkspace.test.jsx`, `App.test.jsx` | Donor coverage and overview/auth compatibility assertions. Earlier Phase 1/2 edits were already present and preserved.                                                                                                                          |

## Routes and reusable data

Donor routes remain `/dashboard/donor`, `donations`, `donations/new`, `donations/:id`, `donations/:id/edit`, `requests`, `history`, `pickups`, `pickups/:id`, `analytics`, `notifications`, plus the existing overview `#profile` anchor. App routing and protected-role guards are unchanged.

The overview reuses `useApiData` with `/analytics/donor`, `/donations/mine?limit=4` and `/requests?status=pending&limit=4`. Listing totals and activity reflect the analytics API's date range, explicitly shown in UTC; pending requests use the current pagination total. Unavailable metrics show an em dash, not an invented zero. Monthly bars have an exact-count table and collapse to onboarding without recorded activity.

All listing search/category/unit/status filters, pagination, donation detail/inventory data, requests/history, pickups, profile operations and notifications reuse existing APIs. The API client, auth context, backend, schemas and environment configuration remain unchanged. Cloudinary uploads still occur after a successful listing save; upload failure preserves the listing and reports the existing error on details. Required handling/allergen/storage declarations and transactional reservation behavior are preserved.

## Responsive and accessible behavior

- 1440px: persistent sidebar, four metrics, two overview panels, three listing columns and form guidance alongside the form where space allows.
- 768px: modal navigation drawer, two listing columns, stacked overview panels and form guidance below the form.
- 375px: single listing/request column, two metrics per row, stacked page actions, compact top navigation and 16px form input text. Content uses normal document scrolling.
- Native modal drawer supports keyboard focus containment, Escape, close and focus restoration. Profile menu supports Escape, outside-click dismissal and ordinary tab navigation.
- Visible focus states, skip link, semantic labels, pending status, real chart data table, image error fallback and reduced-motion overrides remain available. Broader assistive-technology certification is outside this verification.

## Functional verification

- **86 frontend tests pass**, including 20 added donor-focused cases across the two donor suites. Coverage includes genuine analytics/zero/error states, dashboard navigation and drawer, profile menu, listing filters/cancel/ownership/image fallback, create/edit payloads, upload failure, request confirmation/feedback, history timeline, pickup progress/authorized volunteer details and safe profile editing.
- **208 backend tests pass** using the existing isolated MongoDB replica-set suite. The sandbox initially blocked local ports; the approved unrestricted rerun passed. No backend files were edited.
- ESLint, repository formatting check and production build pass.
- Headless **Google Chrome**, Playwright and a temporary local MongoDB replica set exercised actual APIs without mocks or production accounts. The temporary replica set was stopped after verification. No environment files were read or changed by the Phase 3 browser harness.
- Real browser workflow: new donor onboarding → publish donation through the form → edit through the form → isolated verified NGO request → donor confirmation/acceptance → database check of reserved quantity → donor handover → NGO receipt → database check of completed quantity → completed history timeline → profile save.
- All four captured screens pass document overflow checks at 375/768/1440px. Tablet/mobile drawer Escape restores focus. Images with no provided photo show an intentional fallback. Chrome reports zero console errors, uncaught application errors, HTTP failures or unexpected failed requests in the final run. The initial browser harness omitted the existing realtime adapter; the harness was corrected without changing application Socket.IO code.

## Screenshots

Temporary full-page Chrome captures contain only isolated test fixture records created through the verification workflow. These are review artifacts, not application data or production assets; the operating system may clear `/tmp`.

| Screen            | Desktop                                     | Tablet                                     | Mobile                                     |
| ----------------- | ------------------------------------------- | ------------------------------------------ | ------------------------------------------ |
| Overview          | `/tmp/foodbridge-phase3-overview-1440.png`  | `/tmp/foodbridge-phase3-overview-768.png`  | `/tmp/foodbridge-phase3-overview-375.png`  |
| My donations      | `/tmp/foodbridge-phase3-donations-1440.png` | `/tmp/foodbridge-phase3-donations-768.png` | `/tmp/foodbridge-phase3-donations-375.png` |
| Create donation   | `/tmp/foodbridge-phase3-create-1440.png`    | `/tmp/foodbridge-phase3-create-768.png`    | `/tmp/foodbridge-phase3-create-375.png`    |
| Incoming requests | `/tmp/foodbridge-phase3-requests-1440.png`  | `/tmp/foodbridge-phase3-requests-768.png`  | `/tmp/foodbridge-phase3-requests-375.png`  |

Desktop overview/requests and mobile listing/form screenshots were visually inspected. The form remains intentionally long because all existing food-handling fields remain required.

## Remaining limitations

No known blocking workflow issue remains. Live Cloudinary success was not exercised: multipart integration and saved-listing upload failure are covered by frontend/backend tests. Volunteer assignment/progress and role restrictions are test-covered; the browser workflow used direct donor handover and NGO receipt. Full physical-device, cross-browser and screen-reader testing remains outstanding. No claim is made about production deployment configuration.

# Phase 4 — NGO and volunteer experiences

## Scope

Frontend visual and UX redesign of NGO and volunteer workspaces, continuing the Phase 1–3 Organic & Editorial system. Phase 3 was inspected before editing: all 90 existing frontend tests passed, and donor workflows and the shared shell were intact. No Phase 5 work, dependency additions, commits or deployment are included.

Backend source, MongoDB schemas/indexes, API contracts, auth context, API client, route definitions, CSRF, JWT, CORS, cookies, Socket.IO configuration and environment files remain unchanged. Public/auth/donor designs and admin interiors are preserved. Other participants still use the shared Phase 3 dashboard shell.

## Design decisions

- Reuse the existing warm ivory, forest, sage, terracotta, sand and charcoal palette with self-hosted Fraunces headings and DM Sans controls/data.
- Extend Phase 3 workflow primitives to `.community-workspace` using `:is(.donor-workspace, .community-workspace)`. Donor selector specificity remains equivalent; first-metric emphasis targets the first direct article so it cannot style a nested pending-delivery metric accidentally.
- Give overviews an editorial welcome, explicit organization/verification context, operational metrics and clear next actions. Use real records and deliberate onboarding instead of demonstration numbers.
- Use food-image surfaces, compact quantities, refined badges and clear primary actions. Missing or broken managed images use the existing leaf fallback, extracted into a shared component. No stock photo is represented as a real donation.
- Distinguish matching from ordinary browsing with server-ranked position labels, returned score bars and transparent distance/quantity/pickup explanations. Scores and weights are never calculated or altered by the frontend.
- Keep map access optional. Written cards and selectable previews remain fully usable without loading third-party tiles. Nearby desktop discovery pairs results with a map/preview column; mobile places the map/preview above results.
- Present custody plainly: donor handover and NGO receipt are separate from volunteer travel and arrival. Progress indicators never invent an intermediate transition.

## Screens completed

### NGO

- **Overview:** personalized greeting, organization, verification, Browse donations CTA, total requests, accepted/awaiting-receipt requests, completed receipts, live pending deliveries, recent requests, available donations and discovery/tracking shortcuts.
- **Explore donations:** existing search, category/unit filters and pagination, full-width image/fallback cards, status, inventory, deadline, authorized location and details links. No unsupported sort control was added.
- **Recommended donations:** backend-ranked cards, score indicator, returned component scores/weights, full-quantity explanation, distance/cutoff context, missing-location guidance, no-match/retry states and optional area map.
- **Nearby donations:** existing coordinates/radius/quantity/category/unit controls, responsive Leaflet/OpenStreetMap view, selected marker/list preview, written locations and approximate straight-line distance labels.
- **Donation details/request form:** shared photo fallback, declarations, inventory and existing request eligibility/validation, submission and success feedback.
- **My requests/history:** request summaries and inline detail, authorized donor reference, statuses/dates, recorded chronological timestamps, cancellation, volunteer transport arrangement and receipt confirmation. Existing routes remain; no unsupported request-detail endpoint was introduced.
- **Delivery tracking/details:** supported status filters, real pickup progress, participant information, optional map, existing transport cancellation, event history and a link to request-based receipt confirmation.
- **Profile:** existing `#profile` anchor, editable permitted fields, read-only account facts, location controls, verification and original save/error feedback.

### Volunteer

- **Overview:** personalized welcome, verification/eligibility guidance, live available/active counts, confirmed completion total, latest assignment highlights, real recent activity and onboarding.
- **Available pickups:** authorized pickup/delivery areas, quantity, deadline, current status, eligibility-controlled claim confirmation and conflict feedback.
- **My assignments:** recent/current/historical records, backend-supported status filter, ownership-aware next actions, start/release/issue reporting and persistent mutation feedback.
- **Pickup details:** five supported stages (awaiting volunteer, assigned, en route, picked up, delivered), current-step indication, authorized stops, event history, optional map, donor/NGO custody guidance and arrival reporting after handover.
- **Profile:** same shared permitted-field editor and account facts, styled consistently with the role workspace.

## API data and preserved behavior

NGO metrics use `/analytics/ngo` summary values. The analytics date range is displayed in UTC. Accepted requests retain the backend definition: accepted or handed-over requests created in the analytics period; completed receipts use receipt dates. Live pending deliveries sum pagination totals from four disjoint existing `/pickups/mine` status queries: `awaiting_volunteer`, `assigned`, `en_route_to_pickup`, `picked_up`. An incomplete/failed count remains unavailable rather than appearing as zero and has its own retry.

Volunteer metrics use `/analytics/volunteer`: `availableAssignments`, `activeAssignments` and `completedPickups`. The first two are live snapshots; completions use the displayed receipt period. Latest assignments come from `/pickups/mine?limit=4`; recent activity uses the existing analytics `pickupHistory` response. Full history remains on My assignments with pagination and supported status filtering.

Discovery keeps `/donations`, `/donations/recommendations` and `/donations/nearby` and their existing query parameters. Search does not reserve stock. All scores, suitability components, weights, distance and inventory values come from returned data. Markers use only API-returned locations. Approximate points are identified as approximate; distance is not described as road travel time. Exact pickup/delivery information remains governed by server response authorization.

Request and pickup mutations retain their existing endpoint, method and body. Consequential actions still require confirmation. NGO receipt is offered only for handed-over requests. Volunteer claim uses `canClaim`, and assignment movement uses existing ownership/status predicates. HTTP 409 remains an error, with refresh guidance; no success state or local inventory change is fabricated. Donor handover, NGO receipt, inventory reservation and assignment ownership remain server controlled.

Leaflet still requests tiles only after the user opens the map. ResizeObserver invalidates the map size when its container changes; cleanup removes observers and map instances. Marker selection and written preview selection use the same actual record IDs. Failed map tiles retain the existing written-location fallback.

## Reused and new components

Reused `DashboardPage`, `StatusBadge`, `DataState`, `Pagination`, `ConfirmAction`, `DonationCard`, `ProfileForm`, `FormField`, `LocationFields`, `LocationMap`, existing hooks and Phase 3 panel/metric primitives. No parallel design system or new component library was added.

New `CommunityOverview.jsx` contains the two role overviews and small private panel/metric/empty-state primitives. `CommunityWorkflow.jsx` provides the NGO/volunteer pickup progress indicator. `DonationPhoto.jsx` extracts the unchanged donor photo/failure rendering for reuse; the original named export remains available to donor callers.

## Files created and modified

| File                                                       | Change                                                                                                         |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `client/src/pages/CommunityOverview.jsx`                   | New NGO and volunteer overviews using existing APIs                                                            |
| `client/src/components/CommunityWorkflow.jsx`              | New presentation-only pickup progress                                                                          |
| `client/src/components/DonationPhoto.jsx`                  | Shared extraction of existing photo/fallback behavior                                                          |
| `client/src/community-workspace.css`                       | NGO/volunteer-only responsive visual rules                                                                     |
| `client/src/pages/DashboardPage.jsx`                       | Route existing NGO/volunteer overview slots into new views, add scoped content class; retain shell/admin/donor |
| `client/src/donor-workspace.css`                           | Share existing editorial workflow selectors without changing donor appearance                                  |
| `client/src/components/DonorDonationCard.jsx`              | Import/re-export the extracted photo component; donor card markup and action rules retained                    |
| `client/src/components/DonationShared.jsx`                 | Use shared photo/fallback in existing discovery card                                                           |
| `client/src/pages/DonationsPage.jsx`                       | NGO no-result filter reset                                                                                     |
| `client/src/pages/DiscoveryPage.jsx`                       | Matching presentation, map/list layout, selectable preview, setup guidance                                     |
| `client/src/components/LocationMap.jsx`                    | Optional selection callback/highlight, expanded state and responsive size observer                             |
| `client/src/pages/DonationDetailsPage.jsx`                 | Shared photo/fallback, request form pending semantics and repeat-submit guard                                  |
| `client/src/pages/RequestsPage.jsx`                        | NGO timelines, empty states, mutation/arrangement feedback and primary receipt action                          |
| `client/src/pages/PickupsPage.jsx`                         | Community progress, supported filters, feedback, eligibility/ownership guidance                                |
| `client/src/CommunityWorkspace.test.jsx`                   | 18 new NGO/volunteer regression cases                                                                          |
| `client/src/App.test.jsx`, `client/src/Logistics.test.jsx` | Update redesigned overview/empty copy assertions and identify signup call directly after new overview fetches  |
| `docs/redesign-phase-4.md`                                 | This implementation and verification record                                                                    |

## Responsive and accessibility verification

- **1440px:** persistent shared sidebar, four NGO or three volunteer metrics, responsive card grids, paired nearby results/map, editorial headings and compact operational panels.
- **768px:** navigation drawer, two-column card/metric layouts where space permits, responsive maps, stacked overview panels and reachable form actions.
- **375px:** single cards and form columns, two NGO metrics per row, stacked volunteer metrics, wrapping pickup stages, 16px input/select text and normal document scrolling. No horizontal overflow found.
- All twelve screenshot surfaces were checked at all three widths. Maps initialize and resize within their containers. Mobile/tablet Escape restores focus to the drawer trigger.
- Native labels, buttons, form constraints and confirmation dialogs remain. Status includes text, current pickup stage uses `aria-current="step"`, written previews have a live region, and marker selection has ordinary keyboard-operable list buttons as an alternative.
- Existing visible focus, skip link and shared reduced-motion rules apply to the new workspaces. Screenshots were captured with reduced motion and after map tiles loaded; full-page captures reset scroll/focus to avoid recording sticky-header positions from a prior interaction.

## Functional verification

- **108 frontend tests pass:** all prior functional coverage remains, plus 18 NGO/volunteer tests for actual/zero/unavailable data, verification, navigation/drawer, image failure, existing filters, returned score presentation, written map selection, receipt restrictions/payload, safe profile fields, assignment claim conflict, owned start, status filtering and handover-vs-receipt progress.
- **208 backend tests pass:** unchanged isolated replica-set suite covers security, RBAC, inventory, reservation and pickup transitions.
- ESLint, repository Prettier check, `git diff --check` and normal production build pass. No packages or runtime environment settings changed.
- Headless **Google Chrome** exercised the real existing API against a temporary **local MongoDB replica set**, not production/Atlas user data. Operator verification was limited to fixture accounts in that isolated database. The replica set was stopped in cleanup; environment file fingerprints remained unchanged.
- NGO browser verification: login/role redirect, refresh restoration, genuine onboarding, available listing search, returned matching scores, nearby preview selection and Leaflet initialization, request submission, cancellation, accepted-request update, no premature receipt button, volunteer pickup arrangement and receipt confirmation after donor handover.
- Volunteer browser verification: login/role redirect, refresh restoration, unverified availability rejection, available pickup discovery, atomic claim, second-volunteer claim conflict, owned start/release/reclaim/start, assignment list/details, arrival after donor handover, delivered-history status filter and refusal of volunteer receipt mutation.
- Database assertion confirmed reserved quantity returns to zero and completed quantity increments only after NGO receipt. No donation inventory or assignment status was changed optimistically by the UI.
- Both roles' analytics and notification routes loaded, profile saves succeeded, and a wrong-role admin navigation returned the volunteer to its own dashboard. Existing notification security/reconnect/read behavior remains covered by the unchanged notification tests; no Socket.IO implementation changes were made.
- Final browser run reported no unexpected application exceptions, console errors, failed requests, HTTP failures or OpenStreetMap tile failures. Expected HTTP 401, 403 and 409 checks are deliberately distinguished from unexpected failures.

## Screenshots

Temporary full-page review artifacts contain only explicit isolated test fixtures. They are not application seed data or production assets. `/tmp` may be cleared by the operating system.

For each suffix below, captures exist at **1440**, **768** and **375** pixels:

| Screen                    | Path pattern                                               |
| ------------------------- | ---------------------------------------------------------- |
| NGO overview              | `/tmp/foodbridge-phase4-ngo-overview-{width}.png`          |
| Explore donations         | `/tmp/foodbridge-phase4-ngo-explore-{width}.png`           |
| Recommendations           | `/tmp/foodbridge-phase4-ngo-recommended-{width}.png`       |
| Nearby discovery with map | `/tmp/foodbridge-phase4-ngo-nearby-{width}.png`            |
| NGO requests              | `/tmp/foodbridge-phase4-ngo-requests-{width}.png`          |
| NGO tracking              | `/tmp/foodbridge-phase4-ngo-tracking-{width}.png`          |
| NGO profile               | `/tmp/foodbridge-phase4-ngo-profile-{width}.png`           |
| Volunteer overview        | `/tmp/foodbridge-phase4-volunteer-overview-{width}.png`    |
| Available pickups         | `/tmp/foodbridge-phase4-volunteer-available-{width}.png`   |
| My assignments            | `/tmp/foodbridge-phase4-volunteer-assignments-{width}.png` |
| Pickup details/progress   | `/tmp/foodbridge-phase4-volunteer-tracking-{width}.png`    |
| Volunteer profile         | `/tmp/foodbridge-phase4-volunteer-profile-{width}.png`     |

Desktop overview/recommendations/tracking and mobile nearby/overview screenshots were visually reviewed. Review corrected image stretching, metric text contrast and small timeline text before final captures.

## Remaining limitations

No known blocking issue remains in the tested flows and sizes. Broader physical-device, cross-browser and assistive-technology testing remains manual follow-up; this is not a full accessibility certification. Live Cloudinary writes were not needed for this frontend phase; existing upload handling and tests remain intact, and broken-image behavior is covered. Map availability still depends on the existing external OpenStreetMap tile service. No manual migration, environment change or deployment step is required.

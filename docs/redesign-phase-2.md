# Authentication redesign — Phase 2

Phase 2 introduces an Organic & Editorial login and registration experience. Phase 1's homepage and the existing dashboard designs remain intact. No backend, API contracts, JWT/cookie/CSRF/CORS, MongoDB models, session context, protected routes, authorization, environment or package configuration is changed. No deployment or Git commit is created; Phase 3 is not started.

## Design decisions

The auth experience shares the homepage's warm ivory, forest, sage, terracotta, sand and charcoal tokens, self-hosted Fraunces (including a real italic face), and DM Sans. Tokens/font declarations were extracted from public-site.css into editorial-tokens.css and scoped to `.public-site, .auth-experience`; there are no root or dashboard overrides. The homepage retains the same token values and visual rules.

Desktop uses a forest editorial panel and a focused ivory form column, with the existing local Pexels photographs, an original FoodBridge wordmark treatment and a clear Back to home link. Registration's story panel is sticky on large screens while the longer form uses ordinary document scrolling. There are no fixed-height form containers or nested scrolling panels. No new photographic imagery, testimonials, unsupported recovery features or dependencies were introduced. An original vector/ICO browser icon fixes a missing favicon request discovered during Chrome verification. Existing image/font licenses remain in client/public/ASSET-LICENSES.md.

Registration uses native radio controls presented as role cards, with visible selected/check/focus states and accessible labels/descriptions. URL preselection and the donor fallback for invalid roles are preserved. Only NGOs see the required organization field. Verification copy explicitly states that NGO requests and volunteer pickup claims need administrator verification; it does not imply automatic verification or an available approval service.

Auth-only field primitives preserve labels, autocomplete, native constraints, required flags and backend field errors. Password visibility is a type=button action with aria-pressed/aria-controls and never changes the password value or adds a payload field. Input autofill text remains legible; focus is moved to the first server-invalid field or the form error summary. Pending states disable form editing/role changes/repeated submission and expose aria-busy. Reduced-motion preference disables entrance/spinner animations; visible pending text remains available.

## Components and files

| File                                   | Change                                                                                                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| client/src/pages/AuthPage.jsx          | Redesigned existing forms, native role cards, clear verification note, loading/error hierarchy and focused validation feedback; same authenticate call and payload keys |
| client/src/components/AuthShell.jsx    | New auth-only split layout, responsive brand/header, local photo panel and minimal footer                                                                               |
| client/src/components/AuthField.jsx    | New auth-only label/input/hint/error primitive with optional password visibility toggle; dashboard FormField is untouched                                               |
| client/src/components/Layout.jsx       | Adds an auth-only presentation branch for existing /login and /register paths; route definitions are unchanged                                                          |
| client/src/auth-experience.css         | Auth-scoped layout, controls, focus, autofill, motion and responsive styles                                                                                             |
| client/src/editorial-tokens.css        | Extracted shared Phase 1 palette/font declarations, limited to public/auth boundaries                                                                                   |
| client/src/public-site.css             | Imports the extracted tokens; all homepage visual rules remain                                                                                                          |
| client/public/favicon.svg, favicon.ico | Original local browser icon; fixes the previously missing /favicon.ico request                                                                                          |
| client/public/ASSET-LICENSES.md        | Records the original icon alongside the existing photo/font licenses                                                                                                    |
| client/src/App.test.jsx                | Preserves existing tests and adds nine auth UI cases; updates the Phase 1 design-boundary assertion for the now-redesigned auth page                                    |

The original Brand export and FormField component remain unchanged for dashboards. AuthProvider, useAuth, API helper, App route configuration, ProtectedRoute and backend files are unchanged. Phase 1 work was already present in the working tree and was preserved.

## Responsive behavior

- **1440px:** Editorial/photo panel beside the form. Registration uses a sticky, naturally sized story panel instead of stretching the green surface to the entire form height.
- **768px:** A centered, generously spaced form replaces the image panel. The masthead keeps branding/home navigation; form content stays readable and reachable.
- **375px:** Full-width inputs within 24px gutters, 16px input text to avoid mobile browser zoom, visible role cards and password controls, natural vertical scrolling through registration. No horizontal overflow or clipped fields/buttons was found.

## Functional verification

- **274 tests pass, zero failures:** 66 frontend and 208 backend. All prior tests remain passing; nine new auth UI cases cover role preselection, role-dependent fields, unchanged signup payload/CSRF headers, password visibility, validation/accessibility, pending submissions and navigation.
- ESLint, formatting checks and normal production build pass.
- Backend security tests remain passing for authentication, public admin rejection, protected roles, CSRF/cookies, session/logout revocation and existing reservations/pickups. No backend source changes were made.
- Chrome at 375/768/1440px verified login and NGO registration layouts, role preselection/native keyboard selection, password reveal/hide, reachable submit controls and no horizontal overflow.
- Isolated real Atlas browser verification exercised donor/NGO/volunteer signup, login, logout and session restoration, plus admin login/role redirect using an operator-created fixture confined to that temporary database. Invalid credentials show the existing generic message and receive keyboard focus. Native required-field validation blocks empty registration. Back to home opens the Phase 1 page.
- Final browser checks found no uncaught application errors or unexpected console/network failures. Anonymous session restoration and the intentionally invalid login return the expected 401 responses. The missing favicon 404 found during review is fixed by the new local icon.
- Test accounts and all live browser writes are confined to a uniquely named temporary verification database, which is removed after each run. Existing environment files are checked for unchanged contents; no credential values are printed.

## Screenshots

Temporary Chrome full-page captures (may be cleared by the operating system):

| Width | Login                                 | Registration (NGO selected)              |
| ----- | ------------------------------------- | ---------------------------------------- |
| 1440  | /tmp/foodbridge-phase2-login-1440.png | /tmp/foodbridge-phase2-register-1440.png |
| 768   | /tmp/foodbridge-phase2-login-768.png  | /tmp/foodbridge-phase2-register-768.png  |
| 375   | /tmp/foodbridge-phase2-login-375.png  | /tmp/foodbridge-phase2-register-375.png  |

Screenshots were visually reviewed; form controls remain accessible with ordinary document scrolling. Broader physical-device, password-manager and screen-reader checks are useful follow-up work; this is not a full accessibility certification. Registration intentionally remains longer than one mobile viewport. No dashboard redesign is included.

## Remaining issues

No known blocking visual or functional issues remain at the tested widths. Cross-browser password-manager/autofill and full screen-reader testing remain useful manual follow-ups. Existing deployment prerequisites are unchanged; this redesign does not claim to resolve hosted cross-site cookie or production alerting setup. Phase 3 has not begun.

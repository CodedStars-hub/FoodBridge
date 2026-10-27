# FoodBridge production-readiness audit

Initial audit date: 25 October 2026. Milestone 6B follow-up: 27 October 2026; see [production hardening](milestone-6b-hardening.md). Scope: committed Milestones 1–5 plus the two small audit fixes described below. No services were deployed, no commits created and no existing environment secrets modified.

**Decision after Milestone 6B: application hardening checks pass; actual Render proxy allowlist verification and real alert delivery remain manual release gates, alongside the existing hosting/Cloudinary prerequisites below.** University submission can demonstrate the verified workflows, but live Cloudinary functionality must be disclosed as unverified until credentials and a provider smoke test are supplied. Passing local/integration tests does not establish that an undeployed hosting configuration works.

Status meanings: **PASS** = evidence obtained; **FAIL** = a concrete readiness gap in the current implementation; **NEEDS MANUAL CONFIGURATION** = hosting/account/operator setup still required; **OPTIONAL** = improvement not required for a single-instance university demonstration. Priority P1 blocks the stated production release; P2 should follow before broader public traffic; P3 is optional improvement.

## Verification evidence

| Check                                       | Status                     | Evidence and limits                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing suite before fixes                 | PASS                       | 215 tests: 52 frontend + 163 backend                                                                                                                                                                                                                                                                                                                        |
| Initial final regression suite (25 October) | PASS                       | 217 tests: 53 frontend + 164 backend, before Milestone 6B                                                                                                                                                                                                                                                                                                   |
| Milestone 6B regression suite (27 October)  | PASS                       | 261 tests: 53 frontend + 208 backend; 0 failures. Lint, formatting and production build pass                                                                                                                                                                                                                                                                |
| ESLint                                      | PASS                       | `npm run lint`, zero warnings                                                                                                                                                                                                                                                                                                                               |
| Formatting                                  | PASS                       | `npm exec prettier -- --check .`                                                                                                                                                                                                                                                                                                                            |
| Normal production build                     | PASS                       | `npm run build`, no NODE_ENV override; Vite emits client/dist; server script checks its entry points                                                                                                                                                                                                                                                        |
| Dependency advisory audit                   | PASS                       | `npm audit`: zero known vulnerabilities at audit time; this is not a guarantee against undisclosed defects                                                                                                                                                                                                                                                  |
| Backend normal startup                      | PASS                       | `npm start` using unchanged environment connects to Atlas and listens; `/api/health` returns 200 with Helmet headers; audit process then stopped                                                                                                                                                                                                            |
| Current Atlas connection                    | PASS                       | Read-only connection, replica-set/session capability, snapshot transaction read and explicit abort, real geospatial query                                                                                                                                                                                                                                   |
| Existing Atlas indexes                      | PASS                       | All declared indexes present: User 4, Donation 8, DonationRequest 11, Notification 5, ImageCleanupTask 3 (including `_id` indexes). Inspection disabled autoIndex/autoCreate; it did not create indexes or write application records                                                                                                                        |
| Isolated Atlas/browser smoke                | PASS                       | Chrome: geolocated listing, NGO recommendations, optional attributed map, live donor inbox, volunteer claim/start/arrival, donor handover, NGO receipt, correct inventory, real received quantities in analytics, persistent inbox, mobile layout, no uncaught page errors. Only a randomly named temporary database was used for writes and it was removed |
| Live Cloudinary provider                    | NEEDS MANUAL CONFIGURATION | All three Cloudinary values are absent in current server environment. Upload transport tests use mocks; no live upload/replacement/deletion was claimed                                                                                                                                                                                                     |
| Final deployed domains/TLS/cookies          | NEEDS MANUAL CONFIGURATION | No deployment exists as part of this audit; browser smoke uses a local origin and does not establish hosted cross-site cookie compatibility                                                                                                                                                                                                                 |

Runtime used: Node v24.19.0, npm 11.17.0. Pin Node 24 for hosting rather than relying on an arbitrary provider default. Tests use a real isolated MongoDB 7.0.24 replica set with transactions; authentication tests also use model spies. Frontend tests use jsdom and mocked API responses. These scopes differ from live provider verification.

## Feature audit

| Feature                                  | Status                     | Findings                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Donor/NGO/volunteer/admin authentication | PASS                       | bcrypt cost 12; normalized unique email; signed expiring JWT; session restoration; logout revokes tokenVersion. Public roles exclude admin. Admin login/access is covered by role/session tests, not public admin registration                                                                                                   |
| Backend role/owner authorization         | PASS                       | requireAuth reloads account and private session version; authorizeRoles and service ownership checks enforce access independently of React; privileged profile/signup fields are rejected                                                                                                                                        |
| Donations and management                 | PASS                       | Required declarations, quantity/time validation, owner-only edits/cancellation, edit restrictions with active requests/receipts, strict body validation after audit fix                                                                                                                                                          |
| NGO requests and reservations            | PASS                       | Verified NGO submission/acceptance checks; partial inventory, conditional acceptance and shared donation transaction lock; duplicate active requests prevented by partial unique index; concurrency/rollback tests pass                                                                                                          |
| Expiry                                   | PASS                       | Server deadlines filter discovery and reject submission/acceptance/handover. Actual receipt remains possible for food already handed over. Persisted cleanup is idempotent but requires an external schedule                                                                                                                     |
| Geospatial matching                      | PASS                       | GeoJSON longitude/latitude validation, sparse-by-nature 2dsphere behavior for absent optional locations, radius bounds, 40/35/25 explainable ranking; insufficient quantity excluded explicitly; approximate areas outside participant access                                                                                    |
| Pickup logistics                         | PASS                       | Atomic claim and workflow lock; reassignment before handover; donor records handover, NGO records receipt; volunteer arrival cannot complete receipt; direct handover retained; released/completed volunteers lose precise stop access                                                                                           |
| Analytics                                | PASS                       | Role-scoped aggregation, bounded date ranges, UTC months, confirmed receipts only, quantities grouped by immutable unit; legacy receipt timestamp fallback disclosed; zero states use no fabricated data                                                                                                                         |
| Persistent notifications                 | PASS                       | Recipient-scoped retrieval/read operations; eventKey/recipient uniqueness; transactional outbox persistence; failed business transaction rolls back notifications                                                                                                                                                                |
| Real-time notifications                  | PASS                       | Cookie/Origin-authenticated sockets, server-selected user room, expiry/logout revocation, REST sync on reconnect and periodic polling; no client-selected recipient/join event; network emission outside business transactions                                                                                                   |
| Image implementation                     | PASS                       | Donor owner check before buffering; multipart CSRF check; 5 MiB JPEG/PNG/WebP with magic/signature and actual decode, 20 MP cap, EXIF stripping and WebP <=1600×1600; CAS replacement, scoped public IDs and durable cleanup; inventory unaffected                                                                               |
| Image provider account                   | NEEDS MANUAL CONFIGURATION | Live provider credentials and successful provider operations still needed for a complete Milestone 5 demonstration                                                                                                                                                                                                               |
| Accessibility/mobile/states              | PASS                       | Label/error associations, native controls/dialogs, skip links, focus styles, reduced-motion CSS, chart data tables, retry/empty/loading states; Chrome mobile analytics and pickup pages fit viewport. This is a targeted review, not full WCAG certification; screen-reader, contrast and broader browser testing remain manual |

Safety/storage/allergen details are donor declarations. Matching, pickup deadlines and photos do not certify food safety. Verification workflows and account/password recovery are not implemented; account verification is a trusted operator action.

## Prioritized release gaps

| ID / priority | Status                                                             | Gap and required resolution                                                                                                                                                                                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1 / P1       | NEEDS MANUAL CONFIGURATION                                         | Select HTTPS domains and cookie topology before building. Separate default Vercel/Render sites are cross-site and can fail authentication under third-party-cookie blocking. Use the same-site custom-domain configuration below or a fully verified same-origin proxy                                                                                                   |
| R2 / P1       | PASS implementation; NEEDS MANUAL CONFIGURATION for Render         | Explicit TRUSTED_PROXY_CIDRS replaces blanket/hop-count trust; direct/untrusted clients cannot spoof their limiter keys. Production Render web startup requires a nonempty operator-verified allowlist. All spoofing/budget tests pass. Actual Render inbound ranges/header behavior have not been verified because no service was deployed; that check remains required |
| R3 / P1       | NEEDS MANUAL CONFIGURATION                                         | Missing CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET. Configure server-side values and verify live upload, replacement, deletion and retry cleanup. Otherwise explicitly submit/demo with uploads unavailable                                                                                                                                                                |
| R4 / P1       | NEEDS MANUAL CONFIGURATION                                         | Configure an external recurring expiry command, suggested every five minutes, with the correct database/environment and failure alerts. No expiry interval is started by server/src/index.js. Deadline enforcement already prevents expired food from being advertised even before the sweep                                                                             |
| R5 / P1       | PASS implementation; NEEDS MANUAL CONFIGURATION for alert delivery | Production JSON request/error/job logs, safe metadata, request IDs, durations and job failure exit codes are implemented and tested. Worker failures no longer disappear silently. No actual alert destination or delivered failure notification has been configured/verified; production alerting is NOT operational                                                    |
| R6 / P1       | NEEDS MANUAL CONFIGURATION                                         | Configure SPA fallback, TLS, frontend security headers, correct VITE_API_URL, WebSocket routing, database network access and database backups/restore policy. Existing Vite development proxies do not configure production routing; Express currently serves API only                                                                                                   |
| R7 / P1       | NEEDS MANUAL CONFIGURATION                                         | Ensure the target database already has a securely provisioned admin and an accountable NGO/volunteer verification operator. The only supplied admin bootstrap is development-only and refuses production; no public promotion/verification endpoint exists. Do not weaken this restriction or enable development mode on a public API to provision admin                 |
| R8 / P2       | OPTIONAL                                                           | Start with one always-running API instance. Memory rate limits reset at restart; Socket.IO adapter and worker coordination are process-local. Before horizontal scaling, implement shared limits/adapter and coordinated worker delivery; current user rooms/logout disconnects do not span API processes                                                                |
| R9 / P2       | PASS implementation; NEEDS MANUAL CONFIGURATION for hosting        | /api/health/ready now checks active MongoDB, bounded ping and transaction-capable topology/session support and returns 503 on failure. Keep /api/health as liveness; configure the hosting readiness path separately. Cloudinary remains optional                                                                                                                        |
| R10 / P2      | OPTIONAL                                                           | Add measured workload limits for authenticated writes, expensive geo/analytics queries, and socket connection churn; current limits cover signup, login and upload only. Date/page/body limits help, but do not constitute system-wide abuse protection                                                                                                                  |
| R11 / P3      | OPTIONAL                                                           | Automate browser/keyboard/contrast/screen-reader checks, session-expiry UX across all pages, backup restore drills, and CI. Review aggregation explain plans and large `$in` owner-list queries as data grows; no high-volume benchmark was performed                                                                                                                    |
| R12 / P3      | OPTIONAL                                                           | Add retention/archival policies for notifications and embedded pickup events. Do not delete request/receipt records needed for unit accounting. Finish password recovery/verification administration if required by the eventual operating policy                                                                                                                        |

The original R2 finding was supported by the [Express proxy guidance](https://expressjs.com/en/guide/behind-proxies/) and [express-rate-limit proxy troubleshooting](https://express-rate-limit.mintlify.app/guides/troubleshooting-proxy-issues). Milestone 6B adds explicit CIDR trust and spoofing tests rather than assuming an ingress hop count; the operator must still verify Render ranges.

An always-running backend is required for timely in-process notification/cleanup work. [Render documents free-service idle shutdown and recommends against free instances for production](https://render.com/docs/free). Sleeping/restarting services preserve MongoDB inbox/tasks but do not execute timers while stopped; notifications catch up after reconnect and worker restart.

## Cookie and domain decision

The current browser API helper uses credentials:include and the socket client uses withCredentials, both appropriate. Production session cookies are HttpOnly, Secure, host-only, Path=/ and `__Host-` prefixed; the code deliberately omits Domain. JWT uses HS256 with explicit issuer/audience, bounded expiry and tokenVersion revocation. SameSite defaults to lax; none is allowed only with production Secure cookies.

| Topology                                                                    | Cookie outcome                                                                                                                                                                                                  | Recommendation                                                                                                                                                                    |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://project.vercel.app` → `https://service.onrender.com`               | Cross-site. Lax/Strict cookies do not support the required cross-site fetch session. None+Secure permits cross-site intent, but browser privacy policy may still reject/block cookies and socket authentication | Do not assume reliable login on these default domains                                                                                                                             |
| `https://app.foodbridge.example.org` → `https://api.foodbridge.example.org` | Different origins, same HTTPS site under one owned registrable domain. Host-only API cookie is sent only to API; Lax can work for requests initiated by the sibling app site                                    | Recommended fit for the existing separate frontend/backend architecture                                                                                                           |
| One public HTTPS origin with `/api` and `/socket.io` routed to backend      | Same-origin cookies; avoids cross-site browser restrictions                                                                                                                                                     | Strong alternative, but reverse proxy must preserve Origin, cookies and Set-Cookie, support WebSocket Upgrade, avoid API caching and keep SPA fallback away from API/socket paths |

Example domains above are placeholders; use your own domain and TLS on both hosts. For the recommended sibling-subdomain topology:

- Backend NODE_ENV=production, COOKIE_SAME_SITE=lax, CLIENT_ORIGIN=https://app.foodbridge.example.org. If CLIENT_ORIGINS is set, it overrides that fallback and must be an explicit exact HTTPS list with no trailing slash or wildcard.
- Frontend build-time VITE_API_URL=https://api.foodbridge.example.org/api. Socket.IO derives the API origin from that URL and connects directly to its `/socket.io` endpoint. Both API and socket must allow the exact app origin.
- Keep the API cookie host-only; a shared Domain attribute is unnecessary and incompatible with the current `__Host-` prefix.
- Avoid opening the app inside a cross-site iframe for assessment. Use its top-level custom-domain URL. Preview domains require separate explicit allowlisting and may reintroduce cross-site behavior.
- An HTTP-only Vercel rewrite is not proof that socket upgrades and cookie forwarding work. The repository has no production rewrite/proxy configuration; verify both protocols before selecting this alternative. Vercel documents [external rewrites](https://vercel.com/docs/routing/rewrites); Render documents [inbound WebSocket support](https://render.com/docs/websocket).

Cross-origin CORS permission and cross-site cookie permission are different browser decisions. `SameSite=None; Secure`, credentialed fetch, and explicit CORS are necessary for a default cross-site attempt, but cannot override third-party-cookie blocking. See [MDN third-party cookies](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies) and [credentialed CORS limitations](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS). Test fresh login, hard reload/restoration, logout and socket reconnect with third-party cookies blocked, including Safari/Firefox/Chrome; that hosted verification remains pending.

## Environment and secret audit

- Current server/.env exists and contains the required local database/JWT/origin/port variables. Current client/.env contains only VITE_API_URL; no NODE_ENV or backend-only key is present. Values were never printed.
- Both real `.env` files are ignored. No real environment file is tracked now or appears among environment paths in reachable Git history. Example files contain placeholders, not real credentials.
- All reachable Git blobs were checked for current non-placeholder local secret values, credentialed MongoDB URI/private-key/AWS/GitHub-token patterns; no matches found. Built client assets contain no current backend secret values. This targeted scan cannot prove the absence of every possible secret, deleted refs, previously externalized logs or remote copies.
- server/src/config/env.js loads server/.env relative to its own module; process variables take precedence. Invalid configuration errors print field names only. Local development values must not be treated as production configuration.
- `VITE_*` values are public and embedded at build time. A backend environment change does not update an already-built frontend; rebuild it after changing VITE_API_URL. Do not put any Cloudinary API credential or JWT/MongoDB secret in frontend variables. See [Vite environment handling](https://vite.dev/guide/env-and-mode).
- No production `.env` files were created. Set secrets in the provider's environment/secret settings, not Git, client code, shell history or documentation. A JWT should be newly generated for the target environment and stored once; do not rotate working credentials just to execute checks.

## API, data and operational security

CSRF protection applies to cookie-authenticated mutations: exact allowlisted Origin, custom X-CSRF-Protection:foodbridge, JSON except the tightly scoped owner image multipart endpoint. The marker is not a secret token; browsers cannot supply it through a simple cross-site form. CORS and Socket.IO allow explicit origins only. JWT roles are not trusted from token input; current database role and session version are loaded on protected calls. Public admin signup and privileged profile mass assignment are rejected.

Zod strict schemas validate workflow quantities, coordinates, query ranges and profile fields; search text is escaped as a literal regex; JSON has a 100kb default cap. The audit fixed cancellation's previously ignored extra body fields. Most errors are consistent JSON and hide unexpected server stacks/provider secrets. The generic duplicate-key error message remains email-oriented outside the transaction wrapper; refining it for future non-account models is optional.

Helmet headers were observed on the API. They **do not configure headers for a separately served Vercel frontend**. Configure/test the static host's CSP, frame restrictions, nosniff, referrer policy and HSTS. A frontend CSP must accommodate its API HTTPS/WSS, Cloudinary images, the selected map tiles and the rendering libraries; blindly copying the API's self-only CSP would break images/maps. Keep sensitive API responses uncacheable as currently implemented; never cache credentialed responses at a CDN.

MongoDB transactions use snapshot reads/majority writes and no external provider/socket side effects inside callbacks. Startup waits for model index initialization, uses a five-second server-selection timeout and disconnects on termination. Data access is guarded when disconnected. Production URI/user permissions, Atlas IP allowlist/DNS/TLS, backups and restore access must be validated for the hosting environment, not inferred from this laptop's successful connection. Do not use standalone MongoDB or a non-transactional workflow fallback. Production index build permissions and startup duration need an explicit operator decision if least-privilege users cannot create indexes; no automatic destructive syncIndexes call exists.

Images remain public assets at their secure URLs; owner-only modification is not private download authorization. Photos must not contain sensitive personal/location records. Missing provider configuration fails gracefully. 5 MiB upload and 20 MP decode limits, signature checks, metadata removal, server IDs, ownership and compare-and-set prevent the tested attacks/races. Deferred deletion can leave provider assets until cleanup recovers; no cloud/database distributed transaction is claimed.

## Background-job requirements

| Job                  | Existing mechanism                                                               | Production prerequisite                                                                                |
| -------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Notification outbox  | API interval every 2 seconds, batch <=100; durable MongoDB rows                  | Always-running single API process, failure monitoring; reconnect REST remains authoritative            |
| Image orphan cleanup | API interval every minute, batch <=25; one-hour new-upload grace and retry tasks | Cloudinary+MongoDB configuration, worker uptime and queue monitoring; manual cleanup command available |
| Donation expiry      | CLI only, idempotent per-listing transaction                                     | External schedule, suggested every 5 minutes, same environment and database; monitor exit status       |

Do not run expiry as a frontend/serverless request or rely on a student's browser remaining open. Scheduling configuration has not been created. Concurrent repeated expiry is designed to serialize safely; avoid unnecessary overlap and alert on failures. When Cloudinary is disabled, cleanup:images intentionally exits unsuccessfully; schedule that CLI only when configured. Never run maintenance scripts against the wrong database.

## Low-risk fixes made

1. client/src/pages/DashboardPage.jsx: render logout failure feedback outside the overview-only branch, so it remains visible on every dashboard subpage. Added a frontend regression test on the notification center.
2. server/src/controllers/donationController.js: require an empty strict JSON body for cancellation, consistent with its documented contract. Added a real replica-set regression proving unexpected fields return 400 without cancelling the listing, followed by a valid cancellation.

No architecture, cookie policy, secrets, public routes, deployment services or workflow state machines were redesigned. The report and README audit link are documentation additions.

## Exact deployment prerequisites and commands

These are instructions for a later deployment, not authorization or evidence that one has happened. Resolve R1–R7 first.

1. Select owned HTTPS sibling subdomains (recommended) or a verified same-origin ingress. Confirm Render ingress forwarding behavior and set TRUSTED_PROXY_CIDRS to the verified inbound proxy IPs/subnets; there is no default Render range or assumed hop count. Production Render web startup refuses an empty allowlist.
2. Use a separate intended Atlas database/least-privilege user with replica-set transactions. Configure its network access for the backend, verify backups/restore and required indexes. Provision admin and verification operations through a controlled operator procedure; the supplied bootstrap remains development-only.
3. Put this environment on the **backend only**, replacing placeholders with actual values in secret settings:

   ```dotenv
   NODE_ENV=production
   CLIENT_ORIGIN=https://app.foodbridge.example.org
   CLIENT_ORIGINS=https://app.foodbridge.example.org
   COOKIE_SAME_SITE=lax
   MONGODB_URI=<target Atlas URI>
   JWT_SECRET=<random secret of at least 32 characters>
   JWT_EXPIRES_SECONDS=86400
   TRUSTED_PROXY_CIDRS=<verified inbound proxy IPs/CIDRs>
   JSON_BODY_LIMIT=100kb
   LOGIN_RATE_LIMIT=20
   REGISTER_RATE_LIMIT=10
   CLOUDINARY_CLOUD_NAME=<actual cloud name>
   CLOUDINARY_API_KEY=<actual API key>
   CLOUDINARY_API_SECRET=<actual API secret>
   ```

   Let the host inject PORT; the application reads it and binds on the default listening interface. Do not pin localhost as the production origin. Optional matching defaults are already validated in server/.env.example. Keep ADMIN_PASSWORD absent from the running service.

4. Set **frontend build environment** VITE_API_URL=https://api.foodbridge.example.org/api. Do not put NODE_ENV=development in client environment files. Configure SPA deep-link fallback to index.html and static-host security headers. The API is not a static file server.
5. Pin Node 24 and run from the repository root:

   ```sh
   npm ci --include=dev
   npm run lint
   npm test
   npm exec prettier -- --check .
   npm run build
   npm audit
   ```

   The first integration-test run may download its MongoDB binary; tests need local process/socket permissions. Cloudinary provider calls are mocked. Run tests in CI/a test environment, not by granting production database access to test jobs.

6. For the later **frontend hosting build**, with the public VITE_API_URL already set in the provider:

   ```sh
   npm ci --include=dev
   npm run build -w client
   ```

   Use repository root as the working directory and publish **client/dist**. For Vercel, explicitly configure these build/output settings and SPA routing; do not publish the repository or use Vite's development server. No vercel.json is supplied by this audit.

7. For the later **backend hosting build/start**, with server environment configured:

   ```sh
   npm ci --include=dev
   npm run build -w server
   npm start
   ```

   Use repository root. `npm start` delegates to the server workspace's `node src/index.js`. It needs a long-running WebSocket-capable Node service; no server bundle/static directory is generated. Dev dependencies are included at build time because the monorepo build tooling lives there; runtime NODE_ENV must be production. Do not use npm run dev or npm run preview as the production server.

8. Configure the later scheduler's working directory and environment, then command:

   ```sh
   npm run expire:donations -w server
   ```

   Schedule every five minutes, monitor failures. The API already runs image cleanup; the bounded manual/recovery command, once Cloudinary is configured, is:

   ```sh
   npm run cleanup:images -w server
   ```

9. After a separately authorized deployment, check the actual HTTPS API health URL and use real browser sessions for each role. Verify login → reload → request/claim workflow → receipt analytics → notification reconnect → logout with third-party cookies blocked; verify foreign-role API denial, rejected public admin signup, expiry scheduling, actual Cloudinary replacement/deletion and log redaction. Do not call a live deployment verified until these succeed. Liveness 200 alone is insufficient; configure /api/health/ready as the dependency health path. Verify an actual alert reaches its responsible recipient before calling production alerting operational.

## Milestone 6B resolution

Proxy-aware limiter handling, structured payload-free HTTP/error logs, observable CLI/runtime jobs and dependency readiness are implemented. Read [Milestone 6B configuration and verification](milestone-6b-hardening.md) before configuring Render. Existing frontend/business workflows remain unchanged. The final suite is 261 passing tests, with no failures; all 217 prior tests still pass. No secrets, deployed services or commits were changed. Hosted Render spoofing checks, actual alert notification delivery, Cloudinary credentials/provider smoke checks and the other environment prerequisites remain manual.

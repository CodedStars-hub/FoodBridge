# FoodBridge — final pre-deployment readiness audit

Audit date: 27 October 2026. Reviewed the current working tree, `production-readiness-audit.md`, `milestone-6b-hardening.md` and redesign phases 1–5. Existing uncommitted redesign changes were preserved.

**Recommendation: NO-GO for public production release.** Application tests, local production-mode HTTPS smoke, live Cloudinary verification and current Atlas connectivity/index/transaction checks pass. The current Atlas credential is overprivileged for a production application, and target-host proxy, domains/cookies, scheduling, backup and alert-delivery gates are not verified. Passing a local smoke test does not satisfy those gates. No deployment or commit was performed.

Status meanings: **PASS** means direct evidence obtained within the scope stated; **BLOCKED** means a confirmed release blocker; **NEEDS MANUAL VERIFICATION** means required target-environment evidence was unavailable. Multiple host-dependent areas have passing application checks but remain manual release gates.

## Area-by-area result

| Area                            | Status                        | Current evidence and limits                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Cloudinary                   | **PASS**                      | All three configured credentials authenticated successfully. Real owner upload, validation/authorization denials, Chrome rendering, replacement, provider deletion, orphan cleanup and idempotent rerun passed. The successful run used three tiny assets; two from an earlier harness run were also cleaned by exact ID. This supersedes the old missing-credentials finding.   |
| 2. Express production readiness | **NEEDS MANUAL VERIFICATION** | CIDR-based proxy trust, independent proxy-aware limiters, bounded request bodies, safe errors, Helmet and logging pass tests. The actual Render ingress chain/allowlist is unverified; simulated production Render startup correctly rejects the currently empty proxy allowlist.                                                                                                |
| 3. Production authentication    | **NEEDS MANUAL VERIFICATION** | Built frontend on local HTTPS with production server mode passed Secure/HttpOnly/host-only cookies, restoration, logout, RBAC, CSRF and CORS checks. Final frontend/API origins, TLS and browser cookie/privacy behavior on the actual hosts are not verified.                                                                                                                   |
| 4. MongoDB Atlas                | **BLOCKED**                   | Current connection, all declared indexes, geospatial query, replica-set sessions and an explicitly aborted snapshot transaction passed. Read-only privilege inspection found a broad built-in role and broad write resource. Use a separate database-scoped production identity before release. Target network access and backup/restore policy also need operator verification. |
| 5. Socket.IO                    | **NEEDS MANUAL VERIFICATION** | Production-cookie WebSocket connection passed locally. Existing tests cover forbidden origins, forged/revoked sessions, recipient isolation, reconnect and durable notifications. Real hosted WSS ingress, restart/reconnect and recipient behavior still require staging verification.                                                                                          |
| 6. Scheduled maintenance        | **NEEDS MANUAL VERIFICATION** | Real isolated expiry CLI processed one listing, rerun processed zero; accepted stock was released once. Configured cleanup CLI passed; actual provider orphan cleanup/rerun passed separately. No external schedule/account execution evidence was available.                                                                                                                    |
| 7. Observability                | **NEEDS MANUAL VERIFICATION** | Structured JSON, request/job correlation, safe error classification, exit codes and readiness pass tests; 46 captured production-mode request records were sanitized. Actual log collection, failure alerts, destination receipt and missing-job detection remain unverified.                                                                                                    |
| 8. Deployment compatibility     | **NEEDS MANUAL VERIFICATION** | Correct build/output/start commands verified; Vercel SPA/build/header config added and regression-tested. Node 24.19.0 used. Actual Vercel settings, host runtime, persistent single-instance service, DNS/TLS, frontend CSP and final API build variable remain release gates.                                                                                                  |
| 9. End-to-end regression        | **PASS**                      | Built frontend donor creation → NGO request → reservation → pickup arrangement → volunteer claim/start → donor handover → arrival → NGO receipt passed against an isolated replica set in production mode. Rejection, repeat-claim conflict, expiry and unauthorized cases passed. Backend suite adds concurrency/rollback coverage.                                             |
| 10. Tests/build                 | **PASS**                      | **345 tests: 137 frontend, 208 backend.** ESLint, Prettier, diff whitespace checks and normal production build pass. Current npm advisory query reports zero known advisories; this is not a guarantee against undisclosed vulnerabilities.                                                                                                                                      |

## Confirmed blockers and reproduction evidence

### B1 — Current Atlas application credential is not least privilege

Read-only `connectionStatus` inspection returned one broad built-in role and broad write-resource privileges. The audit recorded only booleans/counts, not usernames, database names, connection strings or secrets. No roles or access-list entries were changed.

Required resolution:

1. Create or select a dedicated production database and separate application identity restricted to that database/required collections. Do not reuse the broadly privileged operator credential as the running service identity.
2. Account for current startup behavior: `connectDatabase()` waits for all five models' `init()` calls. The intended identity must have the required collection/index initialization rights, or indexes must be provisioned through an approved operational process with a compatible startup policy. No destructive `syncIndexes()` operation is introduced.
3. Restrict Atlas network access to the intended backend/scheduler egress paths. Verify permissions and the transaction/readiness checks using that target identity.
4. Confirm backup retention, restore permissions and a restore exercise into an isolated destination. Do not restore over existing user data for this audit.

This is a production-credential/configuration blocker, not a request to change business models. See [Atlas database user configuration](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/) and [Atlas backup/restore responsibilities](https://www.mongodb.com/docs/atlas/backup-restore-cluster/).

### B2 — Actual ingress proxy trust has not been established

The local server environment has no configured `TRUSTED_PROXY_CIDRS`. This is appropriate for direct development access. A safe simulated production Render web configuration with an empty allowlist is rejected by `parseEnvironment()` with the existing explicit gate. No actual Render ingress was available to inspect.

Required resolution: obtain supported inbound peer/intermediate proxy ranges and forwarding-header behavior for the intended service, then configure the exact trust boundary. Render outbound egress ranges are not an inbound trust list. Never substitute blanket trust, a guessed hop count or an end-user network. [Express requires trust settings to match the real proxy chain](https://expressjs.com/en/guide/behind-proxies/).

After separate deployment authorization, exercise a small staging login/signup rate-limit budget from two controlled clients: forged leftmost forwarding headers must not reset client A's budget, and client B must retain its own budget. Test every exposed path/hostname and remove temporary operator diagnostics. Do not weaken or bypass the existing startup gate.

### B3 — Final HTTPS origins, API URL and cookie topology are unverified

The local frontend uses a relative API path, which works with the development proxy and the local same-origin HTTPS smoke. A separate Vercel static frontend does **not** inherit Vite's development proxy. This audit's SPA fallback is not an API or WebSocket proxy. Building a standalone Vercel frontend without an explicit intended API URL would send API requests to the frontend fallback and can produce HTML/JSON session-restoration failures.

Required resolution:

- Select final owned HTTPS origins. Prefer sibling frontend/API subdomains under the same owned registrable site, or a separately verified same-origin ingress that handles both API and WebSocket traffic.
- Configure the exact backend frontend-origin allowlist and the intended cookie policy. Keep the existing host-only `__Host-` cookie; do not add a Domain attribute.
- Configure the frontend's public API build variable before building. Socket.IO derives the API origin and uses its existing `/socket.io` path.
- Default Vercel/Render service domains are cross-site. Lax/Strict cookies cannot establish the same cross-site session behavior as a same-site deployment; a cross-site cookie setting cannot override browser third-party-cookie blocking. Verify the actual topology with fresh sessions, reload, reconnect and logout in supported browsers with privacy restrictions enabled. [Cookie rules](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie) and [Render WSS requirements](https://render.com/docs/websocket) apply.

The successful local HTTPS smoke used a temporary self-signed certificate trusted only by its test browser context. It is not evidence that a public certificate or hosted cross-origin deployment is valid.

### B4 — Operational release evidence is missing

No target scheduler, alert destination, log collector, actual deployment configuration or backup policy was supplied/verified. This does not establish that none exists; it means their operation cannot be signed off by this audit. Before release, provide evidence of:

- An expiry schedule on the intended database/environment, with completed-run and missed-run monitoring.
- A persistent backend service that actually runs the existing notification/cleanup timers. Start with one API instance: in-memory rate-limit budgets and the default Socket.IO adapter are not a shared multi-instance setup.
- Confirmed health/readiness checks, log ingestion, actionable alerts and receipt by the responsible operator, including a controlled failure/recovery test.
- Target runtime, final domains/TLS, API build URL, static headers, CSP and existing account provisioning/verification responsibilities.

The existing production bootstrap command deliberately refuses production mode. Public admin signup remains forbidden. Use a separately reviewed trusted operator process for initial admin provisioning and NGO/volunteer verification; do not remove these security gates to simplify deployment. No new admin-management feature is included.

## Minimal changes made

1. **`vercel.json` added:** repository-root install/build commands, actual frontend output directory, SPA deep-link fallback, and static-host nosniff/frame/referrer/HSTS headers. This resolves a missing deployment artifact; it does not deploy a project. Static-host headers are separate from Express/Helmet. No CORS wildcard, API proxy, guessed provider/domain or CSP allowlist was added.
2. **`client/src/Deployment.test.js` added:** three regression checks covering workspace/output commands, public/protected deep-link fallback and baseline static security headers. Hosted Vercel routing still needs a later real-host check; these tests do not emulate the Vercel platform.
3. **`client/src/App.test.jsx` tightened:** logout mocks now target the logout endpoint rather than the next arbitrary fetch. The audit reproduced a race where a background inbox request could consume a one-shot simulated network failure. This was test instability, not an application logout failure. Runtime logout/security code was not changed.
4. **This report and README link added.** Historical reports are retained as dated evidence rather than silently rewritten.

No backend, business rule, schema, authentication implementation, visual design, dependency or actual environment file was changed. No new application feature was added. Current redesign working-tree changes were preserved.

The missing SPA fallback follows Vercel's documented Vite requirement: [Vite SPA deep linking](https://vercel.com/docs/frameworks/frontend/vite). Header configuration is covered by [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json).

## Live Cloudinary verification

Unlike the historical audit, current configured provider credentials were available and valid. The audit used the existing signed/authenticated server SDK flow, not unsigned browser uploads or a new preset.

- Authenticated provider ping passed.
- Another donor and an NGO were denied image changes. Missing CSRF marker was denied. MIME/signature mismatch was rejected before upload.
- A tiny generated test PNG uploaded through the real owner API, was re-encoded to WebP, returned a server-generated managed public ID and HTTPS delivery URL, and decoded in the actual `DonationPhoto` component in Chrome.
- A replacement uploaded successfully; querying the exact previous asset returned provider not-found, confirming deletion.
- The owner detach/delete endpoint succeeded and donation inventory remained unchanged.
- A third exact audit asset was intentionally left unreferenced in the **local isolated database's** cleanup queue. Actual provider cleanup removed it; rerun removed zero with no failures.
- The successful run cleaned its three exact recorded fixture IDs and received successful/not-found results. An earlier harness attempt created two assets and also completed exact-ID cleanup, so all five audit assets across both attempts were removed. No folder/prefix bulk delete or real donation/asset deletion was performed.

The first harness attempt misinterpreted the provider's nested not-found response; the harness was corrected, rerun and completed successfully. No provider exception was relabeled as a successful application check without evidence.

Reviewed controls remain intact: donor ownership before multipart parsing, authenticated role checks, scoped multipart CSRF exception, one-file/no-extra-field parser, 5 MiB encoded limit, JPEG/PNG/WebP signatures, 20 MP decode ceiling, metadata-stripping WebP conversion, upload timeout, server IDs, revision compare-and-set, existing-image preservation on failure, active-reference checks and durable retry tasks. Upload credentials remain server-only. Delivery images are public assets at their secure URLs; signed upload authentication is not private image-delivery authorization.

Safe sanitized summary: `/tmp/fb-final-cloud-result.json`. The exact-ID cleanup manifest remains temporary and contains no credential values. Temporary local database instances were stopped and environment fingerprints were unchanged.

## Atlas verification and environment handling

Read-only checks disabled automatic collection/index creation for the existing Atlas connection. Results:

| Check                                                | Result                                              |
| ---------------------------------------------------- | --------------------------------------------------- |
| Current configured Atlas connection                  | PASS                                                |
| Replica set/mongos and logical sessions              | PASS                                                |
| Snapshot transaction read followed by explicit abort | PASS                                                |
| Geospatial query/index compatibility                 | PASS                                                |
| User declared indexes                                | PASS — 4 actual indexes including `_id`             |
| Donation declared indexes                            | PASS — 8 actual indexes                             |
| DonationRequest declared indexes                     | PASS — 11 actual indexes                            |
| Notification declared indexes                        | PASS — 5 actual indexes                             |
| ImageCleanupTask declared indexes                    | PASS — 3 actual indexes                             |
| Current credential production scope                  | BLOCKED — broader role/resource scope than required |

No existing Atlas document or index was created, edited or deleted. Transaction write/idempotency tests used isolated local replica sets.

Environment values were read only for authorized checks and never printed. Both actual `.env` files remain ignored/untracked and byte-for-byte unchanged. The current backend still uses a development configuration; do not copy it verbatim into a production service. The frontend build was scanned for current database/JWT/provider credentials: no matches. A targeted scan of 238 reachable Git blobs found no current server credential values. This is not proof that every possible historical or externalized secret is absent.

## Express, authentication, Socket.IO and health

Existing production hardening is present and working; the old pre-hardening findings are not reopened as missing code:

- Explicit CIDR proxy policy; resolved-IP authentication limiter keys; independent login/signup budgets; canonical IPv6 grouping; spoofed-header/direct/untrusted/multi-proxy tests.
- Strict validation, JSON request limit, bounded image parser, safe unexpected errors, no-store sensitive endpoints, request IDs, Helmet and disabled framework disclosure header.
- HS256 JWT with issuer/audience/expiry and database-backed session version; current role loaded server-side; public admin signup and privileged profile fields rejected.
- Production host-prefixed Secure/HttpOnly cookie with root path and no shared Domain. Origin/custom-header/content-type CSRF checks remain independent of CORS.
- Authenticated Socket.IO handshake with exact Origin allowlist, current session verification, recipient-only rooms, logout revocation and no client-controlled room selection. Reconnect reloads MongoDB notifications; socket failure does not roll back committed inventory.
- Logs allowlist event names, route templates, safe error types/codes, request/job IDs and bounded counts. They omit raw body/header/query/cookie/token/provider/database/user fields. Log-sink exceptions cannot change committed business state.

Practical endpoints:

- `/api/health`: process liveness; no dependency queries; uncached.
- `/api/health/ready`: active MongoDB connection, bounded ping/hello and transaction-capable topology/session checks; uncached 200 or 503 without topology/secret details.

Select **`/api/health/ready`** as the host traffic/readiness path; liveness alone is insufficient. It does not verify provider credentials, every database permission, backups, alerts or hosted browser cookies. [Render HTTP health checks](https://render.com/docs/health-checks) support a configured application readiness path.

## Safe scheduled maintenance

These are instructions for later operator configuration, not schedules installed by this audit. Use the intended production database identity and secret settings. Do not copy a command into a scheduler until its database/environment has been independently confirmed. Do not pass credentials as command-line arguments or print a complete environment.

Run from the repository root after dependencies are installed:

```sh
npm run --silent expire:donations -w server
npm run --silent cleanup:images -w server
```

| Job                 | Mechanism and safe scheduling                                                                                                                                                                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Donation expiry     | External schedule required. Suggested cron expression `*/5 * * * *`, UTC. Per-listing transactions are idempotent. Already handed-over food is not released; NGO receipt remains required.                                                                                                                |
| Image cleanup       | API already runs one bounded tick per minute when configured, processing at most 25 eligible tasks. New uploads have the existing grace period and failures retry. A separate CLI schedule is optional recovery/batch capacity; enable only with valid provider configuration and avoid needless overlap. |
| Notification outbox | Existing API interval every two seconds, bounded batch, durable MongoDB state. Requires persistent process uptime; it is not a browser task.                                                                                                                                                              |

Keep the backend and timers on a persistent service; do not implement expiry as a public HTTP endpoint, frontend timer or short-lived static/serverless invocation. With a platform cron service, set the working directory, build/runtime and secret environment explicitly. Render schedules use UTC and provide a single-active-run guarantee, but a manual trigger cancels an active run; do not manually trigger over a healthy active sweep. [Render cron semantics](https://render.com/docs/cronjobs).

Do not inherit a web-service proxy flag configuration blindly into cron: the existing Render production gate distinguishes web services from cron/worker services. Keep provider-injected service-type variables accurate. Do not override them to bypass the web proxy gate.

Preserve CLI exit status. Exit 0 means successful work/disconnect; exit 1 or abnormal termination means failure. Do not append `|| true` or use a pipeline that hides failures. Set a bounded timeout/retry policy suitable for actual data volume and avoid overlapping work. Monitor nonzero exits, `job_failed`, `job_item_failed`, absent completion/heartbeat, repeated readiness 503 and process downtime. A successful process start is not a successful sweep.

Audit evidence: the actual expiry CLI in production mode against a temporary replica set returned one changed listing, then zero on rerun; reserved quantity was released once and the accepted request expired. The configured cleanup CLI returned a successful no-task batch. Separate live provider cleanup removed one exact orphan then zero on rerun. Failure/partial-batch/disconnect/exit-code behavior remains covered by backend tests. No maintenance command was run against the existing Atlas database.

## Deployment commands and environment-variable names

No real values are included here. Configure secrets in the host's secret settings, not source, public variables, shell history or command arguments.

### Shared runtime and repository checks

Use **Node 24 LTS** for the intended services, matching the tested major; this audit ran Node 24.19.0. The repository engine range also allows other versions, so explicitly select the intended major at each host. Render can select a runtime using its `NODE_VERSION` setting; confirm the effective version rather than assuming a provider default. [Render runtime selection](https://render.com/docs/node-version).

Repository-root release/CI commands:

```sh
npm ci --include=dev
npm run test
npm run lint
npx prettier --check .
npm run build
npm audit
```

Tests require permission to start local processes/sockets and a test MongoDB binary. They do not require production database access. Keep CI test credentials separate from runtime secrets. `npm ci` above is the reproducible installation instruction; the audit checked the existing locked installation and did not replace working credentials or reinstall dependencies unnecessarily.

### Vercel frontend

Use repository root as Project Root Directory. The checked-in `vercel.json` supplies:

```sh
npm ci --include=dev
npm run build -w client
```

Output: **`client/dist`**. Serve that static directory. SPA fallback is `/index.html`; it does not proxy `/api` or WebSockets. Do not publish the repository/server or run Vite dev/preview as the production service. Confirm actual deep links and static assets on the hosted project before release.

| Frontend variable name | Purpose                                                                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL`         | Public intended API base URL, including the API path. Must be configured at build time for separately hosted API; relative addressing requires an independently verified same-origin ingress. |
| `VITE_OSM_TILES_URL`   | Optional public tile endpoint. Preserve explicit user map opening, attribution and provider policy.                                                                                           |

No database, JWT or Cloudinary API secret belongs in a `VITE_*` variable. Rebuild after API-base changes. Configure and verify the final static-host CSP once API HTTPS/WSS, image and optional tile origins are known; it must accommodate Recharts/Leaflet inline styling without accidentally blocking authorized resources. Baseline static headers are in `vercel.json`; API Helmet headers do not secure a separately served frontend. No guessed allowlist was shipped.

### Persistent Node backend, such as Render

Use repository root for install/build/start:

```sh
npm ci --include=dev
npm run build -w server
npm --silent start
```

The backend build syntax-checks its entry points; it does not produce a static output directory. The start script delegates to the server workspace's `node src/index.js`. The existing listener accepts the host-provided port on the default listening interface; do not bind the production service only to localhost. Render requires a publicly reachable listening interface and supports inbound WebSockets. Use WSS and a persistent single-instance service initially. [Render web-service requirements](https://render.com/docs/web-services), [Render WebSockets](https://render.com/docs/websocket).

| Backend variable name                                                                                | Purpose                                                                                              |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                                           | Production runtime mode for cookie, origin and JSON-log behavior                                     |
| `PORT`                                                                                               | Host-provided listening port                                                                         |
| `MONGODB_URI`                                                                                        | Intended Atlas database using the separately scoped application identity                             |
| `JWT_SECRET`                                                                                         | Fresh target-environment signing secret satisfying existing validation                               |
| `JWT_EXPIRES_SECONDS`                                                                                | Existing bounded session lifetime                                                                    |
| `CLIENT_ORIGIN`                                                                                      | Exact frontend origin fallback                                                                       |
| `CLIENT_ORIGINS`                                                                                     | Optional exact allowlist; overrides the fallback when configured                                     |
| `COOKIE_SAME_SITE`                                                                                   | Policy matching the verified domain topology                                                         |
| `TRUSTED_PROXY_CIDRS`                                                                                | Verified inbound proxy trust boundary                                                                |
| `JSON_BODY_LIMIT`                                                                                    | Existing bounded JSON body setting                                                                   |
| `LOGIN_RATE_LIMIT`, `REGISTER_RATE_LIMIT`                                                            | Existing separate authentication budgets                                                             |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`                               | Provider credentials on backend/cleanup worker only                                                  |
| `GEO_DEFAULT_RADIUS_KM`, `GEO_MAX_RADIUS_KM`                                                         | Optional validated discovery limits                                                                  |
| `MATCH_DISTANCE_WEIGHT`, `MATCH_QUANTITY_WEIGHT`, `MATCH_TIME_WEIGHT`, `MATCH_PICKUP_WINDOW_MINUTES` | Optional existing matching settings; do not change business weights as part of deployment            |
| `RENDER`, `RENDER_SERVICE_TYPE`                                                                      | Provider-injected service identity, consumed by the existing startup gate; do not spoof to bypass it |
| `NODE_VERSION`                                                                                       | Render runtime selection where used; verify frontend host runtime separately                         |

Keep bootstrap-only `ADMIN_NAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` absent from the running production service. Do not run the development bootstrap in production or enable public admin signup.

## Regression and production smoke results

- **345 passing tests: 137 frontend and 208 backend.** Three added configuration regression cases supplement the prior 342 tests. Existing logout assertions now target the actual endpoint, removing the reproduced fetch-order race without changing application behavior.
- ESLint, formatting, `git diff --check` and production build pass. Frontend output is `client/dist`; backend start/build scripts match the commands above.
- npm advisory result at audit time: **0 info, low, moderate, high or critical advisories**. Initial sandbox DNS restrictions required an approved registry query; no package changes were made.
- Local HTTPS smoke served the built frontend with production-mode API/session configuration and an isolated replica set. Chrome restored secure sessions, created a donor listing through the UI, and completed request/reservation/claim/start/handover/arrival/receipt. Inventory was checked directly after NGO receipt.
- Missing CSRF marker, foreign Origin, foreign-role admin access, volunteer receipt impersonation, duplicate claim, rejected request and expired request cases were denied or resolved as expected. Real expiry CLI idempotency was verified as described above.
- Production host-prefixed cookies were Secure, HttpOnly, root-path and host-only; logout removed the cookie. The authenticated production-cookie WebSocket reached Live status. Existing tests separately cover expired/revoked sessions, room isolation, reconnect/durable read state, conflict concurrency, rollback and picked-up-food expiry behavior.
- Readiness returned 200; liveness had no-store/security headers. Captured production request logs were JSON and contained no audit password, signing secret, account email, URI or raw request payload. Built-frontend browser execution reported no console/application errors.
- Local self-signed HTTPS and direct local proxy simulations are not evidence of hosted browser privacy behavior, actual Render forwarding, deployed static CSP, real alert receipt, backup restorability or production egress access.

All write tests used temporary local databases. The existing Atlas database was inspected read-only. Cloudinary writes were limited to five tiny audit assets across both attempts (three in the successful run, two in the earlier harness attempt), and all exact IDs were cleaned. No real user data, credentials, environment files, schemas or business rules were changed.

## Required release sign-off

Remain **NO-GO** until the operator supplies evidence for B1–B4 and associated host checks:

1. Database-scoped production identity, target network access and verified indexes/transaction permissions.
2. Real inbound proxy trust boundary and hosted spoof/rate-limit checks.
3. Owned HTTPS origins, frontend API build URL, exact CORS/CSRF origins and fresh-session/reload/logout/WSS behavior under browser privacy restrictions.
4. Verified static routing/headers/CSP, intended Node runtime and persistent single-instance service/readiness configuration.
5. Expiry scheduling, worker uptime, sanitized log ingestion, a responsible alert recipient and a controlled alert/recovery delivery check.
6. Backup/restore evidence and a controlled admin/account-verification operational process.

Application hardening and local regression are **GO for a separately authorized staging deployment once its scoped environment is prepared**, not unconditional production approval. This audit has stopped before deployment and has not committed any changes.

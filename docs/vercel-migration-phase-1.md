# Vercel migration — Phase 1

**Deployment plan superseded:** the active college-demo target is a persistent Render backend and static Vercel frontend. See [Render college demo](render-college-demo.md). The Vercel backend entry point and routing described below have been removed; this document records historical migration work.

Status: runtime foundation implemented; **not ready for a complete Vercel-only deployment**. No deployment or commit was performed. No schemas, donation/request/reservation/assignment rules, frontend designs, Cloudinary integration, or authentication contracts were changed.

## Runtime architecture

- `server/src/app.js` remains the host-independent Express application factory, including existing middleware and API routes.
- New `server/src/runtime.js` initializes the database, creates the HTTP server, attaches the existing authenticated Socket.IO service, and retains notification dispatch and image-cleanup timers. It returns `app`, `server`, and an explicit cleanup method. It does not listen, install process signal handlers, or exit the process.
- `server/src/index.js` remains the persistent local/Node entry point. It calls the shared runtime, listens on the existing validated `PORT`, and handles SIGINT/SIGTERM, cleanup, and database shutdown.
- New `api/index.js` awaits runtime initialization and exports the Node HTTP server for Vercel Functions, preserving upgrade listeners. It does not start a listener or disconnect the database after a response. Initialization failure fails the Function module rather than accepting application traffic before the database is ready.
- Maintenance CLI entry points are unchanged. Timers remain in the shared runtime for compatibility; they are not a reliable hosted scheduler in Functions.

Official runtime reference: [Vercel WebSockets](https://vercel.com/docs/functions/websockets), including Node HTTP server exports. Runtime support does not establish correct multi-instance application behavior.

## MongoDB reuse

`connectDatabase()` caches one initialization promise per module instance, including all existing model initialization. Concurrent initialization callers share the same work and warm calls reuse the pool. Failed initialization disconnects and clears the cache so a later call can retry. An attempt to switch the URI while an instance owns a pool is rejected with a generic message. Explicit CLI/local shutdown clears the cache.

Pool settings: `maxPoolSize=5`, `minPoolSize=0`, `maxIdleTimeMS=60000`, `waitQueueTimeoutMS=5000`, and the existing `serverSelectionTimeoutMS=5000`. These bound each instance, not the total number of Function instances. Atlas capacity, network access, and a database-scoped demo identity still require operator configuration. No credentials are recorded here.

## Client IP and security boundary

New environment names:

- `CLIENT_IP_SOURCE`: `express` by default; select `vercel` only for a Vercel-hosted backend.
- `VERCEL`: platform-provided `1`; do not spoof this setting on another host.

Vercel mode requires `NODE_ENV=production`, `VERCEL=1`, no Render flag, and an empty `TRUSTED_PROXY_CIDRS`. It keeps Express `trust proxy` **false**. Only a single syntactically valid IP from `x-vercel-forwarded-for` is accepted for authentication rate-limit identity; generic XFF, `Forwarded`, `X-Real-IP`, and request-supplied platform markers do not select the mode. Missing, malformed, or multiple IP values share one restrictive limiter bucket. IPv6 /56 grouping and independent login/registration budgets remain intact. Local/Render mode continues using the existing Express/CIDR policy and ignores the Vercel header.

Trust depends on [Vercel's platform-owned request-header behavior](https://vercel.com/docs/headers/request-headers), not on a header authenticating itself. Do not enable this mode on an origin reachable outside Vercel's ingress. The tests simulate the platform-provided value; they cannot prove edge sanitization. Hosted spoofing checks are still required.

JWT verification, current-user/token-version checks, role permissions, exact Origin allowlists, mutation CSRF marker/content-type checks, and production Secure/HttpOnly/host-only cookies are unchanged. No unrestricted proxy trust was added. Existing **in-memory** rate-limit storage is retained, not replaced with a weaker or disabled limiter; shared storage remains a deployment blocker.

## Vercel configuration

Use repository root, Node 24, existing install command `npm ci --include=dev`, build command `npm run build -w client`, and output `client/dist`.

`vercel.json` routes `/api/:path*` and `/socket.io/:path*` to `/api/index` before a frontend-only SPA fallback. The fallback explicitly excludes API and Socket.IO paths so unknown API paths stay JSON 404s rather than HTML. Existing static security headers remain. The Function maximum duration is configured to 300 seconds, not an unlimited connection lifetime.

Same-origin environment configuration:

```text
VITE_API_URL=/api
NODE_ENV=production
CLIENT_IP_SOURCE=vercel
COOKIE_SAME_SITE=lax
CLIENT_ORIGIN=<exact HTTPS application origin, without trailing slash>
TRUSTED_PROXY_CIDRS=
MONGODB_URI=<dedicated demo database connection URI>
JWT_SECRET=<independently generated secret>
```

Vercel supplies `VERCEL=1`; do not add Render flags. Leave `CLIENT_ORIGINS` unset for the single-origin fallback, or explicitly supply only approved HTTPS frontend origins. Existing JWT lifetime, request size, and rate-limit settings retain their defaults unless deliberately configured. Cloudinary environment names and image handling are unchanged. All backend secrets remain server-only; `VITE_*` values are public.

## Local compatibility and regression verification

Local commands remain `npm run dev`, `npm run dev:server`, and `npm start`. Vite still proxies `/api` and `/socket.io` to port 5001. Keep `CLIENT_IP_SOURCE=express` and the existing local origin settings. No real `.env` files were changed.

New tests cover:

- Real local subprocess startup on an isolated port, HTTP liveness, Engine.IO handshake, and successful SIGTERM shutdown, without any external database or image service.
- Shared runtime and Function export without an initial listener or added process shutdown handlers; Socket.IO upgrade listener remains attached.
- API JSON responses, query paths, unknown-route JSON errors, and Vercel route precedence/SPA exclusions.
- Production cookie attributes, valid session restoration, missing/invalid/revoked sessions, unauthorized roles, mutation CSRF and Origin rejection, and logout.
- Platform-mode configuration guards, ignored forged forwarding prefixes, separate client budgets, malformed-header fallback, IPv6 grouping, and local refusal to trust Vercel headers.
- Concurrent/warm database initialization, bounded pools, failed-connection/model-init retry, URI switching rejection, and explicit shutdown/reinitialization.

Initial sandbox execution blocked localhost listeners with `EPERM`; approved execution outside that restriction passed the targeted tests. Tests use isolated fixtures and mocks; no real user data was created, changed, or deleted.

### Results

- Node: `v24.19.0`.
- Backend: **225/225 passed** in the full `npm test` execution, including **17 new migration tests**.
- Frontend: **137/137 passed** on the standalone `npm run test -w client` rerun. During the first `npm test` run, while a production build was running concurrently, the existing asynchronous NGO pickup-link assertion in `Logistics.test.jsx` failed; 136 others passed. No frontend implementation or logistics-test changes were made, and the unchanged full frontend suite then passed. This timing sensitivity is recorded rather than hidden.
- Final workspace totals: **362 passing tests** (137 frontend + 225 backend).
- `npm run lint`: passed, zero warnings.
- `npx prettier --check .`: passed.
- `npm run build`: passed; Vite produced `client/dist`, and backend syntax checks passed.
- `node --check api/index.js`, `node --check server/src/runtime.js`, and `git diff --check`: passed.
- No hosted browser, Vercel builder, external Atlas, or Cloudinary verification was performed in this phase. The route tests verify repository routing configuration and the real Node handler separately; they are not a claim that Vercel's hosted rewrite/upgrade integration has been exercised.

## Exact files changed

Created:

- `api/index.js`
- `server/src/runtime.js`
- `server/test/database.test.js`
- `server/test/localRuntime.test.js`
- `server/test/vercel.test.js`
- `docs/vercel-migration-phase-1.md`

Modified:

- `server/src/index.js`
- `server/src/config/database.js`
- `server/src/config/env.js`
- `server/src/config/proxy.js`
- `server/src/routes/authRoutes.js`
- `server/.env.example`
- `client/.env.example`
- `client/src/Deployment.test.js`
- `vercel.json`

## Remaining blockers — future phases only

1. Shared atomic authentication and upload limiter storage across Function instances/cold starts; existing memory counters cannot provide deployment-wide budgets.
2. Socket.IO cross-instance room/pub-sub coordination and notification outbox delivery. Process-local dispatch must not mark a notification broadcast while a recipient is connected to another instance. Reconnection after Function duration expiry needs hosted verification.
3. The existing 5 MiB upload contract exceeds Vercel's 4.5 MB request limit. Cloudinary uploads were deliberately not changed in this phase.
4. Notification polling and image cleanup still use existing intervals. Functions do not provide an unattended persistent worker; Hobby Cron cannot reproduce the current cadence. Scheduled maintenance authentication, overlap handling, and bounded execution remain future work. Existing expiry CLI logic remains available.
5. Configure Atlas network access, restricted credentials, capacity, and deployment environment. Do not assume Hobby offers stable outbound IPs.
6. Hosted Vercel verification of original API paths/query preservation through rewrites, SPA/static assets, authenticated Socket.IO upgrades, exact origin behavior, edge header overwrite/spoof resistance, secure cookies, and rate limiting remains pending. No Vercel CLI deployment or browser verification against a hosted Function was performed.

Stop after Phase 1. This foundation is not approval to deploy the entire application as a working Vercel-only demo.

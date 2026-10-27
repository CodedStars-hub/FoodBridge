# Vercel migration — Phase 2

**Deployment plan superseded:** the active college-demo target is a persistent Render backend and static Vercel frontend. See [Render college demo](render-college-demo.md). The Vercel backend entry point and routing described below have been removed; this document records historical migration work.

## Status and scope

**Implementation and local verification complete; live provider/host verification BLOCKED pending manual configuration.** This is not full Vercel deployment readiness. No provider account was created, paid service enabled, infrastructure changed, deployment performed, or commit made. Phase 3 was not started.

Read the Phase 1 migration, final readiness audit, and donor access investigation before implementation. Existing uncommitted Phase 1 and donor guidance changes were preserved. No schemas, donation/request/reservation/assignment workflows, JWT, CSRF, cookie, CORS, RBAC, frontend design, image transport/validation, or scheduled maintenance implementation changed.

## Architecture: shared throttling

Production uses `RedisRateLimitStore`, an Express rate-limit Store implemented with Node's native `fetch` and the Upstash Redis HTTPS REST protocol. No npm dependency was added. A managed Redis-compatible store is an external operational dependency, not an assumption that credentials exist.

Every increment sends one parameterized `EVAL` containing `INCR`, `PTTL`, and conditional `PEXPIRE`. The increment and initial fixed-window expiry execute atomically on Redis. There is no client-side read/modify/write race, separate non-atomic increment/expiry pipeline, local cache of allowed requests, or automatic retry of an ambiguous write. Blocked requests continue to count, and later attempts do not extend the normal window.

References: [Upstash REST API](https://upstash.com/docs/redis/features/restapi), [Upstash EVAL](https://upstash.com/docs/redis/sdks/ts/commands/scripts/eval), and [Redis script atomicity](https://redis.io/docs/latest/develop/interact/programmability/eval-intro/).

Budgets remain:

- Login: `LOGIN_RATE_LIMIT`, default **20 per normalized client per 15 minutes**.
- Registration: `REGISTER_RATE_LIMIT`, default **10 per normalized client per 15 minutes**.
- Existing image-upload throttle: **30 per authenticated owner per 15 minutes**. Only its counter storage changed; no upload migration was performed.

Scope-specific prefixes keep these budgets independent. Client identity still comes from Phase 1's gated Vercel header handling or the existing local/verified-CIDR Express policy. IPv6 /56 normalization, malformed-header restrictive bucketing, and spoofed forwarding-header rejection are unchanged. Provider keys contain an HMAC digest rather than raw IP addresses or account IDs; the existing shared JWT secret supplies the HMAC key with a separate message prefix. All instances must share that secret and namespace. Secret rotation changes counters as well as invalidating sessions; changing a namespace resets the corresponding budget, so never generate it per instance or deploy URL.

### Outage and local behavior

- **Production never falls back to memory.** Missing credentials, connection/HTTP/authentication/quota errors, a three-second transport timeout, redirects, and malformed results fail limited operations with a generic **503**. No login/registration controller runs after store failure. Provider bodies, tokens, and URLs are not exposed in the error.
- Partial credentials and unsafe URL/namespace configuration are rejected during environment validation. Both credentials absent permits startup, but limited production operations return 503. This preserves health and session-read diagnostics without silently permitting attempts.
- `/api/health` and session reads do not require a limiter operation. Existing readiness primarily verifies MongoDB; it does **not** establish Redis readiness. Verify a limited operation before demo approval.
- Local development/test defaults retain process-local memory counters. Configuring the REST credentials locally explicitly opts into shared counters.
- Authentication, CSRF, Origin, ownership and role checks retain their existing order and behavior. The Express `passOnStoreError` option is explicitly false.

## External setup and environment names

Manually create or select an Upstash Redis database using a free account/plan where available. Nothing provisions it automatically. Use the authoritative write-capable endpoint/token; a read-only token cannot execute the increment script. Keep credentials server-only, and use the smallest supported command/key permissions for the limiter namespace. Disable key eviction for limiter storage so pressure produces failures rather than removing live budgets. Confirm provider durability/consistency and expiry behavior; do not treat a read replica/cache as the authority for quota decisions.

| Name                       | Purpose                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `UPSTASH_REDIS_REST_URL`   | HTTPS REST origin, without credentials/query/fragment or a command path                          |
| `UPSTASH_REDIS_REST_TOKEN` | Server-only REST token authorized for the required limiter operations                            |
| `RATE_LIMIT_NAMESPACE`     | Stable environment namespace; default `foodbridge`; 1–64 letters, digits, underscores or hyphens |
| `LOGIN_RATE_LIMIT`         | Existing login budget, unchanged                                                                 |
| `REGISTER_RATE_LIMIT`      | Existing registration budget, unchanged                                                          |

Use distinct namespaces for preview and demo production, consistently across all instances of each environment. Do not place any Redis credential in `VITE_*`. Retain the Phase 1 same-origin settings: `VITE_API_URL=/api`, production HTTPS cookies with `COOKIE_SAME_SITE=lax`, exact `CLIENT_ORIGIN`, `CLIENT_IP_SOURCE=vercel`, platform-provided `VERCEL=1`, and empty `TRUSTED_PROXY_CIDRS`.

No usable Redis REST credentials were present during this task. Live provider authentication, Lua execution, expiry and quota behavior remain **NEEDS MANUAL VERIFICATION**. Credentials were neither invented nor printed.

## Architecture: cross-instance notification reconciliation

MongoDB remains the authoritative notification inbox. Existing transactional persistence and the unique `(recipient, eventKey)` index continue to prevent duplicate notification records. Existing list, read-one and read-all endpoints and response shapes are unchanged.

Previously, any instance could select `broadcastAt: null`, emit only into its own local rooms, and globally mark the rows broadcast. An instance with no recipient connection could therefore consume another instance's delivery work.

Now each Socket.IO instance:

1. Enumerates only its own server-authenticated socket recipients. Client-selected rooms/recipients remain unsupported.
2. Revalidates current users, token versions and expiry before emitting. Remote-instance logout therefore revokes the socket on reconciliation, while subsequent HTTP reads reject the revoked cookie immediately.
3. Reads authoritative inbox summaries for those recipients: item count, unread count, newest ID and latest update timestamp. Queries are batched by at most 100 recipients and bounded by a three-second query execution limit.
4. Compares each summary against an instance-local fingerprint, then emits the existing empty `notifications:changed` invalidation to that local authenticated user room when changed. No message, address, event body or other user's inbox is transmitted.
5. Keeps a failed recipient's previous fingerprint so the next active tick retries. Overlapping timer flushes share one in-flight operation. With no connected recipients, no inbox query is performed.

The existing two-second interval now drives this recipient reconciliation rather than global consumption. It is useful only while the Function is executing; it is not an unattended worker. The `flush()` runtime method also permits deterministic multi-instance tests and shares that same overlap guard.

**`broadcastAt` is retained in the unchanged schema and existing rows, but no longer gates or acknowledges delivery.** It is not updated by reconciliation. Do not use `broadcastAt: null` counts as a stuck-dispatch alert after this phase. Job `sent` counts invalidated recipient inboxes, not acknowledged notification events. There is no data migration or deletion.

### Reconnect, read state and duplicates

On connection, the server still joins only the authenticated user room and emits `notifications:sync`. The existing frontend re-fetches its persistent inbox on connect/sync/change and every 30 seconds. Reconnecting on a different instance or after an instance terminates therefore reconciles persisted records without requiring the old instance's in-memory state.

Read-one/read-all mutations remain MongoDB writes. Other instances detect changed unread counts/timestamps and invalidate their own recipient connections. Existing direct local hints remain a latency optimization; correctness does not depend on them reaching another instance.

Socket events are invalidations, not notification-item appends. Repeated hints re-fetch the same ID-keyed list; they do not create duplicate user-visible notifications. A client disconnected during a mutation retains the durable inbox and read state for its next successful fetch.

## Coordination alternatives evaluated

- **Socket.IO Redis Pub/Sub adapter:** requires actual publisher/subscriber clients, not this request/response REST store. Pub/Sub packets are not a durable inbox and the adapter does not provide connection-state recovery. A lost subscription or terminated Function still needs authoritative reconciliation. It was not installed or claimed to work on the target runtime. [Official Redis adapter](https://socket.io/docs/v4/redis-adapter/).
- **Redis Streams adapter:** supports stream resumption and connection-state recovery, but introduces a native Redis client, continuous stream consumption, additional storage/connection quotas, and explicit lifecycle/reconnect verification on Vercel. It was not assumed compatible merely because Redis can be reached over HTTPS. [Official Streams adapter](https://socket.io/docs/v4/redis-streams-adapter/).
- **Selected approach:** MongoDB-backed recipient reconciliation. It uses the already required durable data source, avoids another pub/sub provider or TCP subscription, and preserves the existing Socket.IO auth and inbox protocol. It trades immediate cross-instance fan-out for eventual authoritative reconciliation. This is appropriate for a small demo, not a high-volume notification transport.

Vercel documents that connections can land on different instances and close at Function maximum duration. [Vercel WebSockets](https://vercel.com/docs/functions/websockets). Its current documented WebSocket support is available on all plans; actual project runtime availability must still be checked.

## Guarantees and limits on Hobby

- Committed notification records survive producer/recipient instance termination as long as the configured MongoDB service retains them. Reconnect or a successful authenticated HTTP refresh retrieves them, regardless of global broadcast markers.
- Cross-instance unread state is eventually reconciled. Under normal active processing, the server checks at the existing two-second cadence; the client also retains its 30-second HTTP fallback.
- Neither cadence is a delivery SLA. Sleeping/offline tabs, network/Atlas outages, server suspension, quota exhaustion and Function termination can delay reconciliation. There is no exactly-once WebSocket delivery, client delivery acknowledgement, instant global revocation, or guaranteed background execution. Read state is not a transport acknowledgement.
- At the current Hobby maximum duration, a WebSocket may close after 300 seconds. Existing reconnection/sync must be exercised on the actual host across that boundary. Nothing in this phase makes a Function persistent indefinitely.
- A lost hint does not lose the notification record. Recovery depends on a later successful inbox fetch; it is not a promise that every transient packet is replayed.
- Large inbox histories and many simultaneous recipients increase Atlas query cost. Recipient batching and query deadlines bound work but do not establish production-scale capacity.

## Free-tier feasibility

No new npm package or paid infrastructure was enabled. The consulted [Upstash pricing page](https://upstash.com/pricing/redis) lists a free tier with **500K monthly commands, 10 GB bandwidth and 250 MB data**, and one free database per account. Confirm current dashboard eligibility/limits before provisioning. Do not enable automatic paid upgrades for the college demo without an explicit decision.

One REST script request is issued per limited attempt; blocked traffic also consumes provider quota. Monitor the provider's actual command accounting rather than equating HTTP calls to all billable operations. Quota exhaustion causes 503 on limited operations, not a security bypass. No Redis quota is spent on the notification reconciliation loop; that load is on Atlas.

The free-tier architecture is plausible for a restricted, low-traffic demo, subject to actual accounts, quotas, Atlas network access/capacity, and hosted runtime verification. Upload and scheduled-maintenance blockers remain, so this is not approval to launch the full application.

## Files changed in Phase 2

Created:

- `server/src/stores/redisRateLimitStore.js`
- `server/test/sharedRateLimit.test.js`
- `server/test/helpers/redisRestFixture.js`
- `docs/vercel-migration-phase-2.md`

Modified:

- `server/src/config/env.js`
- `server/src/routes/authRoutes.js`
- `server/src/routes/imageRoutes.js` — limiter store only
- `server/src/services/realtimeService.js`
- `server/.env.example` — names/comments only, no credentials
- `server/test/auth.test.js` — production-cookie test now supplies the shared-store fixture
- `server/test/vercel.test.js` — production tests now supply the shared-store fixture
- `server/test/donations.test.js` — notification reconciliation and cross-instance tests; previous donor-access tests preserved
- `client/src/Milestone5.test.jsx` — duplicate hints/reconnect/read-state regression; no frontend implementation/design changes

## Verification

- **142 frontend tests passed.**
- **249 backend tests passed.** Total: **391 passing tests**, including 23 added Phase 2 cases.
- Production-cookie and Phase 1 production fixtures were updated to model the required shared store rather than bypass it. No production-only rate-limit exception was introduced for tests.
- Concurrent limiter tests use two app instances and a fresh third instance against one test-only atomic REST boundary model. Both login and registration admit exactly the configured two attempts, then reject the remaining concurrent requests with 429. Tests also cover expiry, per-client/per-endpoint/per-environment independence, IPv6 normalization, spoofed forwarding headers, missing credentials, network/timeout/provider/malformed-result failures, and store contract methods.
- The REST fixture is **not** a Redis/Lua interpreter or live Upstash service. It proves application/store integration and shared-boundary behavior; the parameterized Lua algorithm relies on documented Redis atomic execution. Live EVAL/TTL verification is still a gate.
- Real isolated MongoDB replica-set tests run two actual HTTP/Socket.IO servers and verify cross-instance recipient delivery, read/unread propagation, cross-user denial, instance termination, offline persistence, reconnect sync, remote logout revocation, no duplicate inbox records, and retry after database reads fail.
- Frontend tests verify repeated invalidation hints and reconnect do not append duplicate items and do reconcile changed read state.
- ESLint, formatting, production build, and whitespace checks passed. No Vercel deployment, real Redis mutation, hosted browser/runtime check, or real user-data mutation was performed.

## Remaining manual gates and later-phase blockers

1. Provision/select the free shared Redis store and configure server-only credentials and stable environment namespaces. Verify permissions, non-evicting counters, actual command quotas, and limits for your account.
2. On an explicitly authorized isolated deployment, send concurrent limited requests through multiple Function instances and restarts; confirm 429/Retry-After, expiry, header spoof resistance and 503 under denied/unavailable store access. Never test exhaustion against real user accounts.
3. Verify Vercel HTTP-server exports, authenticated WSS upgrades, active-connection timer execution, reconnect after 300 seconds, cross-instance durable reconciliation, read state, and termination recovery. No hosted evidence was available here.
4. Preserve the existing upload implementation until its separate migration: 5 MiB multipart still exceeds Vercel's 4.5 MB request limit.
5. Preserve existing cleanup/expiry maintenance code until its separate migration. This phase does not provide a persistent scheduler; Hobby Cron cannot reproduce the current short cadence.
6. Keep the Atlas restricted demo identity, network access, environment and capacity checks from earlier audits. Local tests are not evidence that those external deployment settings are configured.

**Phase 2 conclusion:** code and local regression work are complete; live infrastructure verification remains pending. Stop before Phase 3.

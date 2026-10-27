# Milestone 6B: production hardening

Implemented 27 October 2026. Backend hardening only: no deployment, secret changes, business-state changes or frontend redesign. The initial 217-test suite is preserved; 44 regression tests bring the total to **261 (53 frontend, 208 backend)**. See the updated [readiness audit](production-readiness-audit.md) for the other deployment prerequisites.

## Proxy policy and Render assumptions

Express now uses `TRUSTED_PROXY_CIDRS`, an explicit comma-separated list of trusted **inbound** proxy addresses/subnets. Empty means direct access and `trust proxy=false`. It accepts IP literals or CIDRs, not `true`, hop counts, wildcard networks or Express aliases such as `uniquelocal`. Validation caps the list at 32 ranges and rejects overly broad prefixes (IPv4 shorter than /8 or IPv6 shorter than /32). Those bounds are not a declaration that every accepted range is safe: operators must still select the narrowest verified proxy ranges.

Only a matching immediate TCP peer can supply trusted forwarding information. Express's proxy-addr implementation walks X-Forwarded-For right-to-left, skipping explicitly trusted proxies, then stops at the nearest untrusted address. The leftmost header is never selected merely because it was provided. An untrusted direct peer cannot rotate XFF to get new auth budgets. Alternate Forwarded, X-Real-IP, CF-Connecting-IP and caller request-ID headers are not used as authentication limiter keys. Malformed resolved IPs fall back to the TCP peer's bucket. Keys use express-rate-limit's canonical IPv6 /56 grouping.

Login remains **20 attempts/IP/15 minutes** and registration **10/IP/15 minutes** by default, using the existing independently configurable LOGIN_RATE_LIMIT and REGISTER_RATE_LIMIT. All attempts count, including rejected validation attempts. The image user-based limiter is unchanged. Memory limits reset on process restart and are not shared between instances.

### Render configuration is an explicit release gate

[Render describes Cloudflare and its load balancers in the ingress chain](https://render.com/articles/how-render-handles-ddos-attacks); it does not establish a fixed hop count for this particular FoodBridge service. [Express requires trust settings to match the real proxy chain](https://expressjs.com/en/guide/behind-proxies/). No deployment or connected Render account was available to inspect, so no proxy ranges or hop counts were invented.

1. Obtain the actual service's supported inbound peer/proxy IP ranges and header behavior from Render's current network configuration/support. Outbound IP ranges are **not** an inbound proxy allowlist. Do not copy an example private subnet or enable all private addresses. If stable verified ranges cannot be established, do not work around the gate with blanket trust; use a controlled ingress with an enforceable trust boundary before release.
2. Verify that every ingress appends or replaces forwarding information with the real observed client address; close any shorter/direct path that bypasses it. Only include intermediate proxies actually present in that trusted chain. A custom CDN/extra reverse proxy requires a new review. Never trust end-user networks as proxy ranges.
3. Set `TRUSTED_PROXY_CIDRS` only in the server environment to those verified ranges. The local `.env.example` intentionally leaves it empty. This configuration is not a secret, but the audit did not modify an actual `.env` file.
4. Render [automatically sets RENDER=true and RENDER_SERVICE_TYPE](https://render.com/docs/environment-variables). Production Render web services now **refuse startup without an explicit allowlist**. Cron/worker services do not need HTTP proxy configuration. Do not override RENDER to bypass this check. Other hosts default to direct access until deliberately configured.
5. Before release, use two controlled clients/networks and expend a small test budget in staging. Changing forged leftmost XFF, Forwarded and X-Real-IP on client A must not evade its 429. Client B must retain its own budget. Repeat over every exposed hostname, HTTPS ingress and any permitted private/direct path. Remove any temporary operator-only IP diagnostics; no public `/ip` or header-dump endpoint is added here. Confirm proxy ranges with platform tooling/support rather than logging user IPs by default.

**Implementation and local simulations pass. Actual Render ingress identity and spoof resistance remain unverified until those operator checks are performed.** CIDR trust is conditional on those assumptions; it cannot authenticate a compromised trusted proxy.

## Production log contract

Application logs use one JSON object per line when NODE_ENV=production; development uses readable timestamp/level/event lines. Tests are quiet unless a test explicitly supplies a capture sink. Info events use stdout; warning/error events use stderr. Package-manager banners are not application JSON: use `npm --silent start` or the silent maintenance commands below if the collector expects JSON-only output.

Every HTTP response gets a newly generated UUID in `X-Request-ID`; caller-supplied IDs are ignored. One `http_request` log records requestId, route template, method, status, durationMs and timestamp. Closed/incomplete responses are recorded as status 499. A server failure also emits `http_error` with the same requestId and safe error type/code; the API retains its existing generic unexpected-error response. Route templates use static allowlisted segments and `:id`/`:role`, not actual object IDs, addresses, arbitrary paths or query strings. Requests that fail before matching a route use `unmatched`.

Example shape (illustrative metadata only):

```json
{
  "timestamp": "2026-10-27T00:00:00.000Z",
  "level": "error",
  "event": "http_error",
  "requestId": "00000000-0000-4000-8000-000000000000",
  "route": "/api/requests/:id",
  "method": "PATCH",
  "status": 500,
  "error": { "type": "MongoNetworkError", "code": "ECONNRESET" }
}
```

Logging uses an allowlist of events/metadata and **omits** request/response payloads, headers, cookies, Authorization, passwords, JWTs, MongoDB URIs, Cloudinary credentials, phone/email, user/donation data, raw URLs, raw error messages, stack traces and causes. Arbitrary error names/codes and extra nested fields are dropped. Safe error types and selected stable codes support classification without logging provider/database details. Application logs intentionally trade raw-stack diagnostics for bounded, secret-safe metadata. Correlate request IDs and job run IDs; do not reintroduce body/header serialization for debugging.

Logging sink exceptions cannot change HTTP/business transaction outcomes. However, a failed stdout/stderr collector cannot deliver logs: operational collection/alerts must be verified separately. Startup, database connection/unconfigured state, shutdown and fatal startup/shutdown failures now use the same logger. A server listen error exits unsuccessfully.

## Observable jobs and exit codes

The shared runner logs `job_started`, then exactly `job_completed` or `job_failed`, with job, UUID runId, durationMs on terminal events, safe error classification and bounded aggregate counts. Configuration, database, workflow, provider partial-batch and disconnect failures produce a failure terminal event. No task/user/donation/asset identifiers or payloads are logged.

| Job                 | Execution                                       | Success metadata         | Failure semantics                                                                                                                                         |
| ------------------- | ----------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| expire_donations    | Existing expiry CLI; external schedule required | expiredCount             | Any command/configuration/connect/disconnect failure returns exit 1; prior committed listing transactions remain valid and reruns are safe                |
| cleanup_images      | Existing CLI and API's once-per-minute interval | removed, failed, pending | A failed provider deletion retains/reschedules its cleanup task; a batch with failed >0 is logged as failed and CLI exits 1 even if other tasks succeeded |
| notification_outbox | API interval every 2 seconds                    | sent                     | Runtime batch failures emit item/batch failure logs; pending rows retry. No socket network failure rolls back committed inventory/receipts                |

Image cleanup still checks active donation references before deletion. `pending=true` alone does not mean failure: tasks can be deferred by the existing grace/retry window or bounded batch size. Retry after the configured delay to process deferred tasks. Missing Cloudinary configuration logs a `job_skipped` for the API image worker; explicitly invoking its CLI without configuration returns exit 1. This optional feature does not prevent other food workflows from operating.

The notification worker uses strict failure reporting in its scheduled mode, while the existing service return contract remains compatible for non-worker callers. Read-mark invalidation delivery failures also log a safe event; REST remains authoritative. Workers avoid overlapping their own ticks. Shutdown stops their timers and waits for in-flight work, with the existing bounded shutdown timeout. No scheduler, paid monitoring integration, credential, email provider or new alerting infrastructure is introduced.

### Scheduler instructions and explicit alerting gap

Run from the repository root with the intended server environment, on an always-running host/actual scheduler:

```sh
# Suggested every five minutes; configure schedule in your external scheduler.
npm run --silent expire:donations -w server

# Bounded cleanup recovery/optional external batch, only with Cloudinary configured.
npm run --silent cleanup:images -w server
```

The CLI exits 0 only after successful work and disconnect, 1 for caught failures; abnormal termination/scheduler timeout is also a failed run. Preserve the actual exit status: do not append `|| true`, or pipe to a command that masks it. If a shell pipeline is necessary, configure pipefail and verify its behavior. Set a scheduler timeout appropriate to the data volume and a bounded retry policy; transaction/cleanup idempotency makes retries safe. Do not run maintenance against an unintended database. The API continues to enforce deadlines even if an expiry schedule is delayed.

The scheduler/operator must monitor nonzero exit status, `job_failed`/`job_item_failed`, missing expected completion/heartbeat, repeated readiness 503 and process downtime. API workers have no independent process exit per failed tick, so log-based detection is necessary. **No actual notification recipient/destination or delivery mechanism has been configured or verified. Production alerting is NOT operational.** Local failure tests prove signals and exit codes, not that anyone receives an alert. Before release, wire an existing available scheduler/platform notification channel, identify the responsible operator, trigger a controlled failure and verify receipt at the real destination, then verify successful recovery. Until then R5's alerting portion remains a manual blocker.

## Liveness and readiness

- `GET /api/health`: unchanged lightweight process liveness, no dependency queries, Cache-Control:no-store.
- `GET /api/health/ready`: uncached readiness; checks active MongoDB connection, performs bounded `ping` and `hello` commands (2-second driver timeout each), and requires a replica set or mongos with sessions. Returns 200 `{status:"ready",application:"FoodBridge"}` or 503 `{status:"not_ready",application:"FoodBridge"}`. Missing/disconnected/unreachable/standalone databases do not report ready. No connection strings, topology names, credentials or error details are returned. Failures are recorded with a request ID.

Configure the later Render readiness/traffic health path as **`/api/health/ready`**, not the liveness path. Keep liveness for independent process diagnostics. Missing MongoDB can still run the foundation-only demo mode, but readiness is 503. Cloudinary remains optional; this endpoint does not validate live Cloudinary account credentials, hosted cookie behavior, backup policy, all user permissions or alert delivery. Index initialization still completes during normal backend startup before listen; full write transactions are covered by existing integration tests, not a mutating health probe.

Local checks after normal startup (port may differ if configured):

```sh
npm start
# In another terminal:
curl --fail http://localhost:5001/api/health
curl --fail http://localhost:5001/api/health/ready
```

## Verification

```sh
npm test
npm run lint
npm exec prettier -- --check .
npm run build
```

All **261 tests pass, 0 failures**: 53 client, 208 server. Tests include direct/untrusted/multi-proxy spoofing, unchanged separate budgets and IPv6 grouping; production JSON request/error redaction; CLI child-process exit codes; failed connection, workflow, cleanup partial batch and disconnect handling; real MongoDB replica-set readiness; retained outbox and cleanup retries; existing authentication, inventory and pickup workflows. Lint, formatting and production build pass. No hosted Render verification or live Cloudinary upload is implied.

A read-only live Atlas check also passed: readiness returned 200 after ping/session-topology validation, then 503 after explicitly disconnecting that audit connection; liveness stayed 200. Captured production request logs were valid JSON and contained no current backend secret values. No model indexes or application records were created/modified by this check. Existing real `.env` files were verified byte-for-byte unchanged.

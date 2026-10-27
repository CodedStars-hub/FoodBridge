# Render startup failure diagnostics

## Fast configuration check

The original `server_failed` log containing only `error.type=Error` cannot identify the exact remote exception. No Render log/configuration connector was available, and no hosted configuration, deployment, commit or push was performed.

The first likely blocker is `CLIENT_ORIGIN`: its repository default is `http://localhost:5173`, which production rejects. Set it in Render to the **exact production frontend HTTPS origin**, with **no trailing slash or path**. Leave `CLIENT_ORIGINS` unset unless deliberately configuring additional exact HTTPS origins; that variable overrides the fallback origin list. Do not include a comma-separated list in `CLIENT_ORIGIN`.

For the chosen demo mode, also verify:

```text
NODE_ENV=production
CLIENT_IP_SOURCE=socket
RATE_LIMIT_STORE=process-demo
DEMO_SINGLE_PROCESS=true
COOKIE_SAME_SITE=none
CLIENT_ORIGIN=<actual Vercel frontend HTTPS origin, no slash/path>
JWT_SECRET=<strong secret, at least 32 characters, not an example placeholder>
MONGODB_URI=<actual restricted Atlas demo database URI>
```

Render supplies `RENDER=true`, `RENDER_SERVICE_TYPE=web` and `PORT`. Remove a copied `VERCEL=1`. Leave `TRUSTED_PROXY_CIDRS` and both Upstash REST credential fields unset for process-demo mode. Confirm the deployed commit contains the current socket-only demo support; local edits do not change a Git-connected deployment until the operator publishes them.

**If the full original output lacks `demo_rate_limit_mode`, environment validation is the first suspect**: the warning is emitted immediately after successful validation and before any database connection. If the warning appears, investigate the later initialization steps instead. Missing/invalid JWT or URI configuration, stale Redis fields, an invalid origin or a different deployed revision can all produce the old generic error. This is a diagnostic inference, not proof of the original account's remote configuration.

## Entire startup path and failure points

1. Module imports complete. An import-time exception would ordinarily be outside the existing `start().catch()`; the reported structured fatal log indicates the handler itself ran.
2. `parseEnvironment()` validates schema fields, the explicit demo/proxy modes, origin syntax/HTTPS requirements, matching settings and cookie mode. Every guard remains enforced.
3. `createRuntime()` awaits MongoDB connection with the existing five-second server-selection timeout and bounded pool. Invalid URI syntax, credentials, DNS/TLS, a paused/unreachable cluster or Atlas Network Access can fail here.
4. All five existing Mongoose models initialize their collections/indexes. Insufficient rights, duplicate values for a unique index or conflicting index options can fail startup here. No indexes or data are dropped by this fix.
5. Express middleware and API routers initialize.
6. Socket.IO attaches to the shared HTTP server, with unchanged Origin/cookie/token-version authorization. A browser WSS connection is not required for startup.
7. Existing notification and image-cleanup timers initialize. Cloudinary enablement is checked from configuration; **there is no blocking Cloudinary provider ping/upload during startup**. Missing optional image credentials skip image cleanup and image endpoints report their existing unavailable state. Worker job failures occur later and are separately logged.
8. The server binds `0.0.0.0` on the validated host `PORT`. Bind errors are reported as listener failures.

An empty MongoDB URI retains the existing unconfigured/liveness behavior, but application data routes and `/api/health/ready` remain unavailable; this does not satisfy a Render deployment's configured readiness check. Supply the real demo URI. No MongoDB requirement or readiness check was bypassed.

## Diagnostic changes

Previously `safeError()` intentionally allowlisted only type/code, dropping all exception messages and stacks. That prevented secret leakage but hid safe environment-validation details and collapsed unlisted Mongoose error names to `Error`.

Startup now emits `startup_step` records with these stages: `environment`, `database_connection`, `database_indexes`, `application`, `socket_io`, `maintenance`, and `listen`. Fatal/shutdown diagnostics include a safe message, safe type/code, and filtered stack locations. Database failures retain stage context; index failures also identify an allowlisted model name.

Safety properties:

- Exact application configuration messages and allowlisted configuration field names may appear, **never their values**.
- MongoDB parse/authentication/authorization/network/index errors use constructed actionable descriptions. Raw driver messages, server replies, connection URIs, nested causes and arbitrary exception properties are never serialized.
- Stack output contains only up to eight allowlisted application file locations with line/column numbers. The untrusted message line, function names, absolute paths, dependency frames and unknown locations are omitted.
- Unknown exceptions report the stage and safe stack with a generic description. This is intentionally less verbose than dumping a raw exception; text redaction alone cannot guarantee protection of bare secrets.
- Ordinary HTTP/job logs retain their previous restricted error metadata. HTTP responses do not expose startup stacks or provider diagnostics.
- Demo-mode validation now reports the exact conflicting field names instead of a combined generic condition. It accepts no previously forbidden configuration.

Example reproduced locally:

```json
{
  "event": "server_failed",
  "stage": "environment",
  "error": {
    "type": "Error",
    "message": "Production client origins must use HTTPS",
    "stack": "at server/src/config/env.js:<line>:<column>\nat server/src/index.js:<line>:<column>"
  }
}
```

## Action by reported stage

- `environment`: correct only the named fields. For the HTTPS error, fix `CLIENT_ORIGIN` and remove/correct a stale `CLIENT_ORIGINS`. Keep production security enabled.
- `database_connection`, parse: check the Atlas URI format and percent-encode special username/password characters. Never paste the URI into shared logs.
- `database_connection`, authentication: verify the database user/password and authentication database.
- `database_connection`, server selection: check the cluster and Atlas Network Access against the **actual Render outbound ranges**. These are not Express inbound proxy CIDRs.
- `database_indexes`: ensure the scoped demo identity can initialize the required collections/indexes. Investigate unique conflicts safely; do not delete real records or drop indexes to force startup.
- `application` / `socket_io` / `maintenance`: use the sanitized application frame to identify code initialization failure. No such application failure was reproduced with the validated demo configuration.
- `listen`: use the Render-provided `PORT`; ensure there is one persistent Node process.

## Verification

- Non-secret production subprocess fixtures reproduce HTTP-origin rejection, trailing-slash/path errors, invalid JWT configuration, leftover Vercel/Redis configuration and refused localhost MongoDB connectivity. They verify exit code 1, correct failure stage/message and credential-safe stack output.
- Tests cover provider-error classification, raw/nested/bare-secret exclusion, unknown stack paths and forged diagnostic fields.
- Existing database tests verify connection/index stage tagging and exact model attribution without changing retry behavior.
- Targeted startup/database/demo/listener/logging checks: **64 passed**.
- Full backend suite: **276 passed**. ESLint, formatting, production build, new-module syntax and whitespace checks passed. Frontend implementation was unchanged; the production frontend build also passed.
- No real user data or external infrastructure was modified. The remote root cause still requires the configured field check or the new safe diagnostic record; it cannot be proven from the old type-only log.

Changed files: `server/src/index.js`, `server/src/runtime.js`, `server/src/config/database.js`, `server/src/config/env.js`, `server/src/utils/logger.js`, new `server/src/utils/startupDiagnostics.js`, `server/test/database.test.js`, new `server/test/startupDiagnostics.test.js`, and this document.

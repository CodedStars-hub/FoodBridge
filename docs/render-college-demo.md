# Active deployment plan — Render backend + Vercel frontend

This supersedes the Vercel-only backend migration plan for the college demo. No deployment, commit, push, infrastructure change or real user-data modification was performed.

## What changed

- Removed `api/index.js`, Vercel Function duration configuration, and backend API/Socket.IO rewrites. Vercel serves only `client/dist` with the SPA fallback and existing security headers.
- Retained the reusable persistent Express/HTTP/Socket.IO runtime, bounded MongoDB pool, donor session-recovery guidance, Cloudinary integration and MongoDB-backed per-instance notification reconciliation.
- The Node entry point explicitly listens on `0.0.0.0` and validated `process.env.PORT`. It retains SIGTERM/SIGINT shutdown and dependency cleanup.
- Added an explicitly acknowledged, single-process Render demo rate-limit mode. Optional Redis storage remains available; it is not required for this mode. No request is allowed through by catching a store failure and disabling a limiter.
- Local development remains `npm run dev` with the existing `/api` and `/socket.io` Vite proxies. No real `.env` file changed.

## Conservative demo trust and rate-limit policy

Set `CLIENT_IP_SOURCE=socket`, `RATE_LIMIT_STORE=process-demo`, and `DEMO_SINGLE_PROCESS=true` on one production Render process. This configuration requires `RENDER=true`, rejects `VERCEL=1`, rejects proxy CIDRs and Redis credentials, and keeps Express `trust proxy=false`.

**No claim is made to identify the original client IP behind Render.** Socket address inspection uses only the actual peer. Login and registration deliberately share their respective existing budgets across **all** visitors, regardless of forwarding headers or which Render proxy peer connects. Defaults remain 20 login attempts and 10 registration attempts per 15 minutes. The two endpoints have separate budgets. The image-upload limit remains 30 per authenticated owner per 15 minutes.

This is stricter than per-client throttling and avoids guessing any proxy range or allowing forged forwarding values to reset counters. It has explicit limitations: anyone can consume the collective budget; in-memory counters reset on process restart; counters do not coordinate across processes. Use one Free instance, the existing plain Node start command, and no cluster/PM2 workers. `DEMO_SINGLE_PROCESS=true` is an operator acknowledgement, not automatic detection of your host topology. Wait for a 429 window to expire; do not bypass the limiter. Prepare demo accounts before the presentation rather than repeatedly registering them.

The missing-CIDR startup gate is bypassed **only for socket-only handling**; proxy-aware mode still requires verified ranges. Legacy Vercel client-IP handling remains gated and is rejected when `RENDER=true`; no Vercel backend entry point remains.

For shared quotas, choose `RATE_LIMIT_STORE=redis` and supply the existing Upstash REST credentials instead. Redis failures still fail closed with 503. Do not select `process-demo` as an outage fallback. A Redis service does not by itself establish trusted original client IPs.

This policy is for a restricted single-instance college demo, not approval for a public production launch.

## Exact Render Web Service settings

| Field             | Value                                                            |
| ----------------- | ---------------------------------------------------------------- |
| Repository        | Your FoodBridge GitHub repository and reviewed deployment branch |
| Root Directory    | **Blank** — repository root, not `server` with these commands    |
| Runtime           | Node                                                             |
| Instance          | Free, one instance/process                                       |
| Build Command     | `npm ci --include=dev && npm run build -w server`                |
| Start Command     | `npm --silent start`                                             |
| Health Check Path | `/api/health/ready`                                              |
| Node version      | `NODE_VERSION=24`                                                |

The actual backend source root is `server/`; the repository-root npm start command delegates to `server/src/index.js`. Render provides `PORT`, `RENDER=true` and `RENDER_SERVICE_TYPE=web`. Do not replace the assigned port or set `NODE_ENV=development` to bypass validation. HTTP and Socket.IO share that one service/port.

### Required backend environment

```text
NODE_ENV=production
NODE_VERSION=24
CLIENT_IP_SOURCE=socket
RATE_LIMIT_STORE=process-demo
DEMO_SINGLE_PROCESS=true
COOKIE_SAME_SITE=none
CLIENT_ORIGIN=<exact Vercel production HTTPS origin, no trailing slash>
MONGODB_URI=<dedicated demo database URI>
JWT_SECRET=<independently generated secret, at least 32 characters>
CLOUDINARY_CLOUD_NAME=<your configured cloud name>
CLOUDINARY_API_KEY=<your server-only key>
CLOUDINARY_API_SECRET=<your server-only secret>
```

Leave `TRUSTED_PROXY_CIDRS` empty or unset. Leave `CLIENT_ORIGINS` unset for the single-origin fallback; if already present, remove it or configure the exact approved HTTPS frontend origins because it overrides `CLIENT_ORIGIN`. Remove any manually copied `VERCEL=1`. Leave Upstash URL/token unset in process-demo mode. Existing optional budgets, JWT lifetime, body size, discovery and matching settings retain their defaults.

Do not copy backend secrets to Vercel. Do not print them in logs or commit them.

## Exact Vercel frontend settings

| Field                  | Value                                                           |
| ---------------------- | --------------------------------------------------------------- |
| Root Directory         | Repository root                                                 |
| Framework preset       | Vite (use the explicit commands in `vercel.json`)               |
| Install Command        | `npm ci --include=dev`                                          |
| Build Command          | `npm run build -w client`                                       |
| Output Directory       | `client/dist`                                                   |
| Production environment | `VITE_API_URL=https://<actual-render-service>.onrender.com/api` |

Set the **actual** assigned Render HTTPS URL, including `/api`, before building. This variable is build-time; rebuild after changing it. Do not use `/api` in the hosted static frontend. There is no Vercel backend proxy. Socket.IO automatically derives the Render origin from the API URL and connects to that origin's `/socket.io` over WSS; no separate socket URL or port variable is needed.

The optional `VITE_OSM_TILES_URL` remains public. All `VITE_*` variables are public; never use them for credentials.

## Authentication and browser checks

Default Vercel and Render domains are cross-site. `NODE_ENV=production` and `COOKIE_SAME_SITE=none` retain the Secure, HttpOnly, host-only `__Host-foodbridge_session` cookie, Path=/, without a Domain attribute. Secure cookies are set directly by the existing session implementation; enabling Express proxy trust is not required for this code path.

Frontend API calls retain `credentials: include` and the mutation CSRF marker. Backend credentialed CORS, exact Origin validation and JSON/multipart restrictions remain unchanged. Socket.IO retains exact allowed Origin checks, cookie authentication, token-version checks and recipient isolation.

**Manual browser gate:** SameSite=None does not override third-party-cookie blocking. In the browser used for submission, verify login → reload → logout and authenticated WSS. If cookies are blocked, explicitly permit cookies for these demo sites in that browser or use a same-site custom-domain arrangement. Do not remove CSRF, loosen origins to `*`, or weaken cookie attributes.

## Initialization and regression evidence

- Full frontend suite: **142 passed**.
- Full backend suite: **261 passed**. Total: **403 passing frontend/backend tests**.
- Actual subprocess tests start both local and production Render-demo modes on an isolated port, serve HTTP and Engine.IO, and exit cleanly on SIGTERM.
- Runtime tests confirm Socket.IO upgrade listeners and initialization of the existing 2-second notification and 60-second image-cleanup intervals.
- Tests verify that all forged forwarding headers leave the collective demo quota unchanged; endpoints remain independently limited; unsafe demo configuration is rejected; credentialed CORS and CSRF checks are retained.
- Existing isolated replica-set tests cover donor creation, NGO verification/request/reservation rules, volunteer transitions, image validation/authorization/provider-failure handling, and notification persistence/reconnect/isolation. No donation or assignment business logic changed.
- Read-only checks against current Atlas passed connectivity, declared indexes, replica-set/session capability, aborted snapshot transaction and geospatial compatibility. **The current credential remains broadly privileged**; no account/role changes were made.
- Authenticated Cloudinary provider ping passed. Image transport is unchanged; recent isolated live upload/render/replacement/deletion evidence is recorded in `docs/donor-access-investigation.md`, rather than claimed as a fresh hosted test here.
- ESLint, formatting and production build passed. No hosted Render/Vercel/browser verification has occurred.

## Required manual actions before submission

1. Review and publish the intended local changes to your deployment branch yourself. Git-connected hosts cannot build uncommitted local changes. Nothing was committed or pushed by this agent.
2. Create a dedicated database-scoped `readWrite` Atlas demo user, with an explicit demo database in the URI. Do not use the current broad operator credential as the Render application identity. The app initializes collections/indexes and uses replica-set transactions.
3. In Atlas Network Access, allow the backend's actual Render **outbound** ranges from its dashboard. These ranges are for database egress access, **not** Express inbound proxy trust. Do not guess addresses.
4. Configure the assigned frontend and backend URLs and environment names above, then deploy manually. Check `/api/health` and `/api/health/ready`. Confirm the startup warning `demo_rate_limit_mode` appears and the instance count is one.
5. Use isolated donor, NGO and volunteer accounts. Donors may publish while pending. A trusted operator must verify the isolated NGO and volunteer accounts through the existing authorized administrative process before their restricted workflows. Do not enable privileged signup or change real accounts to make a demo pass.
6. Verify register/login/logout/reload, donor publish + image, NGO request + reservation, volunteer claim/progression, donor handover and NGO receipt, and notification read/reconnect. Check browser cookies, CORS/preflights and WSS in the actual submission browser.
7. Warm the backend shortly before presenting. Render Free sleeps after 15 minutes without inbound traffic and may restart; reconnect and in-memory reset limitations remain. Notification/image-cleanup timers only run while the service is awake. Do not claim an always-on worker.

Donation expiry remains the existing separate `npm run expire:donations -w server` CLI; image cleanup also has `npm run cleanup:images -w server`. No expiry scheduler was added or executed against real data. If running maintenance manually, use the intended demo database/environment and existing operational controls. Free web-service timers are not an external cron guarantee.

## Remaining blockers / hosted verification

- Current broad Atlas credential must be replaced with a restricted demo application identity and the host network allowlist verified.
- Actual assigned URLs, TLS, cross-site cookie acceptance, WSS, role-verified demo accounts and representative workflows require hosted checks.
- Local changes must reach the deployment branch before Git-connected builds can include them.
- Global demo quotas and restart resets are accepted demo limitations only; do not scale this mode or claim production-wide durable rate limiting.

References: [Render web services](https://render.com/docs/web-services), [Render Free limitations](https://render.com/docs/free), [Vercel Vite SPA hosting](https://vercel.com/docs/frameworks/frontend/vite), [cookie attributes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

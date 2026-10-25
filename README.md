# FoodBridge

A MERN surplus food redistribution platform for college cafeterias, restaurants, NGOs, and volunteers. Milestone 2 adds real authentication, profiles, and role-based dashboard shells to the existing landing page and foundation. Food listings, matching, pickups, approval workflows, and analytics are future milestones.

## Requirements and setup

- Node.js 24 LTS recommended; also supports Node.js 22.12+ within v22, or v26+
- npm 10 or newer
- A local MongoDB instance or your own MongoDB connection URI for account features

From the repository root:

```sh
npm install
cp client/.env.example client/.env
cp server/.env.example server/.env
openssl rand -hex 32
```

Paste the generated value into `JWT_SECRET` in `server/.env`, replacing the placeholder. Start your local MongoDB instance and set `MONGODB_URI` to your connection URI. The example uses `mongodb://127.0.0.1:27017/foodbridge`. Then run:

```sh
npm run dev
```

Open http://localhost:5173; the API runs on http://localhost:5000. Vite proxies `/api` to the API. Press Ctrl+C to stop both. Register as a donor, NGO (organization name required), or volunteer. Registration signs you in and takes you to your role’s dashboard. Reloading restores your session. The profile form persists safe field changes; logout ends all your sessions.

Leaving `MONGODB_URI` empty allows the API and landing page to run without database features; account endpoints return HTTP 503. A configured but unreachable database causes startup to fail. Environment validation, including a valid JWT secret, always runs. Health never queries MongoDB.

```sh
npm run dev:client
npm run dev:server
curl http://localhost:5000/api/health

npm run lint
npm test
npm run build
npm exec prettier -- --check .
npm run format

# Production API; configure NODE_ENV=production and HTTPS first
npm start

# Local preview of built frontend (not a production server)
npm run preview -w client
```

The server build checks its JavaScript entry points; Node executes the source directly. Vite generates `client/dist`. In production, serve that directory with SPA fallback to `index.html` and proxy `/api` to Node, or configure an explicit API base in `VITE_API_URL`. Actual hosting remains outside this milestone.

## Environment

`server/.env` is loaded relative to the server package. Existing process variables take precedence. No real credentials are included. `.env` files are ignored; `.env.example` files are tracked. Never commit secrets. Browser `VITE_*` values are public.

| Variable              | Default                 | Purpose                                                             |
| --------------------- | ----------------------- | ------------------------------------------------------------------- |
| `NODE_ENV`            | `development`           | `development`, `test`, `production`                                 |
| `PORT`                | `5000`                  | API port                                                            |
| `MONGODB_URI`         | empty                   | MongoDB URI; needed for account features                            |
| `CLIENT_ORIGIN`       | `http://localhost:5173` | Default allowed browser origin, no trailing slash                   |
| `CLIENT_ORIGINS`      | `CLIENT_ORIGIN`         | Optional comma-separated explicit origin allowlist; no wildcard     |
| `JWT_SECRET`          | none, required          | Random secret of at least 32 characters; use `openssl rand -hex 32` |
| `JWT_EXPIRES_SECONDS` | `86400`                 | Session lifetime, 60–604800 seconds                                 |
| `COOKIE_SAME_SITE`    | `lax`                   | `lax`, `strict`, or `none`; `none` requires production HTTPS        |
| `JSON_BODY_LIMIT`     | `100kb`                 | Maximum JSON payload                                                |
| `LOGIN_RATE_LIMIT`    | `20`                    | Login attempts per IP per 15 minutes                                |
| `REGISTER_RATE_LIMIT` | `10`                    | Signup attempts per IP per 15 minutes                               |

`client/.env`: `VITE_API_URL=/api` by default. Changing the API port locally also requires updating the proxy target in `client/vite.config.js`. For preview at port 4173, explicitly add `http://localhost:4173` to `CLIENT_ORIGINS` and use an API origin in the frontend environment, then rebuild. The default development configuration is intended for `npm run dev`.

## Authentication and security

- Passwords are hashed with bcryptjs at cost 12. Registration requires at least 12 characters and at most 72 UTF-8 bytes to avoid bcrypt truncation. Passwords are never trimmed or returned. Unknown-email and incorrect-password logins return the same response and perform a bcrypt comparison.
- JWTs expire and are restricted to HS256 with fixed issuer and audience. They contain user ID and a session version, not trusted roles. Every protected request loads the current user and checks the session version, so role changes/deleted accounts take effect immediately.
- Cookies are HttpOnly, host-only, and scoped to `/`. Development uses `foodbridge_session` without Secure for localhost HTTP. Production uses `__Host-foodbridge_session` with Secure; production browser origins must use HTTPS. Default SameSite=Lax suits same-site hosting. Cross-site deployments require production HTTPS and SameSite=None; browser third-party cookie restrictions may still prevent these sessions. Prefer serving the app and API on the same site.
- Logout atomically increments the user’s private `tokenVersion` and clears the cookie with matching attributes. **Logout invalidates all sessions for that account**, including copied JWTs. There is no refresh-token flow. Expired sessions require login again; rotating `JWT_SECRET` invalidates every session.
- Credentialed CORS uses only the configured origin allowlist. There is no wildcard.
- **CSRF:** every state-changing request under `/api/auth` and `/api/users`, including registration/login/logout, requires an exact allowlisted `Origin`, `Content-Type: application/json`, and `X-CSRF-Protection: foodbridge`. Missing/foreign origins, missing headers, and simple form content types are rejected with 403. Browsers cannot send that custom header cross-origin without a successful CORS preflight. It is an intentional request marker, not a secret token. SameSite is defense in depth. GET endpoints never mutate account state. See [OWASP’s custom-header guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#employing-custom-request-headers-for-ajaxapi). Non-browser clients must send the same Origin/header/content type. Apply this middleware to any future cookie-authenticated mutation routes too.
- Login and signup have separate per-IP limits with consistent JSON errors and standard rate-limit headers. The default store is process-local and resets at restart. Multiple API instances require a shared store before production scaling. Express does not trust forwarded IP headers by default; configure `trust proxy` only for your actual trusted proxy topology before deployment, otherwise proxy clients may share one limit.
- Strict allowlisted request schemas reject unknown fields, object injection, and privileged mass assignment. Plain-text profile values reject markup/control characters; React escapes rendered text. Public signup never accepts admin, verification status, or session version. Profile updates cannot change email, role, verification status, or password. Password reset/change and email verification are not implemented.
- Model serialization and explicit response projections exclude password hashes and session versions. Auth/profile responses are `Cache-Control: no-store`. Unexpected errors expose no stacks or credentials.
- Verification begins as `pending` for every public account. This is a stored status, not a completed verification process; it does not block the account dashboard. Verification operations are not implemented in this milestone.

## Initial admin (development only)

There is no public admin signup or role-changing API. Configure these values **locally** in `server/.env`:

```dotenv
ADMIN_NAME=<your chosen name>
ADMIN_EMAIL=<your chosen email>
ADMIN_PASSWORD=<your own strong password>
```

With `NODE_ENV=development`, MongoDB configured, and a valid JWT secret:

```sh
npm run bootstrap:admin -w server
```

The script validates credentials, hashes the password, and creates one verified admin. It refuses production/test environments, an existing email, or an existing admin. It never promotes or overwrites a public account. Run it once, remove the `ADMIN_*` values, then log in through the normal login page. Do not run concurrent bootstraps. Production admin provisioning requires a separately controlled operational procedure; this development command deliberately refuses it.

## API

Errors use `{ "error": { "message": "...", "fields": { "field": "validation message" } } }`; `fields` is present only for input validation. Statuses: 400 invalid input, 401 missing/invalid session, 403 CSRF/role denial, 409 duplicate email, 429 rate limit, 503 account database unavailable.

| Method | Path                         | Access / result                                                                  |
| ------ | ---------------------------- | -------------------------------------------------------------------------------- |
| GET    | `/api/health`                | Public process liveness, no database query                                       |
| POST   | `/api/auth/register`         | Public; validated donor/NGO/volunteer input; 201 + user + session cookie         |
| POST   | `/api/auth/login`            | Public; email/password; 200 + user + session cookie                              |
| POST   | `/api/auth/logout`           | Signed in; 204; revokes all account sessions                                     |
| GET    | `/api/auth/me`               | Signed in; current user/session restoration                                      |
| GET    | `/api/users/me`              | Signed in; current profile                                                       |
| PATCH  | `/api/users/me`              | Signed in; only `name`, `phone`, `organizationName`                              |
| GET    | `/api/users/dashboard/:role` | Signed in with exactly that role; shell access confirmation, no operational data |

Signup fields: `name`, `email`, `password`, `role`, optional `phone`, and `organizationName` (required for NGOs). Email is trimmed and lowercased, with a MongoDB unique index. Duplicate insert races return the same 409 as preflight duplicate checks. Startup waits for the User indexes to initialize.

Example signup once MongoDB is running:

```sh
curl -i -c /tmp/foodbridge-cookies.txt \
  -H 'Origin: http://localhost:5173' \
  -H 'Content-Type: application/json' \
  -H 'X-CSRF-Protection: foodbridge' \
  -d '{"name":"Example Donor","email":"donor@example.test","password":"a unique example password","role":"donor"}' \
  http://localhost:5000/api/auth/register

curl -b /tmp/foodbridge-cookies.txt http://localhost:5000/api/auth/me
```

Use your own account details. Cookie files contain sessions and must not be committed.

## Architecture and frontend

```text
client/src/
  auth/          Session context, restoration, auth actions
  components/    Existing layout, protected routes, fields, session status
  pages/         Landing, login/registration, dashboard, not-found page
  utils/         Credentialed API client and CSRF request headers
  App.jsx        Public and role-protected routes
  styles.css     Existing forest/off-white identity plus auth/workspace styles
server/src/
  config/        Validated environment, MongoDB lifecycle
  models/        User schema, unique email index, private fields
  services/      Authentication, password hashing, JWT/cookie lifecycle
  controllers/   Auth and safe profile HTTP handlers
  middleware/    Authentication, role checks, CSRF, database readiness, errors
  routes/        Health, auth, user/profile and dashboard access routes
  utils/         Strict input validation and shared HTTP error
server/scripts/  Development-only admin bootstrap
server/test/     API foundation and auth/security tests
```

Public routes: `/`, `/login`, `/register`. Registration accepts `?role=donor`, `?role=ngo`, or `?role=volunteer`. `/dashboard` redirects to the signed-in role. `/dashboard/donor`, `/dashboard/ngo`, `/dashboard/volunteer`, and `/dashboard/admin` require a session and the matching role; wrong-role visitors go to their own dashboard. These browser guards improve UX; API middleware independently enforces authorization.

The auth provider restores via `/api/auth/me` and distinguishes session absence from network/service errors. Sessions remain in HttpOnly cookies, never localStorage. Forms provide loading states, labelled inputs, validation feedback, and keyboard focus styles. Dashboard shells include a sidebar, account summary, editable profile, logout, and clearly marked upcoming modules. No operational metrics or fake activity are shown. The existing landing design remains intact, with no new external services or remotely hosted visual assets.

## Verification

```sh
npm run lint
npm test
npm run build
```

Tests run without MongoDB. Supertest exercises the actual routes, JWT signing/verification, cookies, CSRF, bcrypt, role middleware, and validation while database operations are isolated using spies on the Mongoose model. Model validation and serialization remain real. These tests do not replace checking a real MongoDB connection/index in your environment.

Frontend tests cover landing preservation, login, registration roles, session restoration/loading/failure/retry, all four dashboard redirects, profile saves, accessible errors, and logout success/failure. Backend tests cover registration, normalized duplicates and unique-index races, password hashing/limits, input rejection, invalid login, auth and role denial, profile mass assignment, logout/token revocation, cookies, CSRF, credentialed CORS, and rate limits, alongside the original health tests.

Manual smoke check with MongoDB: register each public role (NGOs need an organization), reload the dashboard, edit the profile, try another role’s dashboard URL, and log out. Bootstrap the initial admin once and confirm its dashboard. No account fixtures or real credentials are committed.

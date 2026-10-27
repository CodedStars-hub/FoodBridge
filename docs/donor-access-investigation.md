# Local donor access investigation

## Findings

The current backend does **not** require donor verification before creating a donation. The sidebar's previous “pending account” wording represented `verificationStatus`, not a disabled account. NGOs require verification to request food, and volunteers require verification for eligible pickup operations; those rules are unchanged.

On the existing localhost frontend (5173) and backend (5001), a newly registered isolated donor had `role=donor`, `verificationStatus=pending`, and a valid cookie session. `GET /api/auth/me` returned 200, the Create Donation form rendered without an alert, and `POST /api/donations` returned 201. Its exact test account and donation were removed afterward.

A controlled stale-role reproduction produced the reported message:

1. Restore the isolated pending donor's session and open `/dashboard/donor/donations/new`.
2. Change only that disposable account's database role to volunteer, leaving the open browser's in-memory donor user unchanged.
3. `GET /api/auth/me` returns 200 with the current volunteer role.
4. Submit the still-open donor form: `POST /api/donations` returns **403** with “You do not have permission to access this resource”.
5. The backend check is `authorizeRoles('donor')` in `server/src/routes/donationRoutes.js`, implemented in `server/src/middleware/auth.js`. `requireAuth` loads the current database user; the JWT supplies identity/version, not an authoritative cached role.

This is expected server-side RBAC enforcement, with misleading frontend recovery guidance. The generic API message previously appeared verbatim with no account-refresh action. The shared frontend authentication context restores a session on initial load but can retain an outdated role while a page remains open. No Vercel migration regression was found in the tested pending-donor flow.

**Limit:** the original user's browser session was not accessible. A fresh pending donor did not reproduce an immediate page-load error. The stale-role scenario reproduces the exact submission error but does not prove that the original account's role changed. The original browser's failing method/path/status and current `/api/auth/me` role remain necessary if the problem persists. The create form itself does not fetch `/api/donations/new` or require an eligibility API before rendering.

## Minimal fix

- `client/src/pages/DonationFormPage.jsx`: distinguish the backend's exact role-denial 403 from other errors; explain donor-only access and possible stale account details, and provide **Refresh account** using the existing session restoration action. A refreshed NGO/volunteer session follows the existing protected-route redirect. Do not retry the mutation automatically. Keep CSRF, ownership, validation, and other errors distinct. Clarify that pending donors may publish.
- `client/src/pages/DashboardPage.jsx`: label the sidebar status “pending verification” rather than “pending account”, without changing its styling or status value.
- `client/src/DonorWorkspace.test.jsx`: cover pending eligibility guidance, stale-role 403 recovery to NGO/volunteer workspaces, and independent CSRF error presentation.
- `server/test/donations.test.js`: test fresh database role enforcement after donor session restoration; include volunteer rejection in image authorization checks.
- `docs/donor-access-investigation.md`: record evidence and limits.

No backend application code, verification rule, JWT, CSRF, Origin policy, cookie setting, schema, or real user account was changed. Existing uncommitted Vercel Phase 1 changes were preserved.

## Verification

- Frontend: **141 passing tests**.
- Backend: **227 passing tests**, using an isolated MongoDB replica set.
- ESLint and formatting checks: passed.
- Production build: passed.
- Live localhost Chrome: pending donor registration/session restoration/form rendering/donation creation passed. The controlled stale-role case reproduced the exact POST 403. Desktop/mobile guidance and account-refresh recovery were checked separately.
- Live Cloudinary with an isolated local replica set: authenticated owner upload, image rendering in Chrome, replacement, deletion, inventory preservation, wrong-role/non-owner/CSRF rejection, and idempotent orphan cleanup passed. All three generated provider assets were removed. No real database records were used for the Cloudinary workflow.
- Browser screenshots: `/tmp/foodbridge-donor-access-guidance-1440.png` and `/tmp/foodbridge-donor-access-guidance-375.png`.
- Test accounts created against the existing localhost app were removed using exact generated email/ID guards. Real accounts and environment files were left unchanged.

## Manual action for the affected browser

Use **Refresh account**, or reload/sign out and sign in with the intended donor account. Pending donor verification does not require an approval action to publish. If the restored account has an NGO or volunteer role, use an actual donor account; privileged roles must not be changed through profile editing. If `/api/auth/me` still reports donor and submission returns 403, retain only the request method/path/status and response message for further diagnosis—never share cookies or JWTs.

No deployment or commit was performed.

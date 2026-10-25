# Milestone 3: donations and reservations

Milestone 4 extends this workflow with optional locations and volunteer logistics; see [Milestone 4](milestone-4-api.md) for the current location-privacy amendments and pickup mappings. The direct reservation/inventory rules below remain authoritative.

All endpoints require a valid HttpOnly session cookie. Mutations also require an exact allowlisted `Origin`, `Content-Type: application/json`, and `X-CSRF-Protection: foodbridge`, as with authentication. Unknown fields are rejected. IDs are MongoDB ObjectId strings. Existing auth and profile contracts remain unchanged.

## Inventory and state machine

Quantities are **whole positive units**, at most 1,000,000. Supported units: `servings`, `items`, `packs`, `kg`, `grams`, `litres`, `millilitres`. Use grams/millilitres instead of fractional kilograms/litres. A donation always satisfies:

```text
quantity = remainingQuantity + reservedQuantity + completedQuantity
```

`remainingQuantity` means available, unreserved inventory. `reservedQuantity` covers both accepted and handed-over reservations awaiting receipt. `completedQuantity` records permanently received food. A pending request does not reserve stock. Multiple NGOs can request the same food; the donor decides which to accept.

| Current request     | Action       | Who              | Next state    | Inventory change                                           |
| ------------------- | ------------ | ---------------- | ------------- | ---------------------------------------------------------- |
| none                | submit       | Verified NGO     | `pending`     | None                                                       |
| pending             | `accept`     | Owning donor     | `accepted`    | Available − quantity; reserved + quantity                  |
| pending             | `reject`     | Owning donor     | `rejected`    | None                                                       |
| pending             | `cancel`     | Requesting NGO   | `cancelled`   | None                                                       |
| accepted            | `cancel`     | Requesting NGO   | `cancelled`   | Reserved − quantity; available + quantity                  |
| accepted            | `handover`   | Owning donor     | `handed_over` | None; reservation remains held                             |
| handed_over         | `receive`    | Requesting NGO   | `completed`   | Reserved − quantity; completed + quantity                  |
| pending or accepted | expiry sweep | Operator command | `expired`     | Accepted quantities released; pending quantities unchanged |

When all food in a listing is received, its remaining pending requests are automatically rejected in that same transaction because they can no longer be fulfilled. All other transitions return HTTP 409. Terminal requests cannot be reopened. An NGO may submit a new request after a previous one closes, if the listing remains available. At most one active (`pending`, `accepted`, `handed_over`) request per donation/NGO pair is enforced by a partial unique database index. Each request stores its unit at submission so closed-request quantities retain their original meaning after later permitted listing edits.

Donor acceptance rechecks the NGO’s current role and verification. Public NGO signup remains pending; there is no public endpoint to verify an account. Pending/rejected NGOs may browse but cannot submit. Existing requesting NGOs may cancel or confirm their own receipt even if their verification later changes, so inventory can be resolved.

Donation statuses: `available` (unreserved stock remains), `reserved` (no unreserved stock), `completed` (all quantity received), `cancelled`, `expired`. A partially completed donation may still be available. Cancelling a listing is allowed only with zero accepted/handed-over stock; its pending requests are cancelled in the same transaction. Completed records remain in history. A wholly completed listing cannot be cancelled.

Edits are deliberately conservative: allowed only before the deadline, while open, with no active request and no completed quantity. This locks food, quantity, unit, collection and declaration terms while any request is active. Resolve pending/accepted requests first. Donation fields are immutable once any food is recorded as received.

## Atomicity and database setup

Atlas supports these workflows. A local MongoDB installation must run as a replica set; a standalone server cannot provide multi-document transactions and workflow mutations fail explicitly. Do not add a non-transactional fallback.

All request creation and transitions, listing edits/cancellation, and expiry updates use Mongoose transactions with snapshot reads and majority writes. Acceptance additionally uses a conditional inventory update requiring sufficient available stock and an unpassed deadline. Every request-related transaction writes the donation’s private workflow version, serializing it with edits, cancellation and expiry. MongoDB write conflicts retry against a fresh snapshot. Request state and inventory either commit together or both roll back; no compensation outside the transaction is required. Do not add network side effects inside retryable callbacks.

Startup initializes the User, Donation and DonationRequest indexes before accepting HTTP traffic. Integration tests use an isolated local single-node replica set, not the configured Atlas database.

## Expiry and donor declarations

The server excludes listings at `pickupDeadline <= now` from exploration immediately, regardless of stored status. Details and donor listings derive their displayed expiry too. The server rejects new submissions, acceptance, and handover after the deadline. An already handed-over request can still be received after that cutoff; it is never silently released.

Persist expiry and close outstanding pending/accepted requests with:

```sh
npm run expire:donations -w server
```

The command loads `server/.env`. It processes each expired open donation in a transaction, closes pending/accepted requests, and releases accepted stock. It also resolves outstanding requests on listings already marked expired by an earlier late cancellation/receipt. Repeated runs are idempotent; simultaneous runs serialize on the same donation. A failed run can be safely retried. Schedule this command, for example every five minutes, with your deployment scheduler. No scheduler or additional external service is installed here. Inventory released on an expired listing remains unavailable to exploration.

Before the sweep, an expired pending/accepted request may still display its stored request state with the expired pickup time. NGOs can cancel pending/accepted requests before or after the cutoff. Receipt remains possible for already handed-over food.

Preparation time, storage, packaging, handling, allergens and pickup deadlines are **donor declarations, not food safety certifications**. No safety scoring, validation service, matching, maps, uploads, volunteer assignment or analytics is implemented.

## Donation contracts

| Method | Path                          | Access                    | Result                                                |
| ------ | ----------------------------- | ------------------------- | ----------------------------------------------------- |
| POST   | `/api/donations`              | Donor                     | 201 `{ donation }`                                    |
| GET    | `/api/donations`              | Any authenticated account | `{ items, pagination }`, available and unexpired only |
| GET    | `/api/donations/mine`         | Donor                     | Own listings including closed/expired                 |
| GET    | `/api/donations/:id`          | Any authenticated account | `{ donation }`                                        |
| PATCH  | `/api/donations/:id`          | Owning donor              | Validated partial edit; `{ donation }`                |
| POST   | `/api/donations/:id/cancel`   | Owning donor              | `{ donation }`; send `{}`                             |
| POST   | `/api/donations/:id/requests` | Verified NGO              | 201 `{ request }`                                     |

Create body (timestamps are illustrative; use a current preparation time and future deadline):

```json
{
  "title": "Campus rice bowls",
  "category": "prepared-meals",
  "description": "Surplus bowls from the cafeteria lunch service",
  "quantity": 20,
  "unit": "servings",
  "preparationTime": "2026-10-25T06:00:00.000Z",
  "pickupDeadline": "2026-10-25T09:00:00.000Z",
  "storageConditions": "Kept refrigerated after preparation",
  "packagingDetails": "Sealed food containers",
  "handlingDetails": "Keep upright and refrigerated during transport",
  "allergenInformation": "Contains sesame; other allergens unknown",
  "pickupLocation": "College cafeteria collection desk",
  "imageUrl": ""
}
```

All fields except `imageUrl` are required. Categories: `prepared-meals`, `produce`, `bakery`, `dairy`, `packaged`, `other`. Preparation must not be in the future; pickup must be in the future and later than preparation. All dates must be ISO datetime strings with timezone offsets. A supplied image URL must be HTTPS; it is displayed as an external link rather than fetched or uploaded by the application.

The server controls donor, inventory counts, status, workflow version and timestamps. PATCH accepts only create fields and must contain at least one field. The server rejects inventory/status/ownership mass assignment.

Both listing endpoints accept `page` (default 1, maximum 10,000), `limit` (default 12, maximum 50), `category`, `unit`, `q` (literal title substring, maximum 100 characters). `mine` additionally accepts `status`; the available endpoint accepts only `status=available`. Results sort newest first with ObjectId as tie-breaker. Pagination returns `{ page, limit, total, pages }`; empty results have `pages: 0`.

## Request and history contracts

Submit body:

```json
{ "requestedQuantity": 4, "message": "For our community kitchen" }
```

`message` is optional (up to 1,000 characters). Quantity must fit currently available stock on submission. It is checked again on acceptance, which is the actual reservation point.

| Method | Path                    | Access                         | Result                                            |
| ------ | ----------------------- | ------------------------------ | ------------------------------------------------- |
| GET    | `/api/requests`         | Donor or NGO                   | Own incoming requests or own submitted requests   |
| GET    | `/api/requests/history` | Donor or NGO                   | Own completed/rejected/cancelled/expired requests |
| PATCH  | `/api/requests/:id`     | Actor specified in state table | `{ request }`                                     |

Transition body: `{ "action": "accept" }`, with action one of `accept`, `reject`, `cancel`, `handover`, `receive`.

Both GETs accept `page`, `limit`, and `status`. History accepts only terminal statuses. Lists populate donation summaries, donor name/organization and NGO name/organization; they do not expose account email, phone, password hash or token version. History is based on persisted request status and timestamps, never demonstration data. UI dates use the viewer’s local timezone. History is scoped to the requesting NGO or the listing’s donor, never all community activity.

## Errors

The existing `{ "error": { "message": "...", "fields": { "field": "message" } } }` shape is preserved. `fields` appears on schema validation errors only.

- 400: bad ID, quantity, dates, query, unknown/privileged fields
- 401: no valid session
- 403: wrong role/owner/requesting NGO, unverified NGO, missing CSRF protection
- 404: donation or request not found
- 409: insufficient stock, duplicate active request, expired/closed listing, invalid transition, edit/cancel conflict
- 503: account database unavailable or non-replica-set transaction deployment

Concurrent acceptance may return 409 even after the page previously displayed enough inventory. Refresh and resolve the pending request; never optimistically decrement inventory in the client.

## Manual smoke test

1. Sign in as a donor and create a donation with clear declarations and a future pickup deadline.
2. Register an NGO. Confirm it can explore but cannot request while pending.
3. Using a trusted database administration session, verify only the intended NGO:

   ```javascript
   db.users.updateOne(
     { email: 'chosen-ngo@example.test', role: 'ngo' },
     { $set: { verificationStatus: 'verified' } },
   );
   ```

   Replace the example email and select the actual FoodBridge database first. This is a manual operator action; no public verification API is introduced. Reload the NGO session to reflect the change.

4. Submit a partial request. Donor accepts; confirm remaining stock decreases and reserved stock increases.
5. Cancel as the NGO and confirm stock is restored. Submit again, accept, mark handed over, then confirm receipt as the NGO. Confirm completed quantity and history.
6. Try another donor’s edit URL, request twice, accept excess inventory, and act after the deadline. Each must be rejected by the server.
7. Run the expiry command twice; confirm the second run makes no additional changes.

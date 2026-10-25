# Milestone 4: matching, nearby discovery and volunteer logistics

Milestone 4 extends the existing User, Donation and DonationRequest models. There is no duplicate reservation or assignment collection. Every pickup is an optional subdocument of its accepted DonationRequest; its API ID is the existing request ID. The Milestone 3 inventory invariant remains unchanged:

```text
quantity = remainingQuantity + reservedQuantity + completedQuantity
```

Transportation actions never reserve, release or complete food by themselves. Only the existing request acceptance/cancellation, expiry and receipt workflows change inventory. See [Milestone 3](milestone-3-api.md) for those contracts; the amendments below govern optional logistics and coordinate privacy.

## Locations and indexes

GeoJSON format, always **longitude first**:

```json
{ "type": "Point", "coordinates": [77.5946, 12.9716] }
```

Longitude must be −180…180 and latitude −90…90, both finite numbers. Exactly two numbers and `type: "Point"` are required. Zero is valid and never treated as a missing value. No default coordinate is fabricated.

- `PATCH /api/users/me` additionally accepts `location` (Point or null) and `address` (plain text, up to 500 characters). This applies to donors, NGOs and volunteers in the existing User model. These fields are private/select-false and included only in the account’s own auth/profile response. No account-location directory is exposed.
- Donation create/edit additionally accepts `location` (Point or null). Existing `pickupLocation` is its human-readable collection address. Donor profile coordinates are never silently copied to a listing; the collection point must be entered explicitly.
- User.location and Donation.location each have a `2dsphere` index. Missing/null fields are not indexed. Startup initializes these indexes using the existing model initialization. No migration is needed for records without locations; edit them explicitly when location discovery is wanted.
- Donation editing still respects all Milestone 3 active-request and completed-quantity locks, including location edits.
- Requests without coordinates continue to support normal browsing, reservations and direct handover. They are excluded from geospatial results and cannot enable volunteer delivery until collection and destination coordinates are supplied.

## Discovery endpoints

Both endpoints require authenticated **NGO** accounts. Pending NGOs can browse results but cannot submit food requests. All mutation CSRF/cookie requirements from Milestone 2 remain in effect.

| Method | Endpoint                         | Purpose                                               |
| ------ | -------------------------------- | ----------------------------------------------------- |
| GET    | `/api/donations/nearby`          | Available donations within radius, nearest first      |
| GET    | `/api/donations/recommendations` | Eligible donations ranked by explained matching score |

Query parameters:

| Parameter               | Meaning                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `longitude`, `latitude` | Optional pair; otherwise use the NGO’s private saved location                                                 |
| `radiusKm`              | Positive straight-line radius; defaults to configured 10 km, capped by configured maximum (100 km by default) |
| `quantity`              | Whole positive requested amount, maximum 1,000,000; required for recommendations                              |
| `unit`                  | Existing donation unit; required with quantity, including nearby quantity filters                             |
| `category`              | Optional existing category filter                                                                             |
| `page`, `limit`         | Existing pagination convention; default 1/12, limit maximum 50                                                |

If neither coordinates nor a saved location exists, return 400 with guidance to supply them. Normal `/api/donations` remains usable without coordinates. Coordinates are validated before a MongoDB query. No geocoding or external AI provider is used.

MongoDB `$geoNear` uses Donation.location’s 2dsphere index with a radius in metres. Mandatory filters run before ranking: stored availability, remaining stock greater than zero, unpassed pickup deadline, valid indexed coordinates, matching unit/category where supplied, and enough remaining quantity to fulfill the entire requested amount. Cancelled, reserved-out, expired and completed donations cannot appear.

A response has `items`, existing `pagination`, `eligibility`, `asOf`, and `assumptions`. Each item has an approximate `distanceKm`. Recommendations also have a `match` explanation:

```json
{
  "score": 62,
  "components": { "distance": 80, "quantity": 50, "pickupTime": 50 },
  "weights": { "distance": 0.4, "quantity": 0.35, "pickupTime": 0.25 },
  "requestedQuantity": 5,
  "availableQuantity": 10,
  "unit": "servings",
  "fulfillment": "complete",
  "distanceKm": 2,
  "minutesRemaining": 120,
  "windowMinutes": 240
}
```

`eligibility.excludedInsufficientQuantity` counts otherwise available in-radius, same-unit/category listings that do not meet the amount. They are **excluded**, not presented as complete or silently partial fulfillment. `partialFulfillment` is always false. Empty results explain this condition in the UI. Recommendations do not reserve stock; submission and acceptance recheck it transactionally.

### Explainable scoring

For requested quantity **q**, available quantity **a ≥ q**, radius **R**, approximate straight-line distance **d**, minutes until deadline **m > 0**, and configured pickup window **H**:

```text
D = clamp(100 × (1 − d/R), 0, 100)
Q = 100 × q/a
T = clamp(100 × m/H, 0, 100)
score = round(0.40 × D + 0.35 × Q + 0.25 × T, 2)
```

The default H is 240 minutes. Distance is rounded to 0.1 km before scoring, and public markers are rounded to two decimal places. Quantity favours a close fit over large excess; there is no conversion between units. Time favours a feasible remaining collection window, saturating after H minutes; it does not favour urgency or infer travel time. These are operational preferences, not food safety predictions or certifications.

The algorithm is deterministic for the same inventory, location, configuration and `asOf` time. Results sort by score descending, rounded distance ascending, deadline ascending, then ObjectId ascending. Nearby results sort by actual geospatial distance then ObjectId. Pagination is applied after ranking all eligible results, not to a nearest-only candidate subset.

## Privacy and maps

- Normal listing and discovery responses redact exact collection address/coordinates from non-owners. They may include `areaLocation` (rounded Point) and `locationPrecision: "approximate"`. This amends the earlier browse-address behavior; missing-coordinate records still work through the same APIs.
- Exact donation details are available to the owning donor or an NGO with an accepted, handed-over or completed request. Other account profile locations are never populated into discovery.
- Pickup destinations are explicit snapshots of the NGO’s private address/location when it opts into volunteer transport. Profile edits do not move a live assignment. Cancel and rearrange transportation before handover to change the destination.
- Available volunteers see rounded collection/delivery areas, never exact addresses. The participating donor and NGO see their arranged stops. Only the **currently assigned** volunteer sees exact stops while assigned/en route/picked up. Released/reassigned volunteers lose exact access on subsequent API reads immediately, and uncollected stops are hidden after the cutoff even before the expiry sweep; cancelled/delivered volunteer history is coarse. Matching/radius search is useful discovery, not a guarantee against inference from repeated geographic queries.
- Volunteer profile coordinates are never shared with donors or NGOs. This milestone does not perform continuous GPS tracking. Volunteer display names are shown for assignments; private phone/email/profile address are not.
- Leaflet maps are optional and lazy loaded. No tile requests occur until **Show optional map** is selected. Textual addresses and workflow actions remain available if maps are hidden, blocked or unavailable.
- Default tiles: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, with visible OpenStreetMap contributor attribution. Browser User-Agent/Referer are retained; tile images explicitly use `strict-origin-when-cross-origin`. Browser caching headers are respected. There is no scraping, bulk download, prefetch, offline map cache, road route or ETA calculation.
- Follow [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/) when hosting. Keep a public application/contact URL, preserve attribution and an HTTP Referer, and ensure CSP permits the selected tile host under `img-src`. Do not set a referrer policy that strips the tile Referer. Tiles are best-effort; do not rely on them for workflow correctness. Configure an appropriate OSM-compatible tile endpoint if deployment traffic exceeds this public service’s usage policy.

## Pickup endpoints

All IDs below are the existing DonationRequest `_id`.

| Method | Endpoint                   | Permission / result                                                                                                                                    |
| ------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/api/requests/:id/pickup` | Requesting NGO; accepted request, future pickup, collection coordinates and NGO address/coordinates required. Send `{}`. Returns 201 `{ assignment }`. |
| GET    | `/api/pickups/available`   | Verified volunteers; awaiting claim, accepted request, open donation and unpassed deadline only                                                        |
| GET    | `/api/pickups/mine`        | Donor’s reservations, NGO’s reservations, or volunteer’s current/previously claimed assignments                                                        |
| GET    | `/api/pickups/:id`         | Participating donor/NGO, assigned/previous volunteer, or verified volunteer while available (coarse preview)                                           |
| POST   | `/api/pickups/:id/claim`   | Verified volunteer; send `{}`; returns `{ assignment }`                                                                                                |
| PATCH  | `/api/pickups/:id`         | Allowed pickup action; returns `{ assignment }`                                                                                                        |
| PATCH  | `/api/requests/:id`        | Existing donor `handover` and NGO `receive` confirmations remain authoritative                                                                         |

Pickup list endpoints support `page`, `limit`, optional pickup `status`. Available accepts only `awaiting_volunteer` as its status filter. Claim/setup do not accept client-controlled volunteer, status, stops or inventory. Assignment responses contain the request ID/status/quantity/unit, donation title/deadline, pickup status, authorized stop views, volunteer display name, `canClaim`, `assignedToMe`, and previous-assignment indicator. Authorized detail includes workflow events (action/status/time/reason) and any delivery issue.

PATCH body examples:

```json
{ "action": "start" }
```

```json
{
  "action": "report_failure",
  "reason": "Vehicle unavailable before collection"
}
```

Allowed actions: `start`, `release`, `cancel`, `report_failure`, `arrive`. `reason` is optional except for `report_failure`; maximum 1,000 characters. There is deliberately no volunteer `handover`, `receive`, or `delivered` mutation. NGOs confirm actual receipt through the existing request endpoint.

### State machine and reservation mapping

| Pickup state                   | Action / actor                                     | Next pickup state                                    | Existing request / inventory                                                                    |
| ------------------------------ | -------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| absent or cancelled            | arrange / requesting NGO                           | awaiting_volunteer                                   | Must already be accepted; inventory unchanged                                                   |
| awaiting_volunteer             | claim / verified volunteer                         | assigned                                             | Accepted; inventory unchanged                                                                   |
| assigned                       | start / assigned, still-verified volunteer         | en_route_to_pickup                                   | Accepted; inventory unchanged                                                                   |
| assigned or en_route_to_pickup | donor confirms actual handover                     | picked_up                                            | Existing request becomes handed_over; reserved stock remains held                               |
| picked_up                      | NGO confirms actual receipt                        | delivered                                            | Existing request becomes completed; reserved becomes completed quantity once                    |
| assigned or en_route_to_pickup | release / current volunteer                        | awaiting_volunteer (or cancelled if deadline passed) | Reservation remains accepted; no stock restoration                                              |
| uncollected states             | cancel transportation / participating donor or NGO | cancelled                                            | Reservation stays accepted; direct handover or fresh arrangement remains possible before cutoff |
| pending/accepted request       | NGO cancels reservation                            | cancelled if arranged                                | Existing cancellation restores accepted stock exactly once                                      |
| uncollected states at cutoff   | existing expiry sweep                              | cancelled                                            | Existing request expires and accepted stock is released transactionally                         |
| picked_up                      | volunteer reports arrival                          | picked_up                                            | Arrival timestamp only; **not received/delivered**                                              |
| assigned/en_route_to_pickup    | volunteer reports failed collection                | awaiting_volunteer (cancelled past deadline)         | Another volunteer can claim; accepted inventory remains held                                    |
| picked_up                      | volunteer reports delivery issue                   | picked_up with issue                                 | Physical custody retained; coordinate resolution with participants; no inventory restoration    |

Invalid transitions return 409; wrong actors return 403. Start and claim enforce the pickup cutoff. Donor handover still enforces that cutoff and rechecks volunteer eligibility. A volunteer can release an uncollected assignment even after losing verification; they cannot start or newly claim until verified again. Donor handover may occur from assigned or en route because it records the donor’s actual physical confirmation.

### Atomicity, cancellation and direct handover

Claims use a conditional MongoDB update requiring `request.status=accepted`, `pickup.status=awaiting_volunteer`, and no current volunteer. The action runs inside the existing snapshot/majority transaction and writes the shared Donation workflow version; concurrent claims, request cancellation, handover and expiry serialize. Only one claim commits. All pickup changes share that lock; no external requests run inside retryable callbacks. Tests inject persistence failures to verify rollback.

Transportation-only cancellation **does not cancel the food reservation**. To restore accepted food, the NGO must cancel the original request (or the existing expiry sweep must run). Cancelling logistics before handover allows the original direct-handover path. Arranging a new attempt updates the same request/pickup, snapshots fresh stops, clears the current volunteer, and retains workflow events. It never creates a second reservation.

Once food is handed over, no release, reassignment, reservation cancellation or expiry may put that stock back into available inventory. A delivery problem is recorded and visible to participants; its resolution requires actual NGO receipt after coordination, not a false successful delivery or automatic inventory rollback. Receipt may be confirmed after the pickup cutoff for food already handed over. Arrival is informational and may only be reported once.

## Configuration

No new secrets, AI providers, paid mapping services, uploads, email or notification/analytics infrastructure are required. Existing Atlas/replica-set and JWT/CSRF setup remains unchanged.

Optional backend variables in `server/.env` (defaults below):

```dotenv
GEO_DEFAULT_RADIUS_KM=10
GEO_MAX_RADIUS_KM=100
MATCH_DISTANCE_WEIGHT=40
MATCH_QUANTITY_WEIGHT=35
MATCH_TIME_WEIGHT=25
MATCH_PICKUP_WINDOW_MINUTES=240
```

Weights must be 0–100 and sum to 100. Radius default must not exceed maximum; hard maximum is 200 km. Pickup window must be positive and at most 10,080 minutes. Invalid configuration stops startup without printing secrets.

Optional public frontend configuration:

```dotenv
VITE_OSM_TILES_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
```

The default works without this variable. A custom endpoint must meet its provider’s policies and remain OSM-compatible with accurate attribution. Never put secrets in `VITE_*` variables.

## Manual verification

1. Use the existing Atlas connection or a MongoDB replica set. Run `npm install`, then `npm run dev`. Startup creates the geospatial indexes.
2. Donor: create a donation with a collection address, longitude and latitude. Older donations with no coordinates must still appear in ordinary browsing and support direct handover.
3. NGO: set its own delivery address and coordinates in My profile. Test Nearby and Recommended Donations with a quantity/unit. Check explanations, radius limits and the explicit insufficient-stock message. Open the optional map and confirm attribution. Close/disable it; the page must remain usable.
4. Use trusted database administration to verify the intended NGO and volunteer (roles must match the intended accounts):

   ```javascript
   db.users.updateOne(
     { email: 'chosen-volunteer@example.test', role: 'volunteer' },
     { $set: { verificationStatus: 'verified' } },
   );
   ```

   Use the equivalent query for the intended NGO. Select the actual application database; these are operator actions, never public signup permissions. Reload sessions to refresh UI verification status.

5. NGO requests food; donor accepts. NGO chooses Arrange volunteer pickup and consents to sharing its destination with the participants.
6. Two verified volunteers try to claim simultaneously: exactly one succeeds. Confirm another volunteer cannot read the exact destination. Release and reassign; the first volunteer must immediately lose precise access.
7. Assigned volunteer starts collection. Donor confirms handover in Incoming Requests. Volunteer reports arrival; the request must remain handed_over. Only NGO receipt confirmation completes it and changes inventory.
8. Test transportation cancellation then direct handover, NGO reservation cancellation with stock restoration, and a failed collection followed by reassignment. After handover, a delivery issue must retain reserved stock until actual receipt.
9. Test an expired uncollected assignment: claim/start/handover fail, availability excludes it, and `npm run expire:donations -w server` cancels logistics and expires/releases the accepted reservation idempotently. Picked-up stock must not be released.
10. Run `npm test`, `npm run lint`, `npm exec prettier -- --check .`, and `npm run build`. Donation, geospatial and concurrency integration tests use an isolated local MongoDB replica set and never use your Atlas data.

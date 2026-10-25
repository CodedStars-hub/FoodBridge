# Milestone 5 API

All endpoints require an existing cookie-authenticated session. Mutations require an allowlisted `Origin` and `X-CSRF-Protection: foodbridge`. Send JSON `{}` for bodyless mutations. Errors retain `{error:{message,fields?}}`. Existing reservation, direct-handover, expiry, location privacy and pickup state machines remain authoritative; see [Milestone 3](milestone-3-api.md) and [Milestone 4](milestone-4-api.md).

## Analytics

`GET /api/analytics/:role`, where role is `donor`, `ngo`, `volunteer` or `admin`. Only the caller's exact role is permitted; admins do not impersonate other roles. Optional `from=YYYY-MM-DD&to=YYYY-MM-DD` dates are inclusive UTC dates. Default: first day eleven months before this month through today. Maximum span: 732 days; unknown parameters, impossible dates and reversed ranges return 400.

Response contains `role`, `range:{from,to,timezone}`, `generatedAt`, `summary`, `quantitiesByUnit:[{unit,quantity,receipts}]`, zero-filled `monthly:[{month,donations,requests,receipts,pickups,users}]` and `notes`.

| Role      | Summary                                                                                            | Additional data                                                 |
| --------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| donor     | totalDonations, activeDonations, completedDonations, completedReceipts                             | Own listings and confirmed receipts only                        |
| ngo       | totalRequests, acceptedRequests, completedReceipts                                                 | Own requests/receipts only                                      |
| volunteer | availableAssignments, activeAssignments, completedPickups                                          | pickupHistory, most recent ten records involving this volunteer |
| admin     | totalUsers, totalDonations, activeDonations, completedDonations, completedReceipts, completionRate | usersByRole, platform monthly registrations/listings/receipts   |

Counting definitions:

- Listing/request/user counts select records **created** in the date range, reporting their current state. Active listings are available/reserved with a future pickup deadline. Completed listings use the existing `completed` donation status: one partial receipt does not complete an entire listing.
- NGO acceptedRequests means accepted or handed_over, awaiting receipt. Completed requests are counted separately.
- Redistributed quantities select completed requests by explicit `receivedAt`, independently of listing/request creation dates. No accepted, reserved, handed-over or volunteer-arrival quantity counts as received. Grouping uses the immutable request unit. Kilograms, servings, boxes and every other unit remain separate; no aggregate food quantity or speculative impact estimate is returned.
- New transitions record acceptedAt, handedOverAt and receivedAt. Older completed requests fall back to updatedAt; `legacyReceiptTimestamps` and response notes disclose this limitation. No migration fabricates historical timestamps.
- Admin completionRate is completed listings / all listings created in range × 100, rounded to two decimal places; empty denominator returns 0. It is a listing completion rate, not a food safety or food quantity measure.
- Volunteer availability/active counts are live snapshots, independent of dates. Only verified volunteers see available assignments. Completed pickups require both delivered pickup and completed request, filtered by receipt time. History includes released assignments using existing claim events, filtered by updatedAt, with no private stop coordinates.
- MongoDB aggregation pipelines perform filtering, grouping, facets and bounded lookups. Added indexes cover donation donor/createdAt and createdAt/status, request NGO/createdAt, receipt status/date, volunteer/status and claim history, and user createdAt/role. Existing inventory indexes remain intact. Date filtering is capped; history is bounded.

## Durable notifications

| Method | Endpoint                                         | Result                                                  |
| ------ | ------------------------------------------------ | ------------------------------------------------------- |
| GET    | `/api/notifications?page=1&limit=20&unread=true` | items, unreadCount, pagination:{page,limit,total,pages} |
| PATCH  | `/api/notifications/:id/read`                    | notification; idempotent; foreign ID returns 404        |
| PATCH  | `/api/notifications/read-all`                    | unreadCount:0                                           |

Page range 1–10000; limit 1–50. `unread=false` or omission returns all. Items expose id, type, message, requestId, donationId, readAt, createdAt; recipient IDs, internal keys and private location data are omitted. All queries and writes constrain recipient to the authenticated caller; no client-supplied recipient field is accepted.

Request submission, acceptance/rejection, claim, pickup status changes (including arrange/release/issues), handover, receipt, request cancellation, donation cancellation, automatic rejection and expiry persist notifications to affected participants other than the actor. Cancellation of a listing notifies participants of its requests; a listing without requests has no other participant to notify. Messages describe recorded events, not food safety.

`Notification` is a transactional outbox as well as the inbox. The existing business transaction increments a request notificationVersion and inserts/upserts event rows with unique `(recipient,eventKey)`; transaction retries cannot duplicate committed events. A failed notification database write aborts the whole transaction, preserving inventory atomicity. **External socket delivery never runs inside business transactions.** A failed emission leaves pending rows for retry and cannot undo or corrupt committed workflow state.

The API dispatches batches of at most 100 pending notifications every two seconds. Each user receives `notifications:changed` with an empty payload and refreshes REST data. Duplicate invalidations are harmless. `broadcastAt` means an invalidation attempt was emitted, not a client delivery/read acknowledgement; offline clients still receive their persistent inbox after reconnect. Read state is shared across sessions. MongoDB indexes support recipient/date, unread queries, unique deduplication and pending outbox scans.

### Socket.IO contract

Connect at the API origin's default `/socket.io` path using credentials. The backend authenticates the existing HttpOnly JWT cookie, verifies expiry/signature and loads the current account/session version. Browser Origin must match CLIENT_ORIGINS; missing/foreign origins and client-supplied bearer tokens cannot substitute for the session. The server alone joins `user:<authenticated ID>`. There are no client join-room, recipient selection, or notification-write events.

Events: `notifications:sync` on connection; `notifications:changed` after changes. The client refreshes on connect/reconnect and polls every 30 seconds as fallback. JWT expiry disconnects the socket; logout revokes account sessions and disconnects its sockets. Dispatch checks session version again before sending. Vite proxies `/socket.io` with WebSocket support. Current adapter/outbox worker supports one API process; distributed adapters, operational monitoring and production hosting remain out of scope.

## Cloudinary donation images

Optional **server-only** environment variables:

```dotenv
CLOUDINARY_CLOUD_NAME=REPLACE_WITH_YOUR_CLOUD_NAME
CLOUDINARY_API_KEY=REPLACE_WITH_YOUR_API_KEY
CLOUDINARY_API_SECRET=REPLACE_WITH_YOUR_API_SECRET
```

Obtain actual values from your Cloudinary console and enter them in your existing local `server/.env` without replacing unrelated secrets. Restart the API. Never put these in browser VITE variables. Missing/placeholder configuration returns 503 for image operations; donation details disclose only enabled/limits so the UI can explain unavailable uploads. No credentials are invented or required for other workflows.

| Method | Endpoint                   | Contract                                                                 |
| ------ | -------------------------- | ------------------------------------------------------------------------ |
| POST   | `/api/donations/:id/image` | multipart/form-data, exactly one `file` part; returns `{image,imageUrl}` |
| DELETE | `/api/donations/:id/image` | JSON `{}`; returns `{image:null,imageUrl:"",cleanupPending}`             |

Only the owning donor may upload/replace/delete. NGO, volunteer, admin and other donors cannot modify images. The owner and configuration are checked before buffering a file. Upload limit: 30 per user per 15 minutes (process-local), 5 MiB, JPEG/PNG/WebP only. MIME and magic signature must match; Sharp must successfully decode within a 20-megapixel cap. SVG/GIF, malformed files, extra fields/files and oversized payloads are rejected. The server strips metadata, applies orientation, resizes within 1600×1600 and re-encodes WebP. Cloudinary receives processed bytes using a server-generated scoped UUID public ID, never an arbitrary caller-supplied asset identifier.

Stored donation `image`: publicId, secureUrl, format, bytes, width, height, uploadedAt. `imageUrl` remains synchronized for existing components. Legacy external image URLs continue to work; ordinary listing edits cannot bypass managed image ownership by overwriting imageUrl. Cloudinary public URLs/IDs are not API secrets; food images must not contain private addresses, people or sensitive records. Uploaded photos are publicly accessible through their asset URLs.

Concurrent replacement/deletion uses imageVersion compare-and-set, returning 409 for stale operations. Existing images survive upload failure (502); inventory and reservations are never changed by image operations. New assets are queued for cleanup before upload. On failure or a losing race, compensation attempts deletion. Old images are queued before replacement and removed after the new metadata commits. Cleanup verifies that no donation references an asset before deleting it. Deferred crash cleanup waits one hour; failed deletions retry after a minute. Cleanup tasks persist in MongoDB, and only application-scoped asset IDs can be queued.

The API runs a bounded cleanup batch each minute. For manual retry:

```sh
npm run cleanup:images -w server
```

A deleted image can disappear from the UI before provider deletion succeeds; cleanupPending reports deferred deletion. Provider outages may leave assets until a later successful cleanup. Avoid manually deleting application assets in the Cloudinary console. Upload limits/cleanup reduce orphaning but do not provide a distributed asset transaction.

## Frontend and manual verification

1. Run `npm install`, then existing configured `npm run dev`. Use Atlas or a local replica set. Existing `.env` files must remain ignored. Do not copy examples over working secrets.
2. Open each role's Analytics page. Empty accounts show real zero states. Apply date filters and expand chart data tables; compare completed receipts to request history. Confirm different units never merge. Wrong-role analytics API calls return 403.
3. Use donor and verified NGO sessions in separate browser contexts. Submit a request, accept/reject it and confirm bell updates without reload. Disconnect/reconnect the network; notifications remain in the center. Mark one/all read and reload. Another user's notification ID returns 404.
4. Arrange and claim a volunteer pickup. Change permitted status, confirm donor handover and NGO receipt. Notifications must follow existing workflow events; only confirmed receipt affects redistributed totals. Existing direct handover must work identically. Cancel/release before handover and check restored reservation rules and notifications.
5. After setting real Cloudinary credentials, publish a donor listing and upload a small JPEG/PNG/WebP from its details page. Check the real provider asset, dimensions and metadata; replace then delete. Check that old assets disappear or appear as pending cleanup. Run the cleanup command after restoring a temporary provider outage.
6. Try a renamed text file, oversized file and foreign owner operation: all must fail with clear feedback and unchanged donation/inventory. Restart without Cloudinary configuration: controls explain that uploads are disabled while food workflows work.
7. Check analytics, bell, notification center and image controls at mobile width, with keyboard navigation, Escape and confirmation dialogs. Logout should close live sockets and return to login.

Automated checks: `npm test`, `npm run lint`, `npm exec prettier -- --check .`, `npm run build`. Integration tests use an isolated real MongoDB replica set with transactions, race tests and real image decoding; provider calls are mocked. They do not prove live Cloudinary connectivity. No production deployment is performed in this milestone.

# Matching System Deep Dive

## What the system is trying to do

The app uses a host-rider matching model built around these records:

- `profiles` stores identity, commute preferences, and role flags.
- `ride_templates` stores host trips.
- `ride_requests` stores rider trips.
- `match_suggestions` stores possible matches.
- `pods` and `pod_members` store confirmed carpool groups.

The intended lifecycle is:

`account -> verify email -> save profile -> create ride template/request -> score matches -> store suggestions -> host accepts -> rider confirms -> pod formed`

## What happens when a user signs up

There is no separate “host account” and “rider account”. Every person creates a normal account first, then their profile decides whether they behave as a host, a rider, or both.

The practical order is:

1. User signs up.
2. Email is verified.
3. Profile data is saved.
4. If the profile says the user is a host, a `ride_template` is created.
5. If the profile says the user is a rider, a `ride_request` is created.
6. Matching runs immediately.
7. Suggestions are written to `match_suggestions`.
8. Host approves.
9. Rider confirms.
10. Pod is created or updated.

## Where matching is generated

The live matching path is in the Next.js API routes:

- `src/app/api/rides/templates/create/route.ts`
- `src/app/api/rides/requests/create/route.ts`
- `src/app/api/otp/verify/route.ts`
- `src/lib/matching.ts`

The SQL files in `database/functions/` and `database/migrations/` document older and alternate versions of the same system.

## How matching is scored

`src/lib/matching.ts` calculates compatibility using:

1. Gender preference.
2. Pickup distance.
3. Destination distance.
4. Overlapping route distance.
5. Same-college bonus.

If a pair is incompatible, it is rejected early. If it is compatible, a numeric score is written into `match_suggestions`.

## What happens when a host creates a ride

In `src/app/api/rides/templates/create/route.ts`:

1. The host profile is loaded.
2. Email verification is checked.
3. Route geometry is obtained.
4. The host `ride_template` is inserted.
5. `find_intersecting_requests` is called.
6. Each candidate rider is scored with `calculateMatchScore()`.
7. Compatible matches are inserted into `match_suggestions`.

## What happens when a rider creates a request

In `src/app/api/rides/requests/create/route.ts`:

1. The rider profile is loaded.
2. Email verification is checked.
3. Rider route geometry is obtained.
4. The rider `ride_request` is inserted.
5. `find_intersecting_templates` is called.
6. Each candidate host is scored with `calculateMatchScore()`.
7. Compatible matches are inserted into `match_suggestions`.

## The approval flow

The match lifecycle is host-first:

- `src/app/api/matches/accept/route.ts` changes a match from `pending_host_approval` to `pending_rider_approval`.
- `src/app/api/matches/confirm/route.ts` finalizes the match when the rider confirms.
- `src/app/api/matches/skip/route.ts` and `src/app/api/matches/next/route.ts` move to the next candidate after a skip.

## The real production problem

The bug is not that the scoring code ignores new users.

The real problem is that the visibility and approval flow hides fresh matches behind host approval, and the queue ordering favors older rows.

### Exact failure mode

1. Both creation paths write new suggestions as `pending_host_approval`.
2. `src/app/api/matches/suggestions/route.ts` only exposes `pending_rider_approval` to riders.
3. A newly created rider request therefore does not become visible to the rider immediately.
4. `src/app/dashboard/DashboardContent.tsx` stops fetching suggestions when the user already has an active or pending ride.
5. `src/app/api/matches/queue/route.ts` and `src/app/api/matches/next/route.ts` order by `overall_score DESC` and then `created_at ASC`.

That means older suggestions win ties, and the UI keeps surfacing the oldest visible rows first.

## Why this looked like “first come first serve”

The queue endpoints are explicitly first-come-first-serve on ties:

```ts
.order("overall_score", { ascending: false })
.order("created_at", { ascending: true })
```

So the system is not just scoring by compatibility. It is also using creation time to decide which match appears first when scores are similar.

That does not completely ignore new users, but it does make older rows dominate the visible queue. If the frontend only shows the first result or the first page, newer users can look like they are being skipped.

## What is wrong in one sentence

The matching engine creates candidates, but the host-first status filter and the creation-time queue ordering prevent fresh matches from surfacing fairly, so new users can appear to be ignored even though they were matched.

## Code evidence

- `src/app/api/rides/templates/create/route.ts` and `src/app/api/rides/requests/create/route.ts` insert suggestions with `pending_host_approval`.
- `src/app/api/matches/suggestions/route.ts` only shows riders `pending_rider_approval`.
- `src/app/api/matches/queue/route.ts` sorts by score first, then by `created_at ASC`.
- `src/app/api/matches/next/route.ts` uses the same ordering.
- `src/app/dashboard/DashboardContent.tsx` skips suggestion refresh when the user already has an active or pending ride.

## Conclusion

The issue is a combination of:

- host-first visibility,
- queue ordering by creation time,
- and dashboard gating that suppresses refreshes for active users.

So the symptom is not really “new users are never scored”; it is “new users are not being surfaced by the current matching lifecycle.”

## What should be fixed

1. Decide whether riders should see fresh suggestions before host approval.
2. If yes, expose a safe rider-facing view of `pending_host_approval` matches.
3. Revisit the dashboard gate that skips suggestion fetching for active or pending users.
4. Reconsider whether `created_at ASC` should be the tie-breaker for the queue.
5. Add a backfill/rebuild step for historical users so older accounts do not remain stuck on stale suggestions.

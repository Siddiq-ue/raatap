# Email Verification Fix for Match Suggestions

## Problem Identified

Users with `email_verified != true` in their profiles were being included in match suggestions, even though email verification is required to create rides.

### Root Cause

The `calculate_route_match_score()` function in the matching system **did not check** the `email_verified` status of hosts and riders before creating match suggestions.

**Affected Functions:**
- `calculate_route_match_score()` in `database/deploy_osrm_matching.sql`
- `calculate_route_match_score()` in `database/functions/08_osrm_matching.sql`
- `generate_match_suggestions_for_ride_template()`
- `generate_match_suggestions_for_ride_request()`

### How It Happened

1. **API Layer** ✅ - Correctly checks `email_verified` before allowing ride creation
   - `/api/rides/templates/create` returns 403 if not verified
   - `/api/rides/requests/create` returns 403 if not verified

2. **Database Layer** ❌ - Did NOT check `email_verified` when generating matches
   - Only filtered by `status = 'active'`
   - Did not verify user email status

3. **Scenario**: Users created in the database before email verification was enforced could have:
   - `email_verified = false` (or NULL)
   - Active `ride_request` or `ride_template`
   - These users would appear in match suggestions

---

## Solution Implemented

### 1. Updated Matching Function

Added email verification check to `calculate_route_match_score()`:

```sql
-- Both host and rider must have verified emails
IF (SELECT email_verified FROM profiles WHERE id = template.host_id) IS NOT TRUE THEN
    RETURN json_build_object(
        'compatible', false,
        'reason', 'Host email not verified',
        'error_code', 'HOST_EMAIL_NOT_VERIFIED'
    );
END IF;

IF (SELECT email_verified FROM profiles WHERE id = ride_request.rider_id) IS NOT TRUE THEN
    RETURN json_build_object(
        'compatible', false,
        'reason', 'Rider email not verified',
        'error_code', 'RIDER_EMAIL_NOT_VERIFIED'
    );
END IF;
```

**Files Updated:**
- ✅ `database/deploy_osrm_matching.sql`
- ✅ `database/functions/08_osrm_matching.sql`

---

## What to Do for Current Database Users

### Option 1: Run Cleanup Migration (Recommended)

Execute the migration script to:
1. Identify unverified users with active rides
2. Deactivate their ride templates/requests (set `status = NULL`)
3. Clean up match suggestions involving them

**Steps:**

```sql
-- Run this in Supabase SQL Editor
-- File: database/migrations/22_fix_email_verification_check.sql
```

This will:
- Cancel all active ride templates from unverified users (set `status = NULL`)
- Cancel all active ride requests from unverified users (set `status = NULL`)
- Delete pending/shown match suggestions involving unverified users
- Provide a summary report

### Automatic Reactivation When Verified

**Good news:** When an admin or user verifies the email, their rides will be **automatically reactivated**!

Updated flows:
- ✅ **Admin verify** (`/api/admin/verify-user`) - Reactivates rides when admin approves
- ✅ **OTP verify** (`/api/otp/verify`) - Reactivates rides when user verifies email

Both flows now:
1. Set `email_verified = true`
2. Reactivate any `ride_templates` with `status = NULL`
3. Reactivate any `ride_requests` with `status = NULL`

### Option 2: Manually Verify Legitimate Users

If you have users who should have access but weren't verified:

1. **Use Admin Dashboard:**
   - Go to `/admin`
   - Find the user
   - Click "Verify" to set `email_verified = true`

2. **Or Run SQL Directly:**
```sql
-- Verify specific user
UPDATE profiles 
SET email_verified = true 
WHERE id = 'user-uuid-here';
```

### Option 3: Delete Unverified Users

If you want to completely remove unverified users:

```sql
-- WARNING: This deletes data permanently!

-- First, deactivate their rides
UPDATE ride_templates SET status = 'cancelled' 
WHERE host_id IN (SELECT id FROM profiles WHERE email_verified IS NOT TRUE);

UPDATE ride_requests SET status = 'cancelled' 
WHERE rider_id IN (SELECT id FROM profiles WHERE email_verified IS NOT TRUE);

-- Then delete match suggestions
DELETE FROM match_suggestions
WHERE ride_template_id IN (SELECT id FROM ride_templates WHERE host_id IN (SELECT id FROM profiles WHERE email_verified IS NOT TRUE))
   OR ride_request_id IN (SELECT id FROM ride_requests WHERE rider_id IN (SELECT id FROM profiles WHERE email_verified IS NOT TRUE));

-- Finally delete the profiles
DELETE FROM profiles WHERE email_verified IS NOT TRUE;
```

---

## Deployment Steps

### 1. Deploy Updated Matching Function

Run the updated `deploy_osrm_matching.sql` in Supabase SQL Editor:

```sql
-- This will:
-- 1. Install pg_http extension (if not exists)
-- 2. Recreate calculate_route_match_score() with email verification check
-- File: database/deploy_osrm_matching.sql
```

**Important:** The script will automatically install the `pg_http` extension with schema `extensions`.

### 2. Run Cleanup Migration

Execute the cleanup script:

```sql
-- File: database/migrations/22_fix_email_verification_check.sql
```

### 3. Verify Fix

Check that no unverified users have active rides:

```sql
-- Should return 0 rows
SELECT * FROM ride_templates rt
JOIN profiles p ON p.id = rt.host_id
WHERE rt.status = 'active' AND p.email_verified IS NOT TRUE;

SELECT * FROM ride_requests rr
JOIN profiles p ON p.id = rr.rider_id
WHERE rr.status = 'active' AND p.email_verified IS NOT TRUE;
```

---

## Testing

### Test Case 1: Unverified User Should Not Match

```sql
-- Create test unverified user (if needed)
-- Then try to generate matches
-- Should return: HOST_EMAIL_NOT_VERIFIED or RIDER_EMAIL_NOT_VERIFIED
```

### Test Case 2: Verified Users Should Match Normally

```sql
-- Verified users should continue to get matches as before
SELECT calculate_route_match_score('template-uuid', 'request-uuid');
-- Should return compatible: true if route matches
```

---

## Impact Assessment

### Before Fix
- ❌ Unverified users could appear in match suggestions
- ❌ Security/verification bypass possible
- ❌ Inconsistent with API-level checks

### After Fix
- ✅ Only verified users can participate in matches
- ✅ Consistent verification across all layers
- ✅ Clear error codes for debugging

### User Impact
- **Verified users**: No impact, matching continues normally
- **Unverified users with active rides**: Their rides will be cancelled
- **New users**: Must verify email before creating rides (already enforced)

---

## Error Codes

New error codes added for debugging:

| Error Code | Description |
|------------|-------------|
| `HOST_EMAIL_NOT_VERIFIED` | Host's email is not verified |
| `RIDER_EMAIL_NOT_VERIFIED` | Rider's email is not verified |

These will appear in match calculation results and can be logged for monitoring.

---

## Monitoring

### Check for Issues

```sql
-- Check for failed matches due to email verification
SELECT * FROM activity_logs
WHERE function_name = 'calculate_route_match_score'
  AND details->>'error_code' IN ('HOST_EMAIL_NOT_VERIFIED', 'RIDER_EMAIL_NOT_VERIFIED')
ORDER BY created_at DESC
LIMIT 10;
```

### Track Verification Status

```sql
SELECT 
  email_verified,
  COUNT(*) as user_count,
  COUNT(*) FILTER (WHERE prefer_hosting = true) as hosts,
  COUNT(*) FILTER (WHERE prefer_taking_ride = true) as riders
FROM profiles
GROUP BY email_verified;
```

---

## Summary

**Problem:** Unverified users were included in match suggestions.

**Fix:** Added email verification check to matching function.

**Action Required:** 
1. Deploy updated `deploy_osrm_matching.sql`
2. Run cleanup migration `22_fix_email_verification_check.sql`
3. Verify no unverified users have active rides

**Files Changed:**
- `database/deploy_osrm_matching.sql` - Added email verification check
- `database/functions/08_osrm_matching.sql` - Added email verification check
- `database/migrations/22_fix_email_verification_check.sql` - Cleanup script (NEW)

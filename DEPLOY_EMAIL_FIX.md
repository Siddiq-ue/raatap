# Quick Deployment Guide - Email Verification Fix

## ⚡ Quick Fix (3 Steps)

Run these files **in order** in Supabase SQL Editor:

---

### Step 1: Deploy Updated Matching Function

```sql
-- Copy-paste entire content from:
-- File: database/deploy_osrm_matching.sql
```

**What this does:**
- ✅ Installs `pg_http` extension (required for OSRM API calls)
- ✅ Updates `calculate_route_match_score()` to check email verification
- ✅ Updates `generate_match_suggestions_*()` functions

**Expected output:**
```
CREATE EXTENSION
GRANT
CREATE FUNCTION
CREATE FUNCTION
CREATE FUNCTION
CREATE FUNCTION
CREATE FUNCTION
```

---

### Step 2: Run Cleanup Migration

```sql
-- Copy-paste entire content from:
-- File: database/migrations/22_fix_email_verification_check.sql
```

**What this does:**
- ✅ Finds unverified users with active rides
- ✅ Cancels their ride templates/requests
- ✅ Deletes match suggestions involving them
- ✅ Shows summary report

**Expected output:**
- List of affected users (if any)
- Row counts for updated/cancelled rides
- Summary report showing cleanup complete

---

### Step 3: Verify Fix

```sql
-- Check no unverified users have active rides
-- Should return 0 rows

SELECT 'ride_templates' as source, COUNT(*) as count
FROM ride_templates rt
JOIN profiles p ON p.id = rt.host_id
WHERE rt.status = 'active' AND p.email_verified IS NOT TRUE

UNION ALL

SELECT 'ride_requests' as source, COUNT(*) as count
FROM ride_requests rr
JOIN profiles p ON p.id = rr.rider_id
WHERE rr.status = 'active' AND p.email_verified IS NOT TRUE;
```

**Expected result:**
```
source          | count
----------------|-------
ride_templates  |     0
ride_requests   |     0
```

---

## 🔄 Optional: Regenerate All Matches

If you want to regenerate fresh matches after cleanup:

```sql
-- Regenerate matches for all active rides
SELECT generate_all_matches();
```

---

## ✅ Success Indicators

After deployment, you should see:

1. ✅ No errors when running `deploy_osrm_matching.sql`
2. ✅ Cleanup report shows 0 unverified users with active rides
3. ✅ Match suggestions only involve verified users

---

## 🐛 Troubleshooting

### Error: "function http_get(text) does not exist"

**Fix:** Make sure you run the ENTIRE `deploy_osrm_matching.sql` file from the beginning. The first step installs the extension.

### Error: "permission denied for schema extensions"

**Fix:** You need to be logged in as a Supabase admin. Use the Supabase dashboard SQL editor.

### Error: "extension http already exists"

**Fix:** This is fine! Just skip the `CREATE EXTENSION` line and continue with the rest of the script.

---

## 📊 Check Current State

Before deploying, check current state:

```sql
-- How many unverified users have active rides?
SELECT 
  p.email_verified,
  COUNT(DISTINCT rt.id) as active_templates,
  COUNT(DISTINCT rr.id) as active_requests
FROM profiles p
LEFT JOIN ride_templates rt ON rt.host_id = p.id AND rt.status = 'active'
LEFT JOIN ride_requests rr ON rr.rider_id = p.id AND rr.status = 'active'
GROUP BY p.email_verified;
```

---

## 📝 Files Changed

- `database/deploy_osrm_matching.sql` - Added email verification check + fixed pg_http schema
- `database/functions/08_osrm_matching.sql` - Added email verification check + fixed pg_http schema
- `database/migrations/22_fix_email_verification_check.sql` - Cleanup script (NEW)

# OSRM Matching Setup Guide

## Overview

This guide explains how to set up **pure OSRM-based matching** for the ride-sharing platform.

## What Changed

| Before | After |
|--------|-------|
| Straight-line distance (PostGIS) | Road-based distance (OSRM API) |
| Pickup ≤ 2km | Detour ≤ 5km |
| Destination ≤ 1km | Destination ≤ 3km |
| Fast but inaccurate | Slower but accurate |

## Files Created

```
database/functions/
├── 00_osrm_config.sql           # OSRM configuration & pg_http setup
├── 08_osrm_matching.sql         # Main OSRM matching function
├── 09_osrm_match_generation.sql # Match generation functions
└── 10_osrm_instant_triggers.sql # Auto-match triggers
```

## Deployment Steps

### Step 1: Enable pg_http Extension

Run in Supabase SQL Editor:

```sql
-- Enable HTTP extension for calling OSRM API
CREATE EXTENSION IF NOT EXISTS http;

-- Grant permissions
GRANT EXECUTE ON FUNCTION http_get(text) TO postgres;
GRANT EXECUTE ON FUNCTION http_get(text) TO anon;
GRANT EXECUTE ON FUNCTION http_get(text) TO authenticated;
```

### Step 2: Deploy Functions (In Order)

Run these files **in order** in Supabase SQL Editor:

1. `00_osrm_config.sql` - Configuration
2. `08_osrm_matching.sql` - Main matching function
3. `09_osrm_match_generation.sql` - Match generation
4. `10_osrm_instant_triggers.sql` - Instant triggers

Or run the combined deployment file:

```bash
# In Supabase SQL Editor, run:
database/deploy_osrm_matching.sql
```

### Step 3: Test OSRM Connection

```sql
-- Test with a simple route (Hyderabad CBIT to MGIT)
SELECT 
    (http_get(
        'https://router.project-osrm.org/route/v1/driving/78.3194368,17.3919735;78.3220892,17.391051?overview=false'
    )->'content')::text::json->'routes'->0->>'distance' as distance_meters;
```

**Expected:** ~250 meters

### Step 4: Test Matching Function

```sql
-- Test with your existing data
SELECT 
    rt.id as template_id,
    rr.id as request_id,
    calculate_route_match_score(rt.id, rr.id) as match_result
FROM ride_templates rt, ride_requests rr
WHERE rt.status = 'active'
  AND rr.status = 'active'
  AND rt.host_id != rr.rider_id
LIMIT 5;
```

**Expected output:**
```json
{
  "compatible": true,
  "match_score": 85.5,
  "detour_added_km": 1.2,
  "destination_distance_km": 0.8,
  "reason": "Compatible route found via OSRM"
}
```

### Step 5: Regenerate Existing Matches

```sql
-- Regenerate matches for all active templates
SELECT generate_all_matches();

-- Or regenerate for specific template/request
SELECT regenerate_matches_for_template('your-template-id');
SELECT regenerate_matches_for_request('your-request-id');
```

## Configuration

### Using Self-Hosted OSRM (Recommended for Production)

1. Set up OSRM server (see `SELF_HOST_OSRM_GUIDE.md`)

2. Update database configuration:

```sql
ALTER DATABASE postgres SET "app.settings.osrm_url" = 'http://your-osrm-server:5000';
```

### Using Public OSRM (Default)

No configuration needed. Uses `https://router.project-osrm.org` by default.

**Note:** Public server has rate limits. For production, use self-hosted.

## Matching Criteria

### Compatible Match Requires:

1. ✅ **Gender compatible** (both/male/female)
2. ✅ **Detour ≤ 5km** (road distance via OSRM)
3. ✅ **Destination ≤ 3km** (straight-line)

### Match Score Calculation:

```
score = 100 - (detour_added_meters / 50)
bonus = +10 if destination < 1km
```

## Troubleshooting

### Error: "function http_get does not exist"

```sql
-- Enable pg_http extension
CREATE EXTENSION IF NOT EXISTS http;
```

### Error: "permission denied for function http_get"

```sql
-- Grant permissions
GRANT EXECUTE ON FUNCTION http_get(text) TO postgres;
GRANT EXECUTE ON FUNCTION http_get(text) TO anon;
GRANT EXECUTE ON FUNCTION http_get(text) TO authenticated;
```

### No matches being created

1. Check OSRM connection:
   ```sql
   SELECT http_get('https://router.project-osrm.org/route/v1/driving/78.5,17.4;78.5,17.4?overview=false');
   ```

2. Check active templates/requests:
   ```sql
   SELECT COUNT(*) FROM ride_templates WHERE status = 'active';
   SELECT COUNT(*) FROM ride_requests WHERE status = 'active';
   ```

3. Check match_suggestions table:
   ```sql
   SELECT * FROM match_suggestions ORDER BY created_at DESC LIMIT 10;
   ```

### Matches taking too long

OSRM API calls are slower than straight-line calculations. Expected:
- **Straight-line:** 1000s matches/sec
- **OSRM:** 10-50 matches/sec

For large-scale matching, consider:
1. Using self-hosted OSRM (faster, no rate limits)
2. Adding caching layer
3. Batch processing during off-peak hours

## Performance Tips

1. **Use self-hosted OSRM** - Faster and no rate limits
2. **Index match_suggestions** - Already indexed by status
3. **Clean old matches** - Delete old pending matches regularly
4. **Monitor OSRM latency** - Add logging for slow calls

## Rollback

To revert to straight-line matching:

```sql
-- Restore old function from backup
\i database/functions/02_matching.sql

-- Drop OSRM triggers
DROP TRIGGER IF EXISTS on_ride_template_created_auto_match ON ride_templates;
DROP TRIGGER IF EXISTS on_ride_request_created_auto_match ON ride_requests;
```

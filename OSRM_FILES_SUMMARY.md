# OSRM Matching System - File Summary

## Files Created/Modified

### Core Deployment Files

| File | Purpose | Run Order |
|------|---------|-----------|
| `database/deploy_osrm_matching.sql` | **Complete deployment script** | Run this first |
| `OSRM_MATCHING_SETUP.md` | Setup guide and documentation | Reference |

### Individual Function Files (Optional)

| File | Purpose |
|------|---------|
| `database/functions/00_osrm_config.sql` | pg_http setup & OSRM configuration |
| `database/functions/08_osrm_matching.sql` | Main OSRM matching function |
| `database/functions/09_osrm_match_generation.sql` | Match generation functions |
| `database/functions/10_osrm_instant_triggers.sql` | Auto-match triggers |

### Updated Files

| File | Change |
|------|--------|
| `database/functions/02_matching.sql` | Replaced PostGIS with OSRM matching |
| `database/functions/06_instant_matching_triggers.sql` | Updated triggers for OSRM |
| `src/app/dashboard/DashboardContent.tsx` | Added ride request creation for riders |
| `database/functions/06_instant_matching_triggers.sql` | Fixed `drop_location` → `destination_location` bug |

---

## Quick Deploy

### Option 1: Single File (Recommended)

Run in Supabase SQL Editor:

```sql
\i database/deploy_osrm_matching.sql
```

Or copy-paste the contents of `database/deploy_osrm_matching.sql`.

### Option 2: Individual Files (Advanced)

Run in order:

```sql
-- 1. Configuration
\i database/functions/00_osrm_config.sql

-- 2. Matching function
\i database/functions/08_osrm_matching.sql

-- 3. Match generation
\i database/functions/09_osrm_match_generation.sql

-- 4. Triggers
\i database/functions/10_osrm_instant_triggers.sql
```

---

## What Changed

### Matching Criteria

| Before (PostGIS) | After (OSRM) |
|------------------|--------------|
| Pickup ≤ 2km (straight-line) | Detour ≤ 5km (road distance) |
| Destination ≤ 1km (straight-line) | Destination ≤ 3km (straight-line) |
| Fast (in-database) | Slower (API calls) |
| Less accurate | More accurate |

### New Features

- ✅ Real road-based distance calculation
- ✅ Actual detour measurement (not straight-line)
- ✅ Configurable OSRM server URL
- ✅ Fallback to straight-line if OSRM fails
- ✅ Match score based on actual detour distance

---

## Testing

### 1. Test OSRM Connection

```sql
SELECT 
    (http_get(
        'https://router.project-osrm.org/route/v1/driving/78.3194368,17.3919735;78.3220892,17.391051?overview=false'
    )->'content')::text::json->'routes'->0->>'distance' as distance_meters;
```

**Expected:** ~250 meters

### 2. Test Matching Function

```sql
SELECT 
    rt.id as template_id,
    rr.id as request_id,
    calculate_route_match_score(rt.id, rr.id) as match_result
FROM ride_templates rt, ride_requests rr
WHERE rt.status = 'active'
  AND rr.status = 'active'
LIMIT 5;
```

**Expected:** JSON with `compatible: true/false` and `detour_added_km`

### 3. Generate All Matches

```sql
SELECT generate_all_matches();
```

**Expected:** JSON with match count

### 4. View Match Suggestions

```sql
SELECT * FROM match_suggestions 
ORDER BY created_at DESC 
LIMIT 10;
```

---

## Configuration

### Using Self-Hosted OSRM

1. Set up OSRM server (see `SELF_HOST_OSRM_GUIDE.md`)

2. Update database:

```sql
ALTER DATABASE postgres SET "app.settings.osrm_url" = 'http://your-osrm-server:5000';
```

### Using Public OSRM (Default)

No configuration needed. Uses `https://router.project-osrm.org`.

**Note:** Public server has rate limits. For production, use self-hosted.

---

## Troubleshooting

### Error: "function http_get does not exist"

```sql
CREATE EXTENSION IF NOT EXISTS http;
GRANT EXECUTE ON FUNCTION http_get(text) TO postgres;
GRANT EXECUTE ON FUNCTION http_get(text) TO anon;
GRANT EXECUTE ON FUNCTION http_get(text) TO authenticated;
```

### No matches being created

1. Check OSRM connection (test above)
2. Check active templates/requests:
   ```sql
   SELECT COUNT(*) FROM ride_templates WHERE status = 'active';
   SELECT COUNT(*) FROM ride_requests WHERE status = 'active';
   ```
3. Check match_suggestions:
   ```sql
   SELECT * FROM match_suggestions ORDER BY created_at DESC LIMIT 10;
   ```

### Slow matching

OSRM API calls are slower than straight-line:
- **Expected:** 10-50 matches/sec
- **Solution:** Use self-hosted OSRM for better performance

---

## Rollback

To revert to PostGIS straight-line matching:

```sql
-- Restore old function
\i database/functions/02_matching.sql.bak

-- Drop OSRM triggers
DROP TRIGGER IF EXISTS on_ride_template_created_auto_match ON ride_templates;
DROP TRIGGER IF EXISTS on_ride_request_created_auto_match ON ride_requests;
```

---

## Performance Tips

1. **Use self-hosted OSRM** - Faster, no rate limits
2. **Add database indexes** - Already indexed on status
3. **Clean old matches** - Delete old pending matches regularly
4. **Monitor OSRM latency** - Add logging for slow calls
5. **Use connection pooling** - Handled by Supabase

---

## Deployment Checklist

- [ ] pg_http extension enabled
- [ ] Permissions granted to all roles
- [ ] OSRM URL configured (or using default)
- [ ] Connection test successful
- [ ] Functions deployed
- [ ] Triggers deployed
- [ ] Test match creation successful
- [ ] Existing matches regenerated
- [ ] Frontend tested (new rider signup)

---

## Next Steps

1. Run deployment script
2. Test with sample data
3. Regenerate existing matches
4. Test new rider signup flow
5. Monitor match quality
6. Consider self-hosted OSRM for production

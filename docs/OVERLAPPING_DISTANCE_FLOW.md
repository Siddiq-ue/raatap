-- =====================================================
-- OVERLAPPING DISTANCE - COMPLETE DATA FLOW
-- =====================================================

-- STEP 1: Run this SQL to create the helper function
-- File: database/functions/calculate_overlapping_distance.sql

-- STEP 2: The function calculates overlap like this:
--
--    HOST ROUTE:  A ------------------> B (10km)
--    
--    RIDER 1:     A ------------> C    (joins at start, leaves mid)
--    Overlap:     5km (50%)
--
--    RIDER 2:           B <---------- C  (travels opposite - NO OVERLAP!)
--    Overlap:     0km (0%)
--
--    RIDER 3:     A ------------------> B (same route)
--    Overlap:     10km (100%)

-- =====================================================
-- HOW IT WORKS
-- =====================================================

-- 1. Check if pickup point is on host route (within 500m)
-- 2. Check if destination point is on host route (within 500m)
-- 3. Calculate fractional position (0-1) along route for each point
-- 4. If rider travels same direction: overlap = (dest_fraction - pickup_fraction) * route_distance
-- 5. If rider travels opposite direction: overlap = 0

-- =====================================================
-- USAGE IN MATCHING
-- =====================================================

-- Option A: Use the new v2 function
-- SELECT calculate_route_match_score_v2(template_id, request_id);

-- Option B: Use just the overlap calculation in existing code
-- SELECT calculate_overlapping_distance(
--   host_from_point,
--   host_to_point,
--   rider_pickup_point,
--   rider_destination_point
-- );

-- =====================================================
-- RESULT EXAMPLES
-- =====================================================

-- Example 1: Rider joins at start, leaves at end
-- Host: A(0km) ---------> B(10km)
-- Rider: A(0km) ---------> B(10km)
-- Result: overlap = 10km, ratio = 1.0 (100%)

-- Example 2: Rider joins in middle, leaves at end  
-- Host: A(0km) ---------> B(10km)
-- Rider:       A(5km) -----> B(10km)
-- Result: overlap = 5km, ratio = 0.5 (50%)

-- Example 3: Rider joins at start, leaves in middle
-- Host: A(0km) ---------> B(10km)
-- Rider: A(0km) -----> C(5km)
-- Result: overlap = 5km, ratio = 0.5 (50%)

-- Example 4: Rider joins mid, leaves mid (same direction)
-- Host: A(0km) ---------> B(10km)
-- Rider:      A(3km) ---> C(7km)
-- Result: overlap = 4km, ratio = 0.4 (40%)

-- Example 5: Rider travels opposite direction
-- Host: A(0km) ---------> B(10km)
-- Rider: B(10km) <------- C(3km)  
-- Result: overlap = 0km, ratio = 0 (0%)

-- Example 6: Rider not on route at all
-- Host: A(0km) ---------> B(10km)
-- Rider:      X (somewhere else)
-- Result: overlap = 0km, ratio = 0 (0%)

-- 1. Performance Indexes (BTree for filtering/joining)
CREATE INDEX IF NOT EXISTS idx_ride_templates_status ON public.ride_templates(status);
CREATE INDEX IF NOT EXISTS idx_ride_templates_host_id ON public.ride_templates(host_id);

CREATE INDEX IF NOT EXISTS idx_ride_requests_status ON public.ride_requests(status);
CREATE INDEX IF NOT EXISTS idx_ride_requests_rider_id ON public.ride_requests(rider_id);

CREATE INDEX IF NOT EXISTS idx_match_suggestions_status ON public.match_suggestions(status);
-- optimize lookup for specific pair
CREATE INDEX IF NOT EXISTS idx_match_suggestions_pair ON public.match_suggestions(ride_template_id, ride_request_id);

-- 2. Spatial Indexes (GIST for geometry/geography)
-- Ensure PostGIS is available (it should be)
CREATE INDEX IF NOT EXISTS idx_ride_templates_from_point ON public.ride_templates USING GIST(from_point);
CREATE INDEX IF NOT EXISTS idx_ride_templates_to_point ON public.ride_templates USING GIST(to_point);

CREATE INDEX IF NOT EXISTS idx_ride_requests_pickup_point ON public.ride_requests USING GIST(pickup_point);
CREATE INDEX IF NOT EXISTS idx_ride_requests_destination_point ON public.ride_requests USING GIST(destination_point);

-- 3. Idempotency Constraint
-- This ensures that for a given Ride Template and Ride Request, only ONE match suggestion can exist.
ALTER TABLE public.match_suggestions 
DROP CONSTRAINT IF EXISTS match_suggestions_unique_pair; -- drop if exists to allow re-run

ALTER TABLE public.match_suggestions 
ADD CONSTRAINT match_suggestions_unique_pair UNIQUE (ride_template_id, ride_request_id);

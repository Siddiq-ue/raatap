-- Migration to add pickup_landmark columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pickup_landmark TEXT;
ALTER TABLE public.ride_requests ADD COLUMN IF NOT EXISTS pickup_landmark TEXT;
ALTER TABLE public.pod_members ADD COLUMN IF NOT EXISTS pickup_landmark TEXT;

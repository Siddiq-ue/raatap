-- Migration to add student_id column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS student_id TEXT;

-- Add rejection_reason column to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_rejection_reason 
ON profiles(rejection_reason) 
WHERE rejection_reason IS NOT NULL;
--updated code --
-- Migration: 002_add_target_instance_ids
-- Adds target_instance_ids column to scale_requests for targeted scale-down

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scale_requests' AND column_name = 'target_instance_ids'
  ) THEN
    ALTER TABLE scale_requests ADD COLUMN target_instance_ids TEXT;
  END IF;
END $$;

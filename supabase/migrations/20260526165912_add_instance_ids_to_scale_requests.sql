/*
  # Add instance_ids column to scale_requests

  1. Modified Tables
    - `scale_requests`
      - `instance_ids_json` (text, nullable) - JSON array of Linode IDs to target for scale-down.
        When provided, the controller deletes these specific instances instead of using the
        default newest-first selection strategy.

  2. Notes
    - Column stores a JSON-encoded array of integers (Linode IDs)
    - When NULL or empty, existing behavior (newest-first) applies
    - Only relevant for scale_down request types
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scale_requests' AND column_name = 'instance_ids_json'
  ) THEN
    ALTER TABLE scale_requests ADD COLUMN instance_ids_json text;
  END IF;
END $$;

/*
  # Add group scoping to API keys

  1. Modified Tables
    - `api_keys`
      - `allowed_groups_json` (text, nullable) - JSON array of group_ids this key can access.
        NULL means access to all groups (no restriction).

  2. Notes
    - Existing keys get NULL (unrestricted access) preserving backward compatibility.
    - The application layer enforces scoping by checking this column on group-specific operations.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'api_keys' AND column_name = 'allowed_groups_json'
  ) THEN
    ALTER TABLE api_keys ADD COLUMN allowed_groups_json TEXT;
  END IF;
END $$;

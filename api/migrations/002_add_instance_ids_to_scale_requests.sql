-- Migration: 002_add_instance_ids_to_scale_requests
-- Adds instance_ids_json column to scale_requests table.
-- When provided on a scale_down request, the controller targets these specific
-- Linode IDs for deletion instead of using the default newest-first strategy.

ALTER TABLE scale_requests ADD COLUMN IF NOT EXISTS instance_ids_json TEXT;

-- Fix race condition in get_next_queue_number function
-- This ensures queue numbers are sequential and unique even with concurrent requests

CREATE OR REPLACE FUNCTION get_next_queue_number()
RETURNS integer AS $$
DECLARE
  next_number integer;
BEGIN
  -- Lock the table to prevent race conditions
  LOCK TABLE texture_queue IN EXCLUSIVE MODE;
  
  -- Get the next queue number
  SELECT COALESCE(MAX(queue_number), 0) + 1 INTO next_number FROM texture_queue;
  
  RETURN next_number;
END;
$$ LANGUAGE plpgsql;

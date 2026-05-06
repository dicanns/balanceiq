-- Atomic quota increment for OCR and AI usage tables.
-- Increments count if below p_limit and returns the new count.
-- Returns -1 if the limit was already reached (no row modified).
-- Eliminates the read-modify-write race where two concurrent requests
-- can both read count=N, both see N < limit, and both proceed.
CREATE OR REPLACE FUNCTION increment_usage_if_under_limit(
  p_table  TEXT,
  p_org_id TEXT,
  p_month  TEXT,
  p_limit  INT
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new INT;
BEGIN
  IF p_table NOT IN ('ocr_usage', 'ai_usage') THEN
    RAISE EXCEPTION 'forbidden table: %', p_table;
  END IF;

  EXECUTE format(
    'INSERT INTO %I (org_id, month, count)
     VALUES ($1, $2, 1)
     ON CONFLICT (org_id, month)
     DO UPDATE SET count = %I.count + 1
     WHERE %I.count < $3
     RETURNING count',
    p_table, p_table, p_table
  ) USING p_org_id, p_month, p_limit
  INTO v_new;

  -- RETURNING yields NULL when the WHERE clause prevented the update (limit reached)
  RETURN COALESCE(v_new, -1);
END;
$$;

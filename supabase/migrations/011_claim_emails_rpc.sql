-- Atomic email claim function: prevents race conditions between concurrent cron runs
CREATE OR REPLACE FUNCTION claim_emails_for_sending(
  p_step_ids UUID[],
  p_before TIMESTAMPTZ,
  p_limit INTEGER DEFAULT 10
)
RETURNS SETOF UUID AS $$
BEGIN
  RETURN QUERY
  UPDATE emails
  SET send_status = 'sending'
  WHERE id IN (
    SELECT e.id FROM emails e
    WHERE e.approval_status IN ('approved', 'edited')
      AND e.send_status = 'scheduled'
      AND e.sequence_step_id = ANY(p_step_ids)
      AND e.scheduled_for <= p_before
    ORDER BY e.scheduled_for ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

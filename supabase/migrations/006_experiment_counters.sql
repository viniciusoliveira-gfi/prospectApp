-- Function to increment experiment assignment sent counter
CREATE OR REPLACE FUNCTION increment_experiment_sent(
  p_experiment_id UUID,
  p_contact_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE experiment_assignments
  SET emails_sent = emails_sent + 1
  WHERE experiment_id = p_experiment_id AND contact_id = p_contact_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

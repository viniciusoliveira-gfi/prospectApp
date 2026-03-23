-- Increment experiment assignment opened counter
CREATE OR REPLACE FUNCTION increment_experiment_opened(
  p_experiment_id UUID,
  p_contact_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE experiment_assignments
  SET emails_opened = emails_opened + 1
  WHERE experiment_id = p_experiment_id AND contact_id = p_contact_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment experiment assignment replied counter
CREATE OR REPLACE FUNCTION increment_experiment_replied(
  p_experiment_id UUID,
  p_contact_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE experiment_assignments
  SET emails_replied = emails_replied + 1
  WHERE experiment_id = p_experiment_id AND contact_id = p_contact_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

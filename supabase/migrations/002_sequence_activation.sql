-- Sequence Activation & Scheduling Migration

-- Add timing columns to sequences
ALTER TABLE sequences
  ADD COLUMN started_at TIMESTAMPTZ,
  ADD COLUMN paused_at TIMESTAMPTZ,
  ADD COLUMN completed_at TIMESTAMPTZ,
  ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();

-- Add updated_at trigger to sequences
CREATE TRIGGER update_sequences_updated_at
  BEFORE UPDATE ON sequences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Performance indexes for send processor
CREATE INDEX idx_emails_sequence_step ON emails(sequence_step_id);
CREATE INDEX idx_emails_contact ON emails(contact_id);
CREATE INDEX idx_sequence_steps_sequence ON sequence_steps(sequence_id);
CREATE INDEX idx_sequences_status ON sequences(status);
CREATE INDEX idx_emails_send_scheduled ON emails(send_status, scheduled_for)
  WHERE send_status = 'scheduled' AND scheduled_for IS NOT NULL;

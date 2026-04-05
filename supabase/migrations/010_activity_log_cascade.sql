-- Fix activity_log FK constraints to cascade on delete

-- email_id
ALTER TABLE activity_log DROP CONSTRAINT IF EXISTS activity_log_email_id_fkey;
ALTER TABLE activity_log ADD CONSTRAINT activity_log_email_id_fkey
  FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE;

-- contact_id
ALTER TABLE activity_log DROP CONSTRAINT IF EXISTS activity_log_contact_id_fkey;
ALTER TABLE activity_log ADD CONSTRAINT activity_log_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

-- prospect_id
ALTER TABLE activity_log DROP CONSTRAINT IF EXISTS activity_log_prospect_id_fkey;
ALTER TABLE activity_log ADD CONSTRAINT activity_log_prospect_id_fkey
  FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE;

-- campaign_id
ALTER TABLE activity_log DROP CONSTRAINT IF EXISTS activity_log_campaign_id_fkey;
ALTER TABLE activity_log ADD CONSTRAINT activity_log_campaign_id_fkey
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

-- Also fix emails FK on sequence_steps (blocks sequence deletion)
ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_sequence_step_id_fkey;
ALTER TABLE emails ADD CONSTRAINT emails_sequence_step_id_fkey
  FOREIGN KEY (sequence_step_id) REFERENCES sequence_steps(id) ON DELETE CASCADE;

-- Fix emails FK on contacts (blocks contact deletion)
ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_contact_id_fkey;
ALTER TABLE emails ADD CONSTRAINT emails_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

-- Fix emails FK on prospects
ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_prospect_id_fkey;
ALTER TABLE emails ADD CONSTRAINT emails_prospect_id_fkey
  FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE SET NULL;

-- Fix: experiment_assignments FK on contacts blocks prospect/contact deletion
-- Add CASCADE so deleting contacts cleans up their experiment assignments
ALTER TABLE experiment_assignments DROP CONSTRAINT IF EXISTS experiment_assignments_contact_id_fkey;
ALTER TABLE experiment_assignments ADD CONSTRAINT experiment_assignments_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

-- Fix: emails.experiment_id FK should SET NULL on experiment delete (not block)
ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_experiment_id_fkey;
ALTER TABLE emails ADD CONSTRAINT emails_experiment_id_fkey
  FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE SET NULL;

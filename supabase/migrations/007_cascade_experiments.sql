-- Add CASCADE delete so archiving/deleting a campaign removes its experiments
ALTER TABLE experiments DROP CONSTRAINT IF EXISTS experiments_campaign_id_fkey;
ALTER TABLE experiments ADD CONSTRAINT experiments_campaign_id_fkey
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

-- Same for prospect_research
ALTER TABLE prospect_research DROP CONSTRAINT IF EXISTS prospect_research_campaign_id_fkey;
ALTER TABLE prospect_research ADD CONSTRAINT prospect_research_campaign_id_fkey
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

-- ProspectApp Initial Schema

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Campaigns
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  sending_account TEXT,
  daily_send_limit INTEGER DEFAULT 25,
  send_interval_minutes INTEGER DEFAULT 60,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Prospects
CREATE TABLE prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  domain TEXT,
  website TEXT,
  country TEXT,
  size TEXT,
  industry TEXT,
  description TEXT,
  ai_research TEXT,
  ai_research_status TEXT DEFAULT 'pending' CHECK (ai_research_status IN ('pending', 'researching', 'completed', 'failed')),
  tier TEXT CHECK (tier IN ('tier_1', 'tier_2', 'tier_3', 'disqualified')),
  qualification_rationale TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER update_prospects_updated_at
  BEFORE UPDATE ON prospects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Contacts
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  email_status TEXT DEFAULT 'unknown' CHECK (email_status IN ('unknown', 'verified', 'unverified', 'bounced', 'catch_all')),
  title TEXT,
  linkedin_url TEXT,
  phone TEXT,
  apollo_id TEXT,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'apollo', 'csv_import', 'enrichment')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'opted_out', 'bounced', 'replied', 'converted')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sequences
CREATE TABLE sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Sequence Steps
CREATE TABLE sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID REFERENCES sequences(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  delay_days INTEGER NOT NULL DEFAULT 0,
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  step_type TEXT DEFAULT 'email' CHECK (step_type IN ('email', 'manual_task')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Emails
CREATE TABLE emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_step_id UUID REFERENCES sequence_steps(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES prospects(id),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'edited')),
  approved_at TIMESTAMPTZ,
  send_status TEXT DEFAULT 'queued' CHECK (send_status IN ('queued', 'scheduled', 'sending', 'sent', 'failed', 'skipped')),
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  tracking_pixel_id UUID DEFAULT gen_random_uuid(),
  opened_at TIMESTAMPTZ,
  open_count INTEGER DEFAULT 0,
  clicked_at TIMESTAMPTZ,
  click_count INTEGER DEFAULT 0,
  replied_at TIMESTAMPTZ,
  reply_snippet TEXT,
  bounced_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Activity Log
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id),
  prospect_id UUID REFERENCES prospects(id),
  contact_id UUID REFERENCES contacts(id),
  email_id UUID REFERENCES emails(id),
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Settings
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER update_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX idx_emails_send_status ON emails(send_status);
CREATE INDEX idx_emails_scheduled ON emails(scheduled_for) WHERE send_status = 'scheduled';
CREATE INDEX idx_emails_approval ON emails(approval_status);
CREATE INDEX idx_prospects_campaign ON prospects(campaign_id);
CREATE INDEX idx_contacts_prospect ON contacts(prospect_id);
CREATE INDEX idx_contacts_campaign ON contacts(campaign_id);
CREATE INDEX idx_activity_campaign ON activity_log(campaign_id);
CREATE INDEX idx_emails_tracking ON emails(tracking_pixel_id);

-- Enable RLS on all tables
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies (single-user app: allow all for authenticated users)
CREATE POLICY "Authenticated users have full access to campaigns" ON campaigns FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users have full access to prospects" ON prospects FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users have full access to contacts" ON contacts FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users have full access to sequences" ON sequences FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users have full access to sequence_steps" ON sequence_steps FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users have full access to emails" ON emails FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users have full access to activity_log" ON activity_log FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users have full access to settings" ON settings FOR ALL USING (auth.role() = 'authenticated');

-- Increment open count function (for tracking pixel)
CREATE OR REPLACE FUNCTION increment_open_count(email_tracking_id UUID)
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE emails
  SET open_count = open_count + 1,
      opened_at = COALESCE(opened_at, now())
  WHERE tracking_pixel_id = email_tracking_id
  RETURNING open_count INTO new_count;
  RETURN new_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

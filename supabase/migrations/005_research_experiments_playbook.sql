-- ============================================================
-- FEATURE 1: Structured Research Dossiers
-- ============================================================

CREATE TABLE prospect_research (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id),

  -- Company Intelligence
  company_overview TEXT,
  market_position TEXT,
  tech_stack JSONB,
  recent_news TEXT,

  -- Pain & Opportunity Mapping
  pain_points JSONB,
  opportunities JSONB,

  -- Persona Mapping
  personas JSONB,

  -- Competitive & FOMO Intelligence
  local_competitors JSONB,
  fomo_strategy TEXT,
  competitor_naming_strategy TEXT,

  -- Messaging Framework
  core_value_prop TEXT,
  messaging_hypotheses JSONB,
  positioning_angle TEXT,
  objection_map JSONB,

  -- Metadata
  research_depth TEXT DEFAULT 'standard',
  researched_at TIMESTAMPTZ DEFAULT NOW(),
  researched_by TEXT DEFAULT 'claude',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_prospect_research_prospect ON prospect_research(prospect_id);
CREATE INDEX idx_prospect_research_campaign ON prospect_research(campaign_id);

CREATE TRIGGER update_prospect_research_updated_at
  BEFORE UPDATE ON prospect_research
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE prospect_research ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users have full access to prospect_research" ON prospect_research FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- FEATURE 2: Experiment Engine
-- ============================================================

CREATE TABLE experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'analyzed')),

  test_dimension TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  variants JSONB NOT NULL,

  assignment_method TEXT DEFAULT 'random',
  primary_metric TEXT DEFAULT 'reply_rate',
  secondary_metrics JSONB,

  min_sample_per_variant INTEGER DEFAULT 10,
  confidence_threshold NUMERIC DEFAULT 0.95,

  winner_variant TEXT,
  learnings TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_experiments_campaign ON experiments(campaign_id);
CREATE INDEX idx_experiments_status ON experiments(status);

CREATE TRIGGER update_experiments_updated_at
  BEFORE UPDATE ON experiments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users have full access to experiments" ON experiments FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE experiment_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID REFERENCES experiments(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id),
  variant_id TEXT NOT NULL,

  emails_sent INTEGER DEFAULT 0,
  emails_opened INTEGER DEFAULT 0,
  emails_replied INTEGER DEFAULT 0,
  reply_sentiment TEXT CHECK (reply_sentiment IN ('positive', 'neutral', 'negative', 'objection')),
  meeting_booked BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(experiment_id, contact_id)
);

CREATE INDEX idx_experiment_assignments_experiment ON experiment_assignments(experiment_id);
CREATE INDEX idx_experiment_assignments_contact ON experiment_assignments(contact_id);

CREATE TRIGGER update_experiment_assignments_updated_at
  BEFORE UPDATE ON experiment_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE experiment_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users have full access to experiment_assignments" ON experiment_assignments FOR ALL USING (auth.role() = 'authenticated');

-- Add experiment tracking to emails
ALTER TABLE emails ADD COLUMN experiment_id UUID REFERENCES experiments(id);
ALTER TABLE emails ADD COLUMN variant_id TEXT;
ALTER TABLE emails ADD COLUMN test_dimensions JSONB;

-- ============================================================
-- FEATURE 3: Email Variation Metadata
-- ============================================================

ALTER TABLE emails ADD COLUMN metadata JSONB DEFAULT '{}';

-- ============================================================
-- FEATURE 5: Growth Playbook
-- ============================================================

CREATE TABLE growth_playbook (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension TEXT NOT NULL,
  vertical TEXT,
  insight TEXT NOT NULL,
  evidence TEXT,
  confidence TEXT DEFAULT 'hypothesis' CHECK (confidence IN ('hypothesis', 'tested', 'validated', 'proven')),
  applies_to JSONB,
  source_experiment_id UUID REFERENCES experiments(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_playbook_dimension ON growth_playbook(dimension);
CREATE INDEX idx_playbook_vertical ON growth_playbook(vertical);

CREATE TRIGGER update_growth_playbook_updated_at
  BEFORE UPDATE ON growth_playbook
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE growth_playbook ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users have full access to growth_playbook" ON growth_playbook FOR ALL USING (auth.role() = 'authenticated');

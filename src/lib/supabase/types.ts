export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived'
export type ResearchStatus = 'pending' | 'researching' | 'completed' | 'failed'
export type ProspectTier = 'tier_1' | 'tier_2' | 'tier_3' | 'disqualified'
export type EmailStatus = 'unknown' | 'verified' | 'unverified' | 'bounced' | 'catch_all'
export type ContactSource = 'manual' | 'apollo' | 'csv_import' | 'enrichment'
export type ContactStatus = 'active' | 'opted_out' | 'bounced' | 'replied' | 'converted'
export type SequenceStatus = 'draft' | 'active' | 'paused' | 'completed'
export type StepType = 'email' | 'manual_task'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'edited'
export type SendStatus = 'queued' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'skipped'

export interface CampaignSendSettings {
  sender_accounts: string[]
  track_opens: boolean
  send_days: string[]
  send_hours_start: number
  send_hours_end: number
  timezone: string
}

export interface Campaign {
  id: string
  name: string
  description: string | null
  status: CampaignStatus
  sending_account: string | null
  daily_send_limit: number
  send_interval_minutes: number
  send_settings: CampaignSendSettings | null
  created_at: string
  updated_at: string
}

export interface Prospect {
  id: string
  campaign_id: string
  company_name: string
  domain: string | null
  website: string | null
  country: string | null
  size: string | null
  industry: string | null
  description: string | null
  ai_research: string | null
  ai_research_status: ResearchStatus
  tier: ProspectTier | null
  qualification_rationale: string | null
  tags: string[] | null
  created_at: string
  updated_at: string
}

export interface Contact {
  id: string
  prospect_id: string
  campaign_id: string
  first_name: string
  last_name: string
  email: string | null
  email_status: EmailStatus
  title: string | null
  linkedin_url: string | null
  phone: string | null
  apollo_id: string | null
  source: ContactSource
  status: ContactStatus
  created_at: string
  updated_at: string
}

export interface Sequence {
  id: string
  campaign_id: string
  name: string
  status: SequenceStatus
  started_at: string | null
  paused_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface SequenceStep {
  id: string
  sequence_id: string
  step_number: number
  delay_days: number
  subject_template: string
  body_template: string
  step_type: StepType
  created_at: string
}

export interface Email {
  id: string
  sequence_step_id: string
  contact_id: string
  prospect_id: string | null
  subject: string
  body: string
  approval_status: ApprovalStatus
  approved_at: string | null
  send_status: SendStatus
  scheduled_for: string | null
  sent_at: string | null
  gmail_message_id: string | null
  gmail_thread_id: string | null
  sent_from: string | null
  tracking_pixel_id: string
  opened_at: string | null
  open_count: number
  clicked_at: string | null
  click_count: number
  replied_at: string | null
  reply_snippet: string | null
  bounced_at: string | null
  error_message: string | null
  experiment_id: string | null
  variant_id: string | null
  test_dimensions: Record<string, string> | null
  metadata: EmailMetadata | null
  created_at: string
}

export interface EmailMetadata {
  strategy_notes?: string
  fomo_style?: 'named' | 'unnamed' | 'none'
  fomo_companies_mentioned?: string[]
  tone?: 'provocative' | 'consultative' | 'direct' | 'friendly'
  value_prop?: string
  subject_style?: 'question' | 'statement' | 'provocative' | 'personalized_stat'
  cta_style?: 'soft_ask' | 'hard_ask' | 'no_cta' | 'curiosity_hook'
  personalization_elements?: string[]
  word_count?: number
  research_references?: string[]
}

export type ExperimentStatus = 'draft' | 'active' | 'paused' | 'completed' | 'analyzed'

export interface PainPoint {
  pain: string
  severity: 'high' | 'medium' | 'low'
  evidence: string
}

export interface Opportunity {
  opportunity: string
  fit_score: number
  rationale: string
}

export interface PersonaMapping {
  name: string
  title: string
  contact_id?: string
  role_in_deal: string
  pain_points: string[]
  messaging_angle: string
  tone: string
}

export interface LocalCompetitor {
  company_name: string
  relationship: string
  fomo_usable: boolean
}

export interface MessagingHypothesis {
  hypothesis: string
  test_dimension: string
  confidence: 'high' | 'medium' | 'low'
}

export interface ProspectResearch {
  id: string
  prospect_id: string
  campaign_id: string | null
  company_overview: string | null
  market_position: string | null
  tech_stack: Record<string, unknown> | null
  recent_news: string | null
  pain_points: PainPoint[] | null
  opportunities: Opportunity[] | null
  personas: PersonaMapping[] | null
  local_competitors: LocalCompetitor[] | null
  fomo_strategy: string | null
  competitor_naming_strategy: string | null
  core_value_prop: string | null
  messaging_hypotheses: MessagingHypothesis[] | null
  positioning_angle: string | null
  objection_map: { objection: string; response: string }[] | null
  research_depth: string
  researched_at: string
  researched_by: string
  created_at: string
  updated_at: string
}

export interface ExperimentVariant {
  variant_id: string
  label: string
  description: string
}

export interface Experiment {
  id: string
  campaign_id: string | null
  name: string
  description: string | null
  status: ExperimentStatus
  test_dimension: string
  hypothesis: string
  variants: ExperimentVariant[]
  assignment_method: string
  primary_metric: string
  secondary_metrics: string[] | null
  min_sample_per_variant: number
  confidence_threshold: number
  winner_variant: string | null
  learnings: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface ExperimentAssignment {
  id: string
  experiment_id: string
  contact_id: string
  variant_id: string
  emails_sent: number
  emails_opened: number
  emails_replied: number
  reply_sentiment: string | null
  meeting_booked: boolean
  created_at: string
  updated_at: string
}

export interface GrowthPlaybookEntry {
  id: string
  dimension: string
  vertical: string | null
  insight: string
  evidence: string | null
  confidence: 'hypothesis' | 'tested' | 'validated' | 'proven'
  applies_to: Record<string, unknown> | null
  source_experiment_id: string | null
  created_at: string
  updated_at: string
}

export interface ActivityLog {
  id: string
  campaign_id: string | null
  prospect_id: string | null
  contact_id: string | null
  email_id: string | null
  action: string
  details: Record<string, unknown> | null
  created_at: string
}

export interface Setting {
  key: string
  value: Record<string, unknown>
  updated_at: string
}

// Insert types (omit auto-generated fields)
export type CampaignInsert = Omit<Campaign, 'id' | 'created_at' | 'updated_at'> & { id?: string }
export type ProspectInsert = Omit<Prospect, 'id' | 'created_at' | 'updated_at'> & { id?: string }
export type ContactInsert = Omit<Contact, 'id' | 'created_at' | 'updated_at'> & { id?: string }
export type SequenceInsert = Omit<Sequence, 'id' | 'created_at' | 'updated_at'> & { id?: string }
export type SequenceStepInsert = Omit<SequenceStep, 'id' | 'created_at'> & { id?: string }
export type EmailInsert = Omit<Email, 'id' | 'created_at' | 'tracking_pixel_id'> & { id?: string; tracking_pixel_id?: string }
export type ActivityLogInsert = Omit<ActivityLog, 'id' | 'created_at'> & { id?: string }

// Update types (all fields optional except id)
export type CampaignUpdate = Partial<Omit<Campaign, 'id' | 'created_at'>>
export type ProspectUpdate = Partial<Omit<Prospect, 'id' | 'created_at'>>
export type ContactUpdate = Partial<Omit<Contact, 'id' | 'created_at'>>
export type SequenceUpdate = Partial<Omit<Sequence, 'id' | 'created_at'>>
export type EmailUpdate = Partial<Omit<Email, 'id' | 'created_at'>>

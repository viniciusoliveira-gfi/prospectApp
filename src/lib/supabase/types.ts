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

export interface Campaign {
  id: string
  name: string
  description: string | null
  status: CampaignStatus
  sending_account: string | null
  daily_send_limit: number
  send_interval_minutes: number
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
  created_at: string
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
  tracking_pixel_id: string
  opened_at: string | null
  open_count: number
  clicked_at: string | null
  click_count: number
  replied_at: string | null
  reply_snippet: string | null
  bounced_at: string | null
  error_message: string | null
  created_at: string
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
export type SequenceInsert = Omit<Sequence, 'id' | 'created_at'> & { id?: string }
export type SequenceStepInsert = Omit<SequenceStep, 'id' | 'created_at'> & { id?: string }
export type EmailInsert = Omit<Email, 'id' | 'created_at' | 'tracking_pixel_id'> & { id?: string; tracking_pixel_id?: string }
export type ActivityLogInsert = Omit<ActivityLog, 'id' | 'created_at'> & { id?: string }

// Update types (all fields optional except id)
export type CampaignUpdate = Partial<Omit<Campaign, 'id' | 'created_at'>>
export type ProspectUpdate = Partial<Omit<Prospect, 'id' | 'created_at'>>
export type ContactUpdate = Partial<Omit<Contact, 'id' | 'created_at'>>
export type SequenceUpdate = Partial<Omit<Sequence, 'id' | 'created_at'>>
export type EmailUpdate = Partial<Omit<Email, 'id' | 'created_at'>>

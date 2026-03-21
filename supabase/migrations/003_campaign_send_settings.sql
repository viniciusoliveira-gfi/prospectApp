-- Campaign-level send settings
ALTER TABLE campaigns
  ADD COLUMN send_settings JSONB DEFAULT '{}';

-- Track which sender was used for each prospect (same sender per company rule)
CREATE INDEX idx_emails_prospect_sender ON emails(prospect_id, gmail_message_id)
  WHERE send_status = 'sent';

COMMENT ON COLUMN campaigns.send_settings IS 'JSON: { sender_accounts: string[], track_opens: boolean, send_days: string[], send_hours_start: number, send_hours_end: number, timezone: string }';

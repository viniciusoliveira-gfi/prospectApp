-- Track which sender account was used for each email
ALTER TABLE emails ADD COLUMN sent_from TEXT;

-- Index for sender lookups
CREATE INDEX idx_emails_sent_from ON emails(sent_from) WHERE sent_from IS NOT NULL;

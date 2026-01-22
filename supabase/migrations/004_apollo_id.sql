-- Add apollo_id column to contacts table for Apollo API email enrichment
-- apollo_id stores the Apollo person ID which is required for the bulk_match API

ALTER TABLE contacts
ADD COLUMN apollo_id TEXT;

-- Add index for faster lookups when enriching emails
CREATE INDEX idx_contacts_apollo_id ON contacts(apollo_id);

-- Email Templates - Save and reuse email templates across projects
-- Run this in Supabase SQL Editor

-- Email templates table
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE, -- NULL means global template
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'cold_outreach', -- cold_outreach, followup, introduction_request
  description TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  variables JSONB DEFAULT '[]', -- Array of variable names used: ["contact_name", "company_name"]
  is_default BOOLEAN DEFAULT FALSE, -- System default templates
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX idx_templates_project ON email_templates(project_id);
CREATE INDEX idx_templates_category ON email_templates(category);

-- Apply updated_at trigger
CREATE TRIGGER email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Insert default templates
INSERT INTO email_templates (name, category, description, subject, body, variables, is_default) VALUES
(
  'Cold Outreach',
  'cold_outreach',
  'Initial outreach to a new prospect',
  'Partnership opportunity with {{client_name}}',
  'Dear {{contact_name}},

I hope this message finds you well. I am reaching out on behalf of {{client_name}} regarding a potential partnership opportunity with {{company_name}}.

{{client_name}} specializes in {{product_description}}, and we believe there could be significant synergies between our organizations.

I would welcome the opportunity to discuss how we might collaborate. Would you have 15 minutes for a brief call this week?

Best regards',
  '["contact_name", "company_name", "client_name", "product_description"]',
  TRUE
),
(
  'Follow-up',
  'followup',
  'Follow up on a previous email',
  'Following up: {{previous_subject}}',
  'Dear {{contact_name}},

I wanted to follow up on my previous email regarding a potential partnership between {{client_name}} and {{company_name}}.

I understand you have a busy schedule, but I would appreciate a few minutes of your time to explore how we might work together.

Please let me know if you would be available for a brief call at your convenience.

Best regards',
  '["contact_name", "company_name", "client_name", "previous_subject"]',
  TRUE
),
(
  'Introduction Request',
  'introduction_request',
  'Request an introduction from a mutual connection',
  'Introduction request: {{client_name}} and {{company_name}}',
  'Dear {{contact_name}},

I hope you are doing well. I am reaching out because I noticed your connection to {{company_name}} and was hoping you might be able to help with an introduction.

{{client_name}} is looking to connect with decision-makers at {{company_name}} to discuss {{product_description}}.

Would you be open to making an introduction? I would be happy to provide any additional context that would be helpful.

Thank you for considering this request.

Best regards',
  '["contact_name", "company_name", "client_name", "product_description"]',
  TRUE
);

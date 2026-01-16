-- Flexible Schema Configuration
-- Allows users to define their own column schemas per project

-- Schema templates table (optional - for preset templates)
CREATE TABLE schema_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  -- Column definitions for each entity type
  company_columns JSONB NOT NULL DEFAULT '[]',
  contact_columns JSONB NOT NULL DEFAULT '[]',
  email_columns JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default templates
INSERT INTO schema_templates (name, description, company_columns, contact_columns) VALUES
(
  'distributor',
  'For finding distributors and retail partners',
  '[
    {"key": "name", "label": "Company", "type": "text", "required": true},
    {"key": "website", "label": "Website", "type": "url"},
    {"key": "description", "label": "Type/Focus", "type": "text"},
    {"key": "relevance_score", "label": "Relevance", "type": "number"},
    {"key": "status", "label": "Status", "type": "select", "options": ["New", "Contacted", "Meeting Set", "Closed"]}
  ]',
  '[
    {"key": "name", "label": "Name", "type": "text", "required": true},
    {"key": "title", "label": "Title", "type": "text"},
    {"key": "email", "label": "Email", "type": "email"},
    {"key": "linkedin_url", "label": "LinkedIn", "type": "url"}
  ]'
),
(
  'enterprise',
  'For B2B enterprise sales',
  '[
    {"key": "name", "label": "Company", "type": "text", "required": true},
    {"key": "website", "label": "Website", "type": "url"},
    {"key": "description", "label": "Industry/Sector", "type": "text"},
    {"key": "employee_count", "label": "Employees", "type": "text"},
    {"key": "relevance_score", "label": "Fit Score", "type": "number"},
    {"key": "status", "label": "Stage", "type": "select", "options": ["Prospect", "Qualified", "Proposal", "Negotiation", "Won", "Lost"]}
  ]',
  '[
    {"key": "name", "label": "Name", "type": "text", "required": true},
    {"key": "title", "label": "Title", "type": "text"},
    {"key": "department", "label": "Department", "type": "text"},
    {"key": "email", "label": "Email", "type": "email"},
    {"key": "phone", "label": "Phone", "type": "text"},
    {"key": "linkedin_url", "label": "LinkedIn", "type": "url"}
  ]'
),
(
  'research',
  'For R&D and academic outreach',
  '[
    {"key": "name", "label": "Institution", "type": "text", "required": true},
    {"key": "website", "label": "Website", "type": "url"},
    {"key": "description", "label": "Research Focus", "type": "text"},
    {"key": "department", "label": "Department", "type": "text"},
    {"key": "relevance_score", "label": "Relevance", "type": "number"}
  ]',
  '[
    {"key": "name", "label": "Name", "type": "text", "required": true},
    {"key": "title", "label": "Position", "type": "text"},
    {"key": "research_area", "label": "Research Area", "type": "text"},
    {"key": "email", "label": "Email", "type": "email"},
    {"key": "publications", "label": "Key Publications", "type": "text"}
  ]'
);

-- View to get project with its schema (resolved from template or custom)
CREATE OR REPLACE VIEW project_with_schema AS
SELECT
  p.*,
  COALESCE(
    p.schema_config->'company_columns',
    t.company_columns,
    '[]'::jsonb
  ) as resolved_company_columns,
  COALESCE(
    p.schema_config->'contact_columns',
    t.contact_columns,
    '[]'::jsonb
  ) as resolved_contact_columns
FROM projects p
LEFT JOIN schema_templates t ON p.schema_config->>'template' = t.name;

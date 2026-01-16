// Workflow steps
export type Step = 'context' | 'extract' | 'segments' | 'list' | 'research' | 'contacts' | 'emails' | 'conversations'

// Target seniority levels
export type SeniorityLevel = 'any' | 'c-suite' | 'director' | 'senior' | 'mid-senior' | 'mid' | 'junior'

export const SENIORITY_OPTIONS: { value: SeniorityLevel; label: string; description: string }[] = [
  { value: 'any', label: 'Any Level', description: 'No preference' },
  { value: 'c-suite', label: 'C-Suite', description: 'CEO, CFO, COO, CMO, etc.' },
  { value: 'director', label: 'Director+', description: 'Directors, VPs, Heads of' },
  { value: 'senior', label: 'Senior', description: 'Senior managers, leads' },
  { value: 'mid-senior', label: 'Mid-Senior', description: 'Managers, team leads' },
  { value: 'mid', label: 'Mid-level', description: 'Regular staff, specialists' },
  { value: 'junior', label: 'Junior', description: 'Associates, assistants' },
]

// Researched contact (from web search, before getting email)
export interface ResearchedContact {
  id: string
  company: string
  companyId: string
  name: string
  title: string
  linkedinUrl: string
  seniority: 'Executive' | 'Director' | 'Manager' | 'Staff' | 'Unknown'
  relevanceScore: number // 1-10
  reasoning: string // Why this person is relevant
  source: 'web_research'
  researchSources?: string[] // URLs where we found info about this person
  verified?: boolean // Found in multiple sources
}

// Segment to target
export interface Segment {
  id: string
  name: string
  description: string
  examples?: string[] // Example companies in this segment
}

// Project context extracted from documents
export interface ProjectContext {
  clientName: string
  product: string
  valueProposition: string
  targetMarket: string
  targetSegment: string // Legacy, kept for compatibility
  segments: Segment[] // Identified segments
  targetRoles: string[]
  targetSeniority: SeniorityLevel // Preferred seniority level for contacts
  visitDates?: string
  keyDifferentiators: string[]
  credibilitySignals: string[]
}

// Verification status types
export type VerificationStatus = 'verified' | 'unverified' | 'failed'
export type CompanySource = 'web_search' | 'apollo' | 'hunter' | 'import' | 'manual'
export type ContactSource = 'website_scrape' | 'apollo' | 'hunter' | 'apify' | 'import' | 'manual' | 'web_research'

// Company in the target list
export interface Company {
  id: string // Unique ID for deduplication
  name: string
  type: string
  website: string
  domain: string // Extracted domain for dedup (e.g., "acme.com")
  description: string
  relevance: string
  status: 'not_contacted' | 'reached_out' | 'checking' | 'meeting_set' | 'rejected' | 'no_response'
  remarks?: string

  // Verification fields
  verificationStatus: VerificationStatus
  verificationSource: CompanySource
  verifiedAt: number | null // Timestamp when verified
  websiteAccessible: boolean // Could we actually fetch the website?

  [key: string]: string | number | boolean | null | undefined // Allow custom fields
}

// Contact/person at a company
export interface Person {
  id: string // Unique ID
  company: string
  companyId: string // Link to company
  name: string
  title: string
  email: string
  linkedin: string

  // Seniority classification
  seniority?: 'Executive' | 'Director' | 'Manager' | 'Staff' | 'Unknown'

  // Source tracking
  source: ContactSource
  verificationStatus: VerificationStatus

  // Email confidence
  emailCertainty: number // 0-100
  emailSource: string // "Apollo API" | "Pattern: firstname.lastname" | etc
  emailVerified: boolean

  [key: string]: string | number | boolean | undefined // Allow custom fields
}

// Email version for history tracking
export interface EmailVersion {
  subject: string
  body: string
  prompt?: string // The prompt that created this version
  timestamp: number
}

// Generated email draft
export interface EmailDraft {
  id?: string // Optional ID for linking to conversations
  to: Person
  company: Company
  subject: string
  body: string
  type: 'cold' | 'warm' | 'followup' | 'referral'
  versions?: EmailVersion[] // History of refinements
  currentVersionIndex?: number // Which version is currently shown
}

// Email template for reuse
export type EmailTemplateCategory = 'cold_outreach' | 'followup' | 'introduction_request'

export interface EmailTemplate {
  id: string
  projectId: string | null // null = global template
  name: string
  category: EmailTemplateCategory
  description: string | null
  subject: string
  body: string
  variables: string[] // ['contact_name', 'company_name', 'client_name', etc.]
  isDefault: boolean
  createdAt: number
  updatedAt: number
}

// Available template variables
export const TEMPLATE_VARIABLES = [
  { key: 'contact_name', label: 'Contact Name', description: 'Name of the contact person' },
  { key: 'contact_title', label: 'Contact Title', description: 'Job title of the contact' },
  { key: 'contact_email', label: 'Contact Email', description: 'Email address of the contact' },
  { key: 'company_name', label: 'Company Name', description: 'Name of the target company' },
  { key: 'client_name', label: 'Client Name', description: 'Your client/company name' },
  { key: 'product_description', label: 'Product Description', description: 'Description of the product/service' },
  { key: 'value_proposition', label: 'Value Proposition', description: 'Key value proposition' },
  { key: 'visit_dates', label: 'Visit Dates', description: 'Dates of visit (if applicable)' },
  { key: 'previous_subject', label: 'Previous Subject', description: 'Subject of previous email (for followups)' },
] as const

// Conversation types
export type ConversationStatus = 'awaiting_reply' | 'reply_received' | 'meeting_set' | 'declined' | 'closed'

export type ResponseType = 'schedule' | 'confirm' | 'reschedule' | 'followup' | 'thankyou' | 'clarify' | 'custom'

export interface Message {
  id: string
  sender: 'you' | 'them'
  content: string
  subject?: string // For first message or subject changes
  timestamp: number
}

export interface Conversation {
  id: string
  personId: string // Links to Person.id
  companyId: string // Links to Company.id
  status: ConversationStatus
  initialEmailIndex?: number // Index in emails array (for linking to original email)
  messages: Message[]
  meetingDetails?: string // If meeting_set, store the details
  updatedAt: number
  createdAt: number
}

// User's custom schema
export interface Schema {
  companies: string[] // Column headers
  persons: string[] // Column headers
  companiesExample?: Record<string, string>
  personsExample?: Record<string, string>
}

// Document uploaded by user
export interface UploadedDoc {
  id: string
  name: string
  type: 'pdf' | 'doc' | 'text'
  label: string
  content?: string
}

// API keys configuration
export interface ApiKeys {
  apollo?: string
  hunter?: string
  apify?: string
}

// Provider selection for contact finding
export interface ProviderSelection {
  apollo: boolean
  hunter: boolean
  apify: boolean
  aiSearch: boolean
}

// Session credits tracking
export interface SessionCredits {
  apollo: number   // credits used
  hunter: number   // credits used
  apify: number    // compute units used
  aiSearch: number // count (free)
}

// Credits used response from API
export interface CreditsUsed {
  apollo: number
  hunter: number
  apify: number
  aiSearch: number
}

// Provider result summary
export interface ProviderResult {
  found: number
  errors?: string
}

// Project state (full data for persistence)
export interface Project {
  id: string
  name: string

  // Workflow state
  currentStep: Step
  context: ProjectContext | null
  contextDump: string
  documents: UploadedDoc[]

  // List generation
  selectedSegmentIds: string[]
  listCount: number

  // Results
  companies: Company[]
  selectedCompanyIds: number[]
  persons: Person[]
  selectedPersonIds: number[]
  emailsFound: boolean
  emails: EmailDraft[]
  conversations: Conversation[]

  // Incremental workflow tracking
  processedDomains: string[] // Domains already in project (serialized from Set)
  processedNames: string[] // Normalized company names (serialized from Set)
  lastRunAt: number | null // When last generation ran

  // API configuration
  apiKeys: ApiKeys

  // Metadata (timestamps for JSON serialization)
  createdAt: number
  updatedAt: number
}

// Project summary for list view (lightweight)
export interface ProjectSummary {
  id: string
  name: string
  clientName: string | null
  companyCount: number
  personCount: number
  emailCount: number
  currentStep: Step
  createdAt: number
  updatedAt: number
}

// Use case templates
export type UseCase =
  | 'market_entry'    // Export projects, distributors
  | 'job_search'      // Companies to apply to
  | 'sales'           // B2B prospecting
  | 'sourcing'        // Finding suppliers
  | 'recruiting'      // Finding candidates
  | 'fundraising'     // Startups finding VCs
  | 'investor_relations' // VCs finding LPs
  | 'custom'

import { Project, ProjectSummary, Step } from '@/types'

const INDEX_KEY = 'outreach-ai-index'
const PROJECT_PREFIX = 'outreach-ai-project-'
const ACTIVE_KEY = 'outreach-ai-active'
const LEGACY_KEY = 'outreach-ai-state'

// Generate unique ID
export function createProjectId(): string {
  return crypto.randomUUID()
}

// Convert full project to summary for list view
export function projectToSummary(project: Project): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    clientName: project.context?.clientName || null,
    companyCount: project.companies.length,
    personCount: project.persons.length,
    emailCount: project.emails.length,
    currentStep: project.currentStep,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
}

// Index operations
export function getIndex(): ProjectSummary[] {
  try {
    const data = localStorage.getItem(INDEX_KEY)
    return data ? JSON.parse(data) : []
  } catch (e) {
    console.error('Failed to get project index:', e)
    return []
  }
}

export function updateIndex(projects: ProjectSummary[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(projects))
  } catch (e) {
    console.error('Failed to update project index:', e)
  }
}

// Project CRUD
export function getProject(id: string): Project | null {
  try {
    const data = localStorage.getItem(PROJECT_PREFIX + id)
    return data ? JSON.parse(data) : null
  } catch (e) {
    console.error('Failed to get project:', e)
    return null
  }
}

export function saveProject(project: Project): void {
  try {
    // Update the project's updatedAt timestamp
    project.updatedAt = Date.now()

    // Save full project
    localStorage.setItem(PROJECT_PREFIX + project.id, JSON.stringify(project))

    // Update index
    const index = getIndex()
    const summary = projectToSummary(project)
    const existingIdx = index.findIndex(p => p.id === project.id)

    if (existingIdx >= 0) {
      index[existingIdx] = summary
    } else {
      index.unshift(summary) // Add to front (most recent)
    }

    updateIndex(index)
  } catch (e) {
    console.error('Failed to save project:', e)
  }
}

export function deleteProject(id: string): void {
  try {
    // Remove project data
    localStorage.removeItem(PROJECT_PREFIX + id)

    // Update index
    const index = getIndex()
    const filtered = index.filter(p => p.id !== id)
    updateIndex(filtered)

    // Clear active if this was active project
    if (getActiveProjectId() === id) {
      setActiveProjectId(null)
    }
  } catch (e) {
    console.error('Failed to delete project:', e)
  }
}

// Active project tracking
export function getActiveProjectId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY)
  } catch (e) {
    console.error('Failed to get active project ID:', e)
    return null
  }
}

export function setActiveProjectId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_KEY, id)
    } else {
      localStorage.removeItem(ACTIVE_KEY)
    }
  } catch (e) {
    console.error('Failed to set active project ID:', e)
  }
}

// Create a new empty project
export function createNewProject(name: string = 'Untitled Project'): Project {
  const now = Date.now()
  return {
    id: createProjectId(),
    name,
    currentStep: 'context' as Step,
    context: null,
    contextDump: '',
    documents: [],
    selectedSegmentIds: [],
    listCount: 5,
    companies: [],
    selectedCompanyIds: [],
    persons: [],
    selectedPersonIds: [],
    emailsFound: false,
    emails: [],
    conversations: [],
    // Incremental workflow tracking
    processedDomains: [],
    processedNames: [],
    lastRunAt: null,
    // API configuration
    apiKeys: {},
    createdAt: now,
    updatedAt: now,
  }
}

// Migration from legacy storage format
export function migrateFromLegacy(): Project | null {
  try {
    const legacyData = localStorage.getItem(LEGACY_KEY)
    if (!legacyData) return null

    const state = JSON.parse(legacyData)
    const now = Date.now()

    // Migrate old companies to new format with verification fields
    const migratedCompanies = (state.companies || []).map((c: Record<string, unknown>, i: number) => ({
      ...c,
      id: c.id || `legacy-company-${i}`,
      domain: c.domain || extractDomain(c.website as string || ''),
      verificationStatus: 'unverified' as const,
      verificationSource: 'import' as const,
      verifiedAt: null,
      websiteAccessible: false,
    }))

    // Migrate old persons to new format with verification fields
    const migratedPersons = (state.persons || []).map((p: Record<string, unknown>, i: number) => ({
      ...p,
      id: p.id || `legacy-person-${i}`,
      companyId: '',
      source: 'import' as const,
      verificationStatus: 'unverified' as const,
      emailCertainty: p.email ? 50 : 0,
      emailVerified: false,
    }))

    const project: Project = {
      id: createProjectId(),
      name: state.context?.clientName || 'Migrated Project',
      currentStep: state.currentStep || 'context',
      context: state.context || null,
      contextDump: state.contextDump || '',
      documents: [], // Documents weren't persisted in legacy format
      selectedSegmentIds: state.selectedSegmentIds || [],
      listCount: state.listCount || 5,
      companies: migratedCompanies,
      selectedCompanyIds: state.selectedCompanyIds || [],
      persons: migratedPersons,
      selectedPersonIds: state.selectedPersonIds || [],
      emailsFound: state.emailsFound || false,
      emails: state.emails || [],
      conversations: state.conversations || [],
      // Incremental workflow tracking - extract from existing companies
      processedDomains: migratedCompanies.map((c: { domain: string }) => c.domain).filter(Boolean),
      processedNames: migratedCompanies.map((c: { name: string }) => normalizeName(c.name)),
      lastRunAt: null,
      // API configuration
      apiKeys: {},
      createdAt: now,
      updatedAt: now,
    }

    // Save migrated project
    saveProject(project)

    // Set as active
    setActiveProjectId(project.id)

    // Remove legacy key
    localStorage.removeItem(LEGACY_KEY)

    return project
  } catch (e) {
    console.error('Migration from legacy failed:', e)
    return null
  }
}

// Helper: Extract domain from URL
export function extractDomain(url: string): string {
  if (!url) return ''
  try {
    // Add protocol if missing
    const urlWithProtocol = url.startsWith('http') ? url : `https://${url}`
    const parsed = new URL(urlWithProtocol)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    // Try to extract domain from raw string
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^\/\s]+)/i)
    return match ? match[1].replace(/^www\./, '') : ''
  }
}

// Helper: Normalize company name for deduplication
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+(pte|pvt|ltd|llc|inc|corp|co|corporation|company|limited|private)\.?$/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

// Check if legacy data exists
export function hasLegacyData(): boolean {
  return localStorage.getItem(LEGACY_KEY) !== null
}

// Ensure project has all new fields (backwards compatibility)
export function ensureProjectFields(project: Project): Project {
  // Add missing fields with defaults
  return {
    ...project,
    processedDomains: project.processedDomains || [],
    processedNames: project.processedNames || [],
    lastRunAt: project.lastRunAt ?? null,
    apiKeys: project.apiKeys || {},
    // Ensure companies have new fields
    companies: project.companies.map((c, i) => ({
      ...c,
      id: c.id || `company-${i}-${Date.now()}`,
      domain: c.domain || extractDomain(c.website || ''),
      verificationStatus: c.verificationStatus || 'unverified',
      verificationSource: c.verificationSource || 'manual',
      verifiedAt: c.verifiedAt ?? null,
      websiteAccessible: c.websiteAccessible ?? false,
    })),
    // Ensure persons have new fields
    persons: project.persons.map((p, i) => ({
      ...p,
      id: p.id || `person-${i}-${Date.now()}`,
      companyId: p.companyId || '',
      source: p.source || 'manual',
      verificationStatus: p.verificationStatus || 'unverified',
      emailCertainty: p.emailCertainty ?? (p.email ? 50 : 0),
      emailVerified: p.emailVerified ?? false,
    })),
  }
}

// Check if company is a duplicate (by domain or name)
export function isDuplicateCompany(
  company: { name: string; website: string },
  processedDomains: string[],
  processedNames: string[]
): { isDuplicate: boolean; reason?: string } {
  const domain = extractDomain(company.website)
  const normalizedName = normalizeName(company.name)

  // Check domain match
  if (domain && processedDomains.includes(domain)) {
    return { isDuplicate: true, reason: `Domain ${domain} already exists` }
  }

  // Check exact name match
  if (processedNames.includes(normalizedName)) {
    return { isDuplicate: true, reason: `Company "${company.name}" already exists` }
  }

  // Check fuzzy name match (simple Levenshtein-like check)
  for (const existingName of processedNames) {
    if (isSimilarName(normalizedName, existingName)) {
      return { isDuplicate: true, reason: `Company name similar to existing entry` }
    }
  }

  return { isDuplicate: false }
}

// Simple similarity check (not full Levenshtein, but catches common typos)
function isSimilarName(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 3) return false

  // Check if one contains the other
  if (a.includes(b) || b.includes(a)) return true

  // Simple character difference count
  let differences = 0
  const maxLen = Math.max(a.length, b.length)
  for (let i = 0; i < maxLen; i++) {
    if (a[i] !== b[i]) differences++
    if (differences > 2) return false
  }
  return differences <= 2
}

// Storage utility object for convenient imports
export const storage = {
  getIndex,
  updateIndex,
  getProject,
  saveProject,
  deleteProject,
  getActiveProjectId,
  setActiveProjectId,
  createNewProject,
  createProjectId,
  projectToSummary,
  migrateFromLegacy,
  hasLegacyData,
  ensureProjectFields,
  extractDomain,
  normalizeName,
  isDuplicateCompany,
}

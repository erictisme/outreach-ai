import { NextRequest, NextResponse } from 'next/server'
import { Company, Person, ProjectContext, ProviderSelection, CreditsUsed, ProviderResult, SeniorityLevel } from '@/types'

/**
 * Classify job title into seniority level
 */
function classifySeniority(title: string): 'Executive' | 'Director' | 'Manager' | 'Staff' | 'Unknown' {
  const lowerTitle = title.toLowerCase()

  // Executive level (C-Suite)
  if (/\b(ceo|cfo|coo|cmo|cto|cio|chief|president|founder|owner|partner|principal)\b/.test(lowerTitle)) {
    return 'Executive'
  }

  // Director level
  if (/\b(director|vp|vice president|head of|svp|evp|general manager|gm)\b/.test(lowerTitle)) {
    return 'Director'
  }

  // Manager level
  if (/\b(manager|lead|supervisor|team lead|senior|sr\.?)\b/.test(lowerTitle)) {
    return 'Manager'
  }

  // Staff level
  if (/\b(associate|assistant|coordinator|specialist|analyst|executive|officer|representative|intern|junior|jr\.?)\b/.test(lowerTitle)) {
    return 'Staff'
  }

  return 'Unknown'
}

/**
 * Get numeric ranking for seniority (higher = more senior)
 */
function getSeniorityRank(seniority: string): number {
  const ranks: Record<string, number> = {
    'Executive': 4,
    'Director': 3,
    'Manager': 2,
    'Staff': 1,
    'Unknown': 0,
  }
  return ranks[seniority] || 0
}

/**
 * Get minimum seniority rank from target seniority preference
 */
function getMinSeniorityRank(targetSeniority: SeniorityLevel): number {
  const minRanks: Record<SeniorityLevel, number> = {
    'any': 0,
    'c-suite': 4,
    'director': 3,
    'senior': 2,
    'mid-senior': 2,
    'mid': 1,
    'junior': 0,
  }
  return minRanks[targetSeniority] || 0
}

interface ProviderResponse {
  persons: Person[]
  summary: {
    companiesProcessed: number
    contactsFound: number
    creditsUsed?: number
    actorRunsUsed?: number
  }
  error?: string
}

/**
 * Unified contact finding endpoint
 *
 * Runs selected providers in parallel, merges results, and dedupes contacts.
 * Returns combined Person[] with credits tracking.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { companies, context, providers } = body as {
      companies: Company[]
      context: ProjectContext
      providers: ProviderSelection
    }

    if (!companies || companies.length === 0) {
      return NextResponse.json({
        persons: [],
        creditsUsed: { apollo: 0, hunter: 0, apify: 0, aiSearch: 0 },
        providerResults: {},
      })
    }

    // Check which providers are enabled and configured
    const providerCalls: Promise<{ provider: string; result: ProviderResponse }>[] = []
    const baseUrl = request.nextUrl.origin

    // Apollo
    if (providers.apollo && process.env.APOLLO_API_KEY) {
      providerCalls.push(
        callProvider('apollo', `${baseUrl}/api/find-contacts-apollo`, companies, context)
      )
    }

    // Hunter
    if (providers.hunter && process.env.HUNTER_API_KEY) {
      providerCalls.push(
        callProvider('hunter', `${baseUrl}/api/find-contacts-hunter`, companies, context)
      )
    }

    // Apify
    if (providers.apify && process.env.APIFY_API_KEY) {
      providerCalls.push(
        callProvider('apify', `${baseUrl}/api/find-contacts-apify`, companies, context)
      )
    }

    // AI Search (uses research-contacts endpoint, but we need to handle differently)
    // AI Search returns ResearchedContact[], not Person[], and uses SSE
    // For simplicity, we'll call a separate helper that converts the streaming response
    if (providers.aiSearch && process.env.GOOGLE_API_KEY) {
      providerCalls.push(
        callAISearch(`${baseUrl}/api/research-contacts`, companies, context)
      )
    }

    if (providerCalls.length === 0) {
      return NextResponse.json({
        error: 'No providers selected or configured. Enable at least one provider.',
        persons: [],
        creditsUsed: { apollo: 0, hunter: 0, apify: 0, aiSearch: 0 },
        providerResults: {},
      })
    }

    // Run all selected providers in parallel
    console.log(`[Selected] Running ${providerCalls.length} providers in parallel...`)
    const results = await Promise.all(providerCalls)

    // Collect results and credits
    const creditsUsed: CreditsUsed = { apollo: 0, hunter: 0, apify: 0, aiSearch: 0 }
    const providerResults: Record<string, ProviderResult> = {}
    const allPersons: Person[] = []

    for (const { provider, result } of results) {
      if (result.error) {
        providerResults[provider] = { found: 0, errors: result.error }
        continue
      }

      // Track credits
      if (provider === 'apollo') {
        creditsUsed.apollo = result.summary.creditsUsed || result.persons.length
      } else if (provider === 'hunter') {
        creditsUsed.hunter = result.summary.creditsUsed || result.persons.length
      } else if (provider === 'apify') {
        // Apify uses compute units, estimate ~0.02 CU per contact
        creditsUsed.apify = (result.summary.actorRunsUsed || 0) * 0.02
      } else if (provider === 'aiSearch') {
        creditsUsed.aiSearch = result.persons.length // Just count, it's free
      }

      providerResults[provider] = { found: result.persons.length }
      allPersons.push(...result.persons)

      console.log(`[Selected] ${provider}: ${result.persons.length} contacts`)
    }

    // Dedupe contacts
    const deduped = dedupeContacts(allPersons)
    console.log(`[Selected] Total: ${allPersons.length} → ${deduped.length} after dedup`)

    // Classify seniority for all contacts
    const withSeniority = deduped.map(person => ({
      ...person,
      seniority: person.seniority || classifySeniority(person.title),
    }))

    // Sort by seniority (most senior first), then by company
    const targetSeniority = context.targetSeniority || 'any'
    const minRank = getMinSeniorityRank(targetSeniority)

    const sorted = withSeniority.sort((a, b) => {
      // First sort by company (keep contacts from same company together)
      if (a.companyId !== b.companyId) {
        return a.companyId.localeCompare(b.companyId)
      }
      // Then by seniority (higher rank first)
      return getSeniorityRank(b.seniority || 'Unknown') - getSeniorityRank(a.seniority || 'Unknown')
    })

    // Log seniority filtering info
    const seniorCounts = sorted.reduce((acc, p) => {
      acc[p.seniority || 'Unknown'] = (acc[p.seniority || 'Unknown'] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    console.log(`[Selected] Seniority breakdown:`, seniorCounts)

    return NextResponse.json({
      persons: sorted,
      creditsUsed,
      providerResults,
      summary: {
        companiesProcessed: companies.length,
        contactsFound: sorted.length,
        providersUsed: Object.keys(providerResults).filter(p => providerResults[p].found > 0),
        seniorityBreakdown: seniorCounts,
      },
    })
  } catch (error) {
    console.error('Find contacts selected error:', error)
    return NextResponse.json(
      { error: 'Failed to find contacts' },
      { status: 500 }
    )
  }
}

/**
 * Call a provider endpoint
 */
async function callProvider(
  provider: string,
  endpoint: string,
  companies: Company[],
  context: ProjectContext
): Promise<{ provider: string; result: ProviderResponse }> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companies, context }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        provider,
        result: {
          persons: [],
          summary: { companiesProcessed: 0, contactsFound: 0 },
          error: errorData.error || `HTTP ${response.status}`,
        },
      }
    }

    const data = await response.json()
    return { provider, result: data }
  } catch (err) {
    return {
      provider,
      result: {
        persons: [],
        summary: { companiesProcessed: 0, contactsFound: 0 },
        error: err instanceof Error ? err.message : 'Unknown error',
      },
    }
  }
}

/**
 * Call AI Search endpoint (handles SSE streaming)
 * Converts ResearchedContact[] to Person[] for consistency
 */
async function callAISearch(
  endpoint: string,
  companies: Company[],
  context: ProjectContext
): Promise<{ provider: string; result: ProviderResponse }> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companies, context }),
    })

    if (!response.ok) {
      return {
        provider: 'aiSearch',
        result: {
          persons: [],
          summary: { companiesProcessed: 0, contactsFound: 0 },
          error: `HTTP ${response.status}`,
        },
      }
    }

    // Parse SSE stream
    const reader = response.body?.getReader()
    if (!reader) {
      return {
        provider: 'aiSearch',
        result: {
          persons: [],
          summary: { companiesProcessed: 0, contactsFound: 0 },
          error: 'No response body',
        },
      }
    }

    const decoder = new TextDecoder()
    let buffer = ''
    const persons: Person[] = []

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Parse SSE events
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))

            // Handle company_done event - has result with contacts
            if (data.result?.contacts) {
              for (const contact of data.result.contacts) {
                // Convert ResearchedContact to Person
                persons.push({
                  id: contact.id || `ai-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                  company: contact.company,
                  companyId: contact.companyId,
                  name: contact.name,
                  title: contact.title,
                  email: '', // AI search doesn't get emails
                  linkedin: contact.linkedinUrl || '',
                  source: 'web_research',
                  verificationStatus: contact.verified ? 'verified' : 'unverified',
                  emailCertainty: 0,
                  emailSource: 'Needs email lookup',
                  emailVerified: false,
                })
              }
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }
    }

    return {
      provider: 'aiSearch',
      result: {
        persons,
        summary: {
          companiesProcessed: companies.length,
          contactsFound: persons.length,
        },
      },
    }
  } catch (err) {
    return {
      provider: 'aiSearch',
      result: {
        persons: [],
        summary: { companiesProcessed: 0, contactsFound: 0 },
        error: err instanceof Error ? err.message : 'Unknown error',
      },
    }
  }
}

/**
 * Dedupe contacts by email (primary) or name+company (fallback)
 * Prefers contacts with:
 * 1. Verified emails over unverified
 * 2. Higher email certainty
 * 3. More complete data (has LinkedIn, title, etc.)
 */
function dedupeContacts(contacts: Person[]): Person[] {
  const byEmail = new Map<string, Person>()
  const byNameCompany = new Map<string, Person>()

  for (const contact of contacts) {
    // Primary dedup by email (if exists)
    if (contact.email) {
      const emailKey = contact.email.toLowerCase()
      const existing = byEmail.get(emailKey)

      if (!existing || shouldReplace(existing, contact)) {
        byEmail.set(emailKey, contact)
      }
    } else {
      // Fallback dedup by normalized name + company
      const nameKey = `${normalizeName(contact.name)}|${contact.companyId}`
      const existing = byNameCompany.get(nameKey)

      if (!existing || shouldReplace(existing, contact)) {
        byNameCompany.set(nameKey, contact)
      }
    }
  }

  // Merge results, preferring contacts with emails
  const result = new Map<string, Person>()

  // Add all contacts with emails first
  for (const contact of byEmail.values()) {
    result.set(contact.id, contact)
  }

  // Add contacts without emails if no email version exists
  for (const contact of byNameCompany.values()) {
    const nameKey = `${normalizeName(contact.name)}|${contact.companyId}`

    // Check if we have this person with an email already
    const hasEmailVersion = Array.from(byEmail.values()).some(
      p => normalizeName(p.name) === normalizeName(contact.name) && p.companyId === contact.companyId
    )

    if (!hasEmailVersion) {
      result.set(contact.id, contact)
    }
  }

  return Array.from(result.values())
}

function shouldReplace(existing: Person, candidate: Person): boolean {
  // Prefer verified over unverified
  if (candidate.emailVerified && !existing.emailVerified) return true
  if (!candidate.emailVerified && existing.emailVerified) return false

  // Prefer higher certainty
  if (candidate.emailCertainty > existing.emailCertainty) return true
  if (candidate.emailCertainty < existing.emailCertainty) return false

  // Prefer more complete data
  const existingScore = (existing.email ? 2 : 0) + (existing.linkedin ? 1 : 0) + (existing.title ? 1 : 0)
  const candidateScore = (candidate.email ? 2 : 0) + (candidate.linkedin ? 1 : 0) + (candidate.title ? 1 : 0)

  return candidateScore > existingScore
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '')
}

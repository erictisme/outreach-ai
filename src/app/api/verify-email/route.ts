import { NextRequest, NextResponse } from 'next/server'
import { Person, Company } from '@/types'
import { extractDomain } from '@/lib/storage'

// Common email patterns
function generateEmailPatterns(firstName: string, lastName: string, domain: string): string[] {
  const first = firstName.toLowerCase().trim()
  const last = lastName.toLowerCase().trim()
  const firstInitial = first[0] || ''
  const lastInitial = last[0] || ''

  return [
    `${first}.${last}@${domain}`,
    `${first}${last}@${domain}`,
    `${firstInitial}.${last}@${domain}`,
    `${firstInitial}${last}@${domain}`,
    `${first}@${domain}`,
    `${first}_${last}@${domain}`,
    `${last}.${first}@${domain}`,
    `${first}${lastInitial}@${domain}`,
  ].filter(email => email.includes('@') && !email.includes('..'))
}

// Parse name into first and last name
function parseName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' }
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

// Check if domain has MX records (mail server)
async function checkMxRecords(domain: string): Promise<boolean> {
  try {
    // Use a DNS lookup service or Google's DNS-over-HTTPS
    const response = await fetch(
      `https://dns.google/resolve?name=${domain}&type=MX`,
      { method: 'GET' }
    )
    const data = await response.json()
    return data.Answer && data.Answer.length > 0
  } catch {
    return false
  }
}

// Calculate email certainty based on available information
function calculateCertainty(params: {
  hasVerifiedEmail: boolean
  foundOnWebsite: boolean
  hasCompanyPattern: boolean
  hasMxRecords: boolean
  isPatternGuess: boolean
}): number {
  if (params.hasVerifiedEmail) return 100 // API verified
  if (params.foundOnWebsite) return 95 // Found on company website
  if (params.hasCompanyPattern && params.hasMxRecords) return 85 // Pattern + MX verified
  if (params.hasMxRecords) return 70 // MX records exist
  if (params.isPatternGuess) return 50 // Pattern guess only
  return 20 // Domain may not exist
}

export async function POST(request: NextRequest) {
  try {
    const { persons, companies, hunterApiKey } = await request.json() as {
      persons: Person[]
      companies: Company[]
      hunterApiKey?: string
    }

    if (!persons || persons.length === 0) {
      return NextResponse.json({ persons: [] })
    }

    // Create company domain lookup
    const companyDomains: Record<string, string> = {}
    for (const company of companies) {
      const domain = company.domain || extractDomain(company.website)
      if (domain) {
        companyDomains[company.name.toLowerCase()] = domain
      }
    }

    // Check MX records for unique domains (in parallel)
    const uniqueDomains = [...new Set(Object.values(companyDomains))]
    const mxResults: Record<string, boolean> = {}

    await Promise.all(
      uniqueDomains.map(async (domain) => {
        mxResults[domain] = await checkMxRecords(domain)
      })
    )

    // Process each person
    const CONCURRENCY = 5
    const results: Person[] = []

    for (let i = 0; i < persons.length; i += CONCURRENCY) {
      const batch = persons.slice(i, i + CONCURRENCY)

      const batchResults = await Promise.all(
        batch.map(async (person): Promise<Person> => {
          // If already has verified email, skip
          if (person.emailVerified && person.email) {
            return person
          }

          // Get domain for this person's company
          const domain = companyDomains[person.company.toLowerCase()]
          if (!domain) {
            return {
              ...person,
              emailCertainty: 0,
              emailSource: 'No company domain found',
            }
          }

          const hasMxRecords = mxResults[domain] ?? false

          // If already has email from website scraping, just update certainty
          if (person.email && person.source === 'website_scrape') {
            return {
              ...person,
              emailCertainty: calculateCertainty({
                hasVerifiedEmail: false,
                foundOnWebsite: true,
                hasCompanyPattern: false,
                hasMxRecords,
                isPatternGuess: false,
              }),
              emailVerified: false,
            }
          }

          // Generate email patterns
          const { firstName, lastName } = parseName(person.name)
          const patterns = generateEmailPatterns(firstName, lastName, domain)

          if (patterns.length === 0) {
            return {
              ...person,
              emailCertainty: 0,
              emailSource: 'Could not generate email patterns',
            }
          }

          // If Hunter API key is available, try to verify
          if (hunterApiKey) {
            for (const pattern of patterns.slice(0, 3)) { // Try first 3 patterns
              try {
                const response = await fetch(
                  `https://api.hunter.io/v2/email-verifier?email=${pattern}&api_key=${hunterApiKey}`
                )
                const data = await response.json()

                if (data.data?.status === 'valid') {
                  return {
                    ...person,
                    email: pattern,
                    emailCertainty: 100,
                    emailSource: 'Hunter.io verified',
                    emailVerified: true,
                  }
                }
              } catch {
                // Continue to next pattern
              }
            }
          }

          // Use first pattern as best guess
          const bestGuess = patterns[0]
          const certainty = calculateCertainty({
            hasVerifiedEmail: false,
            foundOnWebsite: false,
            hasCompanyPattern: true,
            hasMxRecords,
            isPatternGuess: true,
          })

          return {
            ...person,
            email: person.email || bestGuess,
            emailCertainty: person.email ? person.emailCertainty : certainty,
            emailSource: person.email ? person.emailSource : `Pattern: ${firstName.toLowerCase()}.${lastName.toLowerCase()}`,
            emailVerified: false,
          }
        })
      )

      results.push(...batchResults)
    }

    return NextResponse.json({
      persons: results,
      summary: {
        total: persons.length,
        verified: results.filter(p => p.emailVerified).length,
        withEmail: results.filter(p => p.email).length,
        highCertainty: results.filter(p => p.emailCertainty >= 80).length,
      },
    })
  } catch (error) {
    console.error('Verify email error:', error)
    return NextResponse.json(
      { error: 'Failed to verify emails' },
      { status: 500 }
    )
  }
}

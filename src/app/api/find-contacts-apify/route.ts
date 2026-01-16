import { NextRequest, NextResponse } from 'next/server'
import { Company, Person, ProjectContext } from '@/types'
import {
  ApifyClient,
  searchApolloViaScraper,
  googleSearchContacts,
  sleepWithJitter,
} from '@/lib/apify'

/**
 * Find contacts via Apify scrapers
 *
 * Strategy:
 * 1. Try Apollo scraper first (most complete data)
 * 2. Fall back to Google search scraper if no results
 *
 * Safe defaults:
 * - Low concurrency (1)
 * - Proxy enabled
 * - Randomized delays between companies
 */
export async function POST(request: NextRequest) {
  try {
    const { companies, context } = await request.json() as {
      companies: Company[]
      context: ProjectContext
    }

    const apifyApiKey = process.env.APIFY_API_KEY
    if (!apifyApiKey) {
      return NextResponse.json(
        { error: 'Apify API not configured. Set APIFY_API_KEY in .env.local' },
        { status: 500 }
      )
    }

    if (!companies || companies.length === 0) {
      return NextResponse.json({
        persons: [],
        summary: { companiesProcessed: 0, contactsFound: 0, actorRunsUsed: 0 },
      })
    }

    const client = new ApifyClient(apifyApiKey)
    const targetRoles = context?.targetRoles || ['CEO', 'Managing Director', 'Sales Director', 'Business Development']
    const allPersons: Person[] = []
    let actorRunsUsed = 0

    for (const company of companies) {
      // Get domain
      const domain = company.domain || extractDomain(company.website)
      if (!domain) continue

      try {
        // Try Apollo scraper first
        console.log(`[Apify] Searching Apollo for ${company.name} (${domain})...`)
        const apolloResults = await searchApolloViaScraper(client, domain, targetRoles)
        actorRunsUsed++

        if (apolloResults.length > 0) {
          for (const result of apolloResults) {
            if (!result.name) continue

            allPersons.push(createPerson(result, company))
          }
          console.log(`[Apify] Found ${apolloResults.length} contacts at ${company.name} via Apollo`)
        } else {
          // No Apollo results - try Google search fallback
          console.log(`[Apify] No Apollo results, trying Google for ${company.name}...`)
          const googleResults = await googleSearchContacts(client, company.name, targetRoles)
          actorRunsUsed++

          for (const result of googleResults) {
            if (!result.name) continue

            allPersons.push(createPerson(result, company))
          }

          if (googleResults.length > 0) {
            console.log(`[Apify] Found ${googleResults.length} contacts at ${company.name} via Google`)
          } else {
            console.log(`[Apify] No contacts found for ${company.name}`)
          }
        }

        // Randomized delay between companies (500-800ms)
        await sleepWithJitter(500, 300)

      } catch (err) {
        console.error(`[Apify] Error for ${company.name}:`, err)
        // Continue to next company on error
        continue
      }
    }

    return NextResponse.json({
      persons: allPersons,
      summary: {
        companiesProcessed: companies.length,
        contactsFound: allPersons.length,
        actorRunsUsed,
      },
    })
  } catch (error) {
    console.error('Find contacts Apify error:', error)
    return NextResponse.json(
      { error: 'Failed to find contacts via Apify' },
      { status: 500 }
    )
  }
}

function extractDomain(website?: string): string | null {
  if (!website) return null
  try {
    return new URL(
      website.startsWith('http') ? website : `https://${website}`
    ).hostname.replace('www.', '')
  } catch {
    return null
  }
}

function createPerson(
  contact: { name: string; title: string; email?: string; linkedin?: string; source: string },
  company: Company
): Person {
  return {
    id: `person-apify-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    company: company.name,
    companyId: company.id,
    name: contact.name,
    title: contact.title || '',
    email: contact.email || '',
    linkedin: contact.linkedin || '',
    source: 'apify',
    verificationStatus: contact.email ? 'unverified' : 'unverified',
    emailCertainty: contact.email ? 60 : 0, // Scraped emails need verification
    emailSource: contact.email
      ? `Apify (${contact.source})`
      : 'Needs email lookup',
    emailVerified: false,
  }
}

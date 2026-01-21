import { NextRequest, NextResponse } from 'next/server'
import { Company, Person, ProjectContext } from '@/types'

interface ApolloPersonResult {
  id: string
  first_name: string
  last_name: string
  last_name_obfuscated?: string  // Apollo may return obfuscated last name
  name: string
  title: string
  email: string
  email_status: 'verified' | 'guessed' | 'unavailable' | null
  has_email: boolean
  linkedin_url: string
  organization: {
    name: string
    website_url: string
  }
}

interface ApolloSearchResponse {
  people: ApolloPersonResult[]
  pagination: {
    page: number
    per_page: number
    total_entries: number
    total_pages: number
  }
}

export async function POST(request: NextRequest) {
  try {
    const { companies, context, apiKey } = await request.json() as {
      companies: Company[]
      context: ProjectContext
      apiKey?: string  // API key from client (user-provided)
    }

    // Prefer user-provided apiKey, fall back to env var
    const apolloApiKey = apiKey || process.env.APOLLO_API_KEY
    if (!apolloApiKey) {
      return NextResponse.json({ error: 'Apollo API key required. Please add your API key in settings.' }, { status: 400 })
    }

    if (!companies || companies.length === 0) {
      return NextResponse.json({ persons: [], summary: { companiesProcessed: 0, contactsFound: 0 } })
    }

    const targetTitles = context?.targetRoles || ['CEO', 'Managing Director', 'Sales Director', 'Business Development']

    // Build title keywords for Apollo search (kept for potential future use)
    const _titleKeywords = targetTitles.flatMap(title => {
      // Extract key words from titles
      const words = title.toLowerCase().split(/\s+/)
      return words.filter(w => w.length > 3) // Filter out small words
    })

    const allPersons: Person[] = []
    let creditsUsed = 0

    // Process companies in batches to avoid rate limits
    for (const company of companies) {
      if (!company.domain && !company.website) continue

      const domain = company.domain || new URL(
        company.website.startsWith('http') ? company.website : `https://${company.website}`
      ).hostname.replace('www.', '')

      try {
        // Apollo People Search API
        // Docs: https://docs.apollo.io/reference/people-api-search
        // Using mixed_people/api_search endpoint (the non-api_search version is deprecated)
        // IMPORTANT: q_organization_domains takes a STRING (single domain), not an array
        const response = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'X-Api-Key': apolloApiKey,  // Use X-Api-Key header (capitalized)
          },
          body: JSON.stringify({
            q_organization_domains: domain,  // STRING, not array
            person_titles: targetTitles,
            page: 1,
            per_page: 5, // Limit to 5 people per company to save credits
          }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`Apollo API error for ${company.name}:`, response.status, errorText)

          if (response.status === 401) {
            return NextResponse.json({ error: 'Invalid Apollo API key' }, { status: 401 })
          }
          if (response.status === 422) {
            // Endpoint deprecated or invalid request format
            console.error('Apollo API 422 error - check endpoint and request format:', errorText)
            return NextResponse.json({ error: 'Apollo API request failed. The endpoint or request format may have changed.' }, { status: 422 })
          }
          if (response.status === 429) {
            // Rate limited, wait and continue
            await new Promise(resolve => setTimeout(resolve, 1000))
            continue
          }
          continue
        }

        const data: ApolloSearchResponse = await response.json()
        creditsUsed += 1 // Each search costs credits

        // Convert Apollo results to our Person type
        for (const person of data.people || []) {
          // Skip contacts without a usable name
          if (!person.first_name && !person.name) continue

          // Build full name: prefer first_name + last_name (not obfuscated)
          // Fall back to person.name if available, then just first_name
          let fullName = ''
          if (person.first_name && person.last_name) {
            fullName = `${person.first_name} ${person.last_name}`.trim()
          } else if (person.name) {
            fullName = person.name
          } else if (person.first_name) {
            fullName = person.first_name
          }

          // Skip if we couldn't build a valid name
          if (!fullName || fullName === 'undefined' || fullName === 'undefined undefined') continue

          // Determine email certainty based on Apollo's status
          let emailCertainty = 0
          let emailSource = ''
          if (person.email) {
            if (person.email_status === 'verified') {
              emailCertainty = 100
              emailSource = 'Apollo verified'
            } else if (person.email_status === 'guessed') {
              emailCertainty = 75
              emailSource = 'Apollo pattern'
            } else {
              emailCertainty = 60
              emailSource = 'Apollo'
            }
          }

          allPersons.push({
            id: `person-apollo-${person.id || Date.now()}-${Math.random().toString(36).substring(7)}`,
            company: company.name,
            companyId: company.id,
            name: fullName,
            title: person.title || '',
            email: person.email || '',
            linkedin: person.linkedin_url || '',
            source: 'apollo',
            verificationStatus: person.email_status === 'verified' ? 'verified' : 'unverified',
            emailCertainty,
            emailSource,
            emailVerified: person.email_status === 'verified',
          })
        }

        // Small delay between requests to be nice to the API
        await new Promise(resolve => setTimeout(resolve, 200))

      } catch (err) {
        console.error(`Error fetching contacts for ${company.name}:`, err)
        continue
      }
    }

    // Remove duplicates based on name + company combination
    const seen = new Set<string>()
    const uniquePersons = allPersons.filter(person => {
      const key = `${person.name.toLowerCase()}-${person.companyId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return NextResponse.json({
      persons: uniquePersons,
      summary: {
        companiesProcessed: companies.length,
        contactsFound: uniquePersons.length,
        creditsUsed,
      },
    })
  } catch (error) {
    console.error('Find contacts Apollo error:', error)
    return NextResponse.json(
      { error: 'Failed to find contacts via Apollo' },
      { status: 500 }
    )
  }
}

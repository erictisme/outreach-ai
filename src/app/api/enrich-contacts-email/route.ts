import { NextRequest, NextResponse } from 'next/server'
import { ResearchedContact, Person } from '@/types'

interface ApolloPersonResult {
  id: string
  first_name: string
  last_name: string
  name: string
  title: string
  email: string
  email_status: 'verified' | 'guessed' | 'unavailable' | null
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

// Apollo pricing estimate (credits per contact lookup)
export const APOLLO_CREDIT_COST_PER_CONTACT = 1

export async function POST(request: NextRequest) {
  try {
    const { contacts, companyDomains, apiKey } = await request.json() as {
      contacts: ResearchedContact[]
      companyDomains: Record<string, string> // companyId -> domain mapping
      apiKey?: string
    }

    // Prefer user-provided apiKey, fall back to env var
    const apolloApiKey = apiKey || process.env.APOLLO_API_KEY
    if (!apolloApiKey) {
      return NextResponse.json(
        { error: 'Apollo API key required. Please add your API key in settings.' },
        { status: 400 }
      )
    }

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({
        persons: [],
        summary: { contactsEnriched: 0, creditsUsed: 0 }
      })
    }

    const enrichedPersons: Person[] = []
    let creditsUsed = 0
    let successCount = 0
    let failCount = 0

    for (const contact of contacts) {
      const domain = companyDomains[contact.companyId]

      if (!domain) {
        // If no domain, just convert to Person without email
        enrichedPersons.push({
          id: contact.id.replace('free-', 'person-'),
          company: contact.company,
          companyId: contact.companyId,
          name: contact.name,
          title: contact.title,
          email: '',
          linkedin: contact.linkedinUrl || '',
          seniority: contact.seniority,
          source: 'web_research',
          verificationStatus: 'unverified',
          emailCertainty: 0,
          emailSource: 'Not found',
          emailVerified: false,
        })
        failCount++
        continue
      }

      try {
        // Use Apollo People Search to find the specific person
        // Search by name + organization domain
        const response = await fetch('https://api.apollo.io/api/v1/mixed_people/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'X-Api-Key': apolloApiKey,
          },
          body: JSON.stringify({
            q_organization_domains: domain,
            q_person_name: contact.name,
            page: 1,
            per_page: 3, // Get top 3 matches to find the right person
          }),
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`Apollo API error for ${contact.name}:`, response.status, errorText)

          if (response.status === 401) {
            return NextResponse.json({ error: 'Invalid Apollo API key' }, { status: 401 })
          }
          if (response.status === 429) {
            // Rate limited, wait and continue
            await new Promise(resolve => setTimeout(resolve, 1000))
          }

          // Add contact without email
          enrichedPersons.push({
            id: contact.id.replace('free-', 'person-'),
            company: contact.company,
            companyId: contact.companyId,
            name: contact.name,
            title: contact.title,
            email: '',
            linkedin: contact.linkedinUrl || '',
            seniority: contact.seniority,
            source: 'web_research',
            verificationStatus: 'failed',
            emailCertainty: 0,
            emailSource: 'Apollo lookup failed',
            emailVerified: false,
          })
          failCount++
          continue
        }

        const data: ApolloSearchResponse = await response.json()
        creditsUsed += 1 // Each search costs credits

        // Find best match from results
        const matchedPerson = data.people?.find(p => {
          const apolloName = (p.name || `${p.first_name} ${p.last_name}`).toLowerCase().trim()
          const contactName = contact.name.toLowerCase().trim()
          // Fuzzy match: check if names are similar
          return apolloName.includes(contactName) || contactName.includes(apolloName) ||
            apolloName.split(' ')[0] === contactName.split(' ')[0] // Same first name
        }) || data.people?.[0] // Fall back to first result if no exact match

        if (matchedPerson && matchedPerson.email) {
          // Determine email certainty based on Apollo's status
          let emailCertainty = 0
          let emailSource = ''
          if (matchedPerson.email_status === 'verified') {
            emailCertainty = 100
            emailSource = 'Apollo verified'
          } else if (matchedPerson.email_status === 'guessed') {
            emailCertainty = 75
            emailSource = 'Apollo pattern'
          } else {
            emailCertainty = 60
            emailSource = 'Apollo'
          }

          enrichedPersons.push({
            id: contact.id.replace('free-', 'person-'),
            company: contact.company,
            companyId: contact.companyId,
            name: contact.name,
            title: contact.title,
            email: matchedPerson.email,
            linkedin: matchedPerson.linkedin_url || contact.linkedinUrl || '',
            seniority: contact.seniority,
            source: 'apollo',
            verificationStatus: matchedPerson.email_status === 'verified' ? 'verified' : 'unverified',
            emailCertainty,
            emailSource,
            emailVerified: matchedPerson.email_status === 'verified',
          })
          successCount++
        } else {
          // No email found
          enrichedPersons.push({
            id: contact.id.replace('free-', 'person-'),
            company: contact.company,
            companyId: contact.companyId,
            name: contact.name,
            title: contact.title,
            email: '',
            linkedin: contact.linkedinUrl || '',
            seniority: contact.seniority,
            source: 'web_research',
            verificationStatus: 'unverified',
            emailCertainty: 0,
            emailSource: 'Not found in Apollo',
            emailVerified: false,
          })
          failCount++
        }

        // Small delay between requests to be nice to the API
        await new Promise(resolve => setTimeout(resolve, 200))

      } catch (err) {
        console.error(`Error enriching contact ${contact.name}:`, err)

        // Add contact without email on error
        enrichedPersons.push({
          id: contact.id.replace('free-', 'person-'),
          company: contact.company,
          companyId: contact.companyId,
          name: contact.name,
          title: contact.title,
          email: '',
          linkedin: contact.linkedinUrl || '',
          seniority: contact.seniority,
          source: 'web_research',
          verificationStatus: 'failed',
          emailCertainty: 0,
          emailSource: 'Lookup error',
          emailVerified: false,
        })
        failCount++
      }
    }

    return NextResponse.json({
      persons: enrichedPersons,
      summary: {
        contactsEnriched: contacts.length,
        emailsFound: successCount,
        emailsNotFound: failCount,
        creditsUsed,
      },
    })
  } catch (error) {
    console.error('Enrich contacts email error:', error)
    return NextResponse.json(
      { error: 'Failed to enrich contacts with emails' },
      { status: 500 }
    )
  }
}

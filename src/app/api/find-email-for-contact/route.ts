import { NextRequest, NextResponse } from 'next/server'
import { Person, ResearchedContact } from '@/types'

interface HunterEmailFinderResponse {
  data: {
    first_name: string
    last_name: string
    email: string | null
    score: number
    domain: string
    accept_all: boolean
    position: string | null
    twitter: string | null
    linkedin_url: string | null
    phone_number: string | null
    company: string | null
    sources: Array<{
      domain: string
      uri: string
      extracted_on: string
      last_seen_on: string
      still_on_page: boolean
    }>
  }
  meta: {
    params: {
      first_name: string
      last_name: string
      domain: string
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { contacts, companies } = await request.json() as {
      contacts: ResearchedContact[]
      companies: Array<{ id: string; name: string; domain?: string; website?: string }>
    }

    const hunterApiKey = process.env.HUNTER_API_KEY
    if (!hunterApiKey) {
      return NextResponse.json({ error: 'Hunter API not configured' }, { status: 500 })
    }

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({ persons: [] })
    }

    const persons: Person[] = []

    for (const contact of contacts) {
      // Find the company for this contact
      const company = companies.find(c => c.id === contact.companyId || c.name === contact.company)
      if (!company) {
        // Create person without email
        persons.push(createPersonWithoutEmail(contact))
        continue
      }

      // Get domain
      const domain = company.domain || extractDomain(company.website)
      if (!domain) {
        persons.push(createPersonWithoutEmail(contact))
        continue
      }

      // Split name into first/last
      const nameParts = contact.name.trim().split(/\s+/)
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || nameParts[0] || ''

      if (!firstName) {
        persons.push(createPersonWithoutEmail(contact))
        continue
      }

      try {
        // Hunter Email Finder API
        const url = new URL('https://api.hunter.io/v2/email-finder')
        url.searchParams.set('domain', domain)
        url.searchParams.set('first_name', firstName)
        url.searchParams.set('last_name', lastName)
        url.searchParams.set('api_key', hunterApiKey)

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        })

        if (!response.ok) {
          console.error(`Hunter Email Finder error for ${contact.name}:`, response.status)

          if (response.status === 429) {
            // Rate limited - wait and retry once
            await new Promise(resolve => setTimeout(resolve, 2000))
            const retryResponse = await fetch(url.toString(), {
              method: 'GET',
              headers: { 'Accept': 'application/json' },
            })
            if (!retryResponse.ok) {
              persons.push(createPersonWithoutEmail(contact))
              continue
            }
            const retryData: HunterEmailFinderResponse = await retryResponse.json()
            if (retryData.data?.email) {
              persons.push(createPersonWithEmail(contact, retryData.data))
            } else {
              persons.push(createPersonWithoutEmail(contact))
            }
            continue
          }

          persons.push(createPersonWithoutEmail(contact))
          continue
        }

        const data: HunterEmailFinderResponse = await response.json()

        if (data.data?.email) {
          persons.push(createPersonWithEmail(contact, data.data))
        } else {
          // No email found - try pattern generation as fallback
          const patternEmail = await tryEmailPattern(domain, firstName, lastName, hunterApiKey)
          if (patternEmail) {
            persons.push({
              id: `person-${contact.id}`,
              company: contact.company,
              companyId: contact.companyId,
              name: contact.name,
              title: contact.title,
              email: patternEmail,
              linkedin: contact.linkedinUrl || '',
              source: 'hunter',
              verificationStatus: 'unverified',
              emailCertainty: 50,
              emailSource: 'Pattern guess - verify before sending',
              emailVerified: false,
            })
          } else {
            persons.push(createPersonWithoutEmail(contact))
          }
        }

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 300))

      } catch (err) {
        console.error(`Error finding email for ${contact.name}:`, err)
        persons.push(createPersonWithoutEmail(contact))
      }
    }

    return NextResponse.json({
      persons,
      summary: {
        contactsProcessed: contacts.length,
        emailsFound: persons.filter(p => p.email).length,
      },
    })
  } catch (error) {
    console.error('Find email for contact error:', error)
    return NextResponse.json({ error: 'Failed to find emails' }, { status: 500 })
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

function createPersonWithoutEmail(contact: ResearchedContact): Person {
  return {
    id: `person-${contact.id}`,
    company: contact.company,
    companyId: contact.companyId,
    name: contact.name,
    title: contact.title,
    email: '',
    linkedin: contact.linkedinUrl || '',
    source: 'web_research',
    verificationStatus: 'unverified',
    emailCertainty: 0,
    emailSource: 'Not found - try manual lookup',
    emailVerified: false,
  }
}

function createPersonWithEmail(contact: ResearchedContact, data: HunterEmailFinderResponse['data']): Person {
  return {
    id: `person-${contact.id}`,
    company: contact.company,
    companyId: contact.companyId,
    name: contact.name,
    title: contact.title,
    email: data.email!,
    linkedin: data.linkedin_url || contact.linkedinUrl || '',
    source: 'hunter',
    verificationStatus: data.score >= 90 ? 'verified' : 'unverified',
    emailCertainty: data.score,
    emailSource: `Hunter Email Finder (${data.score}% confidence)`,
    emailVerified: data.score >= 90,
  }
}

async function tryEmailPattern(domain: string, firstName: string, lastName: string, apiKey: string): Promise<string | null> {
  // Try common email patterns
  const patterns = [
    `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`,
    `${firstName.toLowerCase()}${lastName.toLowerCase()}@${domain}`,
    `${firstName.toLowerCase()[0]}${lastName.toLowerCase()}@${domain}`,
    `${firstName.toLowerCase()}@${domain}`,
  ]

  // Use Hunter's email verifier to check which pattern might work
  for (const email of patterns.slice(0, 2)) { // Only try first 2 to save API credits
    try {
      const url = new URL('https://api.hunter.io/v2/email-verifier')
      url.searchParams.set('email', email)
      url.searchParams.set('api_key', apiKey)

      const response = await fetch(url.toString())
      if (response.ok) {
        const data = await response.json()
        if (data.data?.status === 'valid' || data.data?.score >= 70) {
          return email
        }
      }
      await new Promise(resolve => setTimeout(resolve, 200))
    } catch {
      continue
    }
  }

  return null
}

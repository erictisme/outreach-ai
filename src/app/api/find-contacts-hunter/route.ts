import { NextRequest, NextResponse } from 'next/server'
import { Company, Person, ProjectContext } from '@/types'

interface HunterEmail {
  value: string
  type: 'personal' | 'generic'
  confidence: number
  first_name: string | null
  last_name: string | null
  position: string | null
  seniority: string | null
  department: string | null
  linkedin: string | null
  twitter: string | null
  phone_number: string | null
}

interface HunterDomainSearchResponse {
  data: {
    domain: string
    disposable: boolean
    webmail: boolean
    accept_all: boolean
    pattern: string | null
    organization: string | null
    emails: HunterEmail[]
  }
  meta: {
    results: number
    limit: number
    offset: number
    params: {
      domain: string
      company: string | null
      type: string | null
      seniority: string | null
      department: string | null
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { companies, context } = await request.json() as {
      companies: Company[]
      context: ProjectContext
    }

    const hunterApiKey = process.env.HUNTER_API_KEY
    if (!hunterApiKey) {
      return NextResponse.json({ error: 'Hunter API not configured' }, { status: 500 })
    }

    if (!companies || companies.length === 0) {
      return NextResponse.json({ persons: [], summary: { companiesProcessed: 0, contactsFound: 0 } })
    }

    // Map target roles to Hunter seniority/department
    const targetRoles = context?.targetRoles || ['CEO', 'Managing Director', 'Sales Director']

    const allPersons: Person[] = []
    let creditsUsed = 0

    for (const company of companies) {
      if (!company.domain && !company.website) continue

      const domain = company.domain || (() => {
        try {
          return new URL(
            company.website.startsWith('http') ? company.website : `https://${company.website}`
          ).hostname.replace('www.', '')
        } catch {
          return null
        }
      })()

      if (!domain) continue

      try {
        // Hunter Domain Search API
        // Docs: https://hunter.io/api-documentation/v2#domain-search
        const url = new URL('https://api.hunter.io/v2/domain-search')
        url.searchParams.set('domain', domain)
        url.searchParams.set('api_key', hunterApiKey)
        url.searchParams.set('limit', '10') // Limit results per domain

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`Hunter API error for ${company.name}:`, response.status, errorText)

          if (response.status === 401) {
            return NextResponse.json({ error: 'Invalid Hunter API key' }, { status: 401 })
          }
          if (response.status === 429) {
            console.error('Hunter rate limited, waiting...')
            await new Promise(resolve => setTimeout(resolve, 1000))
            continue
          }
          continue
        }

        const data: HunterDomainSearchResponse = await response.json()
        creditsUsed += 1

        // Filter and convert to Person type
        for (const email of data.data.emails || []) {
          // Skip generic emails (info@, contact@, etc.)
          if (email.type === 'generic') continue

          // Skip if no name
          if (!email.first_name && !email.last_name) continue

          const fullName = [email.first_name, email.last_name].filter(Boolean).join(' ')
          const title = email.position || email.department || 'Unknown'

          // Check if this person matches our target roles
          const isRelevantRole = targetRoles.some(role =>
            title.toLowerCase().includes(role.toLowerCase()) ||
            (email.seniority && ['executive', 'senior', 'director'].includes(email.seniority.toLowerCase()))
          )

          // Include executives and relevant roles, or all if we don't have many
          if (isRelevantRole || allPersons.filter(p => p.company === company.name).length < 3) {
            allPersons.push({
              id: `person-hunter-${Date.now()}-${Math.random().toString(36).substring(7)}`,
              company: company.name,
              companyId: company.id,
              name: fullName,
              title,
              email: email.value,
              linkedin: email.linkedin || '',
              source: 'hunter',
              verificationStatus: email.confidence >= 90 ? 'verified' : 'unverified',
              emailCertainty: email.confidence,
              emailSource: `Hunter (${email.confidence}% confidence)`,
              emailVerified: email.confidence >= 90,
            })
          }
        }

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 300))

      } catch (err) {
        console.error(`Error fetching contacts for ${company.name}:`, err)
        continue
      }
    }

    return NextResponse.json({
      persons: allPersons,
      summary: {
        companiesProcessed: companies.length,
        contactsFound: allPersons.length,
        creditsUsed,
      },
    })
  } catch (error) {
    console.error('Find contacts Hunter error:', error)
    return NextResponse.json(
      { error: 'Failed to find contacts via Hunter' },
      { status: 500 }
    )
  }
}

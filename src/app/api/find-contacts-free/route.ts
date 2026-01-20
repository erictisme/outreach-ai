import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { Company, ProjectContext, ResearchedContact } from '@/types'

interface FreeContactResult {
  companyId: string
  companyName: string
  contacts: ResearchedContact[]
}

interface GeminiContact {
  name: string
  title: string
  linkedinUrl?: string
  seniority: string
  relevanceScore: number
  reasoning: string
}

// Search for contacts at a single company
async function searchCompanyContacts(
  model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>,
  company: Company,
  targetRoles: string[],
  context: ProjectContext,
  searchVariant: 'standard' | 'leadership' = 'standard'
): Promise<GeminiContact[]> {
  const domain = company.domain || (() => {
    try {
      return new URL(
        company.website?.startsWith('http') ? company.website : `https://${company.website || company.name}`
      ).hostname.replace('www.', '')
    } catch {
      return company.name.toLowerCase().replace(/\s+/g, '')
    }
  })()

  // Different prompts for different search variants
  const searchContext = searchVariant === 'leadership'
    ? `Focus on the leadership team, executives, and management of ${company.name}.`
    : `We're looking for people in these roles: ${targetRoles.join(', ')}`

  const prompt = `You are researching contacts at "${company.name}" (${company.website || domain}) for a business outreach campaign.

## Target Profile
${searchContext}

## Context
- Client: ${context.clientName || 'Not specified'}
- Product: ${context.product || 'Not specified'}
- Value Proposition: ${context.valueProposition || 'Not specified'}

## CRITICAL REQUIREMENT
You MUST find and return AT LEAST 3 contacts for this company. This is a hard requirement.
- Search thoroughly for real people who work at this company
- Include executives, directors, managers, and other senior staff
- If you can't find people matching target roles exactly, include adjacent roles
- NEVER return an empty list or fewer than 3 contacts

## Your Task
Find 3-5 real people who work at ${company.name} in senior/decision-making roles.

For EACH person, provide ALL of the following:
1. Full name (as found online - must be a real person)
2. Job title (their actual title at ${company.name})
3. LinkedIn URL (construct as linkedin.com/in/firstname-lastname format)
4. Seniority level: Executive, Director, Manager, Staff, or Unknown
5. Relevance score (1-10): How relevant they are to our target roles
6. Brief reasoning: Why they might be a good contact for this outreach

## Important Guidelines
- ONLY include REAL people - verify they actually work at ${company.name}
- Prioritize people who match our target roles
- Include at least one executive-level contact if possible
- Generate LinkedIn profile URL in standard format: linkedin.com/in/firstname-lastname
- Return EXACTLY between 3 and 5 contacts - no more, no less

## Output Format
Return ONLY valid JSON (no markdown code blocks, no explanation text):
{
  "contacts": [
    {
      "name": "John Smith",
      "title": "Chief Executive Officer",
      "linkedinUrl": "https://linkedin.com/in/john-smith",
      "seniority": "Executive",
      "relevanceScore": 9,
      "reasoning": "CEO, key decision maker for partnerships"
    },
    {
      "name": "Jane Doe",
      "title": "Sales Director",
      "linkedinUrl": "https://linkedin.com/in/jane-doe",
      "seniority": "Director",
      "relevanceScore": 8,
      "reasoning": "Leads sales team, directly relevant to product distribution"
    },
    {
      "name": "Mike Johnson",
      "title": "Business Development Manager",
      "linkedinUrl": "https://linkedin.com/in/mike-johnson",
      "seniority": "Manager",
      "relevanceScore": 7,
      "reasoning": "Handles partnerships and new business opportunities"
    }
  ]
}`

  const result = await model.generateContent(prompt)
  const responseText = result.response.text()

  // Clean up response - remove markdown code blocks if present
  const cleanedResponse = responseText
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim()

  const parsed = JSON.parse(cleanedResponse) as { contacts: GeminiContact[] }
  return parsed.contacts || []
}

export async function POST(request: NextRequest) {
  try {
    const { companies, context } = await request.json() as {
      companies: Company[]
      context: ProjectContext
    }

    console.log(`[find-contacts-free] Starting contact search for ${companies?.length || 0} companies`)

    const googleApiKey = process.env.GOOGLE_API_KEY
    if (!googleApiKey) {
      console.error('[find-contacts-free] Google API key not configured')
      return NextResponse.json({ error: 'Google API not configured' }, { status: 500 })
    }

    if (!companies || companies.length === 0) {
      console.log('[find-contacts-free] No companies provided')
      return NextResponse.json({
        contacts: [],
        summary: { companiesProcessed: 0, contactsFound: 0 }
      })
    }

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(googleApiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
    })

    const targetRoles = context?.targetRoles || ['CEO', 'Managing Director', 'Sales Director', 'Business Development']
    console.log(`[find-contacts-free] Target roles: ${targetRoles.join(', ')}`)

    const allContacts: ResearchedContact[] = []
    const results: FreeContactResult[] = []

    // Filter valid companies
    const validCompanies = companies.filter(c => c.verificationStatus !== 'failed')
    console.log(`[find-contacts-free] Processing ${validCompanies.length} valid companies (filtered from ${companies.length})`)

    for (const company of validCompanies) {
      console.log(`[find-contacts-free] Searching contacts for: ${company.name}`)

      try {
        // First attempt: standard search
        let geminiContacts = await searchCompanyContacts(model, company, targetRoles, context, 'standard')
        console.log(`[find-contacts-free] ${company.name}: Found ${geminiContacts.length} contacts (standard search)`)

        // Fallback: if too few contacts, try leadership-focused search
        if (geminiContacts.length < 2) {
          console.log(`[find-contacts-free] ${company.name}: Too few contacts, trying leadership search fallback`)
          const leadershipContacts = await searchCompanyContacts(model, company, targetRoles, context, 'leadership')
          console.log(`[find-contacts-free] ${company.name}: Found ${leadershipContacts.length} contacts (leadership search)`)

          // Merge contacts, avoiding duplicates by name
          const existingNames = new Set(geminiContacts.map(c => c.name.toLowerCase()))
          for (const contact of leadershipContacts) {
            if (!existingNames.has(contact.name.toLowerCase())) {
              geminiContacts.push(contact)
              existingNames.add(contact.name.toLowerCase())
            }
          }
          console.log(`[find-contacts-free] ${company.name}: Total after merge: ${geminiContacts.length} contacts`)
        }

        // Create contacts from Gemini response (no email - that's Phase 2)
        const contacts: ResearchedContact[] = geminiContacts.map((contact, idx) => ({
          id: `free-${company.id}-${idx}-${Date.now()}`,
          company: company.name,
          companyId: company.id,
          name: contact.name,
          title: contact.title,
          linkedinUrl: contact.linkedinUrl || '',
          seniority: (['Executive', 'Director', 'Manager', 'Staff', 'Unknown'].includes(contact.seniority)
            ? contact.seniority
            : 'Unknown') as ResearchedContact['seniority'],
          relevanceScore: Math.min(10, Math.max(1, contact.relevanceScore || 5)),
          reasoning: contact.reasoning,
          source: 'web_research' as const,
          verified: false,
        }))

        // Sort by relevance score descending
        contacts.sort((a, b) => b.relevanceScore - a.relevanceScore)

        results.push({
          companyId: company.id,
          companyName: company.name,
          contacts,
        })

        allContacts.push(...contacts)
        console.log(`[find-contacts-free] ${company.name}: Added ${contacts.length} contacts to results`)

        // Small delay between requests to be nice to the API
        await new Promise(resolve => setTimeout(resolve, 300))

      } catch (err) {
        console.error(`[find-contacts-free] Error researching contacts for ${company.name}:`, err)
        // Continue to next company instead of failing entirely
        continue
      }
    }

    console.log(`[find-contacts-free] Completed: ${allContacts.length} total contacts from ${validCompanies.length} companies`)

    return NextResponse.json({
      contacts: allContacts,
      results,
      summary: {
        companiesProcessed: validCompanies.length,
        contactsFound: allContacts.length,
      },
    })
  } catch (error) {
    console.error('[find-contacts-free] Fatal error:', error)
    return NextResponse.json(
      { error: 'Failed to find contacts' },
      { status: 500 }
    )
  }
}

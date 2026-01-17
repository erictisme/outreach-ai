import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { Company, ProjectContext, ResearchedContact } from '@/types'

interface FreeContactResult {
  companyId: string
  companyName: string
  contacts: ResearchedContact[]
}

export async function POST(request: NextRequest) {
  try {
    const { companies, context } = await request.json() as {
      companies: Company[]
      context: ProjectContext
    }

    const googleApiKey = process.env.GOOGLE_API_KEY
    if (!googleApiKey) {
      return NextResponse.json({ error: 'Google API not configured' }, { status: 500 })
    }

    if (!companies || companies.length === 0) {
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
    const allContacts: ResearchedContact[] = []
    const results: FreeContactResult[] = []

    // Filter valid companies
    const validCompanies = companies.filter(c => c.verificationStatus !== 'failed')

    for (const company of validCompanies) {
      const domain = company.domain || (() => {
        try {
          return new URL(
            company.website.startsWith('http') ? company.website : `https://${company.website}`
          ).hostname.replace('www.', '')
        } catch {
          return company.name.toLowerCase().replace(/\s+/g, '')
        }
      })()

      const prompt = `You are researching contacts at "${company.name}" (${company.website || domain}) for a business outreach campaign.

## Target Profile
We're looking for people in these roles: ${targetRoles.join(', ')}

## Context
- Client: ${context.clientName || 'Not specified'}
- Product: ${context.product || 'Not specified'}
- Value Proposition: ${context.valueProposition || 'Not specified'}

## Your Task
Find 3-5 real people who work at ${company.name} in senior/decision-making roles.

For each person, provide:
1. Full name (as found online)
2. Job title
3. LinkedIn URL (construct as linkedin.com/in/firstname-lastname if not found)
4. Seniority level: Executive, Director, Manager, Staff, or Unknown
5. Relevance score (1-10): How relevant they are to our target roles
6. Brief reasoning: Why they might be a good contact for this outreach

## Important
- Only include REAL people you can verify exist
- Prioritize people who match our target roles
- Generate LinkedIn profile URL pattern if exact URL is not found
- If you can't find anyone, return an empty list

## Output Format
Return ONLY valid JSON (no markdown, no explanation):
{
  "contacts": [
    {
      "name": "Full Name",
      "title": "Job Title",
      "linkedinUrl": "https://linkedin.com/in/firstname-lastname",
      "seniority": "Executive",
      "relevanceScore": 9,
      "reasoning": "CEO, key decision maker for partnerships"
    }
  ]
}`

      try {
        const result = await model.generateContent(prompt)
        const responseText = result.response.text()

        // Parse the JSON response
        let parsed: { contacts: Array<{
          name: string
          title: string
          linkedinUrl?: string
          seniority: string
          relevanceScore: number
          reasoning: string
        }> }

        try {
          // Clean up response - remove markdown code blocks if present
          const cleanedResponse = responseText
            .replace(/```json\s*/g, '')
            .replace(/```\s*/g, '')
            .trim()
          parsed = JSON.parse(cleanedResponse)
        } catch {
          console.error(`Failed to parse response for ${company.name}:`, responseText)
          continue
        }

        // Create contacts from Gemini response (no email - that's Phase 2)
        const contacts: ResearchedContact[] = (parsed.contacts || []).map((contact, idx) => ({
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

        // Small delay between requests to be nice to the API
        await new Promise(resolve => setTimeout(resolve, 300))

      } catch (err) {
        console.error(`Error researching contacts for ${company.name}:`, err)
        continue
      }
    }

    return NextResponse.json({
      contacts: allContacts,
      results,
      summary: {
        companiesProcessed: validCompanies.length,
        contactsFound: allContacts.length,
      },
    })
  } catch (error) {
    console.error('Find contacts free error:', error)
    return NextResponse.json(
      { error: 'Failed to find contacts' },
      { status: 500 }
    )
  }
}

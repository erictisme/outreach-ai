import { NextRequest } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { Company, ProjectContext } from '@/types'
import { researchContact } from '@/lib/websearch'

interface ResearchedContact {
  id: string
  company: string
  companyId: string
  name: string
  title: string
  linkedinUrl: string
  seniority: 'Executive' | 'Director' | 'Manager' | 'Staff' | 'Unknown'
  relevanceScore: number // 1-10
  reasoning: string // Why this person is relevant
  source: 'web_research'
  researchSources?: string[] // URLs where we found info about this person
  verified?: boolean // Found in multiple sources
}

interface ResearchResult {
  companyId: string
  companyName: string
  contacts: ResearchedContact[]
  searchQueries: string[]
}

export async function POST(request: NextRequest) {
  try {
    const { companies, context } = await request.json() as {
      companies: Company[]
      context: ProjectContext
    }

    const googleApiKey = process.env.GOOGLE_API_KEY
    if (!googleApiKey) {
      return new Response(JSON.stringify({ error: 'Google API not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!companies || companies.length === 0) {
      return new Response(JSON.stringify({ results: [], summary: { companiesProcessed: 0, contactsFound: 0 } }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Create a streaming response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        }

        // Initialize Gemini
        const genAI = new GoogleGenerativeAI(googleApiKey)
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.0-flash',
        })

        const targetRoles = context?.targetRoles || ['CEO', 'Managing Director', 'Sales Director', 'Business Development']
        const allResults: ResearchResult[] = []
        let totalContactsFound = 0

        // Filter valid companies
        const validCompanies = companies.filter(c => c.verificationStatus !== 'failed')
        const totalCompanies = validCompanies.length

        // Send initial progress
        sendEvent('progress', {
          phase: 'starting',
          message: `Starting research for ${totalCompanies} companies...`,
          current: 0,
          total: totalCompanies,
        })

        for (let i = 0; i < validCompanies.length; i++) {
          const company = validCompanies[i]

          const domain = company.domain || (() => {
            try {
              return new URL(
                company.website.startsWith('http') ? company.website : `https://${company.website}`
              ).hostname.replace('www.', '')
            } catch {
              return company.name.toLowerCase().replace(/\s+/g, '')
            }
          })()

          // Send progress: searching
          sendEvent('progress', {
            phase: 'searching',
            message: `Searching for contacts at ${company.name}...`,
            company: company.name,
            current: i + 1,
            total: totalCompanies,
          })

          const prompt = `You are researching contacts at "${company.name}" (${company.website || domain}) for a business outreach campaign.

## Target Profile
We're looking for people in these roles: ${targetRoles.join(', ')}

## Context
- Client: ${context.clientName || 'Not specified'}
- Product: ${context.product || 'Not specified'}
- Value Proposition: ${context.valueProposition || 'Not specified'}

## Your Task
Search the web to find 5-10 real people who work at ${company.name} in senior/decision-making roles.

For each person, provide:
1. Full name (as found online)
2. Job title
3. LinkedIn URL (if found)
4. Seniority level: Executive, Director, Manager, Staff, or Unknown
5. Relevance score (1-10): How relevant they are to our target roles
6. Brief reasoning: Why they might be a good contact for this outreach

## Important
- Only include REAL people you can verify from web sources
- Prioritize people who match our target roles
- Include LinkedIn URLs when available
- If you can't find anyone, return an empty list

## Output Format
Return ONLY valid JSON (no markdown, no explanation):
{
  "contacts": [
    {
      "name": "Full Name",
      "title": "Job Title",
      "linkedinUrl": "https://linkedin.com/in/...",
      "seniority": "Executive",
      "relevanceScore": 9,
      "reasoning": "CEO, key decision maker for partnerships"
    }
  ],
  "searchQueries": ["queries you used"]
}`

          try {
            // Send progress: analyzing
            sendEvent('progress', {
              phase: 'analyzing',
              message: `AI analyzing ${company.name}...`,
              company: company.name,
              current: i + 1,
              total: totalCompanies,
            })

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
            }>, searchQueries?: string[] }

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

            // Create initial contacts from Gemini response
            const contacts: ResearchedContact[] = (parsed.contacts || []).map((contact, idx) => ({
              id: `research-${company.id}-${idx}-${Date.now()}`,
              company: company.name,
              companyId: company.id,
              name: contact.name,
              title: contact.title,
              linkedinUrl: '', // Will be filled by web search
              seniority: (['Executive', 'Director', 'Manager', 'Staff', 'Unknown'].includes(contact.seniority)
                ? contact.seniority
                : 'Unknown') as ResearchedContact['seniority'],
              relevanceScore: Math.min(10, Math.max(1, contact.relevanceScore || 5)),
              reasoning: contact.reasoning,
              source: 'web_research' as const,
            }))

            // Sort by relevance score descending
            contacts.sort((a, b) => b.relevanceScore - a.relevanceScore)

            // Research contacts across multiple sources (top 5 to save time)
            sendEvent('progress', {
              phase: 'verifying',
              message: `Verifying contacts at ${company.name}...`,
              company: company.name,
              current: i + 1,
              total: totalCompanies,
            })

            const topContacts = contacts.slice(0, 5)
            for (const contact of topContacts) {
              try {
                const research = await researchContact(contact.name, company.name, domain)
                if (research.linkedinUrl) {
                  contact.linkedinUrl = research.linkedinUrl
                }
                contact.researchSources = research.sources
                contact.verified = research.verified
              } catch (err) {
                console.error(`Failed to research ${contact.name}:`, err)
              }
              // Small delay between searches
              await new Promise(resolve => setTimeout(resolve, 100))
            }

            const companyResult: ResearchResult = {
              companyId: company.id,
              companyName: company.name,
              contacts,
              searchQueries: parsed.searchQueries || [],
            }

            allResults.push(companyResult)
            totalContactsFound += contacts.length

            // Send progress: found contacts for this company
            sendEvent('company_done', {
              phase: 'company_done',
              message: `Found ${contacts.length} contacts at ${company.name}`,
              company: company.name,
              contactsFound: contacts.length,
              current: i + 1,
              total: totalCompanies,
              result: companyResult,
            })

            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 300))

          } catch (err) {
            console.error(`Error researching contacts for ${company.name}:`, err)
            sendEvent('progress', {
              phase: 'error',
              message: `Couldn't research ${company.name}, skipping...`,
              company: company.name,
              current: i + 1,
              total: totalCompanies,
            })
            continue
          }
        }

        // Send final complete event
        sendEvent('complete', {
          results: allResults,
          summary: {
            companiesProcessed: validCompanies.length,
            contactsFound: totalContactsFound,
          },
        })

        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Research contacts error:', error)
    return new Response(JSON.stringify({ error: 'Failed to research contacts' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

import { NextRequest } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { ProjectContext } from '@/types'
import { searchWithCustomCriteria, researchContact } from '@/lib/websearch'

interface ResearchedContact {
  id: string
  company: string
  companyId: string
  name: string
  title: string
  linkedinUrl: string
  seniority: 'Executive' | 'Director' | 'Manager' | 'Staff' | 'Unknown'
  relevanceScore: number
  reasoning: string
  source: 'web_research'
  researchSources?: string[]
  verified?: boolean
}

export async function POST(request: NextRequest) {
  try {
    const { company, criteria, context } = await request.json() as {
      company: { id: string; name: string; domain?: string }
      criteria: string
      context: ProjectContext
    }

    const googleApiKey = process.env.GOOGLE_API_KEY
    if (!googleApiKey) {
      return new Response(JSON.stringify({ error: 'Google API not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Step 1: Search the web for this criteria at the company
    const searchResults = await searchWithCustomCriteria(company.name, criteria)

    if (searchResults.length === 0) {
      return new Response(JSON.stringify({ contacts: [], message: 'No results found' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Step 2: Use Gemini to extract contact info from search results
    const genAI = new GoogleGenerativeAI(googleApiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const searchContext = searchResults
      .slice(0, 5)
      .map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`)
      .join('\n\n')

    const prompt = `You are extracting contact information from web search results.

## Company
${company.name}

## Search Criteria
"${criteria}"

## Search Results
${searchContext}

## Your Task
Based on these search results, identify 1-3 specific people at ${company.name} who match the search criteria "${criteria}".

For each person found, provide:
1. Full name (as found in the search results)
2. Job title
3. Why they match the criteria
4. Seniority level: Executive, Director, Manager, Staff, or Unknown

## Important
- Only include REAL people found in the search results above
- Do not make up names or information
- If no matching people are found, return an empty list

## Output Format
Return ONLY valid JSON (no markdown, no explanation):
{
  "contacts": [
    {
      "name": "Full Name",
      "title": "Job Title",
      "seniority": "Director",
      "reasoning": "Why this person matches the criteria"
    }
  ]
}`

    const result = await model.generateContent(prompt)
    const responseText = result.response.text()

    // Parse the JSON response
    let parsed: { contacts: Array<{
      name: string
      title: string
      seniority: string
      reasoning: string
    }> }

    try {
      const cleanedResponse = responseText
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim()
      parsed = JSON.parse(cleanedResponse)
    } catch {
      console.error('Failed to parse Gemini response:', responseText)
      return new Response(JSON.stringify({ contacts: [], message: 'Could not parse results' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!parsed.contacts || parsed.contacts.length === 0) {
      return new Response(JSON.stringify({ contacts: [], message: 'No matching contacts found' }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Step 3: Research each contact to get LinkedIn and verify
    const contacts: ResearchedContact[] = []

    for (const contact of parsed.contacts.slice(0, 3)) {
      try {
        const research = await researchContact(contact.name, company.name, company.domain)

        contacts.push({
          id: `custom-${company.id}-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          company: company.name,
          companyId: company.id,
          name: contact.name,
          title: contact.title,
          linkedinUrl: research.linkedinUrl || '',
          seniority: (['Executive', 'Director', 'Manager', 'Staff', 'Unknown'].includes(contact.seniority)
            ? contact.seniority
            : 'Unknown') as ResearchedContact['seniority'],
          relevanceScore: 8, // Custom search = high relevance
          reasoning: `[Custom search: "${criteria}"] ${contact.reasoning}`,
          source: 'web_research',
          researchSources: research.sources,
          verified: research.verified,
        })

        // Small delay between searches
        await new Promise(resolve => setTimeout(resolve, 200))
      } catch (err) {
        console.error(`Error researching ${contact.name}:`, err)
      }
    }

    return new Response(JSON.stringify({ contacts }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Custom contact search error:', error)
    return new Response(JSON.stringify({ error: 'Custom search failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

import { generateContent } from '@/lib/gemini'
import { NextRequest, NextResponse } from 'next/server'
import { ProjectContext, Company } from '@/types'
import { extractDomain } from '@/lib/storage'

export async function POST(request: NextRequest) {
  try {
    const { companies, context } = await request.json() as {
      companies: Company[]
      context: ProjectContext | null
    }

    if (!companies || companies.length === 0) {
      return NextResponse.json({ companies: [] })
    }

    // Build company list for enrichment
    const companyNames = companies.map(c => c.name).join('\n- ')

    const contextInfo = context ? `
## Project Context
- Client: ${context.clientName}
- Product: ${context.product}
- Value Proposition: ${context.valueProposition}
- Target Market: ${context.targetMarket}
- Target Segment: ${context.targetSegment}
` : ''

    const prompt = `Enrich these companies with useful information for B2B outreach.

${contextInfo}
## Companies to Enrich
- ${companyNames}

## Task
For each company, provide your best assessment:
1. **type**: Business category (e.g., "Distributor", "Retailer", "Manufacturer", "Tech Company", "Consulting")
2. **website**: Leave as "" - user will verify manually
3. **description**: What they likely do based on company name and market context (1-2 sentences, be specific and useful)
4. **relevance**: "High", "Medium", or "Low" with brief reason${context ? ` for selling ${context.product}` : ''}

## Guidelines
- Be specific and actionable, not vague
- If company name suggests a specific industry, describe that
- For description, focus on what would help a salesperson understand the company
- Don't say "might be" or "could be" - make your best assessment

## Output Format
Return as JSON array in the SAME ORDER as input:
[
  {
    "name": "Original Company Name",
    "type": "Company Type",
    "website": "",
    "description": "Specific description of what they do...",
    "relevance": "High - specific reason"
  }
]

Only return valid JSON array, no other text or markdown.`

    const text = await generateContent(prompt)

    // Remove markdown code blocks if present
    const cleanedText = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim()

    // Parse JSON array from response
    const jsonMatch = cleanedText.match(/\[[\s\S]*\]/)

    if (!jsonMatch) {
      console.error('Raw response:', text.substring(0, 500))
      // Return original companies with default values if parsing fails
      return NextResponse.json({
        companies: companies.map(c => ({
          ...c,
          type: c.type || 'Unknown',
          website: c.website || '',
          description: c.description || '',
          relevance: c.relevance || 'Medium',
          status: c.status || 'not_contacted',
        }))
      })
    }

    // Clean common JSON issues
    const jsonStr = jsonMatch[0]
      .replace(/,\s*]/g, ']')
      .replace(/,\s*}/g, '}')
      .replace(/[\x00-\x1F\x7F]/g, ' ')

    let enrichedData: Array<{
      name: string
      type?: string
      website?: string
      description?: string
      relevance?: string
    }>

    try {
      enrichedData = JSON.parse(jsonStr)
    } catch {
      console.error('JSON parse failed for enrichment')
      // Return original companies
      return NextResponse.json({ companies })
    }

    // Merge enriched data with original companies
    const enrichedCompanies: Company[] = companies.map((original, index) => {
      const enriched = enrichedData[index] || {}
      const website = enriched.website || original.website || ''
      return {
        ...original,
        type: enriched.type || original.type || '',
        website,
        domain: extractDomain(website) || original.domain || '',
        description: enriched.description || original.description || '',
        relevance: enriched.relevance || original.relevance || 'Medium',
        status: original.status || 'not_contacted',
        // Keep verification status but mark as AI-enriched source if website was guessed
        verificationSource: enriched.website && !original.website ? 'web_search' : original.verificationSource,
      }
    })

    return NextResponse.json({ companies: enrichedCompanies })
  } catch (error) {
    console.error('Enrich companies error:', error)
    return NextResponse.json(
      { error: 'Failed to enrich companies' },
      { status: 500 }
    )
  }
}

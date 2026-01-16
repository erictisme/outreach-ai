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

    const prompt = `Enrich the following company names with additional information.

${contextInfo}
## Companies to Enrich
- ${companyNames}

## Task
For each company, provide:
1. **type**: What type/category of company (e.g., "Distributor", "Manufacturer", "Retailer", "Technology Company")
2. **website**: The company's website URL (guess based on company name if unknown, use format https://companyname.com)
3. **description**: 1-2 sentences about what the company does
4. **relevance**: Rate as "High", "Medium", or "Low" with a brief reason${context ? ` based on fit with ${context.product}` : ''}

## Output Format
Return as JSON array in the SAME ORDER as input:
[
  {
    "name": "Original Company Name",
    "type": "Company Type",
    "website": "https://...",
    "description": "What they do...",
    "relevance": "High - reason for rating"
  }
]

Only return valid JSON array, no other text or markdown.`

    const text = await generateContent(prompt)

    // Remove markdown code blocks if present
    let cleanedText = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim()

    // Parse JSON array from response
    let jsonMatch = cleanedText.match(/\[[\s\S]*\]/)

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
    let jsonStr = jsonMatch[0]
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

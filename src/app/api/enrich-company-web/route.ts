import { NextRequest, NextResponse } from 'next/server'
import { Company, ProjectContext } from '@/types'
import { extractDomain } from '@/lib/storage'

interface PerplexityMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface PerplexityResponse {
  id: string
  model: string
  choices: {
    index: number
    finish_reason: string
    message: {
      role: string
      content: string
    }
  }[]
}

async function searchWithPerplexity(
  query: string,
  apiKey: string
): Promise<string> {
  const messages: PerplexityMessage[] = [
    {
      role: 'system',
      content: `You are a business research assistant. Provide factual, concise information about companies.
Always respond with structured JSON data. If you cannot find information, say "unknown" for that field.
Focus on finding: official website, company description, industry, and approximate employee count.`,
    },
    {
      role: 'user',
      content: query,
    },
  ]

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-sonar-small-128k-online',
      messages,
      temperature: 0.1,
      max_tokens: 1000,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Perplexity API error: ${response.status} - ${error}`)
  }

  const data: PerplexityResponse = await response.json()
  return data.choices[0]?.message?.content || ''
}

function parseEnrichmentResponse(content: string, companyName: string): {
  website: string
  description: string
  industry: string
  employeeCount: string
} {
  // Default values
  const result = {
    website: '',
    description: '',
    industry: '',
    employeeCount: '',
  }

  try {
    // Try to parse as JSON first
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      result.website = parsed.website || parsed.url || ''
      result.description = parsed.description || parsed.about || ''
      result.industry = parsed.industry || parsed.sector || ''
      result.employeeCount = parsed.employeeCount || parsed.employees || parsed.size || ''
    } else {
      // Extract from plain text
      const websiteMatch = content.match(/(?:website|url|site)[\s:]+(?:is\s+)?([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i)
      if (websiteMatch) {
        result.website = websiteMatch[1]
      }

      // Extract description - look for sentences about what the company does
      const descMatch = content.match(/(?:is a|provides|offers|specializes in)[^.]+\./i)
      if (descMatch) {
        result.description = descMatch[0].trim()
      } else {
        // Take first meaningful sentence
        const sentences = content.split(/[.!?]+/).filter(s =>
          s.trim().length > 20 &&
          !s.toLowerCase().includes('unknown') &&
          !s.toLowerCase().includes('could not find')
        )
        if (sentences.length > 0) {
          result.description = sentences[0].trim() + '.'
        }
      }

      // Extract industry
      const industryMatch = content.match(/(?:industry|sector|operates in)[\s:]+([^,.]+)/i)
      if (industryMatch) {
        result.industry = industryMatch[1].trim()
      }

      // Extract employee count
      const empMatch = content.match(/(\d+(?:,\d+)?(?:\+)?)\s*(?:employees|staff|people|workers)/i)
      if (empMatch) {
        result.employeeCount = empMatch[1]
      }
    }
  } catch (e) {
    console.error('Error parsing enrichment response:', e)
  }

  return result
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { companies, context, apiKey } = body as {
      companies: Company[]
      context: ProjectContext | null
      apiKey: string
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Perplexity API key is required' },
        { status: 400 }
      )
    }

    if (!companies || companies.length === 0) {
      return NextResponse.json({ companies: [] })
    }

    const enrichedCompanies: Company[] = []
    const errors: string[] = []

    // Process companies sequentially to avoid rate limiting
    for (const company of companies) {
      try {
        // Build search query with context
        let searchQuery = `Find information about the company "${company.name}"`

        if (context?.targetMarket) {
          searchQuery += ` in ${context.targetMarket}`
        }

        searchQuery += `. Return as JSON with fields: website, description, industry, employeeCount.
If the company has a specific known website, include it.
Provide a 1-2 sentence description of what the company does.
If you cannot find specific information, say "unknown".`

        const response = await searchWithPerplexity(searchQuery, apiKey)
        const enriched = parseEnrichmentResponse(response, company.name)

        // Merge enriched data with original company
        const website = enriched.website || company.website || ''
        enrichedCompanies.push({
          ...company,
          website,
          domain: extractDomain(website) || company.domain || '',
          description: enriched.description || company.description || '',
          type: enriched.industry || company.type || '',
          // Store employee count in remarks or a new field
          remarks: enriched.employeeCount
            ? `~${enriched.employeeCount} employees${company.remarks ? `. ${company.remarks}` : ''}`
            : company.remarks,
          // Mark as web search enriched
          verificationSource: 'web_search',
          verificationStatus: enriched.website ? 'verified' : 'unverified',
        })
      } catch (err) {
        console.error(`Error enriching ${company.name}:`, err)
        errors.push(`Failed to enrich ${company.name}`)
        // Keep original company data
        enrichedCompanies.push({
          ...company,
          verificationSource: company.verificationSource || 'manual',
        })
      }
    }

    return NextResponse.json({
      companies: enrichedCompanies,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('Enrich company web error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to enrich companies' },
      { status: 500 }
    )
  }
}

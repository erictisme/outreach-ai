import { generateContent } from '@/lib/gemini'
import { NextRequest, NextResponse } from 'next/server'
import { ProjectContext, Company, Segment } from '@/types'
import { extractDomain } from '@/lib/storage'

// Helper to create a Company with all required fields
function createCompany(obj: Record<string, string>): Company & { linkedinUrl?: string } {
  const website = obj.website || ''
  return {
    id: `company-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    name: obj.name || 'Unknown',
    type: obj.type || 'Unknown',
    website,
    domain: extractDomain(website),
    description: obj.description || '',
    relevance: obj.relevance || 'Medium',
    status: 'not_contacted',
    // Verification fields - AI-generated, so unverified
    verificationStatus: 'unverified',
    verificationSource: 'web_search',
    verifiedAt: null,
    websiteAccessible: false,
    // LinkedIn company page URL (optional)
    linkedinUrl: obj.linkedinUrl || obj.linkedin_url || obj.linkedin || '',
  }
}

export async function POST(request: NextRequest) {
  try {
    const { context, segments, segmentCounts, countPerSegment = 10, excludeNames = [] } = await request.json() as {
      context: ProjectContext
      segments: Segment[]
      segmentCounts?: Record<string, number>
      countPerSegment?: number
      excludeNames?: string[]
    }

    // Build segment descriptions with counts
    const segmentList = segments.map(s => {
      const count = segmentCounts?.[s.id] || countPerSegment
      return `- ${s.name} (${count} companies): ${s.description}`
    }).join('\n')

    // Calculate total
    const totalCount = segments.reduce((sum, s) => sum + (segmentCounts?.[s.id] || countPerSegment), 0)

    // Build exclusion list if provided
    const exclusionNote = excludeNames.length > 0
      ? `\n\n## IMPORTANT: Exclude These Companies\nDo NOT include any of these companies (already in list): ${excludeNames.slice(0, 50).join(', ')}${excludeNames.length > 50 ? '...' : ''}`
      : ''

    const prompt = `Generate a target company list for outreach.

## Project Context
- Client: ${context.clientName}
- Product: ${context.product}
- Value Proposition: ${context.valueProposition}
- Target Market: ${context.targetMarket}
- Key Differentiators: ${context.keyDifferentiators.join(', ')}
- Credibility Signals: ${context.credibilitySignals.join(', ')}

## Target Segments (with company counts)
${segmentList}

## Requirements
1. Generate the EXACT number of companies specified for each segment (total: ${totalCount})
2. For each company, indicate which segment it belongs to in the "type" field
3. Prioritize by relevance (High/Medium/Low with reasoning)
4. Include real companies with actual websites in ${context.targetMarket}
5. Focus on companies that would genuinely benefit from ${context.product}${exclusionNote}

## Output Format
Return as JSON array:
[
  {
    "name": "Company Name",
    "type": "Segment name (e.g., ${segments[0]?.name || 'Premium Distributors'})",
    "website": "https://company-website.com",
    "linkedinUrl": "https://linkedin.com/company/company-name",
    "description": "1-2 sentences about what they do",
    "relevance": "High - specific reason why they're a good fit",
    "status": "not_contacted"
  }
]

IMPORTANT: Include the company's LinkedIn page URL if known. Use the format https://linkedin.com/company/slug

Only return valid JSON array, no other text or markdown.`

    const text = await generateContent(prompt)

    // Remove markdown code blocks if present
    const cleanedText = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim()

    // Parse JSON array from response - handle truncated responses
    let jsonMatch = cleanedText.match(/\[[\s\S]*\]/)

    // If no complete array found, try to salvage truncated response
    if (!jsonMatch) {
      // Check if response starts with [ but got cut off
      if (cleanedText.includes('[')) {
        console.log('Response truncated, attempting to salvage...')
        // Find all complete objects {...}
        const objectMatches = [...cleanedText.matchAll(/\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"type"\s*:\s*"[^"]+"\s*,\s*"website"\s*:\s*"[^"]+"\s*,\s*"description"\s*:\s*"[^"]*"\s*,\s*"relevance"\s*:\s*"[^"]*"\s*,\s*"status"\s*:\s*"[^"]*"\s*\}/g)]

        if (objectMatches.length > 0) {
          const salvaged = '[' + objectMatches.map(m => m[0]).join(',') + ']'
          jsonMatch = [salvaged]
          console.log(`Salvaged ${objectMatches.length} companies from truncated response`)
        }
      }
    }

    if (!jsonMatch) {
      console.error('Raw response:', text.substring(0, 500))
      throw new Error('Could not parse JSON from response')
    }

    // Clean common JSON issues from LLM output
    const jsonStr = jsonMatch[0]
      .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
      .replace(/,\s*}/g, '}')  // Remove trailing commas in objects
      .replace(/[\x00-\x1F\x7F]/g, ' ')  // Remove control characters

    let companies: Company[]
    try {
      const parsed = JSON.parse(jsonStr)
      companies = parsed.map((obj: Record<string, string>) => createCompany(obj))
    } catch {
      // If still fails, try to extract individual objects
      console.error('JSON parse failed, attempting recovery...')
      const objectMatches = jsonStr.matchAll(/\{[^{}]*\}/g)
      companies = []
      for (const match of objectMatches) {
        try {
          const obj = JSON.parse(match[0])
          if (obj.name && obj.website) {
            companies.push(createCompany(obj))
          }
        } catch {
          // Skip malformed objects
        }
      }
      if (companies.length === 0) {
        throw new Error('Could not parse any companies from response')
      }
    }

    return NextResponse.json({ companies })
  } catch (error) {
    console.error('Generate list error:', error)
    return NextResponse.json(
      { error: 'Failed to generate list' },
      { status: 500 }
    )
  }
}

import { generateContent } from '@/lib/gemini'
import { NextRequest, NextResponse } from 'next/server'
import { ProjectContext, Company } from '@/types'
import { extractDomain } from '@/lib/storage'

export async function POST(request: NextRequest) {
  try {
    const { companyName, context } = await request.json() as {
      companyName: string
      context: ProjectContext | null
    }

    if (!companyName || !companyName.trim()) {
      return NextResponse.json(
        { error: 'Company name is required' },
        { status: 400 }
      )
    }

    const contextInfo = context ? `
## Project Context
- Client: ${context.clientName}
- Product: ${context.product}
- Value Proposition: ${context.valueProposition}
- Target Market: ${context.targetMarket}
- Target Segment: ${context.targetSegment}
` : ''

    const prompt = `Given this company name, provide structured information about it for B2B outreach.

${contextInfo}
## Company Name
${companyName.trim()}

## Task
Provide your best assessment of this company:
1. **name**: The properly formatted company name
2. **type**: Business category (e.g., "Distributor", "Retailer", "Manufacturer", "Tech Company", "Consulting")
3. **website**: Your best guess at their website URL (or "" if unknown)
4. **description**: What they likely do based on the name and context (1-2 sentences, be specific)
5. **relevance**: "High", "Medium", or "Low" with brief reason${context ? ` for selling ${context.product}` : ''}

## Guidelines
- Be specific and actionable
- If the company name suggests a specific industry, describe that
- For website, try common patterns like companyname.com, companyname.co, etc.
- Don't say "might be" or "could be" - make your best assessment

## Output Format
Return as JSON object:
{
  "name": "Company Name",
  "type": "Company Type",
  "website": "https://...",
  "description": "Specific description of what they do...",
  "relevance": "High - specific reason"
}

Only return valid JSON object, no other text or markdown.`

    const text = await generateContent(prompt)

    // Remove markdown code blocks if present
    const cleanedText = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim()

    // Parse JSON object from response
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/)

    if (!jsonMatch) {
      // Return basic company if parsing fails
      return NextResponse.json({
        company: {
          id: `company-manual-${Date.now()}`,
          name: companyName.trim(),
          type: '',
          website: '',
          domain: '',
          description: '',
          relevance: 'Medium',
          status: 'not_contacted',
          verificationStatus: 'unverified',
          verificationSource: 'manual',
          verifiedAt: null,
          websiteAccessible: false,
        }
      })
    }

    // Clean common JSON issues
    const jsonStr = jsonMatch[0]
      .replace(/,\s*}/g, '}')
      .replace(/[\x00-\x1F\x7F]/g, ' ')

    let parsed: {
      name: string
      type?: string
      website?: string
      description?: string
      relevance?: string
    }

    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      // Return basic company if parsing fails
      return NextResponse.json({
        company: {
          id: `company-manual-${Date.now()}`,
          name: companyName.trim(),
          type: '',
          website: '',
          domain: '',
          description: '',
          relevance: 'Medium',
          status: 'not_contacted',
          verificationStatus: 'unverified',
          verificationSource: 'manual',
          verifiedAt: null,
          websiteAccessible: false,
        }
      })
    }

    const website = parsed.website || ''
    const company: Company = {
      id: `company-manual-${Date.now()}`,
      name: parsed.name || companyName.trim(),
      type: parsed.type || '',
      website,
      domain: extractDomain(website),
      description: parsed.description || '',
      relevance: parsed.relevance || 'Medium',
      status: 'not_contacted',
      verificationStatus: 'unverified',
      verificationSource: 'manual',
      verifiedAt: null,
      websiteAccessible: false,
    }

    return NextResponse.json({ company })
  } catch (error) {
    console.error('Parse company error:', error)
    return NextResponse.json(
      { error: 'Failed to parse company' },
      { status: 500 }
    )
  }
}

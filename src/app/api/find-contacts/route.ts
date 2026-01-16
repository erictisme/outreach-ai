import { generateContent } from '@/lib/gemini'
import { NextRequest, NextResponse } from 'next/server'
import { ProjectContext, Company, Person } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const { context, companies } = await request.json() as {
      context: ProjectContext
      companies: Company[]
    }

    const companyList = companies.map(c => `- ${c.name} (${c.website})`).join('\n')

    const prompt = `Identify key people to contact at these companies.

## Target Roles
${context.targetRoles.join(', ')}

## Companies
${companyList}

## Requirements
1. For each company, suggest 2-3 relevant people to contact
2. Target roles: ${context.targetRoles.join(', ')}
3. Use realistic names typical for this market (${context.targetMarket})
4. DO NOT generate emails yet - just names and titles
5. LinkedIn field should be empty for now

## Output Format
Return as JSON array:
[
  {
    "company": "Company Name",
    "name": "Full Name",
    "title": "Job Title",
    "email": "",
    "linkedin": "",
    "emailSource": ""
  }
]

Only return valid JSON array, no other text or markdown.`

    const text = await generateContent(prompt)

    // Remove markdown code blocks if present
    let cleanedText = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim()

    const jsonMatch = cleanedText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from response')
    }

    // Clean JSON issues
    let jsonStr = jsonMatch[0]
      .replace(/,\s*]/g, ']')
      .replace(/,\s*}/g, '}')

    const parsed = JSON.parse(jsonStr)

    // Create proper Person objects with all required fields
    const persons: Person[] = parsed.map((p: Record<string, string>, i: number) => ({
      id: `person-${Date.now()}-${i}-${Math.random().toString(36).substring(7)}`,
      company: p.company || '',
      companyId: '', // Will be linked later
      name: p.name || '',
      title: p.title || '',
      email: p.email || '',
      linkedin: p.linkedin || '',
      // Source tracking - AI-generated contacts are unverified
      source: 'web_search' as const,
      verificationStatus: 'unverified' as const,
      // Email confidence - no email yet
      emailCertainty: 0,
      emailSource: p.emailSource || '',
      emailVerified: false,
    }))

    return NextResponse.json({ persons })
  } catch (error) {
    console.error('Find contacts error:', error)
    return NextResponse.json(
      { error: 'Failed to find contacts' },
      { status: 500 }
    )
  }
}

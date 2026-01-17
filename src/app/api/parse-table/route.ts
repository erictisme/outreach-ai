import { generateContent } from '@/lib/gemini'
import { NextRequest, NextResponse } from 'next/server'
import { Company, Person } from '@/types'
import { extractDomain } from '@/lib/storage'

export async function POST(request: NextRequest) {
  try {
    const { rawText, targetType } = await request.json() as {
      rawText: string
      targetType: 'companies' | 'contacts'
    }

    if (!rawText || !rawText.trim()) {
      return NextResponse.json({ error: 'No data provided' }, { status: 400 })
    }

    if (targetType === 'companies') {
      return parseCompanies(rawText)
    } else {
      return parseContacts(rawText)
    }
  } catch (error) {
    console.error('Parse table error:', error)
    return NextResponse.json(
      { error: 'Failed to parse table data' },
      { status: 500 }
    )
  }
}

async function parseCompanies(rawText: string) {
  const prompt = `Parse this data into a structured company list. The data may be:
- Tab-separated (from Excel paste)
- Comma-separated (CSV)
- Space-separated or formatted text
- Any other tabular format

## Input Data
${rawText}

## Task
Identify each company and extract available information:
- name: Company name (REQUIRED)
- type: Type/category of company
- website: Company website URL
- description: Brief description
- relevance: Relevance rating with reason

## Output Format
Return ONLY a valid JSON array:
[
  {
    "name": "Company Name",
    "type": "Company Type",
    "website": "https://...",
    "description": "What they do",
    "relevance": "High - reason"
  }
]

If a field is not available, use empty string "".
If website is not provided, try to guess it from company name.
Only return valid JSON array, no other text.`

  const text = await generateContent(prompt)

  // Clean and parse response
  const cleanedText = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()

  const jsonMatch = cleanedText.match(/\[[\s\S]*\]/)

  if (!jsonMatch) {
    console.error('Could not parse companies from:', rawText.substring(0, 200))
    return NextResponse.json({ companies: [], error: 'Could not parse data' })
  }

  const jsonStr = jsonMatch[0]
    .replace(/,\s*]/g, ']')
    .replace(/,\s*}/g, '}')
    .replace(/[\x00-\x1F\x7F]/g, ' ')

  try {
    const parsed = JSON.parse(jsonStr)
    const companies: Company[] = parsed.map((item: Record<string, string>, i: number) => {
      const website = item.website || ''
      return {
        id: `company-import-${Date.now()}-${i}-${Math.random().toString(36).substring(7)}`,
        name: item.name || 'Unknown',
        type: item.type || '',
        website,
        domain: extractDomain(website),
        description: item.description || '',
        relevance: item.relevance || 'Imported',
        status: 'not_contacted' as const,
        // Verification fields - imported data, needs verification
        verificationStatus: 'unverified' as const,
        verificationSource: 'import' as const,
        verifiedAt: null,
        websiteAccessible: false,
      }
    })
    return NextResponse.json({ companies })
  } catch {
    console.error('JSON parse failed')
    return NextResponse.json({ companies: [], error: 'Failed to parse JSON' })
  }
}

async function parseContacts(rawText: string) {
  const prompt = `Parse this data into a structured contact list. The data may be:
- Tab-separated (from Excel paste)
- Comma-separated (CSV)
- Space-separated or formatted text
- Any other tabular format

## Input Data
${rawText}

## Task
Identify each person/contact and extract available information:
- name: Person's full name (REQUIRED)
- company: Company they work for
- title: Job title
- email: Email address
- linkedin: LinkedIn URL

## Output Format
Return ONLY a valid JSON array:
[
  {
    "name": "John Doe",
    "company": "Acme Inc",
    "title": "VP Sales",
    "email": "john@acme.com",
    "linkedin": ""
  }
]

If a field is not available, use empty string "".
Only return valid JSON array, no other text.`

  const text = await generateContent(prompt)

  // Clean and parse response
  const cleanedText = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()

  const jsonMatch = cleanedText.match(/\[[\s\S]*\]/)

  if (!jsonMatch) {
    console.error('Could not parse contacts from:', rawText.substring(0, 200))
    return NextResponse.json({ persons: [], error: 'Could not parse data' })
  }

  const jsonStr = jsonMatch[0]
    .replace(/,\s*]/g, ']')
    .replace(/,\s*}/g, '}')
    .replace(/[\x00-\x1F\x7F]/g, ' ')

  try {
    const parsed = JSON.parse(jsonStr)
    const persons: Person[] = parsed.map((item: Record<string, string>, i: number) => ({
      id: `person-import-${Date.now()}-${i}-${Math.random().toString(36).substring(7)}`,
      name: item.name || 'Unknown',
      company: item.company || '',
      companyId: '', // Will be linked later
      title: item.title || '',
      email: item.email || '',
      linkedin: item.linkedin || '',
      // Source tracking - imported data
      source: 'import' as const,
      verificationStatus: 'unverified' as const,
      // Email confidence - imported emails are 70% certain
      emailCertainty: item.email ? 70 : 0,
      emailSource: item.email ? 'Imported' : '',
      emailVerified: false,
    }))
    return NextResponse.json({ persons })
  } catch {
    console.error('JSON parse failed')
    return NextResponse.json({ persons: [], error: 'Failed to parse JSON' })
  }
}

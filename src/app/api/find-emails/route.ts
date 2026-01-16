import { generateContent } from '@/lib/gemini'
import { NextRequest, NextResponse } from 'next/server'
import { Person } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const { persons } = await request.json() as {
      persons: Person[]
    }

    const personList = persons.map(p =>
      `- ${p.name}, ${p.title} at ${p.company}`
    ).join('\n')

    const prompt = `Find email addresses for these contacts.

## People
${personList}

## Requirements
1. For each person, generate a realistic email based on common patterns
2. Use the company domain from their company name
3. Common patterns: firstname.lastname@, firstname@, f.lastname@, firstnamelastname@
4. Note the pattern used as emailSource

## Output Format
Return as JSON array with the SAME order as input:
[
  {
    "company": "Company Name",
    "name": "Full Name",
    "title": "Job Title",
    "email": "firstname.lastname@company.com",
    "linkedin": "",
    "emailSource": "Pattern: firstname.lastname@domain"
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

    // Merge email data with original persons, preserving their IDs and other fields
    const personsWithEmails: Person[] = persons.map((original, index) => {
      const enriched = parsed[index] || {}
      const email = enriched.email || original.email || ''
      return {
        ...original,
        email,
        linkedin: enriched.linkedin || original.linkedin || '',
        emailSource: enriched.emailSource || 'Pattern guess',
        // Email confidence - pattern-based guess is 50%
        emailCertainty: email ? 50 : 0,
        emailVerified: false,
      }
    })

    return NextResponse.json({ persons: personsWithEmails })
  } catch (error) {
    console.error('Find emails error:', error)
    return NextResponse.json(
      { error: 'Failed to find emails' },
      { status: 500 }
    )
  }
}

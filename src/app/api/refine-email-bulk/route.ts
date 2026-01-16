import { generateContent } from '@/lib/gemini'
import { NextRequest, NextResponse } from 'next/server'
import { EmailDraft } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const { emails, instruction, goldStandard } = await request.json() as {
      emails: EmailDraft[]
      instruction?: string
      goldStandard?: string
    }

    // Build the prompt based on what was provided
    let styleGuidance = ''
    if (goldStandard) {
      styleGuidance = `
## Gold Standard Example (match this style/tone)
${goldStandard}

Analyze this example email's:
- Tone (formal/casual/professional)
- Length and structure
- Opening and closing style
- Level of detail
- Call-to-action style

Apply the same style to all emails below.`
    }

    if (instruction) {
      styleGuidance += `
## Refinement Instruction
${instruction}`
    }

    const emailSummaries = emails.map((e, i) => `
### Email ${i + 1}
To: ${e.to.name} (${e.to.email}) at ${e.company.name}
Subject: ${e.subject}

${e.body}
`).join('\n---\n')

    const prompt = `Refine these ${emails.length} emails based on the guidance provided.
${styleGuidance}

## Emails to Refine
${emailSummaries}

## Requirements
1. Maintain the core message and personalization for each recipient
2. Apply the style/instruction consistently across all emails
3. Keep each email's unique company/person references
4. Return ALL ${emails.length} emails in the same order

## Output Format
Return as JSON array with exactly ${emails.length} objects:
[
  {
    "subject": "Refined subject line for email 1",
    "body": "Refined body for email 1"
  },
  {
    "subject": "Refined subject line for email 2",
    "body": "Refined body for email 2"
  }
  // ... etc for all ${emails.length} emails
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

    const refinedEmails = JSON.parse(jsonStr)

    // Ensure we got the right number of emails back
    if (refinedEmails.length !== emails.length) {
      console.warn(`Expected ${emails.length} emails, got ${refinedEmails.length}`)
    }

    return NextResponse.json({ emails: refinedEmails })
  } catch (error) {
    console.error('Bulk refine email error:', error)
    return NextResponse.json(
      { error: 'Failed to bulk refine emails' },
      { status: 500 }
    )
  }
}

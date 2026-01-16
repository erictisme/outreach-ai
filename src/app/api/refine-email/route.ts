import { generateContent } from '@/lib/gemini'
import { NextRequest, NextResponse } from 'next/server'
import { EmailDraft } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const { email, instruction } = await request.json() as {
      email: EmailDraft
      instruction: string
    }

    const prompt = `Refine this email based on the instruction.

## Current Email
To: ${email.to.name} (${email.to.email})
Company: ${email.company.name}
Subject: ${email.subject}

${email.body}

## Instruction
${instruction}

## Requirements
1. Apply the instruction while keeping the core message
2. Maintain professionalism
3. Keep the email concise
4. Return ONLY the refined email in this exact JSON format:

{
  "subject": "The refined subject line",
  "body": "The refined email body"
}

Only return valid JSON, no other text or markdown.`

    const text = await generateContent(prompt)

    // Remove markdown code blocks if present
    let cleanedText = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim()

    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from response')
    }

    // Clean JSON issues
    let jsonStr = jsonMatch[0]
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')

    const refined = JSON.parse(jsonStr)

    return NextResponse.json({
      subject: refined.subject,
      body: refined.body,
    })
  } catch (error) {
    console.error('Refine email error:', error)
    return NextResponse.json(
      { error: 'Failed to refine email' },
      { status: 500 }
    )
  }
}

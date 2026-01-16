import { generateContent } from '@/lib/gemini'
import { NextRequest, NextResponse } from 'next/server'
import { ProjectContext } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const { contextDump, documents } = await request.json()

    // Combine all inputs
    let fullContext = ''

    if (contextDump) {
      fullContext += `## Context Dump\n${contextDump}\n\n`
    }

    if (documents && documents.length > 0) {
      for (const doc of documents) {
        fullContext += `## Document: ${doc.label || doc.name}\n${doc.content}\n\n`
      }
    }

    const prompt = `Extract structured project context from the following documents/text.

${fullContext}

---

Extract and return as JSON:
{
  "clientName": "Company name",
  "product": "What they sell/offer",
  "valueProposition": "Why customers should care (1-2 sentences)",
  "targetMarket": "Country/region",
  "targetSegment": "Primary type of companies to target",
  "segments": [
    {
      "id": "segment-1",
      "name": "Segment name (e.g., Premium Distributors)",
      "description": "Why this segment is relevant",
      "examples": ["Example Company 1", "Example Company 2"]
    }
  ],
  "targetRoles": ["Job titles to contact"],
  "targetSeniority": "any | c-suite | director | senior | mid-senior | mid | junior (infer from context, default 'director' for B2B sales)",
  "visitDates": "If physical visit planned, otherwise null",
  "keyDifferentiators": ["What makes them unique"],
  "credibilitySignals": ["Proof points, notable clients, achievements"]
}

For segments: Identify 3-5 distinct segments that would be good targets. Be specific (not just "Distributors" but "Lifestyle Home Distributors", "Department Store Buyers", "Online Marketplaces", etc.)

Only return valid JSON, no other text or markdown.`

    const text = await generateContent(prompt)

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from response')
    }

    const context: ProjectContext = JSON.parse(jsonMatch[0])

    // Set default seniority if not provided
    if (!context.targetSeniority) {
      context.targetSeniority = 'director'
    }

    return NextResponse.json({ context })
  } catch (error) {
    console.error('Extract error:', error)
    return NextResponse.json(
      { error: 'Failed to extract context' },
      { status: 500 }
    )
  }
}

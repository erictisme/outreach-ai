import { generateContent } from '@/lib/gemini'
import { NextRequest, NextResponse } from 'next/server'
import { ProjectContext, Person, Company, Message, ResponseType } from '@/types'
import { buildResponseSystemPrompt, buildResponseUserPrompt } from '@/lib/conversation-prompts'

interface DraftResponseRequest {
  context: ProjectContext
  person: Person
  company: Company
  messages: Message[]
  responseType: ResponseType
  customPrompt?: string
}

export async function POST(request: NextRequest) {
  try {
    const { context, person, company, messages, responseType, customPrompt } = await request.json() as DraftResponseRequest

    if (!context || !person || !company || !messages || messages.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const systemPrompt = buildResponseSystemPrompt(context, person, company, responseType)
    const userPrompt = buildResponseUserPrompt(messages, responseType, customPrompt)

    const fullPrompt = `${systemPrompt}

---

${userPrompt}`

    const text = await generateContent(fullPrompt)

    // Parse the JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      // If no JSON, try to use the text as the body
      const lastMessage = messages[messages.length - 1]
      const originalSubject = messages.find(m => m.subject)?.subject || ''
      return NextResponse.json({
        subject: originalSubject ? `Re: ${originalSubject}` : '',
        body: text.trim()
      })
    }

    try {
      const response = JSON.parse(jsonMatch[0])
      return NextResponse.json({
        subject: response.subject || '',
        body: response.body || ''
      })
    } catch {
      // Fallback if JSON parsing fails
      const lastMessage = messages[messages.length - 1]
      const originalSubject = messages.find(m => m.subject)?.subject || ''
      return NextResponse.json({
        subject: originalSubject ? `Re: ${originalSubject}` : '',
        body: text.trim()
      })
    }
  } catch (error) {
    console.error('Draft response error:', error)
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    )
  }
}

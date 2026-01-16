import { ResponseType, Message, ProjectContext, Person, Company } from '@/types'

// Few-shot examples for each response type, based on real email threads
export const RESPONSE_EXAMPLES: Record<ResponseType, { context: string; example: string }[]> = {
  schedule: [
    {
      context: 'Prospect showed interest and asked for availability',
      example: `Hi [Name],

Great to hear! Here are some times that work:
- Mon Jan 27, 10am or 2pm
- Tue Jan 28, 11am or 3pm

Happy to work around your schedule. Let me know what works best.

Best,
[Sender]`,
    },
    {
      context: 'Prospect agreed to meet, need to propose specific times',
      example: `Hi [Name],

Wonderful - looking forward to it. A few options:
- Thu Jan 30, 2pm
- Fri Jan 31, 10am or 4pm

We could meet at your office or a convenient cafe nearby. Let me know your preference.

Best,
[Sender]`,
    },
  ],

  confirm: [
    {
      context: 'Prospect confirmed a time',
      example: `Hi [Name],

Perfect, that works great. I'll send a calendar invite for [Date] at [Time].

Looking forward to meeting you.

Best,
[Sender]`,
    },
    {
      context: 'Prospect selected from proposed times',
      example: `Hi [Name],

Great - locked in for [Day] at [Time]. I'll bring some samples for you to see.

See you then!

Best,
[Sender]`,
    },
  ],

  reschedule: [
    {
      context: 'Need to change previously scheduled meeting',
      example: `Hi [Name],

Apologies for the change - something came up on our end. Would any of these work instead?
- [New date option 1]
- [New date option 2]

Happy to be flexible around your schedule.

Best,
[Sender]`,
    },
    {
      context: 'Prospect asked to reschedule',
      example: `Hi [Name],

No problem at all. Here are some alternative times:
- [New date option 1]
- [New date option 2]

Let me know what works better for you.

Best,
[Sender]`,
    },
  ],

  followup: [
    {
      context: 'No response after initial outreach',
      example: `Hi [Name],

Just floating this back up - would love to connect while [Client] is in town [dates].

Any availability next week?

Best,
[Sender]`,
    },
    {
      context: 'Continuing conversation after silence',
      example: `Hi [Name],

Hope all is well. Wanted to follow up on my previous email about [topic].

Happy to work around your schedule - even a brief 15-minute call would be helpful.

Best,
[Sender]`,
    },
  ],

  thankyou: [
    {
      context: 'After a productive meeting',
      example: `Hi [Name],

Thank you for taking the time to meet with us today. It was great learning about [topic discussed].

As discussed, I'll [next step]. Please let me know if there's anything else you need in the meantime.

Looking forward to staying in touch.

Best,
[Sender]`,
    },
    {
      context: 'After receiving helpful information or referral',
      example: `Hi [Name],

Thanks so much for the introduction to [Referral Name]. Really appreciate you making the connection.

I'll reach out to them this week. Let me know if there's ever anything I can help with on your end.

Best,
[Sender]`,
    },
  ],

  clarify: [
    {
      context: 'Need more details about their request',
      example: `Hi [Name],

Thanks for your reply. Just to make sure I understand correctly - are you looking for [clarification question]?

Happy to adjust our approach based on your needs.

Best,
[Sender]`,
    },
    {
      context: 'Ambiguous response needs clarification',
      example: `Hi [Name],

Thanks for getting back. Quick question - when you mentioned [ambiguous point], did you mean [interpretation A] or [interpretation B]?

Want to make sure we're aligned before our next step.

Best,
[Sender]`,
    },
  ],

  custom: [],
}

// Build the system prompt for response generation
export function buildResponseSystemPrompt(
  context: ProjectContext,
  person: Person,
  company: Company,
  responseType: ResponseType
): string {
  const examples = RESPONSE_EXAMPLES[responseType]
  const examplesText = examples.length > 0
    ? examples.map((ex, i) => `Example ${i + 1}:\nContext: ${ex.context}\n\n${ex.example}`).join('\n\n---\n\n')
    : 'No specific examples available.'

  return `You are an expert at writing professional business email responses for sales outreach.

## Context
- Client: ${context.clientName}
- Product: ${context.product}
- Value Proposition: ${context.valueProposition}
${context.visitDates ? `- Visit Dates: ${context.visitDates}` : ''}

## Contact
- Name: ${person.name}
- Title: ${person.title}
- Company: ${company.name}
- Industry: ${company.type || 'Unknown'}

## Response Type: ${responseType.toUpperCase()}

## Examples of ${responseType} responses:

${examplesText}

## Guidelines
1. Keep responses brief (3-6 sentences max)
2. Be warm but professional
3. Always propose concrete next steps
4. Use simple, clear language
5. Reference specific details from the conversation
6. For scheduling: propose 2-3 specific time options
7. Sign off with "Best," followed by a placeholder [Sender]

Generate a response email based on the conversation thread provided. Return JSON with:
- subject: The email subject (use "Re: [original subject]" format)
- body: The email body text`
}

// Build the user prompt with conversation history
export function buildResponseUserPrompt(
  messages: Message[],
  responseType: ResponseType,
  customPrompt?: string
): string {
  const conversationHistory = messages.map(msg => {
    const sender = msg.sender === 'you' ? 'YOU' : 'THEM'
    const subject = msg.subject ? `Subject: ${msg.subject}\n` : ''
    return `[${sender}]:\n${subject}${msg.content}`
  }).join('\n\n---\n\n')

  let instruction = `Generate a ${responseType} response to continue this conversation.`
  if (customPrompt) {
    instruction += `\n\nAdditional instructions: ${customPrompt}`
  }

  return `## Conversation History:

${conversationHistory}

---

${instruction}

Return your response as JSON: { "subject": "...", "body": "..." }`
}

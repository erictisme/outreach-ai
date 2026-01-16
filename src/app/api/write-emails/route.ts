import { generateContent } from '@/lib/gemini'
import { NextRequest, NextResponse } from 'next/server'
import { ProjectContext, Company, Person, EmailDraft } from '@/types'

// Gold standard email examples
const EMAIL_EXAMPLES = {
  distributor: `Subject: Premium Scandinavian Tableware Introduction - CEO Visit (26-28 Jan)

Hi Jefery and Su-Lin,

Hope you're doing well. I'm reaching out from Business Sweden Singapore, the Swedish trade and invest office.

We're currently supporting Gustavsberg, a 200-year-old Swedish bone china manufacturer that supplies the Swedish Royal Court. They handcraft all products in Sweden, hold exclusive rights to iconic Stig Lindberg designs, and have collaborated with Cartier, Acne Studios and other luxury brands. They recently entered Korea and Taiwan through boutique retail partners and now we're supporting them to enter Singapore. https://gustafsberg.com/

Given Grafunkt's focus on artisan collaborations and design-led homeware, we thought it might be relevant to introduce Gustavsberg as a premium line that could complement your existing portfolio, particularly for customers seeking handcrafted European lifestyle pieces with strong heritage storytelling.

Gustavsberg's CEO, Fredrik Kempe, will be in Singapore from 26 to 28 January. We'd be happy to set up a short meeting to understand Grafunkt's curation approach and explore if there's a fit for partnership.

I can send more materials if interested. If that sounds useful, let me know a time that works for you or the right colleague to speak with. If now isn't ideal, any feedback on other retailers we should approach would still be appreciated.

Thank you and hope you have a great week.`,

  academic: `Subject: Strengthening Energy Research Impact - Hulteberg CEO Visit (27-31 Oct)

Hi Prof Madhavi,

Hope you're well. I'm reaching out from the Embassy of Sweden's trade office in Singapore (Business Sweden).

We're supporting Hulteberg, a Swedish catalysis company working globally with universities and companies like Petronas to bridge academic research with industrial application. By partnering on catalyst development and scale-up, they help researchers demonstrate industrial relevance and real-world impact, often strengthening funding and grant outcomes. You can find out more info here: https://www.hulteberg.com/

Hulteberg's founder and CEO, Christian, will be in Singapore from 27-31 October (28th/31st preferred) and would welcome a 1-hour meeting to explore how industry collaboration could strengthen your energy research impact at ERI, discuss collaboration opportunities, and understand where catalyst expertise might accelerate your research.

If someone else on your team handles this decision, I'd be grateful for a referral.

Thanks, and wishing you a great week.

Best Regards,
Eric`,

  enterprise: `Subject: Hospital Asset Intelligence for Equipment Tracking - Wittra CTO Visit (Oct 15)

Hi [Name],

Hope you're well. I'm Eric from the Swedish Embassy's trade office in Singapore.

We're supporting Wittra, a Swedish asset intelligence company with Singapore partners, that helps large organizations track location, energy usage, and other sensor data of their physical assets on a single platform in real-time. They work with major operators including Institute of Mental Health Singapore where they're implementing a project to track 10,000+ assets (e.g., wheelchairs, beds, IV pumps, medical equipment) and Stockholm Arlanda Airport. https://wittra.io

Wittra's CTO Warwick Taws and team will be in Singapore Oct 13–16 (Oct 15 preferred) and would welcome a 1-hour meeting with [Hospital/Organization]'s operations teams to explore asset tracking applications across your healthcare facilities.

Given healthcare staff spend up to 20% of their time searching for equipment, Wittra's proven healthcare solutions could enhance operational efficiency while reducing the time staff spend locating critical medical assets.

I'd be very grateful to connect with you, be redirected to relevant teams, or receive feedback. Thanks, and hope you have a great week.

Best Regards,
Eric`
}

export async function POST(request: NextRequest) {
  try {
    const { context, companies, persons } = await request.json() as {
      context: ProjectContext
      companies: Company[]
      persons: Person[]
    }

    // Select appropriate example based on segment
    let exampleEmail = EMAIL_EXAMPLES.distributor
    const segment = context.targetSegment.toLowerCase()
    if (segment.includes('academic') || segment.includes('r&d') || segment.includes('research')) {
      exampleEmail = EMAIL_EXAMPLES.academic
    } else if (segment.includes('enterprise') || segment.includes('b2b') || segment.includes('healthcare')) {
      exampleEmail = EMAIL_EXAMPLES.enterprise
    }

    // Group persons by company
    const personsByCompany = persons.reduce((acc, person) => {
      const company = companies.find(c => c.name === person.company)
      if (company) {
        if (!acc[company.name]) {
          acc[company.name] = { company, persons: [] }
        }
        acc[company.name].persons.push(person)
      }
      return acc
    }, {} as Record<string, { company: Company, persons: Person[] }>)

    const companyEntries = Object.entries(personsByCompany).slice(0, 10)

    const prompt = `Write personalized outreach emails for the following contacts.

## Project Context
- Client: ${context.clientName}
- Product: ${context.product}
- Value Proposition: ${context.valueProposition}
- Target Market: ${context.targetMarket}
- Key Differentiators: ${context.keyDifferentiators.join(', ')}
- Credibility Signals: ${context.credibilitySignals.join(', ')}
${context.visitDates ? `- Visit Dates: ${context.visitDates}` : ''}

## Example Email (use this style)
${exampleEmail}

## What makes this example work:
- Concise, natural tone (~180 words)
- Clear credibility signals upfront
- Personalized relevance paragraph ("Given [Company]'s focus on...")
- Specific dates + flexibility
- "Escape hatch" for referrals at the end
- Three exit paths: connect / redirect / feedback

## Contacts to Email
${companyEntries.map(([companyName, { company, persons: contactPersons }]) => `
### ${companyName}
- Website: ${company.website}
- Why relevant: ${company.relevance}
- Contacts: ${contactPersons.map(p => `${p.name} (${p.title})`).join(', ')}
`).join('\n')}

## Output Format
Return as JSON array:
[
  {
    "companyName": "Company Name",
    "personName": "Contact Name",
    "subject": "Email subject line",
    "body": "Full email body",
    "type": "cold"
  }
]

Only return valid JSON array, no other text or markdown.`

    const text = await generateContent(prompt)

    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from response')
    }

    const rawEmails = JSON.parse(jsonMatch[0])

    // Map back to our EmailDraft type
    const emails: EmailDraft[] = []
    for (const rawEmail of rawEmails) {
      const company = companies.find(c => c.name === rawEmail.companyName)
      const person = persons.find(p => p.name === rawEmail.personName && p.company === rawEmail.companyName)
      if (company && person) {
        emails.push({
          to: person,
          company,
          subject: rawEmail.subject,
          body: rawEmail.body,
          type: rawEmail.type || 'cold'
        })
      }
    }

    return NextResponse.json({ emails })
  } catch (error) {
    console.error('Write emails error:', error)
    return NextResponse.json(
      { error: 'Failed to write emails' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'

// Apollo bulk_match response structure
// This is the PAID endpoint - costs 1 credit per contact
interface ApolloBulkMatchPerson {
  id: string
  first_name: string
  last_name: string
  name: string
  title: string
  email: string | null
  email_status: 'verified' | 'guessed' | 'unavailable' | null
  linkedin_url: string | null
  organization?: {
    name: string
    website_url: string
  }
}

interface ApolloBulkMatchResponse {
  matches: ApolloBulkMatchPerson[]
}

// Apollo pricing: 1 credit per contact lookup via bulk_match
export const APOLLO_CREDIT_COST_PER_CONTACT = 1

export async function POST(request: NextRequest) {
  try {
    const { contactIds, apolloIds, apiKey } = await request.json() as {
      contactIds: string[]   // Our internal contact IDs
      apolloIds: string[]    // Apollo person IDs for bulk_match
      apiKey?: string
    }

    // Prefer user-provided apiKey, fall back to env var
    const apolloApiKey = apiKey || process.env.APOLLO_API_KEY
    if (!apolloApiKey) {
      return NextResponse.json(
        { error: 'Apollo API key required. Please add your API key in settings.' },
        { status: 400 }
      )
    }

    if (!apolloIds || apolloIds.length === 0) {
      return NextResponse.json({
        emails: {},
        summary: { contactsProcessed: 0, emailsFound: 0, creditsUsed: 0 }
      })
    }

    // Filter out any null/undefined apolloIds
    const validApolloIds = apolloIds.filter((id): id is string => !!id)

    if (validApolloIds.length === 0) {
      return NextResponse.json({
        emails: {},
        summary: { contactsProcessed: 0, emailsFound: 0, creditsUsed: 0 }
      })
    }

    // Apollo People Bulk Match API - PAID endpoint (1 credit per contact)
    // Docs: https://docs.apollo.io/reference/people-api-bulk-match
    // This endpoint reveals emails for contacts we already have Apollo IDs for
    const response = await fetch('https://api.apollo.io/api/v1/people/bulk_match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apolloApiKey,
      },
      body: JSON.stringify({
        details: validApolloIds.map(id => ({ id })),
        reveal_personal_emails: false, // Only work emails
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Apollo bulk_match API error:', response.status, errorText)

      if (response.status === 401) {
        return NextResponse.json({ error: 'Invalid Apollo API key' }, { status: 401 })
      }
      if (response.status === 422) {
        console.error('Apollo API 422 error - check endpoint and request format:', errorText)
        return NextResponse.json(
          { error: 'Apollo API request failed. The endpoint or request format may have changed.' },
          { status: 422 }
        )
      }
      if (response.status === 429) {
        return NextResponse.json(
          { error: 'Apollo API rate limit exceeded. Please try again later.' },
          { status: 429 }
        )
      }
      return NextResponse.json(
        { error: `Apollo API error: ${response.status}` },
        { status: response.status }
      )
    }

    const data: ApolloBulkMatchResponse = await response.json()

    // Build apolloId -> email map from response
    const emailMap: Record<string, string> = {}
    let emailsFound = 0

    for (const match of data.matches || []) {
      if (match && match.id && match.email) {
        emailMap[match.id] = match.email
        emailsFound++
      }
    }

    // Also build contactId -> email map by matching indices
    // contactIds and apolloIds should be parallel arrays
    const contactEmailMap: Record<string, string> = {}
    for (let i = 0; i < contactIds.length; i++) {
      const apolloId = apolloIds[i]
      if (apolloId && emailMap[apolloId]) {
        contactEmailMap[contactIds[i]] = emailMap[apolloId]
      }
    }

    return NextResponse.json({
      emails: emailMap,           // apolloId -> email
      contactEmails: contactEmailMap, // contactId -> email (for convenience)
      summary: {
        contactsProcessed: validApolloIds.length,
        emailsFound,
        creditsUsed: validApolloIds.length, // 1 credit per contact in bulk_match
      },
    })
  } catch (error) {
    console.error('Enrich contacts email error:', error)
    return NextResponse.json(
      { error: 'Failed to enrich contacts with emails' },
      { status: 500 }
    )
  }
}

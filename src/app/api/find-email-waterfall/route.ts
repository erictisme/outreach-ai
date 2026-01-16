import { NextRequest, NextResponse } from 'next/server'

interface WaterfallResult {
  email: string | null
  confidence: number
  source: 'hunter' | 'apollo' | 'pattern_guess' | null
  creditsUsed: {
    hunter: number
    apollo: number
  }
}

/**
 * Generate common email patterns for a name
 */
function generateEmailPatterns(firstName: string, lastName: string, domain: string): string[] {
  const f = firstName.toLowerCase()
  const l = lastName.toLowerCase()
  const fi = f.charAt(0) // first initial
  const li = l.charAt(0) // last initial

  if (!l) {
    // No last name - fewer patterns
    return [
      `${f}@${domain}`,
      `${f}.${f}@${domain}`,
    ]
  }

  return [
    `${f}@${domain}`,                    // john@company.com
    `${f}.${l}@${domain}`,               // john.doe@company.com
    `${f}${l}@${domain}`,                // johndoe@company.com
    `${fi}${l}@${domain}`,               // jdoe@company.com
    `${fi}.${l}@${domain}`,              // j.doe@company.com
    `${f}${li}@${domain}`,               // johnd@company.com
    `${f}_${l}@${domain}`,               // john_doe@company.com
    `${l}@${domain}`,                    // doe@company.com
    `${l}.${f}@${domain}`,               // doe.john@company.com
    `${fi}${li}@${domain}`,              // jd@company.com
  ]
}

/**
 * Sequential email lookup - tries providers until email found
 *
 * This is more credit-efficient than domain search because:
 * 1. Only looks up email for ONE specific person (not all at domain)
 * 2. Stops as soon as email is found
 * 3. User only pays for contacts they've explicitly selected
 */
export async function POST(request: NextRequest) {
  try {
    const { name, company, domain } = await request.json() as {
      name: string
      company: string
      domain: string
    }

    if (!name || !domain) {
      return NextResponse.json({ error: 'Name and domain required' }, { status: 400 })
    }

    const result: WaterfallResult = {
      email: null,
      confidence: 0,
      source: null,
      creditsUsed: { hunter: 0, apollo: 0 },
    }

    // Split name into first/last
    const nameParts = name.trim().split(/\s+/)
    const firstName = nameParts[0]
    const lastName = nameParts.slice(1).join(' ') || ''

    console.log(`[Waterfall] Looking up email for ${name} at ${domain}`)

    // Try Hunter Email Finder first
    const hunterApiKey = process.env.HUNTER_API_KEY
    if (hunterApiKey) {
      try {
        const hunterUrl = new URL('https://api.hunter.io/v2/email-finder')
        hunterUrl.searchParams.set('domain', domain)
        hunterUrl.searchParams.set('first_name', firstName)
        if (lastName) hunterUrl.searchParams.set('last_name', lastName)
        hunterUrl.searchParams.set('api_key', hunterApiKey)

        const hunterRes = await fetch(hunterUrl.toString())
        result.creditsUsed.hunter = 1 // Email Finder uses 1 credit

        if (hunterRes.ok) {
          const hunterData = await hunterRes.json()
          if (hunterData.data?.email) {
            result.email = hunterData.data.email
            result.confidence = hunterData.data.score || 80
            result.source = 'hunter'
            console.log(`[Waterfall] Found via Hunter: ${result.email} (${result.confidence}%)`)
            return NextResponse.json(result)
          }
        }
        console.log(`[Waterfall] Hunter: No email found for ${name}`)
      } catch (err) {
        console.error('[Waterfall] Hunter error:', err)
      }
    }

    // Try Apollo if Hunter didn't find
    const apolloApiKey = process.env.APOLLO_API_KEY
    if (apolloApiKey && !result.email) {
      try {
        // Apollo People Search API
        const apolloRes = await fetch('https://api.apollo.io/v1/people/match', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apolloApiKey,
          },
          body: JSON.stringify({
            first_name: firstName,
            last_name: lastName,
            organization_name: company,
            domain: domain,
          }),
        })

        result.creditsUsed.apollo = 1 // People Match uses 1 credit

        if (apolloRes.ok) {
          const apolloData = await apolloRes.json()
          if (apolloData.person?.email) {
            result.email = apolloData.person.email
            result.confidence = apolloData.person.email_status === 'verified' ? 95 : 70
            result.source = 'apollo'
            console.log(`[Waterfall] Found via Apollo: ${result.email} (${result.confidence}%)`)
            return NextResponse.json(result)
          }
        }
        console.log(`[Waterfall] Apollo: No email found for ${name}`)
      } catch (err) {
        console.error('[Waterfall] Apollo error:', err)
      }
    }

    // Step 3: If both providers failed, try pattern guessing + verification
    if (!result.email && hunterApiKey) {
      console.log(`[Waterfall] Trying pattern guesses for ${name}...`)

      const patterns = generateEmailPatterns(firstName, lastName, domain)
      console.log(`[Waterfall] Generated ${patterns.length} patterns to verify`)

      // Verify patterns one by one until we find a valid one
      for (const email of patterns) {
        try {
          const verifyUrl = new URL('https://api.hunter.io/v2/email-verifier')
          verifyUrl.searchParams.set('email', email)
          verifyUrl.searchParams.set('api_key', hunterApiKey)

          const verifyRes = await fetch(verifyUrl.toString())
          result.creditsUsed.hunter += 1 // Each verification uses 1 credit

          if (verifyRes.ok) {
            const verifyData = await verifyRes.json()
            const status = verifyData.data?.status
            const score = verifyData.data?.score || 0

            console.log(`[Waterfall] Pattern ${email}: status=${status}, score=${score}`)

            // Accept if valid/accept_all with decent score
            if ((status === 'valid' || status === 'accept_all') && score >= 50) {
              result.email = email
              result.confidence = score
              result.source = 'pattern_guess'
              console.log(`[Waterfall] Found via pattern: ${result.email} (${result.confidence}%)`)
              return NextResponse.json(result)
            }
          }

          // Small delay between verifications to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200))
        } catch (err) {
          console.error(`[Waterfall] Error verifying ${email}:`, err)
        }
      }

      console.log(`[Waterfall] No valid pattern found for ${name}`)
    }

    console.log(`[Waterfall] No email found for ${name} at ${domain}`)
    return NextResponse.json(result)

  } catch (error) {
    console.error('[Waterfall] Error:', error)
    return NextResponse.json(
      { error: 'Email lookup failed' },
      { status: 500 }
    )
  }
}

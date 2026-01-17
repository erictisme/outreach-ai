import { NextRequest, NextResponse } from 'next/server'
import { Company, Person, ProjectContext, ContactSource } from '@/types'
import { sleepWithJitter, exponentialBackoff } from '@/lib/apify'

/**
 * Waterfall provider strategy endpoint
 *
 * Tries providers in order until one succeeds:
 * 1. Apollo (direct API) - fastest, most reliable
 * 2. Hunter (direct API) - good coverage
 * 3. Apify (scrapers) - fallback when APIs fail
 *
 * Returns results from first successful provider with tracking info.
 */

interface ProviderConfig {
  name: ContactSource
  endpoint: string
  envVar: string
}

const PROVIDER_ORDER: ProviderConfig[] = [
  { name: 'apollo', endpoint: '/api/find-contacts-apollo', envVar: 'APOLLO_API_KEY' },
  { name: 'hunter', endpoint: '/api/find-contacts-hunter', envVar: 'HUNTER_API_KEY' },
  { name: 'apify', endpoint: '/api/find-contacts-apify', envVar: 'APIFY_API_KEY' },
]

// Helper to get API key for a provider from user-provided keys or env
function getProviderApiKey(
  provider: ProviderConfig,
  apiKeys?: { apollo?: string; hunter?: string; apify?: string }
): string | null {
  // Check user-provided keys first
  if (apiKeys) {
    const userKey = apiKeys[provider.name as keyof typeof apiKeys]
    if (userKey) return userKey
  }
  // Fall back to env var
  return process.env[provider.envVar] || null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { companies, context, preferredProvider, skipProviders, apiKeys } = body as {
      companies: Company[]
      context: ProjectContext
      preferredProvider?: ContactSource // Start from this provider
      skipProviders?: ContactSource[]   // Skip these providers
      apiKeys?: { apollo?: string; hunter?: string; apify?: string }  // User-provided API keys
    }

    if (!companies || companies.length === 0) {
      return NextResponse.json({
        persons: [],
        summary: {
          companiesProcessed: 0,
          contactsFound: 0,
          providerUsed: null,
          attemptedProviders: [],
        },
      })
    }

    // Check which providers are configured (have API keys from user or env)
    const configuredProviders = PROVIDER_ORDER.filter(p => {
      // Check if API key exists (user-provided or env)
      const hasKey = !!getProviderApiKey(p, apiKeys)
      // Check if not in skip list
      const notSkipped = !skipProviders?.includes(p.name)
      return hasKey && notSkipped
    })

    if (configuredProviders.length === 0) {
      return NextResponse.json({
        error: 'No contact providers configured. Please add your API keys in settings.',
        configuredProviders: [],
      }, { status: 400 })
    }

    // If preferred provider specified, reorder to start from there
    const providers = [...configuredProviders]
    if (preferredProvider) {
      const idx = providers.findIndex(p => p.name === preferredProvider)
      if (idx > 0) {
        // Move preferred provider to front
        const preferred = providers.splice(idx, 1)[0]
        providers.unshift(preferred)
      }
    }

    const attemptedProviders: ContactSource[] = []
    const errors: Record<string, string> = {}

    // Get base URL for internal API calls
    const baseUrl = request.nextUrl.origin

    // Try each provider in sequence
    for (let i = 0; i < providers.length; i++) {
      const provider = providers[i]
      attemptedProviders.push(provider.name)

      console.log(`[Waterfall] Trying provider ${i + 1}/${providers.length}: ${provider.name}`)

      try {
        // Get the API key for this provider
        const providerApiKey = getProviderApiKey(provider, apiKeys)

        const response = await fetch(`${baseUrl}${provider.endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companies, context, apiKey: providerApiKey }),
        })

        // Handle rate limiting
        if (response.status === 429) {
          console.log(`[Waterfall] ${provider.name} rate limited, trying next...`)
          errors[provider.name] = 'Rate limited'
          await exponentialBackoff(0)
          continue
        }

        // Handle other errors
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const errorMsg = errorData.error || `HTTP ${response.status}`
          console.log(`[Waterfall] ${provider.name} error: ${errorMsg}`)
          errors[provider.name] = errorMsg
          continue
        }

        const data = await response.json()

        // Check if we got results
        if (data.persons && data.persons.length > 0) {
          console.log(`[Waterfall] Success! ${provider.name} returned ${data.persons.length} contacts`)

          // Tag all persons with the provider source
          const taggedPersons = data.persons.map((p: Person) => ({
            ...p,
            source: provider.name,
            emailSource: p.emailSource
              ? `${p.emailSource} (via ${provider.name})`
              : `Found via ${provider.name}`,
          }))

          return NextResponse.json({
            persons: taggedPersons,
            summary: {
              companiesProcessed: companies.length,
              contactsFound: taggedPersons.length,
              providerUsed: provider.name,
              attemptedProviders,
              creditsUsed: data.summary?.creditsUsed || data.summary?.actorRunsUsed,
              errors: Object.keys(errors).length > 0 ? errors : undefined,
            },
          })
        }

        // Provider succeeded but returned no results
        console.log(`[Waterfall] ${provider.name} returned no results, trying next...`)
        errors[provider.name] = 'No results found'

      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        console.error(`[Waterfall] ${provider.name} threw:`, err)
        errors[provider.name] = errorMsg
      }

      // Add small jitter between provider attempts
      if (i < providers.length - 1) {
        await sleepWithJitter(200, 100)
      }
    }

    // All providers exhausted
    console.log('[Waterfall] All providers exhausted, no contacts found')

    return NextResponse.json({
      persons: [],
      summary: {
        companiesProcessed: companies.length,
        contactsFound: 0,
        providerUsed: null,
        attemptedProviders,
        errors,
      },
    })

  } catch (error) {
    console.error('Waterfall find contacts error:', error)
    return NextResponse.json(
      { error: 'Failed to find contacts' },
      { status: 500 }
    )
  }
}

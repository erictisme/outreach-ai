/**
 * Apify client utilities with rate limiting and polling
 *
 * Features:
 * - Randomized delays (not fixed intervals) to avoid detection
 * - Exponential backoff on rate limits
 * - Async actor run polling
 * - Safe default profiles (low concurrency, proxy enabled)
 */

const APIFY_BASE_URL = 'https://api.apify.com/v2'

export const ACTOR_IDS = {
  apolloScraper: 'apify/apollo-io-scraper',
  linkedinProfileScraper: 'curious_coder/linkedin-people-profile-scraper',
  googleSearchScraper: 'apify/google-search-scraper',
}

// ─────────────────────────────────────────────────────────────────────────────
// Delay Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a random delay with jitter
 */
function randomDelay(baseMs: number, jitterMs: number): number {
  return baseMs + Math.random() * jitterMs
}

/**
 * Sleep with randomized jitter to avoid detection
 */
export async function sleepWithJitter(baseMs: number = 300, jitterMs: number = 200): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, randomDelay(baseMs, jitterMs)))
}

/**
 * Exponential backoff with jitter for rate limit handling
 */
export async function exponentialBackoff(attempt: number, baseMs: number = 1000): Promise<void> {
  const delay = Math.min(baseMs * Math.pow(2, attempt), 30000) + randomDelay(0, 500)
  await new Promise(resolve => setTimeout(resolve, delay))
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ApifyRunResult {
  data: {
    id: string
    status: 'READY' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'ABORTED' | 'TIMED-OUT'
    defaultDatasetId: string
  }
}

interface ApifyActorOptions {
  memory?: number        // Memory in MB (default: 256 for safe profile)
  timeout?: number       // Timeout in seconds (default: 300)
  waitForFinish?: number // Max wait time for polling in seconds (default: 120)
}

// ─────────────────────────────────────────────────────────────────────────────
// Apify Client Class
// ─────────────────────────────────────────────────────────────────────────────

export class ApifyClient {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  /**
   * Start an actor run and poll until complete
   */
  async runActor<T>(
    actorId: string,
    input: Record<string, unknown>,
    options: ApifyActorOptions = {}
  ): Promise<T[]> {
    const { memory = 256, timeout = 300, waitForFinish = 120 } = options

    // Start the actor run with safe defaults
    const runResponse = await fetch(
      `${APIFY_BASE_URL}/acts/${actorId}/runs?token=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...input,
          // Safe defaults to avoid bans
          proxyConfiguration: { useApifyProxy: true },
          maxConcurrency: 1,
          memory,
          timeout,
        }),
      }
    )

    if (!runResponse.ok) {
      const errorText = await runResponse.text()
      console.error('Apify actor start failed:', runResponse.status, errorText)
      throw new Error(`Apify actor start failed: ${runResponse.status}`)
    }

    const runData: ApifyRunResult = await runResponse.json()
    const runId = runData.data.id

    // Poll for completion
    const results = await this.pollForResults<T>(runId, waitForFinish)
    return results
  }

  /**
   * Poll actor run until complete, with exponential backoff on rate limits
   */
  private async pollForResults<T>(runId: string, maxWaitSeconds: number): Promise<T[]> {
    const startTime = Date.now()
    let attempt = 0

    while (Date.now() - startTime < maxWaitSeconds * 1000) {
      const statusResponse = await fetch(
        `${APIFY_BASE_URL}/actor-runs/${runId}?token=${this.apiKey}`
      )

      if (statusResponse.status === 429) {
        // Rate limited - exponential backoff
        await exponentialBackoff(attempt++)
        continue
      }

      if (!statusResponse.ok) {
        throw new Error(`Failed to get run status: ${statusResponse.status}`)
      }

      const statusData: ApifyRunResult = await statusResponse.json()
      const status = statusData.data.status

      if (status === 'SUCCEEDED') {
        return this.fetchDataset<T>(statusData.data.defaultDatasetId)
      }

      if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
        throw new Error(`Apify actor run ${status}`)
      }

      // Still running - wait with jitter before next poll
      await sleepWithJitter(2000, 1000)
      attempt = 0 // Reset backoff on successful poll
    }

    throw new Error('Apify actor run timed out waiting for results')
  }

  /**
   * Fetch results from dataset
   */
  private async fetchDataset<T>(datasetId: string): Promise<T[]> {
    const response = await fetch(
      `${APIFY_BASE_URL}/datasets/${datasetId}/items?token=${this.apiKey}`
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch Apify dataset: ${response.status}`)
    }

    return response.json()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Actor-Specific Wrappers with Result Normalization
// ─────────────────────────────────────────────────────────────────────────────

export interface NormalizedContact {
  name: string
  title: string
  email?: string
  linkedin?: string
  source: string
}

/**
 * Search Apollo via Apify scraper
 */
export async function searchApolloViaScraper(
  client: ApifyClient,
  domain: string,
  _targetTitles: string[]
): Promise<NormalizedContact[]> {
  try {
    const results = await client.runActor<Record<string, unknown>>(
      ACTOR_IDS.apolloScraper,
      {
        searchUrl: `https://app.apollo.io/#/people?qOrganizationDomains[]=${domain}`,
        maxResults: 10,
      },
      { waitForFinish: 180 } // Apollo scraper can be slow
    )

    return results.map(normalizeApolloScraperResult).filter(c => c.name)
  } catch (err) {
    console.error('Apollo scraper error:', err)
    return []
  }
}

/**
 * Scrape LinkedIn profile for contact info
 */
export async function scrapeLinkedInProfile(
  client: ApifyClient,
  linkedinUrl: string
): Promise<NormalizedContact | null> {
  try {
    const results = await client.runActor<Record<string, unknown>>(
      ACTOR_IDS.linkedinProfileScraper,
      {
        startUrls: [{ url: linkedinUrl }],
      },
      { waitForFinish: 60 }
    )

    if (results.length === 0) return null
    return normalizeLinkedInResult(results[0])
  } catch (err) {
    console.error('LinkedIn scraper error:', err)
    return null
  }
}

/**
 * Search Google for contacts at a company
 */
export async function googleSearchContacts(
  client: ApifyClient,
  companyName: string,
  targetRoles: string[]
): Promise<NormalizedContact[]> {
  try {
    const roleQuery = targetRoles.slice(0, 2).map(r => `"${r}"`).join(' OR ')
    const query = `"${companyName}" ${roleQuery} site:linkedin.com/in`

    const results = await client.runActor<Record<string, unknown>>(
      ACTOR_IDS.googleSearchScraper,
      {
        queries: query,
        maxPagesPerQuery: 1,
        resultsPerPage: 10,
        mobileResults: false,
      },
      { waitForFinish: 60 }
    )

    return results
      .filter(r => String(r.url || '').includes('linkedin.com/in'))
      .map(normalizeGoogleSearchResult)
      .filter(c => c.name)
  } catch (err) {
    console.error('Google search scraper error:', err)
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalization Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeApolloScraperResult(raw: Record<string, unknown>): NormalizedContact {
  return {
    name: String(raw.name || raw.fullName || raw.full_name || '').trim(),
    title: String(raw.title || raw.position || raw.headline || '').trim(),
    email: raw.email ? String(raw.email).trim() : undefined,
    linkedin: raw.linkedinUrl || raw.linkedin_url || raw.linkedin
      ? String(raw.linkedinUrl || raw.linkedin_url || raw.linkedin).trim()
      : undefined,
    source: 'apify-apollo',
  }
}

function normalizeLinkedInResult(raw: Record<string, unknown>): NormalizedContact {
  return {
    name: String(raw.fullName || raw.name || raw.full_name || '').trim(),
    title: String(raw.headline || raw.title || raw.position || '').trim(),
    email: raw.email ? String(raw.email).trim() : undefined,
    linkedin: raw.profileUrl || raw.url
      ? String(raw.profileUrl || raw.url).trim()
      : undefined,
    source: 'apify-linkedin',
  }
}

function normalizeGoogleSearchResult(raw: Record<string, unknown>): NormalizedContact {
  // Google search results have title like "John Doe - CEO - Company | LinkedIn"
  const title = String(raw.title || '')
  const parts = title.split(' - ').map(p => p.trim())

  // First part is usually the name
  const name = parts[0]?.replace(/\s*\|.*$/, '').trim() || ''
  // Second part is usually the title
  const jobTitle = parts[1]?.replace(/\s*\|.*$/, '').trim() || ''

  return {
    name,
    title: jobTitle,
    linkedin: raw.url ? String(raw.url).trim() : undefined,
    source: 'apify-google',
  }
}

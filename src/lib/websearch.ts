/**
 * Web search utilities using DuckDuckGo
 */

interface SearchResult {
  title: string
  url: string
  snippet: string
}

export interface ContactResearchResult {
  linkedinUrl?: string
  sources: string[] // URLs where we found info about this person (for validation)
  verified: boolean // Did we find them in multiple sources?
}

/**
 * Search DuckDuckGo and extract results
 * Uses the HTML lite version which is easier to parse
 */
export async function searchDuckDuckGo(query: string, maxResults: number = 5): Promise<SearchResult[]> {
  try {
    const encodedQuery = encodeURIComponent(query)
    const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })

    if (!response.ok) {
      console.error('[WebSearch] DuckDuckGo search failed:', response.status)
      return []
    }

    const html = await response.text()

    // Parse results from HTML
    // DuckDuckGo lite HTML has results in <a class="result__a"> tags
    const results: SearchResult[] = []

    // Match result links and snippets - improved regex
    const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([^<]*)</g

    let match
    while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
      const [, encodedUrl, title, snippet] = match

      // DuckDuckGo encodes URLs, need to extract actual URL
      const urlMatch = encodedUrl.match(/uddg=([^&]+)/)
      const actualUrl = urlMatch ? decodeURIComponent(urlMatch[1]) : encodedUrl

      results.push({
        url: actualUrl,
        title: title.trim(),
        snippet: snippet.trim(),
      })
    }

    // Fallback 1: simpler regex for just links
    if (results.length === 0) {
      const linkRegex = /href="\/l\/\?uddg=([^&"]+)[^"]*"[^>]*>([^<]+)</g
      while ((match = linkRegex.exec(html)) !== null && results.length < maxResults) {
        const [, encodedUrl, title] = match
        results.push({
          url: decodeURIComponent(encodedUrl),
          title: title.trim(),
          snippet: '',
        })
      }
    }

    // Fallback 2: extract any LinkedIn URLs directly from HTML
    if (results.length === 0 && query.toLowerCase().includes('linkedin')) {
      const linkedinRegex = /linkedin\.com\/in\/[a-zA-Z0-9\-_%]+/g
      const linkedinMatches = html.match(linkedinRegex)
      if (linkedinMatches) {
        const uniqueUrls = [...new Set(linkedinMatches)]
        for (const linkedinPath of uniqueUrls.slice(0, maxResults)) {
          results.push({
            url: `https://www.${linkedinPath}`,
            title: 'LinkedIn Profile',
            snippet: '',
          })
        }
      }
    }

    if (results.length === 0) {
      console.log(`[WebSearch] No results for: ${query.substring(0, 50)}...`)
    }

    return results
  } catch (error) {
    console.error('[WebSearch] DuckDuckGo search error:', error)
    return []
  }
}

/**
 * Search for a person's LinkedIn profile
 */
export async function findLinkedInProfile(
  name: string,
  company: string
): Promise<string | null> {
  const query = `"${name}" "${company}" site:linkedin.com/in`
  const results = await searchDuckDuckGo(query, 3)

  // Find first LinkedIn profile URL
  for (const result of results) {
    if (result.url.includes('linkedin.com/in/')) {
      return result.url
    }
  }

  // Try without quotes if no results
  if (results.length === 0) {
    const fallbackQuery = `${name} ${company} linkedin`
    const fallbackResults = await searchDuckDuckGo(fallbackQuery, 5)

    for (const result of fallbackResults) {
      if (result.url.includes('linkedin.com/in/')) {
        return result.url
      }
    }
  }

  return null
}

/**
 * Search for multiple people's LinkedIn profiles in parallel
 */
export async function findLinkedInProfiles(
  contacts: Array<{ name: string; company: string }>
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>()

  // Process in batches of 3 to avoid rate limiting
  const batchSize = 3
  for (let i = 0; i < contacts.length; i += batchSize) {
    const batch = contacts.slice(i, i + batchSize)

    const batchResults = await Promise.all(
      batch.map(async (contact) => {
        const linkedinUrl = await findLinkedInProfile(contact.name, contact.company)
        return { key: `${contact.name}|${contact.company}`, url: linkedinUrl }
      })
    )

    for (const result of batchResults) {
      results.set(result.key, result.url)
    }

    // Small delay between batches
    if (i + batchSize < contacts.length) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  return results
}

/**
 * Search for a contact across multiple sources
 * Returns LinkedIn URL + list of sources where we found them (for validation)
 */
export async function researchContact(
  name: string,
  company: string,
  companyDomain?: string
): Promise<ContactResearchResult> {
  const sources: string[] = []
  let linkedinUrl: string | undefined

  // Filter out noise URLs
  const skipDomains = ['google.', 'bing.', 'yahoo.', 'duckduckgo.', 'zoominfo.', 'rocketreach.', 'signalhire.', 'apollo.io', 'lusha.']
  const isValidSource = (url: string) => !skipDomains.some(d => url.includes(d))

  // Search 1: LinkedIn specific
  const linkedinQuery = `"${name}" "${company}" site:linkedin.com/in`
  const linkedinResults = await searchDuckDuckGo(linkedinQuery, 3)
  for (const result of linkedinResults) {
    if (result.url.includes('linkedin.com/in/')) {
      linkedinUrl = result.url
      sources.push(result.url)
      break
    }
  }

  // Small delay
  await new Promise(resolve => setTimeout(resolve, 150))

  // Search 2: General web search (finds company website, news, interviews, Facebook, etc.)
  const generalQuery = `"${name}" "${company}"`
  const generalResults = await searchDuckDuckGo(generalQuery, 8)

  for (const result of generalResults) {
    // Skip noise and already added URLs
    if (!isValidSource(result.url)) continue
    if (sources.includes(result.url)) continue

    // If no LinkedIn yet, check if this is one
    if (!linkedinUrl && result.url.includes('linkedin.com/in/')) {
      linkedinUrl = result.url
    }

    // Add to sources (limit to 5)
    if (sources.length < 5) {
      sources.push(result.url)
    }
  }

  // If still no LinkedIn, try company domain search
  if (!linkedinUrl && companyDomain) {
    await new Promise(resolve => setTimeout(resolve, 150))
    const domainQuery = `"${name}" site:${companyDomain}`
    const domainResults = await searchDuckDuckGo(domainQuery, 3)
    for (const result of domainResults) {
      if (isValidSource(result.url) && !sources.includes(result.url) && sources.length < 5) {
        sources.push(result.url)
      }
    }
  }

  return {
    linkedinUrl,
    sources,
    verified: sources.length >= 2, // Found in multiple places = more likely real
  }
}

/**
 * Search with custom criteria (for re-prompting/custom search)
 */
export async function searchWithCustomCriteria(
  company: string,
  criteria: string
): Promise<Array<{ url: string; title: string; snippet: string }>> {
  const query = `${criteria} "${company}"`
  const results = await searchDuckDuckGo(query, 10)

  // Filter out noise
  const skipDomains = ['google.', 'bing.', 'yahoo.', 'duckduckgo.', 'zoominfo.', 'rocketreach.', 'signalhire.', 'apollo.io', 'lusha.']
  return results.filter(r => !skipDomains.some(d => r.url.includes(d)))
}

import { NextRequest, NextResponse } from 'next/server'
import { Company } from '@/types'
import { extractDomain } from '@/lib/storage'
import { generateContent } from '@/lib/gemini'

interface VerifyResult {
  company: Company
  accessible: boolean
  redirectUrl?: string
  description?: string
  error?: string
}

// Verify if a website is accessible and extract description
async function verifyWebsite(url: string): Promise<{
  accessible: boolean
  redirectUrl?: string
  content?: string
  error?: string
}> {
  if (!url) {
    return { accessible: false, error: 'No URL provided' }
  }

  // Ensure URL has protocol
  const fullUrl = url.startsWith('http') ? url : `https://${url}`

  try {
    // Use HEAD request first for speed, with timeout
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000) // 10s timeout

    const response = await fetch(fullUrl, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OutreachAI/1.0; +https://outreach.ai)',
      },
    })

    clearTimeout(timeout)

    if (response.ok) {
      // Check if we were redirected to a different domain
      const finalUrl = response.url
      const originalDomain = extractDomain(fullUrl)
      const finalDomain = extractDomain(finalUrl)

      return {
        accessible: true,
        redirectUrl: originalDomain !== finalDomain ? finalUrl : undefined,
      }
    } else {
      return {
        accessible: false,
        error: `HTTP ${response.status}`,
      }
    }
  } catch (err) {
    const error = err as Error
    if (error.name === 'AbortError') {
      return { accessible: false, error: 'Timeout' }
    }
    return {
      accessible: false,
      error: error.message || 'Failed to fetch',
    }
  }
}

// Fetch homepage content and extract description using AI
async function extractDescriptionFromWebsite(url: string): Promise<string | undefined> {
  if (!url) return undefined

  const fullUrl = url.startsWith('http') ? url : `https://${url}`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000) // 15s timeout

    const response = await fetch(fullUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OutreachAI/1.0; +https://outreach.ai)',
        'Accept': 'text/html',
      },
    })

    clearTimeout(timeout)

    if (!response.ok) return undefined

    const html = await response.text()

    // Extract text content (basic HTML stripping)
    const textContent = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .substring(0, 5000) // Limit content size

    // Use AI to extract description
    const prompt = `Based on this website content, write a 1-2 sentence description of what this company does. Be factual and concise. If you cannot determine what the company does, say "Unable to determine".

Website content:
${textContent}

Return ONLY the description, no other text.`

    const description = await generateContent(prompt)
    return description.trim()
  } catch {
    return undefined
  }
}

export async function POST(request: NextRequest) {
  try {
    const { companies, enrichDescriptions = false } = await request.json() as {
      companies: Company[]
      enrichDescriptions?: boolean
    }

    if (!companies || companies.length === 0) {
      return NextResponse.json({ results: [] })
    }

    // Verify websites in parallel (with concurrency limit)
    const CONCURRENCY = 5
    const results: VerifyResult[] = []

    for (let i = 0; i < companies.length; i += CONCURRENCY) {
      const batch = companies.slice(i, i + CONCURRENCY)

      const batchResults = await Promise.all(
        batch.map(async (company): Promise<VerifyResult> => {
          const verification = await verifyWebsite(company.website)

          let description = company.description

          // Optionally enrich description from website content
          if (enrichDescriptions && verification.accessible && !company.description) {
            const extractedDesc = await extractDescriptionFromWebsite(
              verification.redirectUrl || company.website
            )
            if (extractedDesc && extractedDesc !== 'Unable to determine') {
              description = extractedDesc
            }
          }

          return {
            company: {
              ...company,
              domain: company.domain || extractDomain(company.website),
              websiteAccessible: verification.accessible,
              verificationStatus: verification.accessible ? 'verified' : 'failed',
              verifiedAt: verification.accessible ? Date.now() : null,
              description: description || company.description,
              // Update website if redirected
              website: verification.redirectUrl || company.website,
            },
            accessible: verification.accessible,
            redirectUrl: verification.redirectUrl,
            description,
            error: verification.error,
          }
        })
      )

      results.push(...batchResults)
    }

    return NextResponse.json({
      results,
      summary: {
        total: companies.length,
        verified: results.filter(r => r.accessible).length,
        failed: results.filter(r => !r.accessible).length,
      },
    })
  } catch (error) {
    console.error('Verify website error:', error)
    return NextResponse.json(
      { error: 'Failed to verify websites' },
      { status: 500 }
    )
  }
}

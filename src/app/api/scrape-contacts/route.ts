import { NextRequest, NextResponse } from 'next/server'
import { Company, Person, ProjectContext } from '@/types'
import { generateContent } from '@/lib/gemini'

// Common team page paths to try
const TEAM_PATHS = [
  '/about',
  '/about-us',
  '/team',
  '/our-team',
  '/leadership',
  '/management',
  '/people',
  '/who-we-are',
  '/company',
  '/about/team',
  '/about/leadership',
]

// Fetch a webpage with timeout
async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OutreachAI/1.0; +https://outreach.ai)',
        'Accept': 'text/html',
      },
    })

    clearTimeout(timeout)

    if (!response.ok) return null

    const html = await response.text()
    return html
  } catch {
    return null
  }
}

// Extract text from HTML
function extractText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Find team page for a company
async function findTeamPage(baseUrl: string): Promise<{ url: string; content: string } | null> {
  // Ensure base URL has protocol
  const fullBaseUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`
  const baseUrlObj = new URL(fullBaseUrl)

  // Try each team path
  for (const path of TEAM_PATHS) {
    const teamUrl = `${baseUrlObj.origin}${path}`
    const html = await fetchPage(teamUrl)

    if (html) {
      const text = extractText(html)
      // Check if this looks like a team/about page (contains people-related keywords)
      const lowerText = text.toLowerCase()
      if (
        lowerText.includes('team') ||
        lowerText.includes('leadership') ||
        lowerText.includes('founder') ||
        lowerText.includes('ceo') ||
        lowerText.includes('director') ||
        lowerText.includes('manager')
      ) {
        return { url: teamUrl, content: text.substring(0, 8000) } // Limit content size
      }
    }
  }

  // Fallback: try the homepage
  const homepageHtml = await fetchPage(fullBaseUrl)
  if (homepageHtml) {
    return { url: fullBaseUrl, content: extractText(homepageHtml).substring(0, 8000) }
  }

  return null
}

// Extract contacts from page content using AI
async function extractContactsFromPage(
  pageContent: string,
  company: Company,
  targetRoles: string[]
): Promise<Omit<Person, 'id' | 'companyId'>[]> {
  const prompt = `Extract real people mentioned on this company webpage. Only include people who are CLEARLY named with their job titles.

## Company
${company.name}

## Target Roles (prioritize these)
${targetRoles.join(', ')}

## Page Content
${pageContent}

## Task
Find real people mentioned on this page. For each person:
1. Extract their EXACT name as shown on the page
2. Extract their EXACT job title as shown
3. Look for any email addresses on the page
4. Look for any LinkedIn profile URLs

IMPORTANT: Only include people who are CLEARLY named with real names and titles. Do NOT invent or guess names.

## Output Format
Return as JSON array (return empty array [] if no people found):
[
  {
    "name": "Full Name",
    "title": "Job Title",
    "email": "email@domain.com or empty string",
    "linkedin": "LinkedIn URL or empty string"
  }
]

Only return valid JSON array, no other text or markdown.`

  const text = await generateContent(prompt)

  // Parse response
  const cleanedText = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()

  const jsonMatch = cleanedText.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []

  try {
    const parsed = JSON.parse(jsonMatch[0])
    return parsed.map((p: Record<string, string>) => ({
      company: company.name,
      name: p.name || '',
      title: p.title || '',
      email: p.email || '',
      linkedin: p.linkedin || '',
      source: 'website_scrape' as const,
      verificationStatus: 'verified' as const, // Scraped from real website
      emailCertainty: p.email ? 95 : 0, // Found on company website = high certainty
      emailSource: p.email ? 'Found on company website' : '',
      emailVerified: !!p.email,
    }))
  } catch {
    return []
  }
}

export async function POST(request: NextRequest) {
  try {
    const { companies, context } = await request.json() as {
      companies: Company[]
      context: ProjectContext
    }

    if (!companies || companies.length === 0) {
      return NextResponse.json({ persons: [] })
    }

    const targetRoles = context?.targetRoles || ['CEO', 'Managing Director', 'Sales Director', 'Business Development']

    // Process companies in parallel with concurrency limit
    const CONCURRENCY = 3
    const allPersons: Person[] = []

    for (let i = 0; i < companies.length; i += CONCURRENCY) {
      const batch = companies.slice(i, i + CONCURRENCY)

      const batchResults = await Promise.all(
        batch.map(async (company) => {
          if (!company.website || !company.websiteAccessible) {
            return []
          }

          const teamPage = await findTeamPage(company.website)
          if (!teamPage) {
            return []
          }

          const contacts = await extractContactsFromPage(
            teamPage.content,
            company,
            targetRoles
          )

          // Add IDs and company references
          return contacts.map((c, idx) => ({
            ...c,
            id: `person-${company.id}-${idx}-${Date.now()}`,
            companyId: company.id,
          })) as Person[]
        })
      )

      for (const persons of batchResults) {
        allPersons.push(...persons)
      }
    }

    return NextResponse.json({
      persons: allPersons,
      summary: {
        companiesProcessed: companies.length,
        contactsFound: allPersons.length,
      },
    })
  } catch (error) {
    console.error('Scrape contacts error:', error)
    return NextResponse.json(
      { error: 'Failed to scrape contacts' },
      { status: 500 }
    )
  }
}

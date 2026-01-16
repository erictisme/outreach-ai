const APOLLO_API_URL = 'https://api.apollo.io/v1'

interface PeopleSearchParams {
  organization_domains?: string[]
  titles?: string[]
  person_locations?: string[]
  per_page?: number
}

interface ApolloPersonResult {
  id: string
  first_name: string
  last_name: string
  name: string
  title: string
  email: string | null
  linkedin_url: string | null
  organization: {
    id: string
    name: string
    website_url: string | null
  } | null
}

interface PeopleSearchResponse {
  people: ApolloPersonResult[]
  pagination: {
    page: number
    per_page: number
    total_entries: number
    total_pages: number
  }
}

export async function searchPeople(
  apiKey: string,
  params: PeopleSearchParams
): Promise<PeopleSearchResponse> {
  const response = await fetch(`${APOLLO_API_URL}/mixed_people/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify({
      api_key: apiKey,
      ...params,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Apollo API error: ${response.status} - ${error}`)
  }

  return response.json()
}

export async function enrichPerson(
  apiKey: string,
  email: string
): Promise<ApolloPersonResult | null> {
  const response = await fetch(`${APOLLO_API_URL}/people/match`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      email,
    }),
  })

  if (!response.ok) {
    return null
  }

  const data = await response.json()
  return data.person || null
}

export type { ApolloPersonResult, PeopleSearchParams, PeopleSearchResponse }

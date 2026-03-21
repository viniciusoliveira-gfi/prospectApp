const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1'

function getApiKey(): string {
  const key = process.env.APOLLO_API_KEY
  if (!key) throw new Error('APOLLO_API_KEY not configured')
  return key
}

export interface ApolloContact {
  id: string
  first_name: string
  last_name: string
  email: string | null
  title: string | null
  linkedin_url: string | null
  phone_numbers?: { raw_number: string }[]
  email_status: string | null
  organization?: {
    name: string
    website_url: string
  }
}

export async function searchPeopleByDomain(
  domain: string,
  titles: string[] = ['CEO', 'CTO', 'COO', 'VP', 'Head', 'Director', 'Founder'],
  perPage: number = 10
): Promise<ApolloContact[]> {
  const res = await fetch(`${APOLLO_BASE_URL}/mixed_people/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: getApiKey(),
      q_organization_domains: domain,
      person_titles: titles,
      per_page: perPage,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Apollo API error: ${err}`)
  }

  const data = await res.json()
  return data.people || []
}

export async function enrichPerson(
  firstName: string,
  lastName: string,
  domain: string
): Promise<ApolloContact | null> {
  const res = await fetch(`${APOLLO_BASE_URL}/people/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: getApiKey(),
      first_name: firstName,
      last_name: lastName,
      organization_domain: domain,
    }),
  })

  if (!res.ok) return null
  const data = await res.json()
  return data.person || null
}

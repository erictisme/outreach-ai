import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseInstance: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.')
  }

  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey)
  return supabaseInstance
}

// For backwards compatibility - lazy getter
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return Reflect.get(getSupabase(), prop)
  }
})

// Types for database tables
export interface Project {
  id: string
  client_name: string
  product_description: string | null
  target_market: string | null
  target_segment: string | null
  brief_content: string | null
  schema_config: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Company {
  id: string
  project_id: string
  name: string
  website: string | null
  description: string | null
  relevance_score: number | null
  relevance_notes: string | null
  status: string
  custom_fields: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Contact {
  id: string
  company_id: string
  name: string
  title: string | null
  email: string | null
  phone: string | null
  linkedin_url: string | null
  source: string
  verified: boolean
  custom_fields: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Email {
  id: string
  contact_id: string
  subject: string | null
  body: string | null
  status: string
  sent_at: string | null
  created_at: string
  updated_at: string
}

export interface EmailTemplate {
  id: string
  project_id: string | null
  name: string
  category: string
  description: string | null
  subject: string
  body: string
  variables: string[]
  is_default: boolean
  created_at: string
  updated_at: string
}

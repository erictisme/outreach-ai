# Supabase Setup for Outreach AI

## 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Fill in:
   - **Name:** outreach-ai (or whatever you prefer)
   - **Database Password:** Generate a strong password (save it!)
   - **Region:** Pick closest to you
4. Wait for project to spin up (~2 minutes)

## 2. Get Your API Keys

1. Go to **Settings** → **API**
2. Copy these values:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 3. Add to .env.local

Create `.env.local` in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# API Keys (already have these)
APOLLO_API_KEY=your_apollo_key
GOOGLE_API_KEY=your_gemini_key
```

## 4. Run Migrations

Go to **SQL Editor** in Supabase dashboard and run each migration file in order:

1. `migrations/001_initial.sql` - Creates base tables
2. `migrations/002_schema_config.sql` - Adds flexible schema support

Or use Supabase CLI:
```bash
supabase db push
```

## 5. Verify Tables Created

In **Table Editor**, you should see:
- `projects` - Your outreach projects
- `companies` - Target companies per project
- `contacts` - People at those companies
- `emails` - Generated emails per contact

## Quick Test

After setup, test the connection:
```bash
pnpm dev
# Open http://localhost:3000
# Try creating a project
```

---

## Table Schema Overview

```
projects
├── id (uuid)
├── client_name
├── product_description
├── target_market
├── target_segment
├── schema_config (jsonb) ← flexible columns
└── created_at

companies
├── id (uuid)
├── project_id → projects.id
├── name
├── website
├── description
├── relevance_score
├── custom_fields (jsonb)
└── created_at

contacts
├── id (uuid)
├── company_id → companies.id
├── name
├── title
├── email
├── linkedin_url
├── source (apollo/manual)
├── custom_fields (jsonb)
└── created_at

emails
├── id (uuid)
├── contact_id → contacts.id
├── subject
├── body
├── status (draft/sent)
└── created_at
```

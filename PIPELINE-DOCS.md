# Outreach AI Pipeline Documentation
**Last updated: 29 Dec 2024, 6pm**

This document shows the APIs, prompts, and flow at each step.

---

## Architecture Overview

```
User Input → Gemini AI (extract/generate) → Real APIs (verify/enrich) → Output
```

**Key Principle:** AI generates suggestions, real APIs verify them.

---

## Environment Variables (.env.local)

```bash
GOOGLE_API_KEY=xxx      # Gemini AI for text generation
HUNTER_API_KEY=xxx      # Email finding & verification
APOLLO_API_KEY=xxx      # Contact database (requires paid plan)
```

---

## Step 1-2: Input Context → Extract Fields

**API:** `/api/extract`
**Engine:** Gemini AI
**Cost:** Gemini API tokens only

### What it does
Parses user's pasted context into structured fields.

### Prompt (abbreviated)
```
Extract structured project context from the following documents/text.

[USER'S PASTED CONTENT]

Extract and return as JSON:
{
  "clientName": "...",
  "product": "...",
  "valueProposition": "...",
  "targetMarket": "...",
  "segments": [...],
  "targetRoles": [...],
  ...
}
```

### Reliability: ⭐⭐⭐⭐ HIGH
Just parsing/structuring text the user provided.

---

## Step 3: Select Segments

**API:** None (UI only)
**Cost:** Free

User selects which market segments to target.

---

## Step 4: Generate List → Verify Websites

### 4a. Generate Company List

**API:** `/api/generate-list`
**Engine:** Gemini AI
**Cost:** Gemini API tokens

### Prompt (abbreviated)
```
Generate a target company list for outreach.

## Project Context
- Client: [name]
- Product: [product]
- Target Market: [market]
...

## Requirements
1. Generate [X] companies PER SEGMENT
2. Include real companies with actual websites
3. Prioritize by relevance (High/Medium/Low)

## Output Format
[{ "name": "...", "website": "...", "relevance": "..." }]
```

### Reliability: ⭐⭐⭐ MEDIUM
AI may suggest companies that don't exist or aren't relevant.

---

### 4b. Verify Websites

**API:** `/api/verify-website`
**Engine:** HTTP HEAD requests (no AI)
**Cost:** Free

### Logic
```javascript
// For each company:
const response = await fetch(company.website, { method: 'HEAD' })

if (response.ok) {
  company.verificationStatus = 'verified'
  company.websiteAccessible = true
} else {
  company.verificationStatus = 'failed'
}
```

### Reliability: ⭐⭐⭐⭐⭐ VERY HIGH
Pure HTTP check - no hallucination possible.

---

## Step 4C: Research Contacts (NEW - Recommended)

**API:** `/api/research-contacts`
**Engine:** Gemini AI with web knowledge
**Cost:** Gemini API tokens only (~$0.001/company)

### What it does
Uses Gemini to research potential contacts at each company before spending Hunter credits. This gives you 5-10 candidates to choose from, so you only pay for emails you actually want.

### Flow
```
Companies (verified) → Gemini researches each → 5-10 candidates per company →
User selects top 2-3 → THEN find emails with Hunter
```

### Prompt (abbreviated)
```
You are researching contacts at "[Company Name]" ([website]) for a business outreach campaign.

## Target Profile
We're looking for people in these roles: CEO, Managing Director, Sales Director...

## Your Task
Search the web to find 5-10 real people who work at [Company] in senior/decision-making roles.

For each person, provide:
1. Full name (as found online)
2. Job title
3. LinkedIn URL (if found)
4. Seniority level: Executive, Director, Manager, Staff, or Unknown
5. Relevance score (1-10): How relevant they are to our target roles
6. Brief reasoning: Why they might be a good contact

IMPORTANT: Only include REAL people you can verify from web sources.
```

### Output Format
```json
{
  "contacts": [
    {
      "name": "John Smith",
      "title": "CEO",
      "linkedinUrl": "https://linkedin.com/in/johnsmith",
      "seniority": "Executive",
      "relevanceScore": 9,
      "reasoning": "CEO, key decision maker for partnerships"
    }
  ]
}
```

### UI Features
- Contacts grouped by company
- Color-coded seniority badges (Executive=purple, Director=blue, etc.)
- Relevance score displayed
- LinkedIn links for manual verification
- Top 3 per company auto-selected
- User can adjust selection before finding emails

### Reliability: ⭐⭐⭐ MEDIUM-HIGH
Based on Gemini's training data + any web access. Names are real but may be outdated. Always verify via LinkedIn before emailing.

### Why This Step Matters
**Without this step:**
- Hunter searches all 10 companies = 10 credits
- Gets random contacts, many not relevant
- Wastes credits on people you won't email

**With this step:**
- Gemini finds candidates for free
- You pick only the best 2-3 per company
- Hunter searches only for those = 2-3 credits per company
- Better targeting, lower cost

---

## Step 5: Find Contacts (Emails)

### Option A: Hunter Domain Search (Recommended)

**API:** `/api/find-contacts-hunter`
**Engine:** Hunter.io API
**Cost:** 1 search credit per company domain

### How it works
```javascript
// Hunter Domain Search API
GET https://api.hunter.io/v2/domain-search?domain=company.com&api_key=XXX

// Returns all known emails at that domain:
{
  "emails": [
    {
      "value": "john.doe@company.com",
      "first_name": "John",
      "last_name": "Doe",
      "position": "CEO",
      "confidence": 95,
      "linkedin": "..."
    }
  ]
}
```

### Reliability: ⭐⭐⭐⭐ HIGH
Real emails from Hunter's database. Confidence score indicates accuracy.

---

### Option B: Scrape Websites (Free)

**API:** `/api/scrape-contacts`
**Engine:** HTTP + Gemini AI
**Cost:** Free (Gemini tokens only)

### How it works
```javascript
// 1. Try common team page paths
const TEAM_PATHS = ['/about', '/team', '/leadership', '/our-team', ...]

// 2. Fetch each path, look for team-related keywords
const html = await fetch(url)
if (text.includes('team') || text.includes('ceo') || ...) {
  // Found team page
}

// 3. Extract contacts with Gemini AI
const prompt = `Extract real people from this webpage...`
```

### Prompt for extraction
```
Extract real people mentioned on this company webpage.
Only include people who are CLEARLY named with their job titles.

## Page Content
[SCRAPED HTML TEXT]

## Task
Find real people mentioned on this page. For each person:
1. Extract their EXACT name as shown
2. Extract their EXACT job title
3. Look for any email addresses
4. Look for LinkedIn URLs

IMPORTANT: Only include people who are CLEARLY named. Do NOT invent names.
```

### Reliability: ⭐⭐⭐⭐ HIGH
Names come from actual website content, not AI invention.

---

## Step 5: Review Contacts → Verify Emails

### Individual Email Verification

**API:** `/api/verify-single-email`
**Engine:** Hunter.io Email Verifier
**Cost:** 1 verification credit per email

### How it works
```javascript
// User clicks "Verify" button on an email
GET https://api.hunter.io/v2/email-verifier?email=john@company.com&api_key=XXX

// Returns:
{
  "status": "valid",      // valid, invalid, accept_all, unknown
  "score": 95,
  "mx_records": true,
  "smtp_check": true
}
```

### Email Certainty Levels
| Certainty | Meaning |
|-----------|---------|
| 100% | Hunter verified as valid |
| 95% | Found on company website |
| 85% | Pattern + MX records verified |
| 75% | Hunter pattern guess |
| 50% | Pattern guess only |

### Reliability: ⭐⭐⭐⭐⭐ VERY HIGH
Hunter actually checks if email exists via SMTP.

---

## Step 5→6: Write Emails

**API:** `/api/write-emails`
**Engine:** Gemini AI
**Cost:** Gemini API tokens

### Prompt (abbreviated)
```
Write personalized outreach emails for the following contacts.

## Project Context
[client, product, value prop, visit dates...]

## Example Email (gold standard)
[Pre-written example with good structure]

## Contacts to Email
- Company: [name], Website: [url], Why relevant: [reason]
- Contact: [name], [title]

## Output Format
[{ "subject": "...", "body": "..." }]
```

### Reliability: ⭐⭐⭐⭐ HIGH
Creative content based on context. Not factual claims.

---

## Cost Summary

| Action | API | Cost |
|--------|-----|------|
| Extract context | Gemini | ~$0.001/request |
| Generate companies | Gemini | ~$0.002/request |
| Verify websites | HTTP | Free |
| **Research contacts** | **Gemini** | **~$0.001/company** |
| Find emails (Hunter) | Hunter | 1 credit/domain |
| Find contacts (Scrape) | Gemini | ~$0.001/company |
| Verify email | Hunter | 1 credit/email |
| Write emails | Gemini | ~$0.003/batch |

### Cost Comparison: With vs Without Research Step
| Scenario | Without Research | With Research |
|----------|-----------------|---------------|
| 10 companies | 10 Hunter credits | ~3 Hunter credits |
| Why? | Search all domains | Only search for selected people |

### Hunter.io Free Plan
- 25 searches/month
- 50 verifications/month

---

## Reliability Summary

| Step | What | Reliability | Can Hallucinate? |
|------|------|-------------|------------------|
| 1-2 | Extract context | ⭐⭐⭐⭐ | No - parsing user input |
| 3 | Select segments | N/A | No - user choice |
| 4a | Generate companies | ⭐⭐⭐ | Yes - may invent |
| 4b | Verify websites | ⭐⭐⭐⭐⭐ | No - HTTP check |
| 4c | Research contacts | ⭐⭐⭐ | Low - from web knowledge |
| 5a | Find emails (Hunter) | ⭐⭐⭐⭐ | No - real database |
| 5b | Find contacts (Scrape) | ⭐⭐⭐⭐ | Low - from real HTML |
| 5c | Verify email | ⭐⭐⭐⭐⭐ | No - SMTP check |
| 6 | Write emails | ⭐⭐⭐⭐ | N/A - creative |

---

## File Structure

```
src/app/
├── page.tsx                    # Main UI, state management
├── api/
│   ├── extract/route.ts        # Gemini: parse context
│   ├── generate-list/route.ts  # Gemini: suggest companies
│   ├── verify-website/route.ts # HTTP: check websites exist
│   ├── research-contacts/route.ts    # Gemini: research people at companies (NEW)
│   ├── find-contacts-hunter/route.ts  # Hunter: domain search for emails
│   ├── scrape-contacts/route.ts       # HTTP+Gemini: scrape team pages
│   ├── verify-email/route.ts   # Hunter: bulk email patterns
│   ├── verify-single-email/route.ts   # Hunter: single email verify
│   └── write-emails/route.ts   # Gemini: compose emails

src/components/
├── ContextInput.tsx     # Step 1 input form
├── ResultsTable.tsx     # Companies/contacts table with verify button
├── EmailEditor.tsx      # Step 7 email editing

src/lib/
├── gemini.ts           # Gemini API wrapper
├── storage.ts          # LocalStorage persistence
```

---

## API Response Formats

### Company
```typescript
{
  id: string
  name: string
  website: string
  domain: string
  verificationStatus: 'verified' | 'unverified' | 'failed'
  websiteAccessible: boolean
  relevance: string
  status: 'not_contacted' | 'reached_out' | ...
}
```

### Person
```typescript
{
  id: string
  company: string
  name: string
  title: string
  email: string
  linkedin: string
  source: 'hunter' | 'website_scrape' | 'manual' | ...
  emailCertainty: number  // 0-100
  emailVerified: boolean
}
```

---

## Future Improvements

1. **LinkedIn scraping** - Find contacts via company LinkedIn pages
2. **Apollo integration** - Requires paid plan for API access
3. **Web search** - Google for "[Company] + [role] + LinkedIn"
4. **Email warm-up tracking** - Track which emails were sent
5. **CRM export** - Export to HubSpot/Salesforce

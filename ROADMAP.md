# Outreach AI Roadmap

## Current State (v0.1)

- Context extraction from pasted text
- Segment identification and selection
- Company list generation (LLM-only, no web search)
- Contact discovery (LLM-only)
- Email drafting with gold standard examples
- Checkbox selection for companies AND contacts
- TSV/CSV export
- Explainability notes (AI-generated warnings)

## Known Limitations

1. **No real web search** - Gemini generates company names from training data, not live search
2. **Hallucinated companies** - Websites may not exist or be incorrect
3. **No contact verification** - Emails/LinkedIn are generated, not verified

---

## v0.2 - Web Search Integration

### Priority: HIGH

**Goal:** Replace LLM hallucination with real web search results

**Options to evaluate:**

| Provider | Pros | Cons | Cost |
|----------|------|------|------|
| **Perplexity API** | Best quality, cites sources | Expensive, rate limits | ~$5/1000 queries |
| **SerpAPI** | Real Google results | Just links, need to parse | ~$50/5000 searches |
| **Tavily** | AI-native search API | Newer, less proven | ~$1/1000 searches |
| **Exa.ai** | Semantic search | Different paradigm | ~$1/1000 searches |

**Implementation approach:**
1. User provides search criteria (market, segment, keywords)
2. Web search returns real companies with verified websites
3. LLM enriches with relevance scoring
4. User selects, then proceed to contacts

**Tasks:**
- [ ] Add search provider selector in settings
- [ ] Implement Perplexity integration (start here)
- [ ] Add fallback to SerpAPI
- [ ] Cache search results to reduce costs
- [ ] Show search queries used (transparency)

---

## v0.3 - Contact Verification

**Goal:** Find real contacts instead of generating fake ones

**Approach:**
1. **LinkedIn scraping** - Use Proxycurl or similar API
2. **Email verification** - Hunter.io, Apollo.io integration
3. **Company website scraping** - Extract team pages

**Tasks:**
- [ ] Integrate Hunter.io for email finding
- [ ] Add LinkedIn profile lookup
- [ ] Email verification before displaying
- [ ] Show confidence score for each contact

---

## v0.4 - Schema Flexibility

**Goal:** Match user's existing Excel format

**Tasks:**
- [ ] Let user paste their Excel headers
- [ ] Few-shot example row for format learning
- [ ] Custom column mapping UI
- [ ] Export in user's exact format

---

## v0.5 - Project Persistence

**Goal:** Save and resume projects

**Tasks:**
- [ ] Database integration (Supabase/Postgres)
- [ ] User authentication
- [ ] Project history
- [ ] Export/import project state

---

## v0.6 - Email Workflow Improvements

**Goal:** Better control over email generation

**Tasks:**
- [ ] Upload existing company list to skip to contacts step
- [ ] Sample emails first → user feedback → generate all
- [ ] Gold standard email upload for style matching
- [ ] Edit individual email prompts
- [ ] Edit master prompt for all emails
- [ ] Show current email template being used

---

## v0.7 - Response Threading

**Goal:** Help users manage email conversations

**Tasks:**
- [ ] Click into email to add recipient responses
- [ ] LLM suggests reply based on response
- [ ] Track conversation history per contact
- [ ] Status updates (replied, meeting set, rejected)

---

## Future Ideas

- **Email sending integration** - Send directly from app
- **CRM sync** - HubSpot, Salesforce integration
- **Analytics** - Track open rates, responses
- **Team collaboration** - Share projects, assign contacts
- **Multi-language** - Generate emails in target market language

---

## Technical Debt

- [ ] Add proper error handling with user-friendly messages
- [ ] Add loading skeletons instead of spinner
- [ ] Add unit tests for API routes
- [ ] Add rate limiting
- [ ] Add request logging/analytics

# Outreach AI

Two ways to use this system:

## Option 1: Web App (for productizing)

**Location:** This folder (`outreach-ai/`)

**Run:**
```bash
cd outreach-ai
pnpm dev
# Open http://localhost:3000
```

**Requires:** `GOOGLE_API_KEY` in `.env.local`

**Flow:** Upload docs → Extract fields → Generate list → Find contacts → Write emails

---

## Option 2: Claude Code (for personal use)

**Location:** `export-projects/` folder

**Files:**
- `PIPELINE.md` - Full workflow documentation
- `QUICK_PROMPTS.md` - Copy-paste prompts
- `EXPORT-PROJECT-PROCESS.md` - Reference docs

**How to use:**
1. Open Claude Code in `export-projects/` directory
2. Say: "Read PIPELINE.md"
3. Follow the stages:
   - Stage 0: Paste context + schema
   - Stage 1: Generate list
   - Stage 2: Find contacts
   - Stage 3: Write emails
   - Stage 4-5: Updates

**Example:**
```
New project:
Client: Gustafsberg
Product: Premium Swedish bone china
Target market: Singapore
Target segment: Distributors, boutique retailers
Visit dates: Jan 26-28

Generate 25 target companies.
```

---

## Folder Structure

```
Desktop/Coding/
├── outreach-ai/           # WEB APP (productized)
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx   # Main UI
│   │   │   └── api/       # Gemini API routes
│   │   ├── components/
│   │   └── types/
│   ├── .env.local         # GOOGLE_API_KEY
│   └── CLAUDE.md          # This file
│
└── export-projects/       # CLAUDE CODE (personal)
    ├── PIPELINE.md        # Main workflow
    ├── QUICK_PROMPTS.md   # Copy-paste prompts
    ├── EXPORT-PROJECT-PROCESS.md
    └── _artifacts/        # Project examples
        ├── gustafsberg/
        ├── hulteberg/
        ├── axiomatics/
        └── ysds/
```

---

## Key Difference

| | Web App | Claude Code |
|---|---------|-------------|
| **Engine** | Gemini API | Claude (this conversation) |
| **Flexibility** | Fixed steps | Conversational, adaptive |
| **For** | Others / productizing | You personally |
| **Schema** | Default columns | Your custom schema |

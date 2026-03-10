# CLAUDE.md — Scout Trivia Build Brief

## Project Overview
A learning-focused Scouting America trivia game. Players select merit badge and rank categories, then answer multiple choice questions drawn from **actual official Scouting America content** — not AI hallucinations. Gemini generates questions from scraped source material; questions are stored in SQLite and served at game time with zero AI latency.

**Domain**: scouttrivia.com  
**Server**: Render-1 (LAN: 192.168.1.112 / Tailscale: 100.114.67.44)  
**Workspace**: `/mnt/claude-workspace/scouttrivia/`  
**Stack**: Node.js + Express backend, React + TypeScript frontend, SQLite DB, Gemini API for offline question generation

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Annual Cron Job (Jan 1 or manual trigger)          │
│  1. Scraper → scrapes scouting.org                  │
│  2. Stores raw content in SQLite                    │
│  3. Question Generator → feeds content to Gemini   │
│  4. Stores questions in SQLite                      │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  Express API (runtime)                              │
│  Serves pre-generated questions from SQLite         │
│  No AI calls at game time                           │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  React Frontend                                     │
│  Existing UI from AI Studio scaffold (reworked)     │
└─────────────────────────────────────────────────────┘
```

---

## Database Schema (SQLite)

```sql
-- Source content from scraper
CREATE TABLE topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,        -- e.g. "first-aid", "tenderfoot-rank"
  name TEXT NOT NULL,               -- e.g. "First Aid", "Tenderfoot Rank"
  type TEXT NOT NULL,               -- "merit_badge" or "rank"
  source_url TEXT NOT NULL,
  content TEXT NOT NULL,            -- full scraped text/HTML
  scraped_at DATETIME NOT NULL,
  last_updated DATETIME NOT NULL
);

-- Pre-generated questions
CREATE TABLE questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id),
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_answer TEXT NOT NULL,     -- "a", "b", "c", or "d"
  source_chunk TEXT,                -- the specific content this was generated from
  generated_at DATETIME NOT NULL,
  active INTEGER DEFAULT 1          -- 0 = retired, 1 = active
);

-- Optional: track player sessions for future analytics
CREATE TABLE game_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  started_at DATETIME NOT NULL,
  completed_at DATETIME,
  score INTEGER,
  total_questions INTEGER
);
```

---

## Phase 1 — Scraper (`scraper/`)

### What to scrape

**Merit Badges** (~130 badges):
- Base URL: `https://www.scouting.org/skills/merit-badges/all/`
- Each badge has its own requirements page
- Scrape: badge name, requirements list, any skill descriptions

**Ranks** (4 ranks):
- `https://www.scouting.org/programs/scouts-bsa/advancement-and-awards/`
- Scout Rank, Tenderfoot, Second Class, First Class
- Scrape full requirement text for each rank

### Scraper behavior
- Respectful scraping: 1-2 second delay between requests
- Store full content text in `topics.content`
- On annual re-run: compare content hash — only regenerate questions if content changed
- Log all scrape results (success/fail/unchanged) to `scraper.log`

### Files
```
scraper/
├── index.js          # Main scraper entry point
├── merit-badges.js   # Merit badge scraper
├── ranks.js          # Rank requirements scraper
└── utils.js          # Request helpers, rate limiting, content cleaning
```

---

## Phase 2 — Question Generator (`generator/`)

### Process
For each topic in the DB:
1. Pull `content` from `topics` table
2. Send to Gemini with structured prompt
3. Parse response
4. Insert questions into `questions` table
5. Mark old questions `active = 0` if content changed

### Gemini Prompt Template
```
You are creating educational trivia questions for Scouting America's official learning program.

Source material for [TOPIC NAME]:
---
[SCRAPED CONTENT]
---

Generate 25 multiple choice questions based ONLY on the above source material.
Rules:
- Questions must be answerable from the source material above
- Do not invent facts not present in the source
- Each question has exactly 4 options (a, b, c, d)
- Only one correct answer per question
- Vary difficulty: mix recall, comprehension, and application questions
- For rank requirements, questions should help Scouts actually learn and pass their requirements

Return as JSON array:
[{
  "question_text": "...",
  "option_a": "...",
  "option_b": "...", 
  "option_c": "...",
  "option_d": "...",
  "correct_answer": "a|b|c|d",
  "source_chunk": "brief quote from source material this is based on"
}]
```

### Files
```
generator/
├── index.js          # Main generator entry point, loops all topics
├── gemini.js         # Gemini API wrapper
└── utils.js          # DB helpers, content chunking if needed
```

---

## Phase 3 — Backend API (`server/`)

### Endpoints

```
GET  /api/categories
  Returns all topics with question counts
  Response: [{id, slug, name, type, question_count}]

GET  /api/categories/:slug/questions?limit=10
  Returns N random questions for a topic (shuffled options)
  Response: [{id, question_text, options: {a,b,c,d}}]  -- correct answer NOT included

POST /api/answer
  Body: {question_id, answer: "a|b|c|d"}
  Response: {correct: bool, correct_answer: "a|b|c|d", correct_text: "..."}

GET  /api/health
  Returns DB stats: topic count, question count, last scrape date
```

**Important**: Never return `correct_answer` in the questions endpoint. Only reveal it via `/api/answer`.

### Files
```
server/
├── index.js          # Express app, routes
├── db.js             # SQLite connection, query helpers
└── middleware.js     # CORS, rate limiting, error handling
```

---

## Phase 4 — Frontend (`src/`)

Rework the existing React AI Studio scaffold. The UI structure (category selection, hub, question card, score screen) is good — just rewire data flow.

### Changes from current scaffold
- Remove all `@google/genai` imports and Gemini calls
- Remove localStorage question cache (DB is the cache now)
- `CategorySelector`: fetch from `GET /api/categories` instead of hardcoded constants
- `QuestionCard`: fetch from `GET /api/categories/:slug/questions`
- Answer submission: POST to `/api/answer`, get correct/incorrect + explanation
- Keep the 4-category selection, 10-questions-per-category game structure
- Keep dark mode, existing Tailwind styling

### Keep from existing code
- `types.ts` GameStatus enum (mostly)
- Overall component structure and game flow
- The collapsible Merit Badges section in category selector
- Shuffle logic for answer options (now shuffle on frontend after receiving options)

### New addition
After a wrong answer, show the `source_chunk` from the DB as a "Learn more" tooltip or expandable section. This is a **learning game** — wrong answers should teach, not just penalize.

---

## Phase 5 — Deployment

### Docker setup
```dockerfile
# Multi-stage: builder + runtime
# Node 20 alpine
# Build frontend with vite
# Copy built frontend into server/public
# Single container serves both API and static files
# Port: 3006 (verify free on Render-1 before building)
```

### docker-compose entry
Add to existing `docker-compose.apps.yml` on Render-1.

### Environment variables needed
```
GEMINI_API_KEY=...      # For annual generation job only
PORT=3006
DB_PATH=/data/scouttrivia.db
```

### Cron job (annual)
```bash
# /etc/cron.d/scouttrivia
0 2 1 1 * cd /mnt/claude-workspace/scouttrivia && node scraper/index.js && node generator/index.js >> /var/log/scouttrivia-refresh.log 2>&1
```
Runs January 1st at 2am. Can also be triggered manually: `node scraper/index.js && node generator/index.js`

---

## Build Order
1. **DB setup** — create SQLite schema, seed topic list
2. **Scraper** — scrape all topics, verify content stored correctly
3. **Generator** — run Gemini batch, verify questions in DB (spot check 5-10 badges)
4. **Backend API** — build Express server, test all endpoints with curl
5. **Frontend** — wire existing React UI to API, remove Gemini client code
6. **Docker** — containerize, deploy on Render-1
7. **Cron** — set up annual refresh job

---

## Owner Notes
- Patrick Nolan — estate planning attorney, Kirksville MO
- **70% solution** — ship it working, don't over-engineer
- This is a learning game, not just a quiz — wrong answers should teach
- Gemini API stays (cost-effective for offline batch generation)
- Annual scrape + regenerate — content hash check to avoid unnecessary AI calls
- Check in before making architectural decisions not covered in this brief

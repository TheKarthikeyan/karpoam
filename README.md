# Karpoam

*கற்போம்* — Tamil for "Let's Learn"

Karpoam is a personal AI-powered learning tool that transforms YouTube videos into structured learning experiences. Paste a URL and get AI-generated highlights, timestamped insights, and a workspace to capture your own notes.

## What It Does

- **AI Highlight Reels** — Automatically extracts key topics with timestamps
- **Smart Summaries** — Get structured insights without watching the full video
- **AI Chat** — Ask questions grounded in the video transcript
- **Personal Notes** — Capture thoughts linked to specific timestamps
- **Cached Learning** — Previously analyzed videos load instantly

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS v4, shadcn/ui
- **AI**: OpenAI (gpt-4.1-mini), with Grok/Gemini adapter support
- **Database**: Supabase (Postgres + Auth)
- **Transcripts**: Supadata API

## Quick Start

### Prerequisites

- Node.js 18+
- Supabase project
- OpenAI API key (or xAI/Gemini)
- Supadata API key

### Setup

```bash
git clone https://github.com/YOUR_USERNAME/karpoam.git
cd karpoam
npm install
```

Create `.env.local`:

```env
# AI Provider (choose one)
OPENAI_API_KEY=your_openai_key
# XAI_API_KEY=your_xai_key        # Alternative: Grok
# GEMINI_API_KEY=your_gemini_key  # Alternative: Gemini

# AI Provider selection
NEXT_PUBLIC_AI_PROVIDER=openai    # or 'grok' or 'gemini'

# Transcripts
SUPADATA_API_KEY=your_supadata_key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Security
CSRF_SALT=generate_with_openssl_rand_base64_32

# Personal Use (disables rate limits and auth requirements)
DISABLE_RATE_LIMITS=true
```

Run migrations in Supabase SQL Editor from `supabase/migrations/`.

### Run

```bash
npm run dev
```

Visit http://localhost:3000

## Project Structure

```
├── app/
│   ├── api/              # API routes
│   ├── analyze/[videoId] # Video analysis workspace
│   ├── my-videos/        # Saved videos library
│   ├── all-notes/        # Notes dashboard
│   └── page.tsx          # Landing page
├── components/           # React components
├── lib/
│   ├── ai-providers/     # OpenAI, Grok, Gemini adapters
│   ├── ai-processing.ts  # AI orchestration
│   └── supabase/         # Database clients
└── supabase/migrations/  # Database schema
```

## Roadmap

- [x] YouTube video analysis
- [x] OpenAI integration
- [x] Personal use mode (no rate limits)
- [ ] OneDrive integration (Learn folder sync)
- [ ] PDF/article analysis
- [ ] Cross-content knowledge graph
- [ ] Spaced repetition for key concepts

## Origin

Forked from [LongCut](https://github.com/SamuelZ12/longcut) and customized for personal learning workflows.

## License

[GNU Affero General Public License v3.0](LICENSE)

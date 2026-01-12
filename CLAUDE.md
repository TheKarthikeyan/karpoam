# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Karpoam** (கற்போம் — Tamil for "Let's Learn") is a personal AI-powered learning tool built on Next.js 15. It transforms YouTube videos into structured learning experiences with AI-generated highlights, summaries, and an interactive Q&A system.

This project is forked from [LongCut](https://github.com/SamuelZ12/longcut) and customized for personal learning workflows with plans to integrate OneDrive for documents, papers, and reading lists.

### Project Goals

1. **Current**: YouTube video analysis with OpenAI integration
2. **Phase 2**: OneDrive integration (Learn folder sync)
3. **Phase 3**: PDF/article analysis
4. **Phase 4**: Cross-content knowledge graph and spaced repetition

### Key Customizations from LongCut

- **OpenAI Integration**: Added OpenAI adapter (`lib/ai-providers/openai-adapter.ts`) with model cascade
- **Personal Use Mode**: `DISABLE_RATE_LIMITS=true` bypasses auth/limits for personal use
- **Rebranded UI**: All branding updated to Karpoam

## Key Commands

```bash
npm run dev           # Start development server with Turbopack
npm run build         # Build production bundle with Turbopack
npm start            # Start production server
npm run lint         # Run ESLint on the codebase
```

## Architecture & Structure

### AI Provider System (`lib/ai-providers/`)

The app uses a pluggable AI provider architecture:

- **`registry.ts`**: Provider registration and selection
- **`openai-adapter.ts`**: OpenAI integration (primary for this fork)
- **`grok-adapter.ts`**: xAI Grok adapter
- **`gemini-adapter.ts`**: Google Gemini adapter
- **`client-config.ts`**: Client-side provider configuration

**OpenAI Model Cascade**:
```
gpt-4.1-mini → gpt-5-mini → gpt-5.1 → gpt-4o
```

**Provider Selection** (via `NEXT_PUBLIC_AI_PROVIDER`):
- `openai` — OpenAI models (recommended for this fork)
- `grok` — xAI Grok models
- `gemini` — Google Gemini models

### Application Routing

The app uses Next.js 15 App Router with two main pages:

1. **Home Page** (`app/page.tsx`): Landing page with URL input
   - Redirects to `/analyze/[videoId]` when URL is submitted
   - Handles auth redirects and pending video linking after authentication

2. **Analysis Page** (`app/analyze/[videoId]/page.tsx`): Main video analysis interface
   - Dynamic route handling `[videoId]` parameter
   - Page states: `IDLE`, `ANALYZING_NEW`, `LOADING_CACHED`
   - Loading stages: `fetching`, `understanding`, `generating`, `processing`
   - Two-column layout: Left (video player + highlights), Right (tabs for Summary/Chat/Transcript/Notes)

### Core Application Flow

1. User inputs YouTube URL → `components/url-input.tsx`
2. Router navigates to `/analyze/[videoId]` with optional query params (`url`, `cached`)
3. Fetch video info → `app/api/video-info/route.ts` (metadata & thumbnails)
4. Fetch transcript → `app/api/transcript/route.ts` (uses Supadata API)
5. Generate AI content in parallel:
   - Highlight reels → `app/api/generate-topics/route.ts`
   - Video summary → `app/api/generate-summary/route.ts`
   - Suggested questions (background) → `app/api/suggested-questions/route.ts`
6. Display two-column interface
7. Cache results to Supabase for instant reload

### API Routes

#### Core Video Processing
- `/api/transcript`: Fetches YouTube transcripts via Supadata API
- `/api/video-info`: Retrieves video metadata (title, author, duration, thumbnail)
- `/api/video-analysis`: Main analysis endpoint (generates topics, saves to cache)
- `/api/generate-summary`: Creates comprehensive video summary
- `/api/quick-preview`: Fast topic preview generation
- `/api/check-video-cache`: Checks if video analysis already exists

#### AI & Chat
- `/api/chat`: Powers context-aware AI chat with citation extraction
- `/api/suggested-questions`: Generates relevant questions based on video content
- `/api/top-quotes`: Extracts memorable quotes from transcript

#### User Data
- `/api/check-limit`: Validates rate limits (bypassed when `DISABLE_RATE_LIMITS=true`)
- `/api/update-video-analysis`: Updates existing video analysis
- `/api/notes`: CRUD operations for user notes
- `/api/csrf-token`: Provides CSRF tokens for secure requests

### Personal Use Mode

When `DISABLE_RATE_LIMITS=true` is set in `.env.local`:

- Rate limits are bypassed
- Authentication is optional
- Video caching works without login
- CSRF tokens work without auth
- All features available for personal use

**Files modified for personal use mode**:
- `app/api/check-limit/route.ts`
- `app/api/video-analysis/route.ts`
- `app/api/update-video-analysis/route.ts`
- `app/api/csrf-token/route.ts`

### Key Technical Implementation

#### Quote Matching System (`lib/quote-matcher.ts`)
- **Boyer-Moore Search**: Efficient substring search for exact matching
- **N-gram Similarity**: 3-gram Jaccard coefficient for fuzzy matching
- **Multi-strategy Matching**: Falls back from exact → normalized → fuzzy

#### AI Processing (`lib/ai-client.ts`, `lib/ai-processing.ts`)
- **Model Cascade**: Automatically falls back through models on failure
- **Structured Output**: Zod schemas for type-safe AI responses
- **Retry Logic**: Detects rate limits and tries next model
- **Topic Generation Modes**: `smart` (quality) vs `fast` (speed)

#### Async Operation Management (`lib/promise-utils.ts`)
- **AbortManager**: Centralized abort controller management
- **backgroundOperation**: Non-blocking operations that log errors
- **safePromise**: Go-style `[data, error]` tuple returns

### Component Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Video Header (title, author, actions)                  │
├──────────────────────────┬──────────────────────────────┤
│  YouTube Player          │  RightColumnTabs             │
│  (youtube-player.tsx)    │  ├─ Summary (summary-viewer) │
│                          │  ├─ Chat (ai-chat)           │
│  HighlightsPanel         │  ├─ Transcript (viewer)      │
│  ├─ ThemeSelector        │  └─ Notes (notes-panel)      │
│  └─ Topic Cards          │                              │
└──────────────────────────┴──────────────────────────────┘
```

### Database Integration (Supabase)

**Tables**:
- `video_analyses`: Stores complete video analysis with topics, transcript, summary
- `user_videos`: Links users to their analyzed videos
- `user_notes`: User notes on videos
- `profiles`: User profile data
- `rate_limits`: API usage tracking

**Caching Strategy**:
- Check cache before processing (`/api/check-video-cache`)
- Save analysis via RPC function `insert_video_analysis_server`
- Load cached data instantly on repeat visits

### Environment Variables

Required in `.env.local`:

```env
# AI Provider (choose one)
OPENAI_API_KEY=your_key           # Recommended for this fork
# XAI_API_KEY=your_key            # Alternative: Grok
# GEMINI_API_KEY=your_key         # Alternative: Gemini

# Provider selection
NEXT_PUBLIC_AI_PROVIDER=openai    # or 'grok' or 'gemini'

# Transcripts
SUPADATA_API_KEY=your_key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key

# Security
CSRF_SALT=generate_random_string

# Personal Use (optional)
DISABLE_RATE_LIMITS=true          # Bypasses auth/limits
```

### Development Patterns

#### Error Handling
- Use `backgroundOperation` for non-critical operations
- Display user-friendly error messages, log details server-side
- Graceful degradation: If summary fails, keep topics visible

#### State Updates
- Batch related state updates to minimize re-renders
- Use `useCallback` for memoized setters
- Clear playback state when switching modes

#### Request Lifecycle
- Create AbortControllers via `AbortManager` for all API requests
- Set appropriate timeouts (10s metadata, 30s transcripts, 60s AI)
- Clean up on unmount

### Future Development (Roadmap)

#### Phase 2: OneDrive Integration
- Microsoft Graph API for OneDrive access
- Sync "Learn" folder with reading lists and papers
- Import documents for analysis

#### Phase 3: Multi-Content Learning
- PDF/article analysis with same topic extraction
- Cross-reference insights between videos and documents
- Personal knowledge graph

#### Phase 4: Enhanced Learning
- Spaced repetition for key concepts
- Progress tracking dashboard
- Export to various formats

### Deployment

Optimized for local development. For production deployment:
- Use Vercel with Next.js 15
- Configure environment variables in Vercel dashboard
- Run Supabase migrations before first deploy

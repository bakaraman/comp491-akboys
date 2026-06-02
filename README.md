# The Velvet Shadow

> A real-time, AI-narrated multiplayer detective game where every mystery is
> procedurally generated from a one-sentence prompt.

Up to ten players cooperate to investigate a procedurally crafted crime,
interrogate NPCs that defend their own alibis, search rooms, and stake one
unanimous accusation before the turn limit runs out. The narrator is a large
language model; the world, the suspects, and the truth are all written on the
fly. Fully bilingual (Turkish + English) end-to-end — same session, two
languages.

## Features

- **Procedural worlds** — host types one sentence; an LLM returns a complete
  world: rooms, NPCs with alibis and motives, evidence, red herrings, a hidden
  culprit.
- **Free-text investigation** — type any action in natural language. No menus,
  no scripted choices. The narrator interprets and responds in cinematic prose.
- **NPCs that lie** — every character has a private backstory, a fragile alibi,
  and a hidden secret. Press them and they slip.
- **One-shot accusation** — wrong suspect or wrong evidence ends the game. The
  accusation must be unanimous. Red herrings punish careless deduction.
- **Real-time multiplayer** — up to 10 detectives. Same-room players share the
  narrator's feed; voice chat and a shared evidence board turn investigation
  into teamwork.
- **Bilingual in one session** — TR and EN flow from a single LLM call.
  Localized narrator voice (Turkish + English TTS) for each player.
- **Cinematic post-game** — crime-scene reconstruction replay and a downloadable
  PDF case file with genre-adaptive styling.
- **Live cost telemetry** — every OpenAI call is logged with token + latency +
  cost to a Firestore-backed `/admin/usage` dashboard.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript |
| Backend | Node.js, Express, Socket.IO, TypeScript |
| AI Narrator | OpenAI `gpt-5.4` (streaming + structured outputs) |
| AI Worldgen / Finale | OpenAI `gpt-5.4-mini` |
| AI Suggestions / Reconstruction | OpenAI `gpt-5.4-nano`, `gpt-4.1-nano` |
| AI Scene Art | OpenAI `gpt-image-2` |
| AI TTS | OpenAI `gpt-4o-mini-tts` (bilingual) |
| Persistence | Firebase Firestore (sessions + usage telemetry) |
| Auth | Firebase Auth (Google sign-in, optional) |
| PDF | `@react-pdf/renderer` (genre-adaptive case file) |
| Monorepo | npm workspaces |

## Project Structure

```
.
├── packages/
│   ├── shared/                    # Shared types + bilingual scenario fallback
│   ├── server/                    # Express + Socket.IO real-time backend
│   │   └── src/
│   │       ├── lib/               # openai-client, retry, usage-logger, tts-cache
│   │       ├── middleware/        # OpenAI wrappers (narrator, structured, suggestions)
│   │       ├── routes/chat.ts     # REST endpoints (chat, image, TTS, finale, PDF)
│   │       ├── socket/            # Real-time handlers + action batcher
│   │       ├── store/             # Memory + Firestore session stores
│   │       ├── world/             # Worldgen, reconstruction, finale, TTS, images
│   │       └── pdf/               # Case-file PDF document
│   └── web/                       # Next.js client
│       └── src/
│           ├── app/               # Pages: home, /session/[id], /replay, /admin/usage
│           ├── components/        # Lobby, ChatMessage, FinaleCinematic, GameMap, etc.
│           ├── hooks/             # useMultiplayerSession, useLocale, useVoiceChat
│           └── lib/               # firebase, tr/en strings, pickLang
└── docs/                          # Architecture / Boot / Contributing / Design
```

## Quick Start

```bash
# 1. Clone
git clone https://github.com/<your-fork>/velvet-shadow.git
cd velvet-shadow

# 2. Install
npm install

# 3. Configure
cp .env.example .env
# Edit .env — at minimum set OPENAI_API_KEY=sk-...
# For Firestore persistence + auth, also set FIREBASE_PROJECT_ID
# and run `gcloud auth application-default login`.

# 4. Run
npm run dev:local
```

- Web:    http://localhost:3000
- Server: http://localhost:3001
- Live cost dashboard: http://localhost:3000/admin/usage

## How a Game Flows

1. **Host** opens the home page, types a one-sentence prompt
   (`"1925 Istanbul boarding-school"`, `"deep-space station, sabotage"`, etc.)
2. The server generates a bilingual world via the OpenAI structured-output
   schema. Genre is auto-detected; an opening atmosphere image renders in
   parallel.
3. **Players** join via the 6-character room code, pick TR or EN per seat,
   and land in their assigned starting rooms.
4. Each turn a player types an action; the narrator returns a structured
   bilingual response with optional `MOVE` directives. Same-room players see
   the action and the narrator's prose in their own locale.
5. After 4–40 turns a player proposes an accusation. The team votes; the call
   must be unanimous. Wrong = game over.
6. The post-game shows a bilingual crime-scene reconstruction replay and lets
   each player download a personalised case-file PDF.

## Architecture (high level)

```
Browser ──WebSocket──► Express+Socket.IO server ──REST──► OpenAI API
   │                            │                          (gpt-5.4 / mini / nano,
   │                            │                           gpt-image-2,
   │                            │                           gpt-4o-mini-tts)
   │                            │
   │                            ├──Firestore (sessions + openai_usage)
   │                            │
   └──Firebase Auth (optional, Google sign-in)
```

- Server-side TTS pre-warm renders both TR + EN narration in parallel the
  moment world generation completes, so the curtain-open audio plays
  instantly.
- `lib/openai-retry.ts` retries once on `RateLimitError` /
  `APIConnectionTimeoutError`; mid-stream errors surface as explicit SSE
  `type:"error"` frames instead of silent truncation.
- `lib/usage-logger.ts` fans every OpenAI call to stdout + JSONL +
  Firestore, keyed by `sessionId + purpose + model`.

## Scripts

| Command | Description |
|---|---|
| `npm run dev:local` | Start server + web concurrently |
| `npm run build` | Build all workspaces |
| `npm run clean` | Remove build artifacts |
| `npm run test:firestore -w packages/server` | Firestore session-store integration test |

## Environment

Copy `.env.example` to `.env` and fill in:

```
OPENAI_API_KEY=sk-...
FIREBASE_PROJECT_ID=<your-firebase-project>   # optional, enables Firestore + Auth
FIREBASE_AUTH_ENABLED=false                   # set true to require Google sign-in
NEXT_PUBLIC_SERVER_URL=http://localhost:3001
CORS_ORIGIN=http://localhost:3000             # comma-separated for prod
SESSION_STORE=memory                          # or `firestore`
```

When `FIREBASE_PROJECT_ID` is unset, the server falls back to an in-memory
session store and the usage dashboard reports `Firestore client başlatılamadı`.

## Authors

Kadir Yiğit Özçelik, Serdar Yengil, Batuhan Karaman, Ata Berke Göktekin.
Advisor: Barış Akgün.

## License

MIT — see [LICENSE](LICENSE).

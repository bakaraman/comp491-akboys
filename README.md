# Text-Based Adventure with LLMs

**COMP 491 Senior Design Project — Koc University, Spring 2026**

An AI-powered text adventure game where a large language model narrates interactive stories in real-time. Players pick a scenario, explore rooms, talk to NPCs, and solve mysteries — all through natural language.

## Team (AK Boys)

| Name | Student ID | Role |
|---|---|---|
| Kadir Yigit Ozcelik | 79975 | Frontend & UI |
| Serdar Yengil | 80232 | Backend & API |
| Batuhan Karaman | 79791 | Infrastructure & GCP |
| Ata Berke Goktekin | 80277 | Game Design & Prompts |

**Advisor:** Baris Akgun

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript |
| Backend | Express.js, TypeScript |
| AI (Narrator) | OpenAI GPT-5.4 (streaming, SSE) |
| AI (Suggestions) | OpenAI GPT-5-nano (minimal reasoning) |
| Markdown | react-markdown |
| Monorepo | npm workspaces |

## Project Structure

```
comp491-akboys/
├── packages/
│   ├── shared/          # Shared types & scenario data
│   │   └── src/
│   │       ├── types/         # Room, NPC, Item, Scenario, ChatMessage, etc.
│   │       └── constants/     # 6 scenarios (noir, haunted, space, pirate, western, cyberpunk)
│   ├── server/          # Express backend
│   │   └── src/
│   │       ├── index.ts       # Entry point (port 3001)
│   │       ├── routes/chat.ts # All API routes
│   │       ├── middleware/openai.ts  # GPT-5.4 streaming + GPT-5-nano suggestions
│   │       └── store/SessionStore.ts # Session interface + in-memory implementation
│   └── web/             # Next.js frontend
│       └── src/
│           ├── app/
│           │   ├── page.tsx              # Home — scenario picker
│           │   └── session/[id]/page.tsx # Game — chat interface per session
│           └── components/
│               ├── ChatMessage.tsx  # Markdown-rendered message bubbles
│               └── ChatInput.tsx    # Player text input
├── docs/                # Course documents, templates, generators
├── .env.example         # Environment variable template
└── package.json         # Root workspace config
```

## Quick Start

```bash
# 1. Clone
git clone https://github.com/bakaraman/comp491-akboys.git
cd comp491-akboys

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env
# Edit .env and add your OpenAI API key:
# OPENAI_API_KEY=sk-...

# 4. Run both server and web
npm run dev:local
```

- **Web:** http://localhost:3000
- **Server:** http://localhost:3001

## How It Works

1. Player opens `/` and picks one of 6 scenarios
2. A session is created with a unique UUID
3. Player is redirected to `/session/[uuid]`
4. The narrator (GPT-5.4) streams the opening scene via SSE
5. Player types actions, narrator responds in real-time
6. After each narrator response, 3 follow-up suggestions appear (GPT-5-nano)

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/chat/scenarios` | List all 6 available scenarios |
| POST | `/api/chat/new` | Create a new session (returns sessionId) |
| POST | `/api/chat/start` | Stream the opening narration |
| POST | `/api/chat` | Send a message, stream narrator response |
| GET | `/api/chat/session/:id` | Get session info + message history |
| POST | `/api/chat/suggestions` | Get 3 follow-up action suggestions |

## Available Scenarios

| ID | Title | Setting |
|---|---|---|
| noir | The Velvet Shadow | 1920s rain-soaked Chicago |
| haunted | The Hollow Manor | Gothic haunted manor on a stormy hilltop |
| space | Station Zero | Deep-space research station |
| pirate | The Crimson Tide | 18th-century pirate galleon |
| western | Dust and Ashes | Wild West frontier town |
| cyberpunk | Neon Ghosts | Rain-drenched cyberpunk megacity, 2087 |

## Architecture

```
Browser ──► Next.js (3000) ──► Express (3001) ──► OpenAI API
                                     │
                              SessionStore (in-memory)
                              (swap to Firestore later)
```

- **SessionStore interface** makes database migration easy — just implement `FirestoreSessionStore`
- **SSE streaming** delivers narrator text chunk-by-chunk for real-time feel
- **Two AI models**: GPT-5.4 for quality narration, GPT-5-nano for fast suggestions

## Scripts

| Command | Description |
|---|---|
| `npm run dev:local` | Start server + web concurrently |
| `npm run build` | Build all packages |
| `npm run clean` | Remove all build artifacts |

## License

Private — COMP 491 course project.

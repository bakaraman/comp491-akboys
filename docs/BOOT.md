# BOOT.md — How to Run the Project Locally

---

## Prerequisites

- **Node.js** >= 18 (check: `node -v`)
- **npm** >= 9 (check: `npm -v`)
- **OpenAI API key** (ask Batuhan)

---

## First-Time Setup

```bash
# 1. Clone
git clone https://github.com/bakaraman/comp491-akboys.git
cd comp491-akboys

# 2. Install all dependencies (root + all 3 packages)
npm install

# 3. Copy env template and add your API key
cp .env.example .env
# Edit .env → set OPENAI_API_KEY=sk-...
```

---

## Running Locally

```bash
# Start both server (3001) and web (3000) concurrently
npm run dev:local
```

This runs:
- **Server**: `http://localhost:3001` (Express + Socket.IO)
- **Web**: `http://localhost:3000` (Next.js)

Open `http://localhost:3000` in your browser.

---

## Environment Variables You Need to Know

| Variable | Default | What It Does |
|----------|---------|-------------|
| `OPENAI_API_KEY` | (required) | Your OpenAI API key for GPT-5.4 |
| `PORT` | `3001` | Server port |
| `CORS_ORIGIN` | `http://localhost:3000` | Frontend origin allowed by server |
| `SESSION_STORE` | `memory` | `memory` for local dev, `firestore` for production |
| `FIREBASE_AUTH_ENABLED` | `false` | Set `true` only in production |
| `NEXT_PUBLIC_SERVER_URL` | `http://localhost:3001` | Frontend reads this to know where the API is |
| `NEXT_PUBLIC_FIREBASE_AUTH_ENABLED` | `false` | Set `true` only in production |

**For local development, you only need to set `OPENAI_API_KEY`.** Everything else has working defaults.

---

## Build & Type Check

```bash
# Build all packages (shared → server → web)
npm run build

# Type check without building (fast, catches errors)
npx tsc --noEmit -p packages/server/tsconfig.json
npx tsc --noEmit -p packages/shared/tsconfig.json
```

---

## Project Structure — What's Where

```
packages/
  shared/src/
    types/game.ts          ← ALL type definitions (Room, NPC, Item, GameState, etc.)
    types/socket-events.ts ← Socket.IO event types (client↔server)
    constants/scenarios.ts ← 6 scenario data objects
    index.ts               ← Re-exports everything

  server/src/
    index.ts               ← Server entry: Express + Socket.IO + CORS + Firebase Admin
    routes/chat.ts         ← 10 REST API endpoints
    middleware/openai.ts   ← GPT-5.4 streaming, GPT-5-nano suggestions, image gen
    middleware/auth.ts     ← Firebase Auth middleware
    store/SessionStore.ts  ← MemorySessionStore + FirestoreSessionStore
    socket/handlers.ts     ← All Socket.IO event handlers (multiplayer)
    socket/prompt-builder.ts ← Narrator prompt construction + response parsing
    socket/action-batcher.ts ← Timer-based action queue for multiplayer

  web/src/
    app/
      layout.tsx           ← Root layout (imports globals.css)
      page.tsx             ← Home page (Single Player / Multiplayer cards)
      login/page.tsx       ← Google sign-in page
      singleplayer/page.tsx ← Scenario picker
      multiplayer/page.tsx  ← Host/Join room
      session/[id]/page.tsx ← THE GAME (1058 lines — both SP and MP)
    components/
      ChatMessage.tsx      ← Markdown-rendered message bubbles
      ChatInput.tsx         ← Player text input with typing indicator
      CommPanel.tsx         ← Player-to-player communication (room + direct)
      PlayerSidebar.tsx     ← Player list, rooms, inventories
      AuthGuard.tsx         ← Auth gate (redirects if not logged in)
      NamePopup.tsx         ← First-time name entry
      CopyLinkButton.tsx    ← Copy room link to clipboard
      ProfileButton.tsx     ← Profile menu (top-right)
    hooks/
      useMultiplayerSession.ts ← Socket.IO state management hook
      usePlayerName.ts         ← localStorage name persistence
    lib/
      firebase.ts          ← Firebase client SDK init
      socket.ts            ← Socket.IO client singleton
    styles/
      globals.css          ← CSS variables, scrollbar, body styles
```

---

## How to Test Your Changes

### Frontend changes:
1. `npm run dev:local` → make changes → browser auto-refreshes (Next.js hot reload)
2. Open browser DevTools → Console tab → check for errors
3. Network tab → verify API calls go to `localhost:3001`

### Backend changes:
1. `npm run dev:local` → make changes → server auto-restarts (tsx watch mode)
2. Test endpoints with curl:
   ```bash
   # List scenarios
   curl http://localhost:3001/api/chat/scenarios
   
   # Create session
   curl -X POST http://localhost:3001/api/chat/new \
     -H 'Content-Type: application/json' \
     -d '{"scenarioId": "noir"}'
   
   # Health check
   curl http://localhost:3001/api/health
   ```

### Shared type changes:
1. Edit `packages/shared/src/types/game.ts`
2. Both server and web pick up changes automatically (no rebuild needed in dev mode)

### Multiplayer testing:
1. Open `http://localhost:3000` in 2-3 browser tabs
2. Tab 1: Create multiplayer room → copy room code
3. Tab 2+: Join with room code
4. Play through scenario voting → game start → actions

---

## Common Issues

### "Cannot find module '@akboys/shared'"
```bash
npm install  # Re-link workspace packages
```

### "OPENAI_API_KEY is not set"
Check `.env` file exists in the project root (not in packages/).

### "CORS error in browser console"
Make sure `CORS_ORIGIN` in `.env` matches your frontend URL (`http://localhost:3000`).

### "WebSocket connection failed"
Socket.IO falls back to polling automatically. If both fail, check server is running on port 3001.

### "Session not found" after server restart
When using `SESSION_STORE=memory`, all sessions are lost on restart. This is expected for local dev.

---

## Git Workflow

```bash
# 1. Create branch for your issue
git checkout -b feature/issue-21-game-map

# 2. Make changes, commit
git add packages/web/src/components/GameMap.tsx
git commit -m "feat: add interactive game map component"

# 3. Push and create PR
git push -u origin feature/issue-21-game-map
gh pr create --title "feat: interactive game map (#21)"
```

See CONTRIBUTING.md for detailed branch naming and PR guidelines.

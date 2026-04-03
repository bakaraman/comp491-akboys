# CONTRIBUTING.md — How to Work on Issues

---

## Branch Naming

```
feature/issue-{number}-{short-description}
fix/issue-{number}-{short-description}
```

Examples:
- `feature/issue-21-game-map`
- `feature/issue-18-player-roles`
- `fix/issue-31-haunted-cellar`

---

## Commit Messages

Format: `type: short description (#issue)`

Types: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`

Examples:
- `feat: add interactive game map component (#21)`
- `fix: connect haunted cellar to foyer exits (#31)`
- `refactor: extract NPC trust logic into separate module (#19)`

---

## Pull Request Process

1. Push your branch
2. Create PR with `gh pr create`
3. PR title: same as commit message
4. PR body: what changed, why, how to test
5. Request review from at least 1 teammate
6. After approval, merge to main

---

## File Rules

### Every `.ts` / `.tsx` file MUST have a header:

```typescript
/**
 * GameMap.tsx — Interactive fog-of-war game map
 *
 * Renders scenario rooms as nodes with connections.
 * Shows player positions and visited/unvisited rooms.
 *
 * @author AK Boys Team
 * @since 2026-04-10
 */
```

### File size limits:

| Lines | Action |
|-------|--------|
| 200+ | Consider splitting |
| 800+ | Must propose split plan |
| 1000+ | Stop — refactor first |

The session page (`session/[id]/page.tsx`) is already 1058 lines. If you need to add to it, extract a new component instead.

---

## Import Order

```typescript
// 1. Node built-ins
import path from 'path';

// 2. External packages
import express from 'express';
import { Server } from 'socket.io';

// 3. Monorepo packages
import { Scenario, GameState } from '@akboys/shared';

// 4. Local imports
import { narratorChatStream } from '../middleware/openai.ts';
import type { SessionData } from '../store/SessionStore.ts';
```

Blank line between each group.

---

## Where to Put New Code

### New frontend component:
```
packages/web/src/components/YourComponent.tsx
```

### New frontend hook:
```
packages/web/src/hooks/useYourHook.ts
```

### New backend route:
Add to `packages/server/src/routes/chat.ts` — or create a new router file if it's a separate domain (e.g., `routes/admin.ts`).

### New socket event:
Add handler in `packages/server/src/socket/handlers.ts`. Add types in `packages/shared/src/types/socket-events.ts`.

### New shared type:
Add to `packages/shared/src/types/game.ts`. Re-export from `packages/shared/src/index.ts`.

### New scenario:
Add to `packages/shared/src/constants/scenarios.ts` inside the `SCENARIOS` record.

---

## Styling Rules

**Read `docs/DESIGN.md` before writing any UI code.**

- All styles are inline: `style={{ color: '#d4a843' }}`
- Use colors from DESIGN.md palette only
- Use existing spacing/radius/z-index patterns
- No Tailwind, no CSS modules, no styled-components

---

## Testing Your Work

Before opening a PR:

1. `npm run dev:local` — does the app start without errors?
2. Open browser → test your feature manually
3. Check browser console → no errors?
4. Check terminal → no server errors?
5. If you changed types in shared, does `npm run build` succeed?
6. If you changed backend, test with curl (see BOOT.md)
7. If you changed multiplayer, test with 2+ browser tabs

---

## API Endpoint Conventions

- All endpoints under `/api/chat/`
- All endpoints use `requireAuth` middleware
- POST body is JSON: `Content-Type: application/json`
- SSE responses: `data: { type, content, ... }\n\n`
- Socket events: typed in `socket-events.ts`
- Error responses: `{ error: string }` with appropriate HTTP status

---

## Adding a New Socket Event

1. Define types in `packages/shared/src/types/socket-events.ts`:
   ```typescript
   // In ClientToServerEvents:
   'player:accuse': (data: { sessionId: string, playerId: string, suspectId: string, evidenceId: string }) => void;
   
   // In ServerToClientEvents:
   'session:gameover': (data: { status: 'won' | 'lost', endReason: string, summary: string }) => void;
   ```

2. Add handler in `packages/server/src/socket/handlers.ts`:
   ```typescript
   socket.on('player:accuse', async (data) => { ... });
   ```

3. Emit from client in `packages/web/src/hooks/useMultiplayerSession.ts`:
   ```typescript
   socket.emit('player:accuse', { sessionId, playerId, suspectId, evidenceId });
   ```

4. Listen from client:
   ```typescript
   socket.on('session:gameover', (data) => { ... });
   ```

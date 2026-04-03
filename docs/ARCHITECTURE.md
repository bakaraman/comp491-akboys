# ARCHITECTURE.md — System Architecture Deep Dive

---

## Package Dependency Graph

```
@akboys/web ──→ @akboys/shared
@akboys/server ──→ @akboys/shared
```

Dependencies flow DOWN only. `shared` never imports from `server` or `web`. `web` never imports from `server`.

---

## Data Flow — Single-Player

```
Browser ──HTTP──→ Next.js (3000) ──REST──→ Express (3001) ──API──→ OpenAI
                                    │
                                    ├── POST /api/chat/new → create session
                                    ├── POST /api/chat/start → SSE stream opening
                                    ├── POST /api/chat → SSE stream narrator response
                                    ├── POST /api/chat/suggestions → 3 action suggestions
                                    ├── POST /api/chat/image → scene image
                                    ├── POST /api/chat/accuse → end-game accusation
                                    └── GET /api/chat/session/:id → session state
```

### Single-Player Action Flow:
1. Player types message in ChatInput
2. Frontend POSTs to `/api/chat` with `{ sessionId, message }`
3. Server increments `turnCount` → checks if `>= maxTurns` → if yes: game over
4. Server calls `narratorChatStream()` → streams SSE chunks to frontend
5. After stream ends: `extractGameStateUpdate()` runs (LLM + heuristic)
6. GameState updated: room, inventory, evidence, turn count
7. Frontend requests `POST /api/chat/suggestions` → 3 buttons appear

### Single-Player Accusation Flow:
1. Player clicks "Accuse" button → modal opens
2. Selects suspect (NPC) + evidence (item)
3. Frontend POSTs to `/api/chat/accuse` with `{ sessionId, suspectId, evidenceId }`
4. Server checks 3 conditions:
   - `suspectId === scenario.solution.culpritId`
   - `evidenceId === scenario.solution.evidenceId`
   - ALL `requiredEvidenceIds` found in `discoveredEvidence ∪ inventory`
5. All 3 true → `status: 'won'` | Any false → `status: 'lost'`
6. Frontend shows game-over overlay

---

## Data Flow — Multiplayer

```
Player 1 ──Socket.IO──┐
Player 2 ──Socket.IO──├──→ Express + Socket.IO (3001) ──API──→ OpenAI
Player 3 ──Socket.IO──┘         │
                                ├── ActionBatcher (timer-based queue)
                                ├── Prompt Builder (per-player scoped prompts)
                                ├── Directive Validator (MOVE, PICKUP, etc.)
                                └── World State Log (canonical events)
```

### Multiplayer Session Lifecycle:
1. **Lobby**: Host creates session → gets 6-char room code
2. **Joining**: Players emit `player:join` → assigned color, UUID, starting room
3. **Voting**: Host picks scenario → others vote → host confirms
4. **Playing**: Actions go through `ActionBatcher` → processed sequentially
5. **Ended**: ⚠️ NOT IMPLEMENTED YET — see issue #25

### Multiplayer Action Flow:
1. Player emits `player:action` with message
2. Cooldown check (2s per player)
3. Action enters `ActionBatcher` queue
4. Batcher waits: 1.5s (single action) / 4s (multi) / 6s max
5. Timer fires → drain queue → process each action sequentially:
   a. `buildPlayerActionPrompt()` → system prompt with full world state
   b. `narratorStructuredResponse()` → JSON `{ response, observed, directives }`
   c. If JSON fails → `narratorChatStream()` + `parseLegacyTextResponse()`
   d. Validate each directive against canonical state
   e. Apply valid directives (update rooms, inventory, object states)
   f. Send `narrator:chunk` + `narrator:done` → ONLY to actor
   g. Send `narrator:observed` → ONLY to same-room witnesses
   h. Generate suggestions → ONLY to actor

### Visibility Model:
| Message Type | Who Sees It |
|-------------|-------------|
| Opening narration | Everyone |
| Player's own action | Only that player |
| Narrator private response | Only the actor |
| Narrator observed response | Same-room players (not the actor) |
| Room comm | All players in sender's room |
| Direct comm | Sender + target only |

---

## Session Store

### SessionData fields:
```typescript
{
  id: string                           // UUID
  scenarioId: string                   // 'noir', 'haunted', etc. or '__pending'
  roomCode?: string                    // 6-char code for multiplayer
  history: MultiplayerChatMessage[]    // all narrator + player messages
  gameState: GameState                 // room, inventory, turns, evidence, status
  players: Map<string, PlayerData>     // multiplayer player states
  state: 'lobby'|'voting'|'playing'|'ended'
  maxPlayers: number                   // 1 for SP, 2-4 for MP
  worldStateLog: string[]              // human-readable log
  worldStateEvents: WorldStateEvent[]  // structured events
  objectStates: Map<string, Record<string, boolean>>  // "roomId:objectId" → flags
  commHistory: CommMessageDTO[]        // player-to-player messages
  // ... plus voting, streaming, queue fields
}
```

### Memory vs Firestore:
- `MemorySessionStore`: Map in RAM. Fast. Lost on restart.
- `FirestoreSessionStore`: Extends Memory. Every mutation → async sync to Firestore. On startup → hydrate from Firestore.
- Selected by `SESSION_STORE` env var.

---

## AI Models

| Model | Purpose | Streaming | Cost |
|-------|---------|-----------|------|
| `gpt-5.4` | Narrator (main) | Yes (SSE) or No (structured JSON) | High |
| `gpt-5-nano` | Suggestions, GameState extraction | No | Low |
| `gpt-image-1.5` | Scene images | No | Medium |

### Narrator parameters:
- `MAX_TOKENS: 800`
- `TEMPERATURE: 0.85`
- Streaming: SSE for single-player, structured JSON for multiplayer

### Structured JSON schema (multiplayer):
```json
{
  "response": "Private narrative for the actor (markdown)",
  "observed": "One-sentence third-person for witnesses",
  "directives": [
    { "type": "MOVE", "player": "Alice", "target": "library" },
    { "type": "PICKUP", "player": "Alice", "target": "silver_knife" }
  ]
}
```

### Valid directive types:
`MOVE`, `PICKUP`, `OPEN`, `CLOSE`, `UNLOCK`, `BREAK`, `REVEAL`, `USE`, `REMOVE`, `STATE`

---

## Scenario Data Structure

```typescript
interface Scenario {
  title: string;           // "The Velvet Shadow"
  setting: string;         // "1920s rain-soaked Chicago"
  synopsis: string;        // Short description
  maxTurns: number;        // 12 (all scenarios)
  rooms: Room[];           // 5 rooms each
  npcs: NPC[];             // 3 NPCs each
  items: Item[];           // 5 items each (some evidence, some not)
  solution: {
    culpritId: string;           // NPC id
    evidenceId: string;          // Key evidence item id
    requiredEvidenceIds: string[]; // All evidence needed (3-4 items)
  };
}
```

### Current scenarios:
| Key | Culprit | Key Evidence | Required Evidence |
|-----|---------|-------------|-------------------|
| noir | bartender | matchbook | broken_necklace, diary, matchbook, cigarette_butt (4) |
| haunted | caretaker | old_journal | old_journal, silver_knife, torn_photograph (3) |
| space | scientist | research_notes | access_log, sample_vial, research_notes (3) |
| pirate | quartermaster | hidden_note | broken_lock, torn_cloth, hidden_note (3) |
| western | shopkeeper | receipt | spent_casing, sheriff_badge, receipt (3) |
| cyberpunk | fixer | encrypted_drive | data_chip, encrypted_drive, shattered_tablet (3) |

---

## Known Gaps (Issues Track These)

| Gap | Impact | Issue |
|-----|--------|-------|
| Multiplayer has no game-over | Game never ends in MP | #25 |
| Multiplayer has no turn counting | No urgency in MP | #25 |
| Multiplayer has no accusation | Can't win in MP | #25 |
| Evidence discovery is text-matching | False positives | #27 |
| Evidence has no prerequisites | No chain logic | #26 |
| Images cached in-memory only | Lost on restart | #33 |
| No rate limiting | Abuse possible | #34 |
| Haunted cellar unreachable | Broken scenario | #31 |
| No sanity/health system | No risk mechanic | #38 |
| NPCs are static | Never move rooms | #39 |
| No hidden rooms | Flat exploration | #40 |

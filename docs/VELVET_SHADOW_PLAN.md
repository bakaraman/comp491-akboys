# VELVET SHADOW — Tam Uygulama Planı

**Tarih:** 2026-04-17
**Vizyon:** Canlı Noir Tiyatrosu — AI'ın her oyun için yeni bir gizem yarattığı, 2-10 oyunculu, sinematik çok oyunculu dedektif deneyimi.

---

## 1. Kimlik ve Felsefe

Oyun **bir tiyatro oyunu veya kısa bir film** gibi hissettirir, bir chatbot gibi değil. Her oturum:
- **Benzersiz** — AI o oturum için tam bir dünya üretir (odalar, NPC'ler, kanıtlar, katil, son)
- **Sinematik** — açılışta tam ekran overlay + TTS ses, finale'de canlı AI anlatımı
- **Paylaşımlı** — oyuncular aynı hikayeyi farklı açılardan yaşar, kesişim noktalarında birleşir
- **Tek atışlık** — yanlış accuse = anında kayıp, drama yüksek

**"Tek bir şeyi çok iyi yap"** — sadece çok oyunculu sinematik tanıklık. Başka her şey (single player, tema sistemi, rol yetenekleri, evidence board) bu deneyime hizmet etmezse kaldırıldı.

---

## 2. Oyun Akışı — Tam Timeline

```
┌──────────────────────────────────────────────────────────────┐
│  T+00:00  Host oda açar, 6 haneli kod üretilir                │
│  T+00:30  Oyuncular kodla katılır (2-10 kişi)                 │
│  T+01:00  Host prompt kutusuna yazar: "ISS'te cinayet"        │
│           Altında 4 preset buton var                          │
│  T+01:20  Host "Create Story" basar                           │
│                                                                │
│  T+01:20  LOADING SCREEN BAŞLAR (paralel iş akışı)            │
│    ├─ GPT-5.4 dünya schema üretir (10-15s)                    │
│    ├─ gpt-image-1.5 açılış atmosferi üretir (5-8s)            │
│    └─ gpt-5-nano atmosferik cümleler yazar (loading'de gösterilir) │
│                                                                │
│  T+01:35  AÇILIŞ CINEMATIC                                    │
│    ├─ Full-screen: açılış görseli (atmosferik fotoğraf)       │
│    ├─ Ambient müzik başlar (850218 loop, düşük volume)        │
│    ├─ TTS (shimmer) Türkçe açılış hikayesini okur (~10s)      │
│    └─ Text overlay: narrator metni yazılıyor gibi görünür     │
│                                                                │
│  T+01:55  TTS biter, müzik azalır, her oyuncu kendi sahnesine │
│           düşer (per-player entry scene)                      │
│                                                                │
│  T+02:00  OYUN BAŞLAR                                         │
│    ├─ Her oyuncu kendi ekranında chat + sidebar + minimap     │
│    ├─ Oda/NPC görselleri arka planda async üretilir           │
│    ├─ Oyuncu yazar → Global FIFO queue → AI cevabı stream'ler │
│    └─ Aynı odadakiler birbirinin TAM mesajını görür           │
│                                                                │
│  T+??:??  Birisi "SUÇLA" der (NPC seç, kanıt sun)             │
│    ├─ Tüm ekranlar donar, oylama overlay açılır               │
│    ├─ Oybirliği gerekli (N/N oyuncu EVET demeli)              │
│    ├─ 45 saniye sayaç                                         │
│    └─ Backend: doğru NPC + doğru kanıt + tüm kanıtlar ✓       │
│                                                                │
│  T+??:??  FİNALE                                              │
│    ├─ Müzik yeniden güçlü çalar                               │
│    ├─ Full-screen cinematic                                   │
│    ├─ AI canlı üretir: oyunun gerçek akışına özel son         │
│    ├─ TTS (shimmer) sonu Türkçe okur                          │
│    └─ Text overlay stream'ler                                 │
│                                                                │
│  T+??:??  REVEAL                                              │
│    ├─ "Gerçek neydi" — timeline + found vs missed             │
│    └─ Oyuncular birbirine bakar                               │
│                                                                │
│  T+??:??  LOBBY                                               │
│    └─ "Play Again" (aynı takım yeni oyun, host yeni prompt)   │
└──────────────────────────────────────────────────────────────┘
```

### Oyun ortasında bir oyuncu aksiyonu işlenirken:

```
Oyuncu yazar: "Silva'nın eldivenine bak"
    │
    ▼
Send butonu disabled (AI cevap bitene kadar)
    │
    ▼
Global FIFO queue'ya düşer
    │
    ▼
Worker aksiyonu işler:
    ├─ Prompt hazırlar:
    │    - Dünya schema'sı (rooms, NPCs, items, solution)
    │    - Tüm önceki aksiyonlar (worldStateLog, last 30)
    │    - NPC dispositions (kim kime kızgın)
    │    - Keşfedilmiş kanıtlar
    │    - Oyuncu konumları
    │    - "Respond in flowing Turkish, noir tone"
    │
    ├─ GPT-5.4 structured response:
    │    { privateResponse, directives }
    │    (observed field yok — aynı oda tam mesajı görüyor)
    │
    ├─ Cevap stream'lenir (v3 chat isolation, 2026-05-14):
    │    - Actor'a: kendi typed action mesajı + narrator yanıtı (kendi locale'inde)
    │    - Aynı oda dahil DİĞER oyuncular: actor'ın typed mesajını ve
    │       narrator yanıtını chat'te görmez. Kuyruk/typing indicator hâlâ
    │       görünür ama içerik aktarılmaz.
    │    - Dünya state'i (MOVE, NPC moves, worldStateLog) hâlâ ortak →
    │       diğer oyuncuların bir sonraki narrator beat'i actor'ın
    │       etkilerini doğal cümlelerle yedirir ("kolye yerde yok").
    │
    ├─ Directives uygulanır:
    │    - MOVE: oyuncu yer değiştirir
    │    - NPC_MEMORY: NPC disposition değişir
    │    - etc.
    │
    └─ worldStateLog'a canonical event yazılır
    │
    ▼
Queue'da sıradaki aksiyon (varsa)
```

---

## 3. Tüm Kararlar Özeti

| # | Konu | Karar |
|---|------|-------|
| 1 | Kimlik | Live Noir Theatre — sinematik tanıklık |
| 2 | Senaryo | Procedural, host prompt yazar, AI dünyayı üretir |
| 3 | Tema sistemi | Yok — tek prompt kutusu, 4 preset buton |
| 4 | Roller | Hepsi detective, yetenek farkı yok |
| 5 | Dil | Akıcı edebi Türkçe (prompt İngilizce, çıktı Türkçe) |
| 6 | Tur limiti | 40 tur (soft cap, AI 30'dan sonra dramatic pressure) |
| 7 | Oyuncu sayısı | 2-10 agnostik |
| 8 | Katil belirsizliği | Tüm NPC'ler şüpheli, sadece 1'inin gerçek zinciri |
| 9 | Aksiyon queue | Global FIFO, tüm history context |
| 10 | Send butonu | AI cevap bitene kadar disabled |
| 11 | Chat visibility (v3, 2026-05-14) | **Tam chat izolasyonu.** Hiçbir oyuncu başkasının typed mesajını veya başkasına gelen narrator yanıtını chat'inde görmez (aynı odada olsalar bile). Kuyruk, typing indicator, accuse banner, evidence board hâlâ ortak. Dünya state'i (MOVE, NPC, item) ortak — narrator komşu beat'lerde diğer oyuncunun etkilerini yedirir. |
| 12 | Suçlama oy eşiği | Oybirliği (N/N) |
| 13 | Yanlış suçlama | Anında kayıp, tek atış |
| 14 | Finale | Canlı AI üretimi, oyun sonu |
| 15 | Reveal | Timeline + Found vs Missed |
| 16 | Replay | Host yeni prompt yazar, yeni dünya |
| 17 | Oyuncu ayrılması | Oyun devam, dönerse katılır |
| 18 | Ortadan katılma | Kilitli, oyun başladıktan sonra kapalı |
| 19 | Harita | Minimap var, görselsiz, zengin graph tasarım |
| 20 | Envanter | Yok — AI anlatır |
| 21 | Evidence Board | Yok — kanıt bulunca herkes bilir |
| 22 | Host yetkisi | Sadece oda açma + prompt yazma |
| 23 | İçerik filtresi | Noir teması gereği yumuşak serbestlik |
| 24 | Image gen stratejisi | Async, schema sonrası; opening host prompt'u ile |
| 25 | Image gen kapsamı | Açılış + 7 oda + 4 NPC (~$0.40 / oturum) |
| 26 | Oda görseli | Chat'in üstünde, ilk giriş anında |
| 27 | NPC portresi | İlk narrator mesajında inline |
| 28 | TTS | `gpt-4o-mini-tts` + `shimmer` + `wav` streaming |
| 29 | TTS kullanımı | Açılış + finale (~$0.02 / oturum) |
| 30 | Müzik | `850218__eee3333e__drum-piano-loop-4.m4a`, açılış + finale, ortada sessiz |
| 31 | Backend cleanup | Sanity, roles, hidden rooms, red herring flag, alibi system kaldırıldı |

---

## 4. Teknik Mimari

### System Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        CLIENT (Next.js)                      │
│                                                              │
│  Home → Lobby → Prompt Input → Loading → Opening Cinematic  │
│    → Game (chat + minimap + comm panel) → Accuse → Finale   │
│    → Reveal → Lobby                                          │
│                                                              │
│  Removed: GameMap (replaced by Minimap), EvidenceBoard,     │
│           ScenarioPicker, SinglePlayer                       │
└──────────────────────────────────────────────────────────────┘
                          ↕ Socket.IO + REST
┌──────────────────────────────────────────────────────────────┐
│                    SERVER (Express + Socket.IO)              │
│                                                              │
│  Endpoints:                                                  │
│    POST /api/chat/new         - Create session               │
│    POST /api/chat/world       - Generate world (NEW)         │
│    POST /api/chat/tts         - Stream TTS audio (NEW)       │
│    POST /api/chat/finale      - Generate live finale (NEW)   │
│                                                              │
│  Socket events:                                              │
│    player:join, player:action (processed via global queue)   │
│    player:propose-accusation, player:vote-accusation         │
│    story:generate (trigger world gen with host prompt)       │
│    narrator:chunk, narrator:done                             │
│    session:gameover                                          │
│                                                              │
│  Services:                                                   │
│    worldGenerator  - GPT-5.4 + Zod schema + validators       │
│    actionProcessor - Global FIFO, per-session sequential     │
│    imagePipeline   - Async rooms+NPCs after schema           │
│    ttsStreamer     - gpt-4o-mini-tts + shimmer + wav         │
│    finaleGenerator - Live AI call at game end                │
└──────────────────────────────────────────────────────────────┘
                          ↕
┌──────────────────────────────────────────────────────────────┐
│  Firestore: Session persistence (world, actions, gamestate) │
│  Cloud Storage (future): Generated images                   │
│  Cloud Run: Backend                                         │
│  Firebase Hosting: Frontend                                 │
└──────────────────────────────────────────────────────────────┘
```

### Global FIFO Queue (tek kuyruk per session)

```
Session State:
  ┌─────────────────────┐
  │ actionQueue: Queue  │
  │ worldStateLog: []   │
  │ world: World JSON   │
  │ players: Map        │
  └─────────────────────┘

Player sends action:
      │
      ▼
  Queue append (timestamp ordered)
      │
      ▼
  Worker (one per session, always running):
    while (queue.length > 0) {
      action = queue.shift()
      buildPromptWithFullHistory(action, world, log)
      response = await openai.chat.completions.create(...)
      stream to actor + same-room players
      applyDirectives(response.directives)
      log.push(canonicalEvent)
    }
```

### Session Data Structure

```typescript
interface SessionData {
  id: string;
  roomCode: string;
  players: Map<playerId, PlayerData>;
  maxPlayers: number;
  state: 'lobby' | 'generating' | 'opening' | 'playing' | 'vote' | 'ended';

  // NEW: procedurally generated world
  hostPrompt: string;                    // what host typed
  world: World | null;                    // AI-generated world (see schema)
  openingImageUrl: string | null;        // atmosphere image
  roomImages: Record<roomId, string>;    // async-filled
  npcPortraits: Record<npcId, string>;   // async-filled

  // gameplay
  actionQueue: PlayerAction[];
  worldStateLog: string[];               // last 30 canonical events
  objectStates: Map<key, Record<flag, boolean>>;
  turnCount: number;

  // accusation
  activeVote: AccusationVote | null;

  // game over
  gameOver: { status, endReason, summary } | null;

  // comm (player-to-player, not narrator)
  commHistory: CommMessageDTO[];
}
```

---

## 5. World Schema (Zod)

### Yapı

```typescript
const World = z.object({
  meta: z.object({
    title: z.string(),                        // "ISS: The Missing Scientist"
    setting: z.string(),                      // short setting description
    centralMystery: z.string(),               // one-line what happened
    tone: z.string(),                         // "grim, cold, claustrophobic"
    visualStylePrompt: z.string(),            // art direction for all images
    ambientTrack: z.enum([                    // which ambient loop to play
      'urban_noir', 'space_station', 'medieval_wind',
      'industrial_drone', 'haunted_forest'
    ]),
  }),

  rooms: z.array(Room).min(3).max(14),       // N+2 rooms
  npcs: z.array(Npc).min(2).max(8),
  items: z.array(Item).min(3).max(15),

  entryScenes: z.array(EntryScene),          // EXACTLY N entries
  openingNarration: z.string(),              // 3-4 sentences, narrator reads via TTS

  solution: Solution,                         // culprit + key evidence + required chain
  whatReallyHappened: z.string(),            // 3-4 paragraphs, for reveal
});

const Room = z.object({
  id: z.string(),                            // snake_case
  name: z.string(),                          // Turkish name
  description: z.string(),                   // atmospheric, for narrator context
  exits: z.object({
    north: z.string().nullable(),
    south: z.string().nullable(),
    east: z.string().nullable(),
    west: z.string().nullable(),
    up: z.string().nullable(),
    down: z.string().nullable(),
  }),
  imagePrompt: z.string(),                   // used for room image generation
  itemIds: z.array(z.string()),
  npcIds: z.array(z.string()),
});

const Npc = z.object({
  id: z.string(),
  name: z.string(),                          // Turkish name
  role: z.string(),                          // "bartender", "engineer"
  description: z.string(),                   // for narrator
  portraitPrompt: z.string(),                // used for portrait generation
  personality: z.enum([...]),
  alibiClaim: z.string(),                    // what they say they were doing
  knownInfo: z.string(),                     // what they actually know
  hiddenSecret: z.string().nullable(),       // what they hide (null if innocent+clean)
});

const Item = z.object({
  id: z.string(),
  name: z.string(),                          // Turkish name
  description: z.string(),                   // what the narrator says on discovery
  isEvidence: z.boolean(),
  pointsToNpcId: z.string().nullable(),      // implicates this NPC (null if not evidence)
  prerequisiteItemIds: z.array(z.string()),  // chain dependencies
});

const EntryScene = z.object({
  roomId: z.string(),
  narrativeHook: z.string(),                 // 3-5 sentences, player's opening POV
});

const Solution = z.object({
  culpritNpcId: z.string(),
  motiveShort: z.string(),
  keyEvidenceId: z.string(),
  requiredEvidenceIds: z.array(z.string()).min(2).max(5),
});
```

### Semantic Validators

Schema geçerli JSON garantiliyor. Semantik doğrulamalar:

1. Entry scenes count == playerCount
2. All IDs reference valid (no dangling pointers)
3. Room graph fully connected (BFS from first room)
4. `solution.culpritNpcId` exists in npcs
5. `solution.keyEvidenceId` ∈ `requiredEvidenceIds` and exists in items
6. All required evidence exists in items[]
7. Exits bidirectional (if A.north==B, B.south==A or explicit 1-way flag)

Fail → 1 repair attempt → fallback to hardcoded Velvet Shadow.

---

## 6. Prompts

### 6.1 World Generation Prompt (English, AI responds in Turkish content)

```
You are a noir mystery generator creating a complete, playable detective story
for {N} players. Output must conform to the provided JSON schema exactly.

HOST PROMPT: "{host_prompt}"   // e.g. "International Space Station"
DIFFICULTY: medium

STRUCTURAL RULES:
- {N+2} rooms total. Extras add exploration variety.
- {N-1 to N+1} NPCs. Exactly 1 is the culprit.
- {N+2 to N+4} items, {N-1 to N+1} are evidence.
- Evidence chain: prerequisite(A) → B → C. Last step = keyEvidenceId.
- {N} entry scenes — exactly one per player.
- Room graph fully connected, bidirectional exits.

KILLER AMBIGUITY:
- EVERY NPC (innocent or guilty) must have:
  * Surface-level suspicious behavior (a lie, a nervous tic, hiding something)
  * A plausible-seeming motive
  * A red herring that points misleadingly at them
- ONLY the culprit has the true evidence chain matching keyEvidenceId.
- Innocent NPCs' secrets should be unrelated to the main crime (affairs,
  small thefts, personal shame).

LANGUAGE:
- ALL player-facing text in Turkish (room names, NPC names, descriptions,
  narrativeHooks, openingNarration, whatReallyHappened, alibi claims).
- Technical IDs stay snake_case English.
- Turkish tone: literary, flowing, noir mood. Channel Chandler + Pamuk.
  No short choppy sentences. Atmospheric detail.

VISUAL STYLE:
- `meta.visualStylePrompt` should be 1-2 sentences describing art direction
  for all images. Match the theme:
    * Noir → "1920s ink illustration, chiaroscuro shadows, sepia tones"
    * ISS → "photorealistic space station interior, cold blue lighting"
    * Medieval → "oil painting, chiaroscuro, Vermeer-inspired lighting"
- Each room's `imagePrompt`: the scene in that style.
- Each NPC's `portraitPrompt`: head-and-shoulders portrait in that style.

AMBIENT TRACK:
- Pick one of: urban_noir, space_station, medieval_wind, industrial_drone,
  haunted_forest. Match the theme.

OPENING NARRATION:
- 3-4 sentences, literary Turkish.
- Sets the scene. Introduces the central mystery.
- Read aloud by TTS, so write for the ear — natural rhythm, no awkward
  phrasing.

OUTPUT: Single JSON object matching World schema.
```

### 6.2 Narrator Action Prompt (per-action, streaming)

```
You are the narrator of a live noir mystery. A player has taken an action.
Respond in flowing literary Turkish.

WORLD:
{world.meta, world.rooms, world.npcs, world.items}

CURRENT STATE:
- Turn: {turnCount} / 40
- Players and their rooms: {players[].currentRoomId}
- Discovered evidence (team-wide): {discoveredEvidence}
- World state log (last 30 canonical events): {worldStateLog}
- NPC states: {npcStates[]}
- Object states (opened, broken, etc.): {objectStates}

CURRENT ACTION:
Player "{playerName}" in room "{roomId}" acts: "{action.message}"

WHO SEES WHAT:
- Your narrative response is visible to {playerName} AND all other players
  currently in {roomId}.
- DO NOT summarize for observers — write the full scene. Same-room players
  are watching together.
- Players in other rooms see nothing of this action.

RULES:
- Respond in Turkish, flowing literary tone.
- Short cinematic paragraphs. 3-6 sentences usually.
- Respect the world state log — if item picked up, it's gone. If door open,
  stays open. NPCs remember.
- If action is impossible (wrong room, missing prerequisite), narrate the
  failure atmospherically.
- DRAMATIC PRESSURE:
  * Turns 1-25: normal pacing, discovery mode
  * Turns 26-33: introduce urgency ("dışarıda bir şey oluyor...")
  * Turns 34-39: critical pressure ("katil kaçmak üzere...")
  * Turn 40: forced ending (auto-lose if no accuse)

OUTPUT (strict JSON):
{
  "response": "<Turkish narrative>",
  "directives": [
    { "type": "MOVE", "player": "{playerName}", "target": "roomId" },
    { "type": "PICKUP", "player": "{playerName}", "target": "itemId" },
    { "type": "OPEN|CLOSE|UNLOCK|BREAK", "player": "...", "target": "..." },
    { "type": "NPC_MOVE", "player": "npcName", "target": "roomId" },
    { "type": "NPC_MOOD", "player": "npcName", "target": "hostile|friendly|..." }
    // etc.
  ]
}
```

### 6.3 Finale Generation Prompt (live, at game end)

```
The game has ended. Generate the cinematic finale in Turkish.

WORLD: {world}
SOLUTION TRUTH: {world.solution, world.whatReallyHappened}

GAME OUTCOME: {won | lost_wrong | lost_timeout}
{if won}:
  ACCUSER: {playerName}
  ACCUSED (correct): {culpritName}
  EVIDENCE PRESENTED: {evidenceName}
{if lost_wrong}:
  ACCUSER: {playerName}
  ACCUSED (wrong): {wronglyAccusedName}
  REAL CULPRIT: {actualCulpritName}
{if lost_timeout}:
  Turns exhausted. Trail went cold.

WHAT ACTUALLY HAPPENED IN GAME:
{last 30 worldStateLog events — the team's actions}

WRITE:
- 4-6 short paragraphs in Turkish.
- Literary, cinematic, noir tone. Channel the ending of a great detective
  film.
- Reference SPECIFIC things the team found or missed — be concrete.
- If won: the resolution feels earned. Maybe bittersweet — truth has cost.
- If lost_wrong: describe the real tragedy. What the wrong accusation caused.
- If lost_timeout: describe the trail going cold. The city moving on.

This will be read aloud by TTS (female voice, shimmer). Write for the ear.

OUTPUT: Just the prose. No JSON wrapper.
```

### 6.4 TTS Prompt Instructions

```
Voice: shimmer (gpt-4o-mini-tts)
Format: wav (low latency streaming)
Language: Turkish
Instructions parameter: "Speak in a smooth, measured, slightly melancholic
  tone. Noir atmosphere. Natural pauses. Like a film voiceover."
```

---

## 7. UI Component Inventory

### Kalan Component'lar
| Component | Durum | Rol |
|-----------|-------|-----|
| `HomePage` | 🔧 Simplified | "Start Session" tek buton |
| `LobbyScreen` | 🆕 Yeni | Oda kodu, oyuncu listesi, host'un prompt kutusu |
| `PromptInput` | 🆕 Yeni | Text input + 4 preset button |
| `LoadingScreen` | 🆕 Yeni | Atmosferik cümleler döngüsü, progress |
| `OpeningCinematic` | 🆕 Yeni | Full-screen image + TTS + streaming text |
| `EntryScenePanel` | 🆕 Yeni | Her oyuncunun kendi açılış sahnesi |
| `ChatView` | 🔧 Simplified | Main chat, chat-head room image |
| `ChatInput` | 🔧 Simplified | Send disabled while AI responding |
| `Minimap` | 🆕 Yeni | Rich graph viz, room nodes, player icons, fog |
| `PlayerSidebar` | 🔧 Simplified | Just names + rooms + online status |
| `CommPanel` | ✅ Keep | Cross-room messaging (keep) |
| `AccuseOverlay` | 🔧 Simplified | NPC select + evidence select + propose |
| `VoteBanner` | 🔧 Simplified | Full-screen unanimous vote |
| `FinaleCinematic` | 🆕 Yeni | Full-screen AI-generated finale + TTS |
| `RevealPanel` | 🆕 Yeni | Timeline + Found vs Missed |
| `PostGameLobby` | 🆕 Yeni | Play again, new game |

### Kaldırılan Component'lar
- `GameMap.tsx` (1698 satır — ya kalır ama minimalleştirilir, ya minimap'le değiştirilir)
- `EvidenceBoard.tsx` (585 satır)
- `SingleplayerPage` (zaten redirect)
- `ScenarioPicker` (tema sistemi yok)

---

## 8. Minimap Tasarımı — Detaylı

Minimap zengin olmalı (kullanıcı özel istedi). Görsel yok ama graph iyi çizilmeli.

```
Panel (fixed, sağ üst köşe):
  ┌─────────────────────────────────┐
  │  HARITA                         │
  ├─────────────────────────────────┤
  │                                 │
  │    ┌──────┐                     │
  │    │Kumand│                     │
  │    │ a    │◀── Sen buradasın    │
  │    └──┬───┘                     │
  │       │                         │
  │    ┌──▼───┐    ┌──────┐         │
  │    │ A    │────│Uyku K│ ●Kadir  │
  │    │Korid │    │abin. │         │
  │    └──┬───┘    └──────┘         │
  │       │                         │
  │    ┌──▼───┐    ┌──────┐         │
  │    │ B    │────│Labor.│ ●Ata    │
  │    │Korid │    │      │         │
  │    └──┬───┘    └──────┘         │
  │       │                         │
  │    ┌──▼───┐    ┌──────┐         │
  │    │Hava  │────│Kargo │ ●Hoca   │
  │    │Kilid.│    │      │         │
  │    └──────┘    └──────┘         │
  │                                 │
  │  Renkler:                       │
  │  ● Sen (gold)                   │
  │  ● Kadir (mavi)                 │
  │  ● Ata (yeşil)                  │
  │                                 │
  │  Ziyaret edilmemiş: soluk       │
  │  Oda adı hover'da tam görünür   │
  └─────────────────────────────────┘
```

**Stil:**
- Beyaz/soluk yazılar, koyu arkaplan
- Odalar yuvarlak köşeli rectangles, 80×40 px
- Çizgiler: exits, direct ve yön okları
- Ziyaret edilmiş: opaque
- Ziyaret edilmemiş: %30 opacity (fog)
- Oyuncu ikonları: odaların sağ üstünde küçük renkli noktalar
- Hover: oda detayı tooltip ("Kumanda Köprüsü — içerde: Kmdr. Voss")

**Teknik:**
- React component, inline SVG ile çizim
- Auto-layout: rooms[0] başlangıç, BFS ile yerleştirme (dagre veya manual grid)
- Socket.IO `players:updated` ile oyuncu konumları realtime

---

## 9. Image Pipeline — Async Rendering

```
Schema gelir gelmez (T+01:20 - T+01:35):
      │
      ├─ [1] Opening atmosphere image (priority, blocks game start)
      │      POST /api/chat/image/opening
      │      prompt = world.meta.visualStylePrompt +
      │               "Atmospheric establishing shot of " +
      │               world.meta.setting
      │      → saves to session.openingImageUrl
      │      → triggers game start when ready
      │
      ├─ [2] Room images (async, non-blocking)
      │      For each room in parallel:
      │        POST /api/chat/image/room
      │        prompt = world.meta.visualStylePrompt + room.imagePrompt
      │        → session.roomImages[roomId]
      │        → broadcast 'image:room-ready' to all players
      │        → frontend updates when player enters that room
      │
      └─ [3] NPC portraits (async, non-blocking)
             For each npc in parallel:
               POST /api/chat/image/npc
               prompt = world.meta.visualStylePrompt + npc.portraitPrompt
               → session.npcPortraits[npcId]
               → broadcast 'image:npc-ready' to all players
               → frontend inserts inline on first NPC mention
```

**Cache:** Her görsel session'da kalır. Oyun bittiğinde silinebilir (maliyet optimizasyonu).

**Failure handling:** 30s timeout. Başarısız olursa image URL null kalır, UI fallback (placeholder yok, sadece görsel atlanır).

---

## 10. TTS Pipeline

```
Açılış:
  worldReady event
      │
      ▼
  POST /api/chat/tts
    body: { text: world.openingNarration, voice: 'shimmer', model: 'gpt-4o-mini-tts' }
    response: audio stream (wav, chunked)
      │
      ▼
  Frontend: AudioContext + MediaSource
    Buffer'a yazılır, paralel çalınır
    Text overlay de aynı anda typewriter efektiyle gösterilir
      │
      ▼
  Müzik (850218 loop) arkada düşük volume başlar (fade-in)
  TTS bittiğinde music yükselir, opening cinematic kapanır

Finale:
  Accuse sonucu gelir, session state = 'ended'
      │
      ▼
  POST /api/chat/finale
    body: { worldSnapshot, outcome, log }
    response: AI-generated Turkish finale text (streaming)
      │
      ▼
  İlk 200 karakter gelir gelmez:
    POST /api/chat/tts (with first chunk as text)
    Paralel: stream TTS audio + stream text to full-screen overlay
  Müzik yeniden güçlü çalar (fade-in)
```

---

## 11. Build Sırası — 13 Commit, 6-10 Saat

| # | Commit | Dosyalar | Süre |
|---|--------|---------|------|
| 1 | **chore:** clean up removed features (SP page, sanity, roles backend, EvidenceBoard UI) | ~10 files | 30m |
| 2 | **feat:** Zod World schema in shared package | packages/shared/src/world-schema.ts | 45m |
| 3 | **feat:** worldGenerator service (OpenAI strict call + semantic validators + repair) | packages/server/src/world/ | 60m |
| 4 | **feat:** hardcoded Velvet Shadow fallback world | packages/server/src/world/fallback.ts | 30m |
| 5 | **feat:** /api/chat/world endpoint + socket event story:generate | packages/server/src/routes + socket/handlers.ts | 45m |
| 6 | **feat:** host prompt input UI + preset buttons | packages/web/src/app/multiplayer/page.tsx + LobbyScreen | 45m |
| 7 | **feat:** LoadingScreen with ambient text loop | packages/web/src/components/LoadingScreen.tsx | 30m |
| 8 | **feat:** Image pipeline (opening priority, rooms/NPCs async) | packages/server/src/world/images.ts | 60m |
| 9 | **feat:** TTS streaming endpoint + frontend AudioContext playback | packages/server/src/routes/tts.ts + web/src/lib/tts.ts | 60m |
| 10 | **feat:** OpeningCinematic component (image + TTS + text typewriter) | packages/web/src/components/OpeningCinematic.tsx | 60m |
| 11 | **feat:** Minimap component (SVG graph, fog of war, player icons) | packages/web/src/components/Minimap.tsx | 60m |
| 12 | **refactor:** same-room full visibility (remove observed summary) + update narrator prompt | packages/server/src/socket + prompt-builder | 45m |
| 13 | **feat:** unanimous vote + wrong = instant loss + FinaleCinematic + RevealPanel | packages/server/src/socket + web components | 90m |

**Her 3 commit'te:** smoke test (2 tab, multiplayer playthrough).
**Son commit'te:** full end-to-end test, deploy'a hazırla.

---

## 12. Maliyetler (per oturum)

| Kalem | Maliyet |
|-------|---------|
| Dünya üretimi (GPT-5.4) | $0.02 |
| Açılış görseli | $0.03 |
| 7 oda görseli | $0.21 |
| 4 NPC portresi | $0.12 |
| TTS açılış + finale | $0.02 |
| Narrator (40 tur × $0.005) | $0.20 |
| Finale generation | $0.01 |
| **Toplam** | **~$0.61 / oturum** |

100 oyun/gün ≈ $61/gün = $1830/ay max. Demo için negligible.

---

## 13. Risk Haritası

| Risk | Mitigation |
|------|-----------|
| AI schema'ya uymaz (düşük olasılık, strict: true) | Zod parse + 1 retry + hardcoded fallback |
| Semantik validator fail (oda graph disconnected) | Repair prompt with specific errors + fallback |
| OpenAI rate limit (12 paralel image) | Sequential with 1s stagger if needed |
| TTS timeout | Retry once, fallback to text-only (no audio) |
| Firestore persist fail | Graceful degrade, session in-memory only |
| User typing meta-command ("reveal the killer") | Prompt hardening: "never reveal solution unless accuse succeeds" |
| Cost spike (oyuncu 40 tur spam) | Per-session hard cap, daily org-wide cap |
| Image gen fails silently | Frontend tolerates null, no placeholder shown |
| Disconnection during vote | Timer continues, disconnected = no vote (treated as no) |

---

## 14. Deployment Strategy

1. **Yeni branch:** `merge/integration-demo` üzerinden `feature/velvet-shadow-full` çıkar
2. Her commit: build check (npm run build) zorunlu
3. Commit 13 sonrası: full local test
4. Merge to main
5. Firebase App Hosting auto-deploy (OR manual firebase deploy)
6. Smoke test canlı URL'de
7. Demo hazır

**Rollback:** Eğer kritik bug çıkarsa, main'i önceki commit'e revert, Firebase re-deploy. ~5 dakika.

---

## 15. Demo Senaryosu — Yarın Ne Yapacağız

1. Batuhan (host) laptopta `velvet-shadow.web.app`'i açar
2. "Start a Session" → kod üretilir (örn: `XK7P4M`)
3. Diğer 4 oyuncu + hoca kendi cihazlarında kodla katılır (5-6 kişi)
4. Batuhan prompt kutusuna yazar: `"1920 İstanbul, Beyoğlu'nda kayıp bir şarkıcı"` (ya da bir preset)
5. "Create Story" → loading (~20 saniye, atmosferik text rotates)
6. Açılış cinematic başlar — TTS (Türkçe, kadın sesi) + görsel + müzik
7. Her oyuncu kendi başlangıç sahnesine düşer
8. ~8-10 dakika keşif — NPC'lerle konuşma, odalar arası geçiş, kanıt toplama
9. Kanıt zinciri tamamlanır, biri "SUÇLA" der
10. Full-screen oybirliği oylaması (45s)
11. Oybirliği + doğru → altın zafer ekranı, canlı AI finale + TTS
12. Reveal ekranı: timeline + found vs missed
13. Demo biter (~15 dakika)

**"Vay be, bu bir film gibiydi"** dedirten bir deneyim. Tek atış.

---

**HAZIRIM.** Bu plan onayınla, build'e geçiyorum.

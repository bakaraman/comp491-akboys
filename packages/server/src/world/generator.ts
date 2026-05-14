/**
 * generator.ts — Procedural world generation via OpenAI strict JSON schema
 *
 * Given a host prompt and player count, asks GPT-5.4 to generate a complete
 * noir mystery world. Uses OpenAI's structured outputs with strict: true,
 * validates the result semantically, attempts one repair call on failure,
 * and falls back to the hardcoded Turkish Velvet Shadow if all else fails.
 *
 * @author AKBOYS Team
 * @since 2026-04-17
 */

import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod.mjs';
import { WorldSchema, type WorldData, getFallbackWorld } from '@akboys/shared';
import { detectGenre, getStyleGuide, type GenreTag } from './genre-style.js';

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}
const MODEL = 'gpt-5.4';
// Per OpenAI docs, gpt-5.4 defaults to 'none' reasoning. Lowest latency for
// this extraction-style task. SDK type union doesn't include 'none' yet, so
// we cast at the call site.
const REASONING_EFFORT = 'none';
const MAX_TOKENS = 8000;

const DEBUG = '[world-gen]';

/* ------------------------------------------------------------------ */
/*  Prompt construction                                                */
/* ------------------------------------------------------------------ */

function buildSystemPrompt(playerCount: number): string {
  return `You are a mystery generator. Create a complete, playable detective story for ${playerCount} detective players. Output must match the JSON schema exactly.

STRUCTURAL RULES:
- Create EXACTLY ${playerCount + 2} rooms. Graph should be navigable.
- ${Math.max(2, Math.round(playerCount * 0.6))} to ${Math.max(3, playerCount)} NPCs. EXACTLY one has isCulprit=true.
- ${Math.max(4, playerCount + 1)} to ${Math.max(6, playerCount + 3)} items. At least 2 are evidence (isEvidence=true) — one of them is solution.keyEvidenceId.
- Each NPC has roomId (starting room). Each item has roomId (where it lives).
- EXACTLY ${playerCount} entryScenes. Each player starts in a DIFFERENT room.

CRITICAL EXIT RULES:
- Each room has 6 exit slots: north, south, east, west, up, down.
- Use the JSON literal null (NOT the string "null", NOT "", NOT ":", NOT ".") when there is no exit in that direction.
- When there IS an exit, use the EXACT room id from rooms[] (snake_case, no extras, no colons).
- Exits are HINTS — the narrator has final movement authority at runtime.
- Still, prefer bidirectional exits (A.north=B → B.south=A) and a connected graph for sensible navigation.

RED HERRINGS (REQUIRED — at least 1 per world):
- At LEAST 1 item must have isRedHerring: true. This item looks suspicious and evidence-like but is NOT the real key clue.
- Accusing the culprit with a red herring item as the "key evidence" fails — it is a deliberate misdirection.
- All other items must have isRedHerring: false.
- The red herring should be physically close to the crime scene or connected to an innocent NPC's hidden secret.

ALIBI RULES (REQUIRED — every NPC must have a complete alibi object):
- Every NPC must have alibi.claimedLocation and alibi.claimedActivity filled in Turkish.
- alibi.corroboratedBy: name of an NPC who can confirm it (or null if alone).
- alibi.inconsistency: CULPRIT ONLY — a specific, player-discoverable contradiction (e.g. "claims to have been in the garden, but the groundskeeper locked the gate at 22:30"). Leave null for innocent NPCs.
- alibiClaim: a short Turkish summary of the alibi (used in quick references).
- Style: NPCs should reveal their alibis under pressure; the alibi must feel personal and drawn from their backstory.

BACKSTORY RULES (REQUIRED — every NPC must have a backstory):
- Every NPC must have backstory: 2-3 Turkish sentences of personal history.
- Each backstory must be distinct enough that the narrator's voice for that character feels different.
- The backstory should hint at the NPC's personality without directly stating it.

KILLER AMBIGUITY (essential for a good mystery):
- EVERY NPC (innocent or guilty) must have:
  * Surface-level suspicious behavior (lies in alibiClaim, nervous tics in description)
  * A plausible-seeming motive
- Innocent NPCs hide UNRELATED secrets (affairs, small theft, shame, debt) — use hiddenSecret.
- knownInfo is what the NPC ACTUALLY knows (narrator's eyes only — used to make them lie convincingly).
- The player should suspect 2-3 NPCs until the narrative deduces the real answer.

LANGUAGE (STRICT):
- ALL player-facing text MUST be in Turkish: room names + descriptions, NPC names + roles + descriptions, narrativeHooks, openingNarration, alibiClaim, alibi fields, backstory, knownInfo, hiddenSecret, item names + descriptions, solution.motiveShort.
- Technical IDs (snake_case English): room.id, npc.id, item.id, roomId refs, keyEvidenceId, culpritNpcId.
- imagePrompt, portraitPrompt, visualStylePrompt, openingImagePrompt: English (for image generation).

TURKISH STYLE:
- Clear, direct, natural prose. Short sentences. Normal anlatıcı tonu.
- NOT ornamental, NOT literary-heavy, NOT Orhan Pamuk. No florid metaphors.
- Native Turkish, factual, concrete. Every line earns its place.
- Atmosphere comes from specific DETAILS (burnt coffee smell, a cracked windowpane) — not from poetic language.

VISUAL STYLE:
- meta.visualStylePrompt: 1-2 English sentences, concrete art direction.
- Each room.imagePrompt: scene description, NO people, matches style.
- Each npc.portraitPrompt: head-and-shoulders portrait, period-appropriate, matches style.

OPENING NARRATION:
- 4-6 Turkish sentences. Clear, natural prose. Bake in era + location + mood naturally. Write for the ear — TTS will read it.

OUTPUT: Single JSON object matching the provided schema exactly.`;
}

function buildStyleAddition(genre: GenreTag): string {
  const guide = getStyleGuide(genre);
  if (genre === 'generic') return '';
  return `\n\nGENRE STYLE (${genre.toUpperCase()}) — shape ALL generated content to this genre:
ROOM DESCRIPTIONS: ${guide.roomDescriptionFlavor}
NPC DIALOGUE PATTERNS: ${guide.npcDialoguePatterns}
TONE: Apply this genre's atmosphere to room descriptions, NPC backstories, and opening narration.`;
}

function buildUserPrompt(hostPrompt: string, playerCount: number): string {
  const cleaned = hostPrompt.trim();
  if (!cleaned) {
    return `Create a surprise mystery for ${playerCount} players. Choose any evocative setting and era yourself — 1920s Chicago, 1970s Istanbul, a corporate cyberpunk megacity, a medieval castle feast, a deep-space station, etc. Write everything in clear, direct, natural Turkish prose. Short sentences. No florid metaphors.`;
  }
  return `HOST PROMPT: "${cleaned}"\n\nCreate a mystery for ${playerCount} players based on this theme. Interpret freely but stay true to the prompt. Write everything in clear, direct, natural Turkish prose. Short sentences. No florid metaphors.`;
}

/* ------------------------------------------------------------------ */
/*  BFS reachability helper                                            */
/* ------------------------------------------------------------------ */

function bfsReachableRooms(world: WorldData): Set<string> {
  const roomMap = new Map(world.rooms.map((r) => [r.id, r]));
  const visited = new Set<string>();
  // Multi-source BFS: start from every player entry room simultaneously
  const queue: string[] = world.entryScenes
    .map((e) => e.roomId)
    .filter((id) => roomMap.has(id));

  for (const id of queue) visited.add(id);

  let i = 0;
  while (i < queue.length) {
    const room = roomMap.get(queue[i++]);
    if (!room) continue;
    for (const target of Object.values(room.exits)) {
      if (target !== null && !visited.has(target) && roomMap.has(target)) {
        visited.add(target);
        queue.push(target);
      }
    }
  }

  return visited;
}

/* ------------------------------------------------------------------ */
/*  Semantic validators                                                */
/* ------------------------------------------------------------------ */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateWorld(world: WorldData, expectedPlayerCount: number): ValidationResult {
  const errors: string[] = [];
  const roomIds = new Set(world.rooms.map((r) => r.id));
  const npcIds = new Set(world.npcs.map((n) => n.id));
  const itemIds = new Set(world.items.map((i) => i.id));

  // 1. Entry scenes count matches players
  if (world.entryScenes.length !== expectedPlayerCount) {
    errors.push(`Expected ${expectedPlayerCount} entryScenes, got ${world.entryScenes.length}`);
  }

  // 2. Each entry scene references a valid room; <=5 players → unique rooms
  const entryRoomIds = new Set<string>();
  for (const entry of world.entryScenes) {
    if (!roomIds.has(entry.roomId)) {
      errors.push(`Entry scene references invalid room: ${entry.roomId}`);
    }
    entryRoomIds.add(entry.roomId);
  }
  if (expectedPlayerCount <= 5 && entryRoomIds.size !== expectedPlayerCount) {
    errors.push(`Entry scenes should each be in a unique room; got ${entryRoomIds.size} unique rooms for ${expectedPlayerCount} players`);
  }

  // 3. Exactly one culprit
  const culprits = world.npcs.filter((n) => n.isCulprit);
  if (culprits.length !== 1) {
    errors.push(`Expected exactly 1 culprit NPC, got ${culprits.length}`);
  }

  // 4. Solution consistency (keyEvidenceId exists; culprit matches)
  if (!npcIds.has(world.solution.culpritNpcId)) {
    errors.push(`solution.culpritNpcId ${world.solution.culpritNpcId} does not exist`);
  }
  if (culprits.length === 1 && culprits[0].id !== world.solution.culpritNpcId) {
    errors.push(`Culprit NPC (isCulprit=true) does not match solution.culpritNpcId`);
  }
  if (!itemIds.has(world.solution.keyEvidenceId)) {
    errors.push(`solution.keyEvidenceId ${world.solution.keyEvidenceId} does not exist`);
  }

  // 5. Each NPC's roomId and each item's roomId must reference a real room
  for (const npc of world.npcs) {
    if (!roomIds.has(npc.roomId)) {
      errors.push(`NPC ${npc.id} has invalid roomId ${npc.roomId}`);
    }
  }
  for (const item of world.items) {
    if (!roomIds.has(item.roomId)) {
      errors.push(`Item ${item.id} has invalid roomId ${item.roomId}`);
    }
  }

  // 6. Exits point to valid rooms (null is OK)
  for (const room of world.rooms) {
    for (const [dir, target] of Object.entries(room.exits)) {
      if (target !== null && !roomIds.has(target)) {
        errors.push(`Room ${room.id}.exits.${dir} → ${target} (invalid room ID)`);
      }
    }
  }

  // 7. At least 2 evidence items
  const evidenceCount = world.items.filter((i) => i.isEvidence).length;
  if (evidenceCount < 2) {
    errors.push(`Expected at least 2 evidence items, got ${evidenceCount}`);
  }

  // 8. At least 1 red herring item
  const redHerringCount = world.items.filter((i) => i.isRedHerring).length;
  if (redHerringCount < 1) {
    errors.push('Expected at least 1 red herring item (isRedHerring: true), got 0');
  }

  // 9. BFS reachability — every room must be reachable from at least one entry scene
  const reachable = bfsReachableRooms(world);
  const unreachableRooms = world.rooms.filter((r) => !reachable.has(r.id)).map((r) => r.id);
  if (unreachableRooms.length > 0) {
    errors.push(`Unreachable rooms: ${unreachableRooms.join(', ')}`);
  }

  // 10. Culprit's starting room must be reachable
  const culpritNpc = world.npcs.find((n) => n.id === world.solution.culpritNpcId);
  if (culpritNpc && !reachable.has(culpritNpc.roomId)) {
    errors.push(`Culprit NPC room unreachable: ${culpritNpc.roomId}`);
  }

  // 11. Key evidence's room must be reachable
  const keyEvidence = world.items.find((i) => i.id === world.solution.keyEvidenceId);
  if (keyEvidence && !reachable.has(keyEvidence.roomId)) {
    errors.push(`Key evidence room unreachable: ${keyEvidence.roomId}`);
  }

  return { valid: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ */
/*  Core generation + repair + fallback                                */
/* ------------------------------------------------------------------ */

export interface GenerateWorldOptions {
  hostPrompt: string;
  playerCount: number;
}

export interface GenerateWorldResult {
  world: WorldData;
  usedFallback: boolean;
  attempts: number;
  validationErrors?: string[];
  genreTag: GenreTag;
}

async function callOpenAIOnce(
  systemPrompt: string,
  userPrompt: string,
): Promise<WorldData> {
  const t0 = Date.now();
  console.log(`${DEBUG} OpenAI call ▶ model=${MODEL} promptLen=${systemPrompt.length + userPrompt.length}`);
  const completion = await client().beta.chat.completions.parse({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: zodResponseFormat(WorldSchema, 'noir_world'),
    max_completion_tokens: MAX_TOKENS,
    reasoning_effort: REASONING_EFFORT as 'low',
  });
  console.log(`${DEBUG} OpenAI call ✓ (${Date.now() - t0}ms)`);

  const msg = completion.choices[0].message;
  if (msg.refusal) {
    throw new Error(`Model refused: ${msg.refusal}`);
  }
  const finishReason = completion.choices[0].finish_reason;
  if (finishReason === 'length') {
    throw new Error('Response truncated (length)');
  }
  if (!msg.parsed) {
    throw new Error('No parsed content');
  }
  const world = normalizeWorld(msg.parsed as WorldData);
  console.log(`${DEBUG}   parsed: title="${world.meta.title}" rooms=${world.rooms.length} npcs=${world.npcs.length} items=${world.items.length} entryScenes=${world.entryScenes.length}`);
  return world;
}

/**
 * Post-process raw AI output to fix common issues before validation:
 * - Empty-string exits → null
 * - Exits pointing to non-existent rooms → null
 * - Trim whitespace from IDs
 */
function normalizeWorld(world: WorldData): WorldData {
  const validRoomIds = new Set(world.rooms.map((r) => r.id.trim()));

  return {
    ...world,
    rooms: world.rooms.map((room) => ({
      ...room,
      id: room.id.trim(),
      exits: Object.fromEntries(
        Object.entries(room.exits).map(([dir, target]) => {
          if (target === null || target === undefined) return [dir, null];
          const trimmed = typeof target === 'string' ? target.trim() : '';
          if (trimmed === '' || trimmed === 'null') return [dir, null];
          if (!validRoomIds.has(trimmed)) {
            console.warn(`${DEBUG} normalize: dropping invalid exit ${room.id}.${dir} → "${trimmed}"`);
            return [dir, null];
          }
          return [dir, trimmed];
        }),
      ) as WorldData['rooms'][number]['exits'],
    })),
    npcs: world.npcs.map((n) => ({
      ...n,
      id: n.id.trim(),
      roomId: n.roomId.trim(),
    })),
    items: world.items.map((i) => ({
      ...i,
      id: i.id.trim(),
      roomId: i.roomId.trim(),
    })),
    entryScenes: world.entryScenes.map((e) => ({
      ...e,
      roomId: e.roomId.trim(),
    })),
    solution: {
      ...world.solution,
      culpritNpcId: world.solution.culpritNpcId.trim(),
      keyEvidenceId: world.solution.keyEvidenceId.trim(),
    },
  };
}

export async function generateWorld(
  opts: GenerateWorldOptions,
): Promise<GenerateWorldResult> {
  const { hostPrompt, playerCount } = opts;
  const clampedPC = Math.min(Math.max(playerCount, 2), 10);

  // Detect genre (keyword heuristic → LLM fallback if ambiguous)
  const genreTag = await detectGenre(hostPrompt);
  console.log(`${DEBUG} genre detected: ${genreTag}`);

  const systemPrompt = buildSystemPrompt(clampedPC) + buildStyleAddition(genreTag);
  const userPrompt = buildUserPrompt(hostPrompt, clampedPC);

  let attempts = 0;

  // Attempt 1 — fresh
  try {
    attempts += 1;
    console.log(`${DEBUG} attempt 1: generating world for ${clampedPC} players, genre=${genreTag}, prompt=${hostPrompt.slice(0, 60)}`);
    const world = await callOpenAIOnce(systemPrompt, userPrompt);
    const validation = validateWorld(world, clampedPC);
    if (validation.valid) {
      console.log(`${DEBUG} attempt 1: success`);
      return { world, usedFallback: false, attempts, genreTag };
    }
    console.warn(`${DEBUG} attempt 1 semantic errors:`, validation.errors);

    // Attempt 2 — repair with feedback
    attempts += 1;
    const repairUserPrompt = `${userPrompt}\n\nYour previous attempt had these validation errors:\n${validation.errors.map((e) => `- ${e}`).join('\n')}\n\nFix them and return a corrected world. Keep everything else consistent.`;
    console.log(`${DEBUG} attempt 2: repair with feedback`);
    const repaired = await callOpenAIOnce(systemPrompt, repairUserPrompt);
    const validation2 = validateWorld(repaired, clampedPC);
    if (validation2.valid) {
      console.log(`${DEBUG} attempt 2: success`);
      return { world: repaired, usedFallback: false, attempts, genreTag };
    }
    console.error(`${DEBUG} attempt 2 still has errors:`, validation2.errors);
  } catch (err) {
    console.error(`${DEBUG} generation error:`, (err as Error).message);
  }

  // Fallback
  console.warn(`${DEBUG} using hardcoded Velvet Shadow fallback`);
  return { world: getFallbackWorld(clampedPC), usedFallback: true, attempts, genreTag };
}

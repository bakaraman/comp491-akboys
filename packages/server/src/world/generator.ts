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

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}
const MODEL = 'gpt-5.4-mini';
const MAX_TOKENS = 6000;
const TEMPERATURE = 0.9;

const DEBUG = '[world-gen]';

/* ------------------------------------------------------------------ */
/*  Prompt construction                                                */
/* ------------------------------------------------------------------ */

function buildSystemPrompt(playerCount: number): string {
  return `You are a noir mystery generator. Create a complete, playable detective story for ${playerCount} detective players. Output must match the JSON schema exactly.

STRUCTURAL RULES:
- Create EXACTLY ${playerCount + 2} rooms. All must be interconnected.
- ${Math.max(2, Math.round(playerCount * 0.6))} to ${Math.max(3, playerCount)} NPCs. EXACTLY one has isCulprit=true.
- ${Math.max(4, playerCount + 1)} to ${Math.max(6, playerCount + 3)} items. At least ${Math.max(3, playerCount - 1)} are evidence (isEvidence=true).
- Evidence chain: prerequisite(A) → B → C. The keyEvidenceId is the final step.
- EXACTLY ${playerCount} entryScenes. Each player starts in a DIFFERENT room.

CRITICAL EXIT RULES (read carefully):
- Each room has 6 exit slots: north, south, east, west, up, down.
- Use null (NOT an empty string "") when there is no exit in that direction.
- When there IS an exit, use the EXACT room id from rooms[] (snake_case, no extra characters).
- Do NOT invent room ids in exits. Only reference ids that exist in rooms[].
- Exits MUST be bidirectional: if roomA.exits.north = "roomB", then roomB.exits.south = "roomA".
- The room graph MUST be fully connected (BFS from room 0 reaches all).

KILLER AMBIGUITY (critical for good mystery):
- EVERY NPC (innocent OR guilty) must have:
  * Surface-level suspicious behavior (lies, nervous tics, hidden things)
  * A plausible-seeming motive
  * A "red herring" pointing misleadingly at them
- ONLY the culprit has the true evidence chain matching keyEvidenceId.
- Innocent NPCs hide UNRELATED secrets (affairs, small theft, shame, debt).
- The player should suspect 2-3 NPCs until the evidence chain connects properly.

LANGUAGE (STRICT):
- ALL player-facing text MUST be in Turkish: room names, NPC names, role, descriptions, narrativeHooks, openingNarration, whatReallyHappened, alibi claims, knownInfo, hiddenSecrets, solution.motiveShort.
- Technical IDs (snake_case English): room.id, npc.id, item.id, pointsToNpcId, keyEvidenceId, requiredEvidenceIds, prerequisiteItemIds, culpritNpcId, entryScenes[].roomId.
- imagePrompt, portraitPrompt, visualStylePrompt, openingImagePrompt: English (for image generation).

TURKISH STYLE:
- Literary, flowing, atmospheric. Channel Chandler + Pamuk.
- NOT robotic or translated-feeling. Native-sounding prose.
- Long sentences where rhythm calls, short sentences for drama.
- Noir mood: rain, shadows, smoke, cigarettes, moral ambiguity.

VISUAL STYLE:
- meta.visualStylePrompt: 1-2 English sentences, concrete art direction.
- Each room.imagePrompt: scene description, NO people, matches style.
- Each npc.portraitPrompt: head-and-shoulders portrait, period-appropriate, matches style.

OPENING NARRATION:
- 3-4 Turkish sentences, literary.
- Sets the central mystery. Creates mood.
- Will be read aloud by TTS, so write for the ear — natural rhythm.

OUTPUT: Single JSON object matching the provided schema exactly.`;
}

function buildUserPrompt(hostPrompt: string, playerCount: number): string {
  const cleaned = hostPrompt.trim();
  if (!cleaned) {
    return `Create a surprise noir mystery for ${playerCount} players. Choose any evocative setting and era yourself — 1920s Chicago, 1970s Istanbul, a corporate cyberpunk megacity, a medieval castle feast, a deep-space station, etc. Write everything in flowing literary Turkish.`;
  }
  return `HOST PROMPT: "${cleaned}"\n\nCreate a noir mystery for ${playerCount} players based on this theme. Interpret freely but stay true to the prompt. Write everything in flowing literary Turkish.`;
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

  // 2. Each entry scene references a valid room and they should ideally be unique
  const entryRoomIds = new Set<string>();
  for (const entry of world.entryScenes) {
    if (!roomIds.has(entry.roomId)) {
      errors.push(`Entry scene references invalid room: ${entry.roomId}`);
    }
    entryRoomIds.add(entry.roomId);
  }
  // For <=5 players, each entry should be in a unique room
  if (expectedPlayerCount <= 5 && entryRoomIds.size !== expectedPlayerCount) {
    errors.push(`Entry scenes should each be in a unique room; got ${entryRoomIds.size} unique rooms for ${expectedPlayerCount} players`);
  }

  // 3. Exactly one culprit
  const culprits = world.npcs.filter((n) => n.isCulprit);
  if (culprits.length !== 1) {
    errors.push(`Expected exactly 1 culprit NPC, got ${culprits.length}`);
  }

  // 4. Solution consistency
  if (!npcIds.has(world.solution.culpritNpcId)) {
    errors.push(`solution.culpritNpcId ${world.solution.culpritNpcId} does not exist`);
  }
  if (culprits.length === 1 && culprits[0].id !== world.solution.culpritNpcId) {
    errors.push(`Culprit NPC (isCulprit=true) does not match solution.culpritNpcId`);
  }
  if (!itemIds.has(world.solution.keyEvidenceId)) {
    errors.push(`solution.keyEvidenceId ${world.solution.keyEvidenceId} does not exist`);
  }
  if (!world.solution.requiredEvidenceIds.includes(world.solution.keyEvidenceId)) {
    errors.push(`keyEvidenceId must appear in requiredEvidenceIds`);
  }
  for (const reqId of world.solution.requiredEvidenceIds) {
    if (!itemIds.has(reqId)) {
      errors.push(`Required evidence ${reqId} does not exist in items`);
    } else {
      const item = world.items.find((i) => i.id === reqId)!;
      if (!item.isEvidence) {
        errors.push(`Required evidence ${reqId} is not marked isEvidence=true`);
      }
    }
  }

  // 5. Key evidence should point to the culprit
  const keyEvidence = world.items.find((i) => i.id === world.solution.keyEvidenceId);
  if (keyEvidence && keyEvidence.pointsToNpcId !== world.solution.culpritNpcId) {
    errors.push(`keyEvidence.pointsToNpcId (${keyEvidence.pointsToNpcId}) must equal solution.culpritNpcId (${world.solution.culpritNpcId})`);
  }

  // 6. All item/NPC references in rooms are valid
  for (const room of world.rooms) {
    for (const [dir, target] of Object.entries(room.exits)) {
      if (target !== null && !roomIds.has(target)) {
        errors.push(`Room ${room.id}.exits.${dir} → ${target} (invalid room ID)`);
      }
    }
    for (const iid of room.itemIds) {
      if (!itemIds.has(iid)) errors.push(`Room ${room.id} references invalid item ${iid}`);
    }
    for (const nid of room.npcIds) {
      if (!npcIds.has(nid)) errors.push(`Room ${room.id} references invalid NPC ${nid}`);
    }
  }

  // 7. Room graph fully connected (BFS)
  if (world.rooms.length > 0) {
    const start = world.rooms[0].id;
    const reached = new Set([start]);
    const queue = [start];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const room = world.rooms.find((r) => r.id === cur);
      if (!room) continue;
      for (const target of Object.values(room.exits)) {
        if (target && !reached.has(target) && roomIds.has(target)) {
          reached.add(target);
          queue.push(target);
        }
      }
    }
    if (reached.size !== world.rooms.length) {
      const unreachable = world.rooms.filter((r) => !reached.has(r.id)).map((r) => r.id);
      errors.push(`Room graph not fully connected. Unreachable: ${unreachable.join(', ')}`);
    }
  }

  // 8. Item prerequisites chain validity
  for (const item of world.items) {
    for (const pid of item.prerequisiteItemIds) {
      if (!itemIds.has(pid)) {
        errors.push(`Item ${item.id} prerequisite ${pid} does not exist`);
      }
    }
  }

  // 9. Evidence prerequisites solvable (every prerequisite of required evidence must itself
  //    be in items — we allow non-required prerequisites but let's just check resolution)
  //    (Skipping deeper graph cycle detection for now — covered by item IDs valid.)

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
    temperature: TEMPERATURE,
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
    npcs: world.npcs.map((n) => ({ ...n, id: n.id.trim() })),
    items: world.items.map((i) => ({
      ...i,
      id: i.id.trim(),
      pointsToNpcId: i.pointsToNpcId?.trim() || null,
      prerequisiteItemIds: i.prerequisiteItemIds.map((p) => p.trim()).filter(Boolean),
    })),
    entryScenes: world.entryScenes.map((e) => ({
      ...e,
      roomId: e.roomId.trim(),
    })),
    solution: {
      ...world.solution,
      culpritNpcId: world.solution.culpritNpcId.trim(),
      keyEvidenceId: world.solution.keyEvidenceId.trim(),
      requiredEvidenceIds: world.solution.requiredEvidenceIds.map((r) => r.trim()).filter(Boolean),
    },
  };
}

export async function generateWorld(
  opts: GenerateWorldOptions,
): Promise<GenerateWorldResult> {
  const { hostPrompt, playerCount } = opts;
  const clampedPC = Math.min(Math.max(playerCount, 2), 10);
  const systemPrompt = buildSystemPrompt(clampedPC);
  const userPrompt = buildUserPrompt(hostPrompt, clampedPC);

  let attempts = 0;

  // Attempt 1 — fresh
  try {
    attempts += 1;
    console.log(`${DEBUG} attempt 1: generating world for ${clampedPC} players, prompt=${hostPrompt.slice(0, 60)}`);
    const world = await callOpenAIOnce(systemPrompt, userPrompt);
    const validation = validateWorld(world, clampedPC);
    if (validation.valid) {
      console.log(`${DEBUG} attempt 1: success`);
      return { world, usedFallback: false, attempts };
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
      return { world: repaired, usedFallback: false, attempts };
    }
    console.error(`${DEBUG} attempt 2 still has errors:`, validation2.errors);
  } catch (err) {
    console.error(`${DEBUG} generation error:`, (err as Error).message);
  }

  // Fallback
  console.warn(`${DEBUG} using hardcoded Velvet Shadow fallback`);
  return { world: getFallbackWorld(clampedPC), usedFallback: true, attempts };
}

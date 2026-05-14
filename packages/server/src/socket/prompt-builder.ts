/**
 * prompt-builder.ts — Multiplayer narrator prompt + response parser (minimal)
 *
 * Builds per-player system prompts that give the AI narrator rich NPC context
 * (alibi claims, hidden knowledge, secrets) so it can write sharp, believable
 * noir scenes. Parses structured JSON output.
 *
 * Only MOVE directive is tracked in canonical state — everything else
 * (inventory, evidence, sanity, NPC mood) is narrative-only.
 *
 * @author AKBOYS Team
 * @since 2026-03-23
 */

import type { Scenario, PlayerAction, WorldStateEvent, WorldData } from '@akboys/shared';
import type { SessionData } from '../store/SessionStore.js';
import type { SceneContext } from '../middleware/openai.js';
import { getStyleGuide } from '../world/genre-style.js';

/* ------------------------------------------------------------------ */
/*  Directive types                                                    */
/* ------------------------------------------------------------------ */

const DIRECTIVE_TYPES = ['MOVE'] as const;
type DirectiveType = (typeof DIRECTIVE_TYPES)[number];

export interface ParsedDirective {
  type: DirectiveType;
  playerName: string;
  target: string;
  detail?: string;
}

/* ------------------------------------------------------------------ */
/*  C.2: Scene context for grounded suggestions                        */
/* ------------------------------------------------------------------ */

/**
 * Build a SceneContext from the player's current room. Used by
 * suggestFollowUps so the model only proposes actions referencing
 * NPCs, items, and exits that actually exist right now.
 *
 * NPC presence respects runtime state when available (npcStates may
 * have been moved by performNPCMovement); otherwise falls back to the
 * scenario's static roomId.
 */
export function buildSceneContext(
  scenario: Scenario,
  session: SessionData,
  roomId: string,
): SceneContext {
  const room = scenario.rooms.find((r) => r.id === roomId);

  const npcsInRoom = scenario.npcs
    .filter((n) => {
      const runtime = session.npcStates.get(n.id);
      const currentRoom = runtime?.currentRoomId ?? n.roomId;
      return currentRoom === roomId;
    })
    .map((n) => ({ name: n.name, description: n.description }));

  const itemsInRoom = scenario.items
    .filter((i) => i.roomId === roomId)
    .map((i) => ({ name: i.name }));

  const adjacentRoomNames = Object.values(room?.exits ?? {})
    .map((targetId) => scenario.rooms.find((r) => r.id === targetId)?.name)
    .filter((name): name is string => typeof name === 'string');

  return {
    roomName: room?.name,
    roomDescription: room?.description,
    npcsInRoom,
    itemsInRoom,
    adjacentRoomNames,
  };
}

/* ------------------------------------------------------------------ */
/*  Per-player action prompt                                           */
/* ------------------------------------------------------------------ */

export function buildPlayerActionPrompt(
  scenario: Scenario,
  session: SessionData,
  actingPlayerName: string,
  actingPlayerRoom: string,
  world?: WorldData | null,
): string {
  const roomList = scenario.rooms
    .map((r) => {
      const exitsStr = Object.entries(r.exits).map(([dir, id]) => `${dir}->${id}`).join(', ') || 'none';
      return `- ${r.name} (${r.id}): ${r.description} Exits hint: ${exitsStr}`;
    })
    .join('\n');

  // Rich NPC context — pull alibi/backstory/knownInfo/hiddenSecret/personality from
  // the original WorldData when available. This is narrator-only context;
  // it never gets broadcast to players verbatim.
  const npcList = scenario.npcs
    .map((n) => {
      const w = world?.npcs.find((x) => x.id === n.id);
      if (!w) {
        return `- ${n.name} (${n.id}, in ${n.roomId}): ${n.description}`;
      }
      const culpritFlag = w.isCulprit ? ' [CULPRIT — NEVER confess this, play innocent]' : '';
      const lines = [
        `- ${n.name} (${n.id}, in ${w.roomId}) role=${w.role} mood=${w.personality}${culpritFlag}`,
        `    description: ${w.description}`,
        `    backstory: ${w.backstory}`,
        `    alibi location: "${w.alibi.claimedLocation}"`,
        `    alibi activity: "${w.alibi.claimedActivity}"`,
        `    alibi short: "${w.alibiClaim}"`,
        `    what they ACTUALLY know (hide unless pressed hard): ${w.knownInfo}`,
      ];
      if (w.alibi.inconsistency) {
        lines.push(`    alibi inconsistency [culprit flaw, never reveal directly]: ${w.alibi.inconsistency}`);
      }
      if (w.hiddenSecret) lines.push(`    their hidden secret: ${w.hiddenSecret}`);
      return lines.join('\n');
    })
    .join('\n\n');

  const itemList = scenario.items
    .map((i) => {
      const w = world?.items.find((x) => x.id === i.id);
      const isRedHerring = w?.isRedHerring ?? false;
      const tag = isRedHerring
        ? ' [RED HERRING — looks like evidence but is NOT the key clue; present as suspicious, never confirm as the answer]'
        : i.isEvidence ? ' [evidence — points toward culprit]' : '';
      return `- ${i.name} (${i.id}, in ${i.roomId}): ${i.description}${tag}`;
    })
    .join('\n');

  const players = Array.from(session.players.values());
  const playerList = players
    .map((p) => `- ${p.name} — currently in "${p.currentRoomId}" — visited: [${p.visitedRooms.join(', ')}]`)
    .join('\n');

  const recentLog = session.worldStateLog.slice(-20);
  const worldLog = recentLog.length > 0
    ? `\nRECENT EVENTS (chronological, latest last):\n${recentLog.join('\n')}\n`
    : '';

  // Genre voice — inject style guide's narrator rules if genre was detected
  const genre = session.detectedGenre ?? 'generic';
  const styleGuide = getStyleGuide(genre);
  const genreVoiceBlock = genre !== 'generic'
    ? `\nGENRE VOICE (${genre}): ${styleGuide.narratorVoiceRules}\n`
    : '';

  return `You are the narrator of a live multiplayer mystery: "${scenario.title}".
Setting: ${scenario.setting}

ROOMS:
${roomList}

NPCs (context for YOU — do not reveal raw secrets; voice it naturally):
${npcList}

ITEMS (objects in the world; describe them when noticed, but no inventory tracking — weave them into story):
${itemList}

PLAYERS:
${playerList}
${worldLog}
CURRENT ACTION BY: ${actingPlayerName} (in room "${actingPlayerRoom}")

Respond with a JSON object that EXACTLY matches the strict schema:
{
  "response": { "tr": "<Turkish narrator text for ${actingPlayerName}>", "en": "<English narrator text — same content, native English>" },
  "observed": { "tr": "", "en": "" },
  "directives": [ { "type": "MOVE", "player": "${actingPlayerName}", "target": "<room_id>", "detail": "" } ]
}

CRITICAL OUTPUT RULES (#58):
- "response.tr" and "response.en" MUST be PROSE STRINGS — narrator text that the player will read directly.
- NEVER nest another JSON object, schema, or stringified JSON inside response.tr or response.en. NO curly braces, NO "response":, NO "directives":, NO embedded schemas. Just prose. The OUTER object is the only JSON.
- The English must be semantically identical to the Turkish — same details, same tone, same length. NOT a literal translation; rewrite for natural English flow.
- If the player did not change rooms, the directives array must be empty: [].
- "observed" stays as an empty bilingual pair: { "tr": "", "en": "" }.

RESPONSE RULES:
- response.tr: Clear, direct, natural Turkish. **Normal bir anlatıcı gibi anlat.** Address the player as "sen".
- response.en: Clear, direct, native English. Address the player as "you".
- 1-2 short paragraphs, maximum 4-5 sentences. No literary flourishes, no poetic metaphors, no "edebi" heavy style.
- Every sentence should move the story forward with a concrete fact, observation, or action. If it's filler, cut it.
- Short sentences. Plain, readable Turkish.
- Use markdown lightly: **bold** for names/places, > blockquote for NPC dialogue, ## headings only when entering a NEW room.
- When an NPC speaks, put their exact words in a blockquote. Liars lie; the culprit MUST NOT confess.
- NPCs should reveal their alibis when pressed — voiced naturally from their backstory and personality.
- If the player picks something up or moves, state it plainly ("eldivenini cebine koydun", "bara doğru yürüyorsun").
- If action is impossible or an NPC refuses, say so directly without decoration.
- For RED HERRING items: present them as intriguing and suspicious, but NEVER confirm them as the definitive key clue.
${genreVoiceBlock}
NPC NAMING RULE (important):
- Always write an NPC's role before their name so the player immediately knows who they are. Examples:
  * "**başhemşire Feride Aksu**" (not just "Feride Aksu")
  * "**barmen Mickey Malone**" (not just "Mickey")
  * "**doktor Şevket Arman**" (not just "Şevket Arman")
- Use the role exactly as given in the NPCs list above. Apply this on every mention, not just the first.

MOVEMENT RULES:
- YOU have full authority over movement. The "Exits hint" is just a suggestion.
- If the player's action implies going to a specific room and the story allows it, include a MOVE directive with target = room_id.
- If they try to move but a door is locked / it's dangerous / narrative demands refusal, describe why and DON'T emit MOVE.
- Use exact room IDs from the ROOMS list — never invent an ID.

DIRECTIVES:
- ONLY ever emit MOVE. No other types. Empty array if the player stayed put.`;
}

/* ------------------------------------------------------------------ */
/*  Opening narration prompt (legacy, only reachable from old code)    */
/* ------------------------------------------------------------------ */

export function buildOpeningPrompt(scenario: Scenario, session: SessionData): string {
  const players = Array.from(session.players.values());
  const playerList = players.map((p) => `- ${p.name} (in "${p.currentRoomId}")`).join('\n');

  return `You are the narrator of "${scenario.title}".
Setting: ${scenario.setting}
Players:
${playerList}

Write a short atmospheric opening paragraph in Turkish. 3-4 short sentences. Clear, natural prose — no literary flourishes.`;
}

/* ------------------------------------------------------------------ */
/*  Combined-action message (legacy helper)                            */
/* ------------------------------------------------------------------ */

export function buildCombinedUserMessage(actions: PlayerAction[]): string {
  const lines = actions.map((a) => `[${a.playerName} / ${a.roomId}] "${a.message}"`);
  return `[ACTIONS THIS TURN]\n\n${lines.join('\n')}`;
}

/* ------------------------------------------------------------------ */
/*  Structured response parser                                         */
/* ------------------------------------------------------------------ */

/**
 * #58 — Narrator output is bilingual. privateResponse and observedLine
 * carry both languages so the emit layer can flatten per-socket using
 * pickLang(field, player.locale).
 */
export interface BilingualText { tr: string; en: string; }

export interface ScopedNarratorOutput {
  privateResponse: BilingualText;
  observedLine: BilingualText;
  directives: ParsedDirective[];
}

const FALLBACK_PRIVATE: BilingualText = {
  tr: '*Anlatıcı bir an duraksıyor...*',
  en: '*The narrator hesitates for a moment...*',
};

export function parseStructuredResponse(
  json: { response: BilingualText; observed: BilingualText; directives: Array<{ type: string; player: string; target: string; detail?: string }> },
  actorName: string,
  actionText: string,
): ScopedNarratorOutput {
  const directives: ParsedDirective[] = (json.directives || [])
    .filter((d) => d.type && d.player && d.target)
    .filter((d) => d.type.toUpperCase() === 'MOVE')
    .map((d) => ({
      type: 'MOVE',
      playerName: d.player,
      target: d.target,
    }));

  const responseTr = (json.response?.tr || '').trim();
  const responseEn = (json.response?.en || '').trim();
  const observedTr = (json.observed?.tr || '').trim();
  const observedEn = (json.observed?.en || '').trim();

  const privateResponse: BilingualText = {
    tr: responseTr || FALLBACK_PRIVATE.tr,
    en: responseEn || responseTr || FALLBACK_PRIVATE.en,
  };
  const observedLine: BilingualText = {
    tr: observedTr,
    en: observedEn || observedTr,
  };
  void actorName; void actionText;

  return { privateResponse, observedLine, directives };
}

/**
 * Legacy [MOVE: name -> room] bracket parser. Kept as a safety net when
 * structured JSON output is unavailable. Output is single-language Turkish
 * (legacy streaming response is unilingual); the EN slice mirrors the TR
 * so EN players still see *something* instead of an empty bubble.
 */
export function parseLegacyTextResponse(raw: string, actorName: string, actionText: string): ScopedNarratorOutput {
  void actorName; void actionText;
  const directives: ParsedDirective[] = [];
  const re = /\[MOVE:\s*(.+?)\s*->\s*(.+?)\]/gi;
  let match;
  while ((match = re.exec(raw)) !== null) {
    directives.push({
      type: 'MOVE',
      playerName: match[1].trim(),
      target: match[2].trim(),
    });
  }
  const cleaned = raw.replace(/\[MOVE:\s*.+?\s*->\s*.+?\]\n?/gi, '').trim();
  const body = cleaned.length >= 5 ? cleaned : FALLBACK_PRIVATE.tr;
  return {
    privateResponse: { tr: body, en: body },
    observedLine: { tr: '', en: '' },
    directives,
  };
}

/* ------------------------------------------------------------------ */
/*  Directive validation (MOVE only)                                   */
/* ------------------------------------------------------------------ */

export interface DirectiveValidationResult {
  valid: boolean;
  reason?: string;
  worldLogEntry?: string;
  worldStateEvent?: WorldStateEvent;
}

export function validateDirective(
  directive: ParsedDirective,
  session: SessionData,
  scenario: Scenario,
  actingPlayerId: string,
  actingRoomId: string,
): DirectiveValidationResult {
  void actingPlayerId; void actingRoomId;
  const player = Array.from(session.players.values()).find((p) => p.name === directive.playerName);
  if (!player) {
    return { valid: false, reason: `Player "${directive.playerName}" not found` };
  }

  if (directive.type !== 'MOVE') {
    return { valid: false, reason: `Only MOVE directives are supported (got ${directive.type})` };
  }

  const targetRoom = scenario.rooms.find((r) => r.id === directive.target);
  if (!targetRoom) {
    return { valid: false, reason: `Room "${directive.target}" does not exist` };
  }

  const now = Date.now();
  return {
    valid: true,
    worldLogEntry: `${directive.playerName} moved from ${player.currentRoomId} to ${directive.target}`,
    worldStateEvent: {
      type: 'move',
      playerName: directive.playerName,
      targetId: directive.target,
      roomId: player.currentRoomId,
      timestamp: now,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Legacy opening-narration parser for [MOVE]/[PICKUP] brackets       */
/* ------------------------------------------------------------------ */

export interface StateChanges {
  moves: Array<{ playerName: string; roomId: string }>;
  pickups: Array<{ playerName: string; itemId: string }>;
  cleanText: string;
}

export function parseStateChanges(narratorResponse: string): StateChanges {
  const moves: StateChanges['moves'] = [];
  const re = /\[MOVE:\s*(.+?)\s*->\s*(.+?)\]/g;
  let match;
  while ((match = re.exec(narratorResponse)) !== null) {
    moves.push({ playerName: match[1].trim(), roomId: match[2].trim() });
  }
  const cleanText = narratorResponse.replace(/\[MOVE:\s*.+?\s*->\s*.+?\]\n?/g, '').trimEnd();
  return { moves, pickups: [], cleanText };
}

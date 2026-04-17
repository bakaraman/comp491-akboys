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

  // Rich NPC context — pull alibi/knownInfo/hiddenSecret/personality from
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
        `    alibi they say out loud: "${w.alibiClaim}"`,
        `    what they ACTUALLY know (hide unless pressed hard): ${w.knownInfo}`,
      ];
      if (w.hiddenSecret) lines.push(`    their hidden secret: ${w.hiddenSecret}`);
      return lines.join('\n');
    })
    .join('\n\n');

  const itemList = scenario.items
    .map((i) => `- ${i.name} (${i.id}, in ${i.roomId}): ${i.description}${i.isEvidence ? ' [evidence — points toward culprit]' : ''}`)
    .join('\n');

  const players = Array.from(session.players.values());
  const playerList = players
    .map((p) => `- ${p.name} — currently in "${p.currentRoomId}" — visited: [${p.visitedRooms.join(', ')}]`)
    .join('\n');

  const recentLog = session.worldStateLog.slice(-20);
  const worldLog = recentLog.length > 0
    ? `\nRECENT EVENTS (chronological, latest last):\n${recentLog.join('\n')}\n`
    : '';

  return `You are the narrator of a live multiplayer noir mystery: "${scenario.title}".
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

Respond with a JSON object:
{
  "response": "<Turkish narrator text for ${actingPlayerName}>",
  "observed": "",
  "directives": [ { "type": "MOVE", "player": "${actingPlayerName}", "target": "<room_id>" } ]  // only include if the player changes room
}

RESPONSE RULES:
- WRITE IN TURKISH. Clear, direct, natural prose. **Normal bir anlatıcı gibi anlat.** Address the player as "sen".
- 1-2 short paragraphs, maximum 4-5 sentences. No literary flourishes, no poetic metaphors, no "edebi" heavy style.
- Every sentence should move the story forward with a concrete fact, observation, or action. If it's filler, cut it.
- Short sentences. Plain, readable Turkish. Think factual detective narration, not Orhan Pamuk.
- Use markdown lightly: **bold** for names/places, > blockquote for NPC dialogue, ## headings only when entering a NEW room.
- When an NPC speaks, put their exact words in a blockquote. Liars lie; the culprit MUST NOT confess.
- If the player picks something up or moves, state it plainly ("eldivenini cebine koydun", "bara doğru yürüyorsun").
- If action is impossible or an NPC refuses, say so directly without decoration.

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

export interface ScopedNarratorOutput {
  privateResponse: string;
  observedLine: string;
  directives: ParsedDirective[];
}

export function parseStructuredResponse(
  json: { response: string; observed: string; directives: Array<{ type: string; player: string; target: string; detail?: string }> },
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

  const privateResponse = (json.response || '').trim() || '*Anlatıcı bir an duraksıyor...*';
  const observedLine = (json.observed || '').trim();
  void actorName; void actionText;

  return { privateResponse, observedLine, directives };
}

/**
 * Legacy [MOVE: name -> room] bracket parser. Kept as a safety net when
 * structured JSON output is unavailable.
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
  const privateResponse = cleaned.length >= 5 ? cleaned : '*Anlatıcı bir an duraksıyor...*';
  return { privateResponse, observedLine: '', directives };
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

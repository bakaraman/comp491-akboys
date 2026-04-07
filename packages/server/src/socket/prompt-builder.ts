/**
 * prompt-builder.ts — Multiplayer system prompt and response parser
 *
 * Builds per-player narrator prompts with world state log for consistency.
 * Parses structured narrator output with robust fallbacks.
 * Validates state mutations against canonical server state.
 *
 * @author AKBOYS Team
 * @since 2026-03-23
 */

import type { Scenario, PlayerAction, WorldStateEvent } from '@akboys/shared';
import type { SessionData } from '../store/SessionStore.js';

/* ------------------------------------------------------------------ */
/*  Directive types supported by the system                            */
/* ------------------------------------------------------------------ */

const DIRECTIVE_TYPES = ['MOVE', 'PICKUP', 'OPEN', 'CLOSE', 'UNLOCK', 'BREAK', 'REVEAL', 'USE', 'REMOVE', 'STATE'] as const;
type DirectiveType = (typeof DIRECTIVE_TYPES)[number];

export interface ParsedDirective {
  type: DirectiveType;
  playerName: string;
  target: string;
  detail?: string;
}

/* ------------------------------------------------------------------ */
/*  Build multiplayer system prompt (per-player action)                */
/* ------------------------------------------------------------------ */

export function buildPlayerActionPrompt(
  scenario: Scenario,
  session: SessionData,
  actingPlayerName: string,
  actingPlayerRoom: string,
): string {
  const roomList = scenario.rooms
    .map((r) => `- ${r.name} (${r.id}): ${r.description} Exits: ${Object.entries(r.exits).map(([dir, id]) => `${dir}->${id}`).join(', ')}`)
    .join('\n');

  const npcList = scenario.npcs
    .map((n) => `- ${n.name} (in ${n.roomId}): ${n.description}`)
    .join('\n');

  const itemList = scenario.items
    .map((i) => `- ${i.name} (in ${i.roomId}): ${i.description}${i.isEvidence ? ' [EVIDENCE]' : ''}`)
    .join('\n');

  const players = Array.from(session.players.values());
  const playerList = players
    .map((p) => {
      const inv = p.inventory.length > 0 ? p.inventory.join(', ') : 'empty';
      return `- ${p.name} — currently in "${p.currentRoomId}" — inventory: [${inv}] — visited: [${p.visitedRooms.join(', ')}]`;
    })
    .join('\n');

  // Compact world state — last 30 entries to avoid token bloat
  const recentLog = session.worldStateLog.slice(-30);
  const worldLog = recentLog.length > 0
    ? `\nWORLD STATE LOG (respect these — they are canonical facts):\n${recentLog.join('\n')}\n`
    : '';

  // Object/room state flags (canonical)
  let objectStateSection = '';
  if (session.objectStates.size > 0) {
    const entries: string[] = [];
    for (const [key, flags] of session.objectStates) {
      const activeFlags = Object.entries(flags).filter(([, v]) => v).map(([k]) => k);
      if (activeFlags.length > 0) {
        entries.push(`- ${key}: ${activeFlags.join(', ')}`);
      }
    }
    if (entries.length > 0) {
      objectStateSection = `\nOBJECT STATES (current canonical state of objects/rooms):\n${entries.join('\n')}\n`;
    }
  }

  return `You are the narrator of a multiplayer text adventure game called "${scenario.title}".
Setting: ${scenario.setting}
Story: ${scenario.synopsis}

ROOMS:
${roomList}

NPCs:
${npcList}

ITEMS:
${itemList}

PLAYERS:
${playerList}
${worldLog}${objectStateSection}
CURRENT ACTION BY: ${actingPlayerName} (in room "${actingPlayerRoom}")

You will respond with a JSON object containing three fields:

"response": A detailed, immersive second-person narrative directed at ${actingPlayerName}. Use "you" to address them. Describe what they see, find, or experience. 1-3 paragraphs. Use markdown: **bold** for names/places, *italic* for sounds/feelings, > blockquotes for NPC speech, ## headings for new rooms.

"observed": ONE brief third-person sentence describing what nearby characters would physically observe ${actingPlayerName} doing. Do NOT reveal discoveries or secrets — only the observable physical action. Example: "${actingPlayerName} kneels beside the body and examines it closely."

"directives": An array of state change objects. Each has "type" (MOVE, PICKUP, OPEN, CLOSE, UNLOCK, BREAK, REVEAL, USE, REMOVE, or STATE), "player" (player name), and "target" (room ID, item ID, or description). Only include if something actually changed. Empty array if nothing changed.

RULES:
- "response" is private — only ${actingPlayerName} sees it.
- "observed" is shown to other players in the same room. Keep it spoiler-free.
- Respect the WORLD STATE LOG. If an item was picked up, it is gone. If a door was opened, it stays open.
- Stay in character as the narrator.
- If the action is impossible, describe the failure in "response" and write a suitable "observed".

CRITICAL DIRECTIVE RULES:
- When a player examines, picks up, takes, or collects an item, you MUST include a PICKUP directive: {"type":"PICKUP","player":"${actingPlayerName}","target":"item_id"}
- Items marked [EVIDENCE] are especially important — always use PICKUP when the player finds or takes evidence.
- When a player moves to a new room, you MUST include a MOVE directive: {"type":"MOVE","player":"${actingPlayerName}","target":"room_id"}
- When a player opens, unlocks, or breaks something, include the appropriate directive (OPEN, UNLOCK, BREAK).
- Use exact item IDs and room IDs from the lists above, not display names.
- If the player's action involves finding or examining an item and they would logically take it, include PICKUP.`;
}

/* ------------------------------------------------------------------ */
/*  Build opening narration prompt (game start, all players)           */
/* ------------------------------------------------------------------ */

export function buildOpeningPrompt(
  scenario: Scenario,
  session: SessionData,
): string {
  const roomList = scenario.rooms
    .map((r) => `- ${r.name} (${r.id}): ${r.description} Exits: ${Object.entries(r.exits).map(([dir, id]) => `${dir}->${id}`).join(', ')}`)
    .join('\n');

  const npcList = scenario.npcs
    .map((n) => `- ${n.name} (in ${n.roomId}): ${n.description}`)
    .join('\n');

  const itemList = scenario.items
    .map((i) => `- ${i.name} (in ${i.roomId}): ${i.description}${i.isEvidence ? ' [EVIDENCE]' : ''}`)
    .join('\n');

  const players = Array.from(session.players.values());
  const playerList = players.map((p) => `- ${p.name} (in "${p.currentRoomId}")`).join('\n');

  return `You are the narrator of a multiplayer text adventure game called "${scenario.title}".
Setting: ${scenario.setting}
Story: ${scenario.synopsis}

ROOMS:
${roomList}

NPCs:
${npcList}

ITEMS:
${itemList}

PLAYERS:
${playerList}

RULES:
- This is the OPENING narration. Set the scene for all players.
- All players start in the same room.
- Address the group, not individual players. Use "you all" or describe the scene generally.
- Keep it 2-3 paragraphs. Create atmosphere and tension.
- Use markdown: **bold** for names/places, *italic* for mood, > for NPC speech.
- Do NOT use [RESPONSE]/[OBSERVED] format for the opening — this goes to everyone.
- If players should start in different rooms, add [MOVE: playerName -> roomId] at the end.`;
}

/* ------------------------------------------------------------------ */
/*  Build combined user message (legacy, for opening)                  */
/* ------------------------------------------------------------------ */

export function buildCombinedUserMessage(actions: PlayerAction[]): string {
  const lines = actions.map(
    (a) => `[${a.playerName} / ${a.roomId}] "${a.message}"`,
  );
  return `[ACTIONS THIS TURN]\n\n${lines.join('\n')}`;
}

/* ------------------------------------------------------------------ */
/*  Robust scoped response parser                                      */
/* ------------------------------------------------------------------ */

export interface ScopedNarratorOutput {
  privateResponse: string;
  observedLine: string;
  directives: ParsedDirective[];
}

/**
 * Parse structured JSON response from narrator (primary path).
 * Falls back to legacy text parsing if JSON is unavailable.
 */
export function parseStructuredResponse(
  json: { response: string; observed: string; directives: Array<{ type: string; player: string; target: string }> },
  actorName: string,
  actionText: string,
): ScopedNarratorOutput {
  const directives: ParsedDirective[] = (json.directives || [])
    .filter((d) => d.type && d.player && d.target)
    .map((d) => ({
      type: d.type.toUpperCase() as DirectiveType,
      playerName: d.player,
      target: d.target,
    }));

  let privateResponse = (json.response || '').trim();
  let observedLine = (json.observed || '').trim();

  // Fallbacks
  if (!privateResponse || privateResponse.length < 5) {
    privateResponse = '*The narrator hesitates, lost in thought...*';
  }
  if (!observedLine || observedLine.length < 5) {
    observedLine = generateFallbackObserved(actorName, actionText);
  }

  return { privateResponse, observedLine, directives };
}

/**
 * Legacy fallback: parse text-based [RESPONSE]/[OBSERVED] tags.
 * Used only when structured JSON output fails.
 */
export function parseLegacyTextResponse(raw: string, actorName: string, actionText: string): ScopedNarratorOutput {
  const directives: ParsedDirective[] = [];
  const directiveRegex = /\[(MOVE|PICKUP|OPEN|CLOSE|UNLOCK|BREAK|REVEAL|USE|REMOVE|STATE):\s*(.+?)\s*->\s*(.+?)\]/gi;
  let match;
  while ((match = directiveRegex.exec(raw)) !== null) {
    directives.push({
      type: match[1].toUpperCase() as DirectiveType,
      playerName: match[2].trim(),
      target: match[3].trim(),
    });
  }

  let cleaned = raw
    .replace(/\[(MOVE|PICKUP|OPEN|CLOSE|UNLOCK|BREAK|REVEAL|USE|REMOVE|STATE):\s*.+?\s*->\s*.+?\]\n?/gi, '')
    .trimEnd();

  let privateResponse = '';
  let observedLine = '';

  const responseMatch = cleaned.match(/\[RESPONSE\]\s*\n?([\s\S]*?)(?=\n\s*\[OBSERVED\]|$)/i);
  const observedMatch = cleaned.match(/\[OBSERVED\]\s*\n?([\s\S]*?)$/i);

  if (responseMatch && responseMatch[1].trim().length > 0) {
    privateResponse = responseMatch[1].trim();
    if (observedMatch) {
      const obsText = observedMatch[1].trim();
      const firstSentences = obsText.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
      observedLine = firstSentences || obsText;
    }
  } else {
    privateResponse = cleaned
      .replace(/\[RESPONSE\]/gi, '')
      .replace(/\[OBSERVED\]/gi, '')
      .trim();
  }

  if (!observedLine || observedLine.length < 5) {
    observedLine = generateFallbackObserved(actorName, actionText);
  }
  if (!privateResponse || privateResponse.length < 5) {
    privateResponse = '*The narrator hesitates, lost in thought...*';
  }

  return { privateResponse, observedLine, directives };
}

/* ------------------------------------------------------------------ */
/*  Fallback observed line generator                                   */
/* ------------------------------------------------------------------ */

function generateFallbackObserved(actorName: string, actionText: string): string {
  const action = actionText.toLowerCase();
  if (action.includes('look') || action.includes('examine') || action.includes('inspect') || action.includes('search')) {
    return `${actorName} carefully inspects something nearby.`;
  }
  if (action.includes('move') || action.includes('go') || action.includes('walk') || action.includes('enter')) {
    return `${actorName} moves to a different part of the area.`;
  }
  if (action.includes('take') || action.includes('pick') || action.includes('grab')) {
    return `${actorName} reaches for something.`;
  }
  if (action.includes('talk') || action.includes('ask') || action.includes('speak')) {
    return `${actorName} starts a conversation with someone.`;
  }
  if (action.includes('open') || action.includes('unlock')) {
    return `${actorName} tries to open something.`;
  }
  if (action.includes('use')) {
    return `${actorName} uses an item.`;
  }
  return `${actorName} does something in the room.`;
}

/* ------------------------------------------------------------------ */
/*  Directive validation against canonical server state                */
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
  const player = Array.from(session.players.values()).find((p) => p.name === directive.playerName);
  if (!player) {
    return { valid: false, reason: `Player "${directive.playerName}" not found` };
  }

  const now = Date.now();

  switch (directive.type) {
    case 'MOVE': {
      // Validate room exists
      const targetRoom = scenario.rooms.find((r) => r.id === directive.target);
      if (!targetRoom) {
        return { valid: false, reason: `Room "${directive.target}" does not exist` };
      }
      // Validate exit exists from current room
      const currentRoom = scenario.rooms.find((r) => r.id === player.currentRoomId);
      const exitRooms = currentRoom ? Object.values(currentRoom.exits) : [];
      if (currentRoom && !exitRooms.includes(directive.target)) {
        return { valid: false, reason: `No exit from "${player.currentRoomId}" to "${directive.target}"` };
      }
      return {
        valid: true,
        worldLogEntry: `${directive.playerName} moved from ${player.currentRoomId} to ${directive.target}`,
        worldStateEvent: { type: 'move', playerName: directive.playerName, targetId: directive.target, roomId: player.currentRoomId, timestamp: now },
      };
    }

    case 'PICKUP': {
      // Validate item exists in scenario
      const item = scenario.items.find((i) => i.id === directive.target);
      if (!item) {
        return { valid: false, reason: `Item "${directive.target}" does not exist in scenario` };
      }
      // Check if already picked up by anyone
      for (const p of session.players.values()) {
        if (p.inventory.includes(directive.target)) {
          return { valid: false, reason: `Item "${directive.target}" already held by ${p.name}` };
        }
      }
      return {
        valid: true,
        worldLogEntry: `${directive.playerName} picked up ${directive.target} from ${actingRoomId}`,
        worldStateEvent: { type: 'pickup', playerName: directive.playerName, targetId: directive.target, roomId: actingRoomId, timestamp: now },
      };
    }

    // Extended directives — validated loosely (no strict schema for targets)
    case 'OPEN':
    case 'CLOSE':
    case 'UNLOCK':
    case 'BREAK':
    case 'REVEAL':
    case 'USE':
    case 'REMOVE':
    case 'STATE': {
      const typeMap: Record<string, WorldStateEvent['type']> = {
        OPEN: 'open', CLOSE: 'close', UNLOCK: 'unlock', BREAK: 'break',
        REVEAL: 'reveal', USE: 'use', REMOVE: 'remove', STATE: 'state_change',
      };
      return {
        valid: true,
        worldLogEntry: `${directive.playerName} ${directive.type.toLowerCase()}: ${directive.target} (in ${actingRoomId})`,
        worldStateEvent: {
          type: typeMap[directive.type] || 'state_change',
          playerName: directive.playerName,
          targetId: directive.target,
          detail: directive.detail,
          roomId: actingRoomId,
          timestamp: now,
        },
      };
    }

    default:
      return { valid: false, reason: `Unknown directive type: ${directive.type}` };
  }
}

/* ------------------------------------------------------------------ */
/*  Parse state changes from opening narration (legacy format)         */
/* ------------------------------------------------------------------ */

export interface StateChanges {
  moves: Array<{ playerName: string; roomId: string }>;
  pickups: Array<{ playerName: string; itemId: string }>;
  cleanText: string;
}

export function parseStateChanges(narratorResponse: string): StateChanges {
  const moves: StateChanges['moves'] = [];
  const pickups: StateChanges['pickups'] = [];

  const moveRegex = /\[MOVE:\s*(.+?)\s*->\s*(.+?)\]/g;
  const pickupRegex = /\[PICKUP:\s*(.+?)\s*->\s*(.+?)\]/g;

  let match;
  while ((match = moveRegex.exec(narratorResponse)) !== null) {
    moves.push({ playerName: match[1].trim(), roomId: match[2].trim() });
  }
  while ((match = pickupRegex.exec(narratorResponse)) !== null) {
    pickups.push({ playerName: match[1].trim(), itemId: match[2].trim() });
  }

  const cleanText = narratorResponse
    .replace(/\[(MOVE|PICKUP|OPEN|CLOSE|UNLOCK|BREAK|REVEAL|USE|REMOVE|STATE):\s*.+?\s*->\s*.+?\]\n?/gi, '')
    .trimEnd();

  return { moves, pickups, cleanText };
}

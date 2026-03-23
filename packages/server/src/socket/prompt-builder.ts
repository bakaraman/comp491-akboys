/**
 * prompt-builder.ts — Multiplayer system prompt and state change parser
 *
 * Builds the narrator system prompt with player locations, inventories,
 * and multiplayer rules. Also parses [MOVE:] and [PICKUP:] directives
 * from the narrator's response to update server-side game state.
 *
 * @author AK Boys Team
 * @since 2026-03-23
 */

import type { Scenario, PlayerAction } from '@akboys/shared';
import type { SessionData } from '../store/SessionStore.js';

/* ------------------------------------------------------------------ */
/*  Build multiplayer system prompt                                    */
/* ------------------------------------------------------------------ */

export function buildMultiplayerSystemPrompt(
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
  const playerList = players
    .map((p) => {
      const inv = p.inventory.length > 0 ? p.inventory.join(', ') : 'empty';
      return `- ${p.name} (${p.id.slice(0, 8)}) — currently in "${p.currentRoomId}" — inventory: [${inv}] — visited: [${p.visitedRooms.join(', ')}]`;
    })
    .join('\n');

  const playerCount = players.length;

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
- This is a MULTIPLAYER game with ${playerCount} players acting independently.
- Players can be in DIFFERENT rooms at the same time.
- When you receive actions, they will be formatted as:
  [PlayerName / roomId] "their action"
- You MUST respond to EVERY player's action in your response.
- Structure your response with clear sections for each player/location.
- If two players are in the same room, describe how they see each other and how their actions interact.
- If players are in different rooms, use section separators (---) between their narratives.
- Address each player by name in second person: "Ray, you walk into..." or "Kim, you find..."
- Use **PlayerName** in bold when first addressing them in a section.
- Keep each player's section to 1-2 paragraphs.
- When a player moves to a new room, update their location by including [MOVE: playerName -> newRoomId] at the very end of your response.
- When a player picks up an item, include [PICKUP: playerName -> itemId] at the very end of your response.
- Stay in character. You are the narrator, not an AI helper.
- If a player tries something impossible, describe the failure in character.

FORMAT:
- Use markdown in your answers. It will be shown in a styled chat UI.
- Use **bold** for important names, places, and key items.
- Use *italic* for sounds, feelings, and inner thoughts.
- Use ## headings when switching between players in different locations.
- Use > blockquotes for NPC speech or written notes the player finds.
- Use --- to separate scenes when players are in different rooms.`;
}

/* ------------------------------------------------------------------ */
/*  Build combined user message from batched actions                   */
/* ------------------------------------------------------------------ */

export function buildCombinedUserMessage(actions: PlayerAction[]): string {
  const lines = actions.map(
    (a) => `[${a.playerName} / ${a.roomId}] "${a.message}"`,
  );
  return `[ACTIONS THIS TURN]\n\n${lines.join('\n')}`;
}

/* ------------------------------------------------------------------ */
/*  Parse state changes from narrator response                         */
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

  // Remove directives from the text sent to clients
  const cleanText = narratorResponse
    .replace(/\[MOVE:\s*.+?\s*->\s*.+?\]\n?/g, '')
    .replace(/\[PICKUP:\s*.+?\s*->\s*.+?\]\n?/g, '')
    .trimEnd();

  return { moves, pickups, cleanText };
}

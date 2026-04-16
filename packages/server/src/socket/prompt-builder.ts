/**
 * prompt-builder.ts — Multiplayer system prompt and response parser
 *
 * Builds per-player narrator prompts with world state log for consistency.
 * Parses structured narrator output with robust fallbacks.
 * Validates state mutations against canonical server state.
 *
 * Supports: roles (#18), NPC memory (#19), MP game end (#25),
 *           evidence chains (#26), evidence fix (#27), sanity (#38),
 *           NPC movement (#39), secret rooms (#40).
 *
 * @author AKBOYS Team
 * @since 2026-03-23
 */

import type { Scenario, PlayerAction, WorldStateEvent } from '@akboys/shared';
import type { SessionData } from '../store/SessionStore.js';

/* ------------------------------------------------------------------ */
/*  Directive types supported by the system                            */
/* ------------------------------------------------------------------ */

const DIRECTIVE_TYPES = [
  'MOVE', 'PICKUP', 'OPEN', 'CLOSE', 'UNLOCK', 'BREAK', 'REVEAL',
  'USE', 'REMOVE', 'STATE',
  'DISCOVER',       // #27 — explicit evidence discovery
  'SANITY',         // #38 — sanity change
  'NPC_MOOD',       // #19 — change NPC disposition
  'NPC_MEMORY',     // #19 — add NPC memory
  'NPC_MOVE',       // #39 — NPC moves to a new room
  'DISCOVER_EXIT',  // #40 — discover hidden passage
] as const;
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
  // Use NPC runtime state for current rooms (#19, #39)
  const getNpcRoom = (npcId: string): string => {
    const state = session.npcStates.get(npcId);
    return state?.currentRoomId || scenario.npcs.find(n => n.id === npcId)?.roomId || 'unknown';
  };

  const roomList = scenario.rooms
    .filter((r) => !r.isHidden || isRoomDiscovered(session, r.id))
    .map((r) => {
      let exitsStr = Object.entries(r.exits).map(([dir, id]) => `${dir}->${id}`).join(', ');
      // Include discovered hidden exits
      if (r.hiddenExits) {
        for (const [dir, hidden] of Object.entries(r.hiddenExits)) {
          const key = `${r.id}:hidden_exit:${dir}`;
          if (session.objectStates.get(key)?.discovered) {
            exitsStr += `, ${dir}->${hidden.targetRoomId} [SECRET]`;
          }
        }
      }
      return `- ${r.name} (${r.id}): ${r.description} Exits: ${exitsStr}`;
    })
    .join('\n');

  // NPC list with runtime state (#19)
  const npcList = scenario.npcs
    .map((n) => {
      const npcState = session.npcStates.get(n.id);
      const room = npcState?.currentRoomId || n.roomId;
      const disposition = npcState?.disposition || 'neutral';
      const memories = npcState?.memories?.length
        ? `\n    Recent events: ${npcState.memories.slice(-5).join('; ')}`
        : '';
      const metBy = npcState?.metPlayers?.length
        ? `\n    Has interacted with: ${npcState.metPlayers.join(', ')}`
        : '';
      return `- ${n.name} (${n.id}, in ${room}) [${disposition.toUpperCase()}]: ${n.description}${memories}${metBy}`;
    })
    .join('\n');

  // Item list with prerequisite info (#26)
  const teamDiscovered = new Set(session.gameState.discoveredEvidence);
  const teamInventory = new Set<string>();
  for (const p of session.players.values()) {
    for (const inv of p.inventory) teamInventory.add(inv);
  }

  const itemList = scenario.items
    .map((i) => {
      let prereqInfo = '';
      if (i.prerequisites?.length) {
        const unmet = i.prerequisites.filter(
          pre => !teamDiscovered.has(pre) && !teamInventory.has(pre),
        );
        if (unmet.length > 0) {
          prereqInfo = ` [LOCKED — requires discovering: ${unmet.join(', ')} first]`;
          if (i.lockedDescription) {
            return `- ${i.name} (in ${i.roomId}): ${i.lockedDescription}${prereqInfo}`;
          }
        }
      }
      return `- ${i.name} (${i.id}, in ${i.roomId}): ${i.description}${i.isEvidence ? ' [EVIDENCE]' : ''}${prereqInfo}`;
    })
    .join('\n');

  // Player list with roles (#18) and sanity (#38)
  const players = Array.from(session.players.values());
  const playerList = players
    .map((p) => {
      const inv = p.inventory.length > 0 ? p.inventory.join(', ') : 'empty';
      const roleLabel = p.role ? ` [${p.role.toUpperCase()}]` : '';
      const sanityLabel = ` — sanity: ${p.sanity}/${p.maxSanity}`;
      return `- ${p.name}${roleLabel} — currently in "${p.currentRoomId}" — inventory: [${inv}] — visited: [${p.visitedRooms.join(', ')}]${sanityLabel}`;
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

  // Role-specific rules (#18)
  const actingPlayer = players.find(p => p.name === actingPlayerName);
  let roleRules = '';
  if (actingPlayer?.role === 'journalist') {
    roleRules = '\nROLE BONUS: This player is a Journalist. NPCs should share extra details, rumors, and gossip they would not tell others.';
  } else if (actingPlayer?.role === 'thief') {
    roleRules = '\nROLE BONUS: This player is a Thief. They can notice hidden passages, pick locks, and find secret exits that others cannot.';
  } else if (actingPlayer?.role === 'doctor') {
    roleRules = '\nROLE BONUS: This player is a Doctor. They have medical knowledge and are less affected by disturbing scenes.';
  } else if (actingPlayer?.role === 'detective') {
    roleRules = '\nROLE BONUS: This player is a Detective. They notice small forensic details and can make deductive leaps.';
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
${roleRules}
You will respond with a JSON object containing three fields:

"response": A detailed, immersive second-person narrative directed at ${actingPlayerName}. Use "you" to address them. Describe what they see, find, or experience. 1-3 paragraphs. Use markdown: **bold** for names/places, *italic* for sounds/feelings, > blockquotes for NPC speech, ## headings for new rooms.

"observed": ONE brief third-person sentence describing what nearby characters would physically observe ${actingPlayerName} doing. Do NOT reveal discoveries or secrets — only the observable physical action. Example: "${actingPlayerName} kneels beside the body and examines it closely."

"directives": An array of state change objects. Each has "type", "player" (player name), "target", and optional "detail". Types:
- MOVE: player moves to a room. target = room ID.
- PICKUP: player picks up an item. target = item ID.
- OPEN, CLOSE, UNLOCK, BREAK, REVEAL, USE, REMOVE: object interactions. target = object description.
- STATE: generic state change. target = description.
- DISCOVER: player discovers/identifies evidence through investigation. target = evidence item ID. ONLY use when the player explicitly examines, searches for, or investigates the evidence — NOT when evidence is merely mentioned.
- SANITY: player's sanity changes. target = number (e.g. "-10", "-20", "+5"). Use for: encountering horror (-10 to -20), dangerous actions (-5 to -15), reckless behavior (-5), finding comfort (+5), successful investigation (+5).
- NPC_MOOD: NPC disposition changed. target = NPC ID. detail = "friendly" | "neutral" | "hostile" | "scared".
- NPC_MEMORY: notable event for NPC memory. target = NPC ID. detail = short memory description.
- NPC_MOVE: NPC moves rooms. target = "npcId:newRoomId".
- DISCOVER_EXIT: player discovers a hidden passage. target = "roomId:direction".

Only include directives if something actually changed. Empty array if nothing changed.

RULES:
- "response" is private — only ${actingPlayerName} sees it.
- "observed" is shown to other players in the same room. Keep it spoiler-free.
- Respect the WORLD STATE LOG. If an item was picked up, it is gone. If a door was opened, it stays open.
- NPCs REMEMBER previous interactions with ALL players. Check the NPC section for disposition and memories. A hostile NPC should refuse help or mislead.
- Items marked [LOCKED] cannot be discovered yet — describe the area but do not reveal the evidence.
- Stay in character as the narrator.
- If the action is impossible, describe the failure in "response" and write a suitable "observed".

CRITICAL DIRECTIVE RULES:
- When a player examines, picks up, takes, or collects an item, you MUST include a PICKUP directive: {"type":"PICKUP","player":"${actingPlayerName}","target":"item_id"}
- Items marked [EVIDENCE] are especially important — always use PICKUP when the player finds or takes evidence.
- When a player moves to a new room, you MUST include a MOVE directive: {"type":"MOVE","player":"${actingPlayerName}","target":"room_id"}
- When a player opens, unlocks, or breaks something, include the appropriate directive (OPEN, UNLOCK, BREAK).
- Use exact item IDs and room IDs from the lists above, not display names.
- If the player's action involves finding or examining an item and they would logically take it, include PICKUP.
- For dangerous or horrifying situations, include a SANITY directive. Players should lose sanity for: encountering corpses/horror, reckless dangerous actions, threatening NPCs. Small comfort or breakthroughs can restore a little sanity.`;
}

/* ------------------------------------------------------------------ */
/*  Build opening narration prompt (game start, all players)           */
/* ------------------------------------------------------------------ */

export function buildOpeningPrompt(
  scenario: Scenario,
  session: SessionData,
): string {
  const roomList = scenario.rooms
    .filter((r) => !r.isHidden)
    .map((r) => `- ${r.name} (${r.id}): ${r.description} Exits: ${Object.entries(r.exits).map(([dir, id]) => `${dir}->${id}`).join(', ')}`)
    .join('\n');

  const npcList = scenario.npcs
    .map((n) => `- ${n.name} (in ${n.roomId}): ${n.description}`)
    .join('\n');

  const itemList = scenario.items
    .map((i) => `- ${i.name} (in ${i.roomId}): ${i.description}${i.isEvidence ? ' [EVIDENCE]' : ''}`)
    .join('\n');

  const players = Array.from(session.players.values());
  const playerList = players.map((p) => {
    const roleLabel = p.role ? ` [${p.role.toUpperCase()}]` : '';
    return `- ${p.name}${roleLabel} (in "${p.currentRoomId}")`;
  }).join('\n');

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
/*  Helper: check if a hidden room has been discovered                 */
/* ------------------------------------------------------------------ */

function isRoomDiscovered(session: SessionData, roomId: string): boolean {
  // A hidden room is considered discovered if any hidden exit pointing to it
  // has been discovered in objectStates
  for (const [key, flags] of session.objectStates) {
    if (key.includes('hidden_exit') && flags.discovered) {
      // We can't easily check targetRoomId from keys alone, so just check
      // if player has visited it
      break;
    }
  }
  // Also discovered if any player has visited it
  for (const p of session.players.values()) {
    if (p.visitedRooms.includes(roomId)) return true;
  }
  return false;
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
  json: { response: string; observed: string; directives: Array<{ type: string; player: string; target: string; detail?: string }> },
  actorName: string,
  actionText: string,
): ScopedNarratorOutput {
  const directives: ParsedDirective[] = (json.directives || [])
    .filter((d) => d.type && d.player && d.target)
    .map((d) => ({
      type: d.type.toUpperCase() as DirectiveType,
      playerName: d.player,
      target: d.target,
      detail: d.detail,
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
  const directiveRegex = /\[(MOVE|PICKUP|OPEN|CLOSE|UNLOCK|BREAK|REVEAL|USE|REMOVE|STATE|DISCOVER|SANITY|NPC_MOOD|NPC_MEMORY|NPC_MOVE|DISCOVER_EXIT):\s*(.+?)\s*->\s*(.+?)\]/gi;
  let match;
  while ((match = directiveRegex.exec(raw)) !== null) {
    directives.push({
      type: match[1].toUpperCase() as DirectiveType,
      playerName: match[2].trim(),
      target: match[3].trim(),
    });
  }

  let cleaned = raw
    .replace(/\[(MOVE|PICKUP|OPEN|CLOSE|UNLOCK|BREAK|REVEAL|USE|REMOVE|STATE|DISCOVER|SANITY|NPC_MOOD|NPC_MEMORY|NPC_MOVE|DISCOVER_EXIT):\s*.+?\s*->\s*.+?\]\n?/gi, '')
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
      // Validate room exists (including hidden rooms)
      const targetRoom = scenario.rooms.find((r) => r.id === directive.target);
      if (!targetRoom) {
        return { valid: false, reason: `Room "${directive.target}" does not exist` };
      }
      // Validate exit exists from current room (normal or discovered hidden)
      const currentRoom = scenario.rooms.find((r) => r.id === player.currentRoomId);
      const normalExits = currentRoom ? Object.values(currentRoom.exits) : [];

      // Also check discovered hidden exits (#40)
      const discoveredHiddenExits: string[] = [];
      if (currentRoom?.hiddenExits) {
        for (const [dir, hidden] of Object.entries(currentRoom.hiddenExits)) {
          const key = `${currentRoom.id}:hidden_exit:${dir}`;
          if (session.objectStates.get(key)?.discovered) {
            discoveredHiddenExits.push(hidden.targetRoomId);
          }
        }
      }

      if (currentRoom && !normalExits.includes(directive.target) && !discoveredHiddenExits.includes(directive.target)) {
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
      // Check prerequisites (#26)
      if (item.prerequisites && item.prerequisites.length > 0) {
        const discovered = new Set(session.gameState.discoveredEvidence);
        const allInv = new Set<string>();
        for (const p of session.players.values()) {
          for (const inv of p.inventory) allInv.add(inv);
        }
        const unmet = item.prerequisites.filter(pre => !discovered.has(pre) && !allInv.has(pre));
        if (unmet.length > 0) {
          return { valid: false, reason: `Prerequisites not met for "${directive.target}": need ${unmet.join(', ')}` };
        }
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

    case 'DISCOVER': {
      // #27 — Explicit evidence discovery via narrator directive
      const item = scenario.items.find((i) => i.id === directive.target);
      if (!item) {
        return { valid: false, reason: `Item "${directive.target}" does not exist in scenario` };
      }
      if (!item.isEvidence) {
        return { valid: false, reason: `Item "${directive.target}" is not evidence` };
      }
      // Check prerequisites (#26)
      if (item.prerequisites && item.prerequisites.length > 0) {
        const discovered = new Set(session.gameState.discoveredEvidence);
        const allInv = new Set<string>();
        for (const p of session.players.values()) {
          for (const inv of p.inventory) allInv.add(inv);
        }
        const unmet = item.prerequisites.filter(pre => !discovered.has(pre) && !allInv.has(pre));
        if (unmet.length > 0) {
          return { valid: false, reason: `Evidence prerequisites not met for "${directive.target}": need ${unmet.join(', ')}` };
        }
      }
      // Already discovered?
      if (session.gameState.discoveredEvidence.includes(directive.target)) {
        return { valid: false, reason: `Evidence "${directive.target}" already discovered` };
      }
      return {
        valid: true,
        worldLogEntry: `${directive.playerName} discovered evidence: ${directive.target} in ${actingRoomId}`,
        worldStateEvent: { type: 'discover', playerName: directive.playerName, targetId: directive.target, roomId: actingRoomId, timestamp: now },
      };
    }

    case 'SANITY': {
      // #38 — Sanity change, target is a number string
      const delta = parseInt(directive.target, 10);
      if (isNaN(delta)) {
        return { valid: false, reason: `Invalid sanity delta: "${directive.target}"` };
      }
      return {
        valid: true,
        worldLogEntry: `${directive.playerName} sanity changed by ${delta} (in ${actingRoomId})`,
        worldStateEvent: { type: 'sanity', playerName: directive.playerName, targetId: directive.target, roomId: actingRoomId, timestamp: now },
      };
    }

    case 'NPC_MOOD': {
      // #19 — NPC disposition change
      const npc = scenario.npcs.find(n => n.id === directive.target);
      if (!npc) {
        return { valid: false, reason: `NPC "${directive.target}" not found` };
      }
      const validDispositions = ['friendly', 'neutral', 'hostile', 'scared'];
      if (!directive.detail || !validDispositions.includes(directive.detail)) {
        return { valid: false, reason: `Invalid disposition: "${directive.detail}"` };
      }
      return {
        valid: true,
        worldLogEntry: `NPC ${npc.name} is now ${directive.detail} (caused by ${directive.playerName})`,
        worldStateEvent: { type: 'npc_mood', playerName: directive.playerName, targetId: directive.target, detail: directive.detail, roomId: actingRoomId, timestamp: now },
      };
    }

    case 'NPC_MEMORY': {
      // #19 — NPC memory addition
      const npc = scenario.npcs.find(n => n.id === directive.target);
      if (!npc) {
        return { valid: false, reason: `NPC "${directive.target}" not found` };
      }
      if (!directive.detail) {
        return { valid: false, reason: 'NPC_MEMORY requires a detail description' };
      }
      return {
        valid: true,
        worldLogEntry: `NPC ${npc.name} remembers: "${directive.detail}"`,
        worldStateEvent: { type: 'npc_memory', playerName: directive.playerName, targetId: directive.target, detail: directive.detail, roomId: actingRoomId, timestamp: now },
      };
    }

    case 'NPC_MOVE': {
      // #39 — NPC movement, target format: "npcId:newRoomId"
      const parts = directive.target.split(':');
      if (parts.length !== 2) {
        return { valid: false, reason: `Invalid NPC_MOVE target format: "${directive.target}" (expected "npcId:roomId")` };
      }
      const [npcId, newRoomId] = parts;
      const npc = scenario.npcs.find(n => n.id === npcId);
      if (!npc) {
        return { valid: false, reason: `NPC "${npcId}" not found` };
      }
      const targetRoom = scenario.rooms.find(r => r.id === newRoomId);
      if (!targetRoom) {
        return { valid: false, reason: `Room "${newRoomId}" does not exist` };
      }
      return {
        valid: true,
        worldLogEntry: `NPC ${npc.name} moved to ${newRoomId}`,
        worldStateEvent: { type: 'npc_move', playerName: directive.playerName, targetId: directive.target, roomId: actingRoomId, timestamp: now },
      };
    }

    case 'DISCOVER_EXIT': {
      // #40 — Discover hidden passage, target format: "roomId:direction"
      const parts = directive.target.split(':');
      if (parts.length !== 2) {
        return { valid: false, reason: `Invalid DISCOVER_EXIT target: "${directive.target}" (expected "roomId:direction")` };
      }
      const [roomId, exitDir] = parts;
      const room = scenario.rooms.find(r => r.id === roomId);
      if (!room?.hiddenExits?.[exitDir]) {
        return { valid: false, reason: `No hidden exit "${exitDir}" in room "${roomId}"` };
      }
      const hiddenExit = room.hiddenExits[exitDir];

      // Validate access based on discover method
      if (hiddenExit.discoverMethod === 'thief_only' && player.role !== 'thief') {
        return { valid: false, reason: 'Only a Thief can discover this passage' };
      }
      if (hiddenExit.discoverMethod === 'item_required' && hiddenExit.requiredItemId) {
        if (!player.inventory.includes(hiddenExit.requiredItemId)) {
          return { valid: false, reason: `Requires item "${hiddenExit.requiredItemId}" to discover this passage` };
        }
      }

      // Already discovered?
      const key = `${roomId}:hidden_exit:${exitDir}`;
      if (session.objectStates.get(key)?.discovered) {
        return { valid: false, reason: 'This passage has already been discovered' };
      }

      return {
        valid: true,
        worldLogEntry: `${directive.playerName} discovered a hidden passage: ${exitDir} from ${roomId} to ${hiddenExit.targetRoomId}`,
        worldStateEvent: { type: 'discover_exit', playerName: directive.playerName, targetId: directive.target, roomId: actingRoomId, timestamp: now },
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
    .replace(/\[(MOVE|PICKUP|OPEN|CLOSE|UNLOCK|BREAK|REVEAL|USE|REMOVE|STATE|DISCOVER|SANITY|NPC_MOOD|NPC_MEMORY|NPC_MOVE|DISCOVER_EXIT):\s*.+?\s*->\s*.+?\]\n?/gi, '')
    .trimEnd();

  return { moves, pickups, cleanText };
}

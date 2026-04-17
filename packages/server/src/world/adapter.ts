/**
 * adapter.ts — Bridge between procedural World and legacy Scenario
 *
 * Converts a generated World into the Scenario shape the existing
 * prompt-builder, accusation logic, and session store already understand.
 *
 * This lets us ship procedural generation without rewriting every consumer.
 *
 * @author AKBOYS Team
 * @since 2026-04-17
 */

import type { WorldData } from '@akboys/shared';
import type { Scenario, Room, NPC, Item } from '@akboys/shared';

const SYNTHETIC_SCENARIO_ID = '__generated';
const DEFAULT_MAX_TURNS = 40;

/**
 * Produce a Scenario object from a World. This runs once at world-save time
 * and the result is cached on session for subsequent prompt builds.
 */
export function worldToScenario(world: WorldData): Scenario {
  // Build room → items, room → npcs reverse indices based on world.rooms
  const npcsByRoom: Record<string, string> = {};
  const itemsByRoom: Record<string, string> = {};
  for (const r of world.rooms) {
    for (const iid of r.itemIds) itemsByRoom[iid] = r.id;
    for (const nid of r.npcIds) npcsByRoom[nid] = r.id;
  }

  const rooms: Room[] = world.rooms.map((r) => {
    const exitsFiltered: Record<string, string> = {};
    for (const [dir, target] of Object.entries(r.exits)) {
      if (target) exitsFiltered[dir] = target;
    }
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      exits: exitsFiltered,
      items: [...r.itemIds],
      npcs: [...r.npcIds],
    };
  });

  const npcs: NPC[] = world.npcs.map((n) => ({
    id: n.id,
    name: n.name,
    description: n.description,
    roomId: npcsByRoom[n.id] ?? world.rooms[0]?.id ?? '',
    dialogue: [n.alibiClaim],
  }));

  const items: Item[] = world.items.map((i) => ({
    id: i.id,
    name: i.name,
    description: i.description,
    roomId: itemsByRoom[i.id] ?? world.rooms[0]?.id ?? '',
    isEvidence: i.isEvidence,
  }));

  return {
    title: world.meta.title,
    setting: world.meta.setting,
    rooms,
    npcs,
    items,
    synopsis: world.meta.centralMystery,
    maxTurns: DEFAULT_MAX_TURNS,
    solution: {
      culpritId: world.solution.culpritNpcId,
      evidenceId: world.solution.keyEvidenceId,
      requiredEvidenceIds: [...world.solution.requiredEvidenceIds],
    },
  };
}

export { SYNTHETIC_SCENARIO_ID };

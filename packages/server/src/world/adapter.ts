/**
 * adapter.ts — Bridge between procedural World and legacy Scenario
 *
 * Converts a generated World into the Scenario shape the existing
 * prompt-builder, accusation logic, and session store already understand.
 *
 * After #58 the WorldData carries bilingual descriptive fields. This
 * adapter flattens them to a single language using pickLang(locale) so
 * the narrator prompt builder can stay locale-agnostic at its boundary.
 *
 * @author AKBOYS Team
 * @since 2026-04-17 (original), 2026-05-13 (locale-aware)
 */

import { pickLang } from '@akboys/shared';
import type { Locale, WorldData } from '@akboys/shared';
import type { Scenario, Room, NPC, Item } from '@akboys/shared';

const SYNTHETIC_SCENARIO_ID = '__generated';
const DEFAULT_MAX_TURNS = 40;

/**
 * Produce a Scenario object from a World for a given player locale.
 * Called once per locale per session and cached at the call site.
 */
export function worldToScenario(world: WorldData, locale: Locale = 'tr'): Scenario {
  const rooms: Room[] = world.rooms.map((r) => {
    const exitsFiltered: Record<string, string> = {};
    for (const [dir, target] of Object.entries(r.exits)) {
      if (target) exitsFiltered[dir] = target;
    }
    return {
      id: r.id,
      name: r.name, // proper noun — same in every locale
      description: pickLang(r.description, locale),
      exits: exitsFiltered,
      items: world.items.filter((i) => i.roomId === r.id).map((i) => i.id),
      npcs: world.npcs.filter((n) => n.roomId === r.id).map((n) => n.id),
    };
  });

  const npcs: NPC[] = world.npcs.map((n) => ({
    id: n.id,
    name: n.name, // proper noun
    description: pickLang(n.description, locale),
    roomId: n.roomId,
    dialogue: [pickLang(n.alibiClaim, locale)],
  }));

  const items: Item[] = world.items.map((i) => ({
    id: i.id,
    name: i.name, // proper noun
    description: pickLang(i.description, locale),
    roomId: i.roomId,
    isEvidence: i.isEvidence,
  }));

  const settingText = pickLang(world.meta.setting, locale);

  return {
    title: pickLang(world.meta.title, locale),
    setting: settingText,
    rooms,
    npcs,
    items,
    synopsis: settingText,
    maxTurns: DEFAULT_MAX_TURNS,
    solution: {
      culpritId: world.solution.culpritNpcId,
      evidenceId: world.solution.keyEvidenceId,
      requiredEvidenceIds: [world.solution.keyEvidenceId],
    },
  };
}

export { SYNTHETIC_SCENARIO_ID };

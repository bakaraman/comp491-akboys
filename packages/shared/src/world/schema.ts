/**
 * schema.ts — Procedural world Zod schema
 *
 * Full schema for AI-generated noir mystery worlds. Used with OpenAI
 * structured outputs (strict: true) to guarantee the shape.
 *
 * All player-facing text fields are Turkish.
 * Technical IDs stay snake_case English.
 *
 * @author AKBOYS Team
 * @since 2026-04-17
 */

import { z } from 'zod';

/* ------------------------------------------------------------------ */
/*  Enums                                                              */
/* ------------------------------------------------------------------ */

export const AmbientTrackEnum = z.enum([
  'urban_noir',
  'space_station',
  'medieval_wind',
  'industrial_drone',
  'haunted_forest',
]);

export const NpcPersonalityEnum = z.enum([
  'nervous',
  'confident',
  'suspicious',
  'friendly',
  'cold',
  'erratic',
  'melancholic',
]);

/* ------------------------------------------------------------------ */
/*  Sub-schemas (internal — not re-exported as types at root)         */
/* ------------------------------------------------------------------ */

const WorldRoomSchema = z.object({
  id: z.string().describe(
    'snake_case English ID, e.g. "control_bridge" or "wine_cellar". Must be unique.',
  ),
  name: z.string().describe('Turkish name shown to players, e.g. "Kumanda Köprüsü".'),
  description: z.string().describe(
    'Turkish atmospheric description, 1-2 sentences. Used by narrator as context.',
  ),
  exits: z.object({
    north: z.string().nullable(),
    south: z.string().nullable(),
    east: z.string().nullable(),
    west: z.string().nullable(),
    up: z.string().nullable(),
    down: z.string().nullable(),
  }).describe(
    'Exits to other room IDs. Null where there is no exit. Must be bidirectional '
      + '(if A.north=B, B.south=A). At least one exit per room.',
  ),
  imagePrompt: z.string().describe(
    'English prompt for image generation. Will be prefixed with world.meta.visualStylePrompt. '
      + 'Describe the scene: lighting, objects, mood. NO people.',
  ),
  itemIds: z.array(z.string()).describe('Item IDs starting in this room. Can be empty.'),
  npcIds: z.array(z.string()).describe('NPC IDs starting in this room. Can be empty.'),
});

const WorldNpcSchema = z.object({
  id: z.string().describe('snake_case English ID, e.g. "bartender_mickey".'),
  name: z.string().describe('Turkish full name, e.g. "Mickey Malone".'),
  role: z.string().describe('Turkish role/occupation, e.g. "barmen", "mühendis".'),
  description: z.string().describe(
    'Turkish physical + manner description, 1-2 sentences. Noir tone.',
  ),
  portraitPrompt: z.string().describe(
    'English prompt for portrait image. Prefixed with visualStylePrompt. '
      + 'Head-and-shoulders, period-appropriate clothing, distinctive feature.',
  ),
  personality: NpcPersonalityEnum,
  alibiClaim: z.string().describe('Turkish: what this NPC claims they were doing.'),
  knownInfo: z.string().describe(
    'Turkish: what this NPC actually knows. Used by narrator, never revealed directly.',
  ),
  hiddenSecret: z.string().nullable().describe(
    'Turkish: something this NPC hides. For innocents: unrelated crime (affair, theft). '
      + 'For culprit: the actual motive. Null only if NPC has nothing to hide.',
  ),
  isCulprit: z.boolean().describe('True ONLY for the single culprit. Exactly one NPC must have this true.'),
});

const WorldItemSchema = z.object({
  id: z.string().describe('snake_case English ID, e.g. "grease_stained_glove".'),
  name: z.string().describe('Turkish name, e.g. "Yağ Lekeli Eldiven".'),
  description: z.string().describe(
    'Turkish: what the narrator says when this item is examined or found.',
  ),
  isEvidence: z.boolean(),
  pointsToNpcId: z.string().nullable().describe(
    'NPC ID this evidence implicates. Null for non-evidence or red herring items '
      + 'that mislead without pointing at a specific NPC.',
  ),
  prerequisiteItemIds: z.array(z.string()).describe(
    'Evidence items that must be found first before this can be discovered. '
      + 'Empty array = starter clue. Used for chain puzzles.',
  ),
});

const EntrySceneSchema = z.object({
  roomId: z.string().describe('Room ID where this player starts.'),
  narrativeHook: z.string().describe(
    'Turkish 3-5 sentences, second person ("uyanıyorsun..."). Sets mood. '
      + 'References 1-2 items or NPCs in the room by Turkish name. Literary tone.',
  ),
});

const SolutionSchema = z.object({
  culpritNpcId: z.string().describe('ID of the NPC with isCulprit=true.'),
  motiveShort: z.string().describe('Turkish: one sentence motive.'),
  keyEvidenceId: z.string().describe(
    'The single item ID that nails the culprit. Must be in requiredEvidenceIds and '
      + 'must have pointsToNpcId === culpritNpcId.',
  ),
  requiredEvidenceIds: z.array(z.string()).min(2).max(5).describe(
    'All evidence the team must collectively discover before accusing. Includes keyEvidenceId. '
      + 'Chain together via prerequisiteItemIds.',
  ),
});

const WorldMetaSchema = z.object({
  title: z.string().describe(
    'Turkish evocative title, e.g. "The Velvet Shadow" or "Yalnız Kovboy". Used in UI.',
  ),
  setting: z.string().describe(
    'Turkish 1-2 sentence setting. Where + when. Shown on loading screen.',
  ),
  centralMystery: z.string().describe(
    'Turkish 1 sentence: what happened. Shown in UI headers.',
  ),
  tone: z.string().describe(
    'Turkish descriptive tone keywords, e.g. "yağmurlu, soğuk, caz dolu".',
  ),
  visualStylePrompt: z.string().describe(
    'English art direction sentence for ALL images in this world. '
      + 'Example: "1920s ink illustration, chiaroscuro shadows, sepia tones, hand-drawn" '
      + 'or "photorealistic space station interior, cold blue lighting, cinematic".',
  ),
  ambientTrack: AmbientTrackEnum.describe('Which ambient track fits this theme.'),
  openingImagePrompt: z.string().describe(
    'English prompt for the opening atmosphere image. Wide establishing shot, '
      + 'no people, captures the setting. Prefixed with visualStylePrompt when generating.',
  ),
});

/* ------------------------------------------------------------------ */
/*  Root schema (exported)                                             */
/* ------------------------------------------------------------------ */

export const WorldSchema = z.object({
  meta: WorldMetaSchema,
  rooms: z.array(WorldRoomSchema).min(3).max(14).describe(
    'All rooms in the world. Player count + 2 target. Graph must be fully connected.',
  ),
  npcs: z.array(WorldNpcSchema).min(2).max(8).describe(
    'All NPCs. Exactly one has isCulprit=true. Others are innocent but LOOK suspicious '
      + 'through lies, nervous ticks, hidden unrelated secrets.',
  ),
  items: z.array(WorldItemSchema).min(3).max(15).describe('All items. At least 2 are evidence.'),
  entryScenes: z.array(EntrySceneSchema).describe(
    'Exactly playerCount entries. Each player starts in a DIFFERENT room. '
      + 'Each entry scene is personalized.',
  ),
  openingNarration: z.string().describe(
    'Turkish 3-4 sentences. Shown as full-screen text after world generation. '
      + 'Also read aloud by TTS. Write for the ear — natural rhythm, literary.',
  ),
  solution: SolutionSchema,
  whatReallyHappened: z.string().describe(
    'Turkish 3-4 short paragraphs. The full truth. Shown in reveal panel after game ends. '
      + 'Reference specific items and NPCs by Turkish name.',
  ),
});

/* ------------------------------------------------------------------ */
/*  Types (exported — prefixed World* to avoid collisions)            */
/* ------------------------------------------------------------------ */

export type WorldData = z.infer<typeof WorldSchema>;
export type WorldRoom = z.infer<typeof WorldRoomSchema>;
export type WorldNpc = z.infer<typeof WorldNpcSchema>;
export type WorldItem = z.infer<typeof WorldItemSchema>;
export type WorldEntryScene = z.infer<typeof EntrySceneSchema>;
export type WorldSolution = z.infer<typeof SolutionSchema>;
export type WorldMeta = z.infer<typeof WorldMetaSchema>;
export type AmbientTrackValue = z.infer<typeof AmbientTrackEnum>;
export type NpcPersonalityValue = z.infer<typeof NpcPersonalityEnum>;

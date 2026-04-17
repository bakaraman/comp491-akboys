/**
 * schema.ts — Procedural world Zod schema (minimal)
 *
 * Trimmed to what the runtime actually uses: rooms, NPCs (rich context),
 * items, entry scenes, solution. No evidence chains, no sanity, no
 * disposition tracking — narrator handles all that in natural language.
 *
 * Player-facing text fields are Turkish. Technical IDs stay snake_case English.
 *
 * @author AKBOYS Team
 * @since 2026-04-17
 */

import { z } from 'zod';

/* ------------------------------------------------------------------ */
/*  Enums                                                              */
/* ------------------------------------------------------------------ */

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
/*  Sub-schemas                                                        */
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
    'Exits to other room IDs. Null where there is no exit. Hints for navigation — '
      + 'narrator has final authority and can allow/deny movement based on narrative.',
  ),
  imagePrompt: z.string().describe(
    'English prompt for image generation. Will be prefixed with world.meta.visualStylePrompt. '
      + 'Describe the scene: lighting, objects, mood. NO people.',
  ),
});

const WorldNpcSchema = z.object({
  id: z.string().describe('snake_case English ID, e.g. "bartender_mickey".'),
  name: z.string().describe('Turkish full name, e.g. "Mickey Malone".'),
  role: z.string().describe('Turkish role/occupation, e.g. "barmen", "mühendis".'),
  roomId: z.string().describe('ID of the room where this NPC starts.'),
  description: z.string().describe(
    'Turkish physical + manner description, 1-2 sentences. Noir tone.',
  ),
  portraitPrompt: z.string().describe(
    'English prompt for portrait image. Prefixed with visualStylePrompt. '
      + 'Head-and-shoulders, period-appropriate clothing, distinctive feature.',
  ),
  personality: NpcPersonalityEnum,
  alibiClaim: z.string().describe('Turkish: what this NPC tells detectives they were doing.'),
  knownInfo: z.string().describe(
    'Turkish: what this NPC actually knows. Narrator context only — never revealed directly unless pressed.',
  ),
  hiddenSecret: z.string().nullable().describe(
    'Turkish: something this NPC hides. For innocents: unrelated (affair, theft, debt). '
      + 'For culprit: the actual motive or key detail. Null only if NPC has nothing to hide.',
  ),
  isCulprit: z.boolean().describe('True ONLY for the single culprit. Exactly one NPC must have this true.'),
});

const WorldItemSchema = z.object({
  id: z.string().describe('snake_case English ID, e.g. "grease_stained_glove".'),
  name: z.string().describe('Turkish name, e.g. "Yağ Lekeli Eldiven".'),
  description: z.string().describe(
    'Turkish: what the narrator says when this item is noticed or examined.',
  ),
  roomId: z.string().describe('ID of the room where this item starts.'),
  isEvidence: z.boolean().describe(
    'True if this item is meaningful evidence that points toward the culprit. '
      + 'Narrator context only — no pickup tracking at runtime.',
  ),
});

const EntrySceneSchema = z.object({
  roomId: z.string().describe('Room ID where this player starts.'),
  narrativeHook: z.string().describe(
    'Turkish 3-5 sentences, second person ("uyanıyorsun..."). Sets mood. '
      + 'References 1-2 items or NPCs in the room by Turkish name. Literary tone. '
      + 'This is broadcast to the player as their private opening scene.',
  ),
});

const SolutionSchema = z.object({
  culpritNpcId: z.string().describe('ID of the NPC with isCulprit=true.'),
  motiveShort: z.string().describe('Turkish: one sentence motive.'),
  keyEvidenceId: z.string().describe(
    'The item ID that best points to the culprit. Used only for finale narration context.',
  ),
});

const WorldMetaSchema = z.object({
  title: z.string().describe(
    'Turkish evocative title, e.g. "The Velvet Shadow" or "Yalnız Kovboy". Used in UI.',
  ),
  setting: z.string().describe(
    'Turkish 1-2 sentence setting. Where + when. Shown on loading + opening screens.',
  ),
  visualStylePrompt: z.string().describe(
    'English art direction sentence for ALL images in this world. '
      + 'Example: "1920s ink illustration, chiaroscuro shadows, sepia tones, hand-drawn" '
      + 'or "photorealistic space station interior, cold blue lighting, cinematic".',
  ),
  openingImagePrompt: z.string().describe(
    'English prompt for the opening atmosphere image. Wide establishing shot, '
      + 'no people, captures the setting. Prefixed with visualStylePrompt when generating.',
  ),
});

/* ------------------------------------------------------------------ */
/*  Root schema                                                        */
/* ------------------------------------------------------------------ */

export const WorldSchema = z.object({
  meta: WorldMetaSchema,
  rooms: z.array(WorldRoomSchema).min(3).max(14).describe(
    'All rooms. Player count + 2 target. Graph should be navigable but narrator has final say.',
  ),
  npcs: z.array(WorldNpcSchema).min(2).max(8).describe(
    'All NPCs. Exactly one has isCulprit=true. Others are innocent but look suspicious '
      + 'via lies, nervous ticks, unrelated hidden secrets.',
  ),
  items: z.array(WorldItemSchema).min(3).max(15).describe('All items. At least 2 are evidence.'),
  entryScenes: z.array(EntrySceneSchema).describe(
    'Exactly playerCount entries. Each player starts in a DIFFERENT room. '
      + 'Each entry has a personalized narrative hook.',
  ),
  openingNarration: z.string().describe(
    'Turkish 4-6 sentences — this is the ONLY text shown on the opening cinematic '
      + 'and read aloud by TTS. WEAVE IN the era, location, and atmospheric details '
      + '(what was in meta.setting) naturally — no separate setting line is displayed, '
      + 'so everything the player should hear about where and when they are must live here. '
      + 'Clear, direct, natural Turkish prose. Short sentences. No literary flourishes, '
      + 'no ornamental metaphors — normal anlatıcı tonu, ne daha fazlası ne daha azı.',
  ),
  solution: SolutionSchema,
});

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type WorldData = z.infer<typeof WorldSchema>;
export type WorldRoom = z.infer<typeof WorldRoomSchema>;
export type WorldNpc = z.infer<typeof WorldNpcSchema>;
export type WorldItem = z.infer<typeof WorldItemSchema>;
export type WorldEntryScene = z.infer<typeof EntrySceneSchema>;
export type WorldSolution = z.infer<typeof SolutionSchema>;
export type WorldMeta = z.infer<typeof WorldMetaSchema>;
export type NpcPersonalityValue = z.infer<typeof NpcPersonalityEnum>;

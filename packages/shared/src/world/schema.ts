/**
 * schema.ts — Procedural world Zod schema (bilingual after #58)
 *
 * Two-tier content model:
 *   - PROPER NOUNS (single strings): NPC names, room names, item names —
 *     culturally consistent with the world setting (Istanbul setting →
 *     Turkish names; LA setting → English names). Same for every player.
 *   - DESCRIPTIVE FIELDS (BilingualString = {tr, en}): everything else
 *     the player sees or hears. Single LLM call produces both languages
 *     so the story is semantically identical, only the spoken language
 *     differs per player.
 *
 * Technical IDs stay snake_case English. Image prompts stay English.
 *
 * @author AKBOYS Team
 * @since 2026-04-17 (original), 2026-05-13 (bilingual)
 */

import { z } from 'zod';

/* ------------------------------------------------------------------ */
/*  Bilingual primitive                                                */
/* ------------------------------------------------------------------ */

/**
 * A descriptive field produced by the LLM in BOTH languages in a single
 * generation call so player A reads TR and player B reads EN about the
 * exact same content, beat-for-beat.
 */
export const BilingualStringSchema = z.object({
  tr: z.string().describe('Turkish version. Native, natural prose.'),
  en: z.string().describe(
    'English version. Native, natural prose. Must be semantically identical to the Turkish — same details, same tone, same pacing. NOT a literal word-for-word translation; rewrite for native English flow.',
  ),
});

export type BilingualString = z.infer<typeof BilingualStringSchema>;

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
  name: z.string().describe(
    'PROPER NOUN — room name shown to ALL players regardless of locale. '
      + 'Match the cultural setting (e.g. "Eski Saray" in an Istanbul story, '
      + '"The Velvet Lounge" in a 1927 Chicago story). Single string, not bilingual.',
  ),
  description: BilingualStringSchema.describe(
    'Atmospheric description, 1-2 sentences in BOTH languages.',
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
  name: z.string().describe(
    'PROPER NOUN — full name shown to ALL players regardless of locale. '
      + 'Match the cultural setting. Single string, not bilingual.',
  ),
  role: BilingualStringSchema.describe(
    'Role/occupation in BOTH languages, e.g. {tr:"barmen", en:"bartender"}.',
  ),
  roomId: z.string().describe('ID of the room where this NPC starts.'),
  description: BilingualStringSchema.describe(
    'Physical + manner description, 1-2 sentences in BOTH languages. Match the genre tone.',
  ),
  portraitPrompt: z.string().describe(
    'English prompt for portrait image. Prefixed with visualStylePrompt. '
      + 'Head-and-shoulders, period-appropriate clothing, distinctive feature.',
  ),
  personality: NpcPersonalityEnum,
  alibiClaim: BilingualStringSchema.describe(
    'Short summary of what this NPC tells detectives they were doing. BOTH languages.',
  ),
  alibi: z.object({
    claimedLocation: BilingualStringSchema.describe('Specific location this NPC claims to have been. BOTH languages.'),
    claimedActivity: BilingualStringSchema.describe('What this NPC claims to have been doing there. BOTH languages.'),
    corroboratedBy: z.string().nullable().describe(
      'Name (proper noun, single string) of the NPC who can corroborate this alibi, or null.',
    ),
    inconsistency: BilingualStringSchema.nullable().describe(
      'For the CULPRIT: a specific, player-discoverable contradiction in this alibi. '
        + 'For innocent NPCs: null. BOTH languages when present.',
    ),
  }).describe('Structured alibi the NPC gives when interrogated.'),
  backstory: BilingualStringSchema.describe(
    '2-3 sentence personal history in BOTH languages. Must be distinct enough that '
      + 'the narrator sounds different for each NPC.',
  ),
  knownInfo: BilingualStringSchema.describe(
    'What this NPC actually knows. Narrator context only — never revealed directly unless pressed. BOTH languages.',
  ),
  hiddenSecret: BilingualStringSchema.nullable().describe(
    'Something this NPC hides. For innocents: unrelated (affair, theft, debt). '
      + 'For culprit: the actual motive or key detail. Null only if NPC has nothing to hide. BOTH languages when present.',
  ),
  isCulprit: z.boolean().describe('True ONLY for the single culprit. Exactly one NPC must have this true.'),
});

const WorldItemSchema = z.object({
  id: z.string().describe('snake_case English ID, e.g. "grease_stained_glove".'),
  name: z.string().describe(
    'PROPER NOUN — item name shown to ALL players regardless of locale. '
      + 'Match the cultural setting. Single string, not bilingual.',
  ),
  description: BilingualStringSchema.describe(
    'What the narrator says when this item is noticed or examined. BOTH languages.',
  ),
  roomId: z.string().describe('ID of the room where this item starts.'),
  isEvidence: z.boolean().describe(
    'True if this item is meaningful evidence that points toward the culprit. '
      + 'Narrator context only — no pickup tracking at runtime.',
  ),
  isRedHerring: z.boolean().describe(
    'True if this item is a deliberate false lead: looks suspicious and evidence-like, '
      + 'but accusing the culprit with it as the key evidence fails. '
      + 'AT LEAST 1 item per world must have isRedHerring: true. '
      + 'Set to false for all other items.',
  ),
});

const EntrySceneSchema = z.object({
  roomId: z.string().describe('Room ID where this player starts.'),
  narrativeHook: BilingualStringSchema.describe(
    '3-5 sentences in BOTH languages, second person ("uyanıyorsun..." / "you wake up..."). '
      + 'Sets mood. References 1-2 items or NPCs in the room by their proper-noun name. '
      + 'Literary tone consistent with the genre.',
  ),
});

const SolutionSchema = z.object({
  culpritNpcId: z.string().describe('ID of the NPC with isCulprit=true.'),
  motiveShort: BilingualStringSchema.describe('One sentence motive in BOTH languages.'),
  keyEvidenceId: z.string().describe(
    'The item ID that best points to the culprit. Used only for finale narration context.',
  ),
});

const WorldMetaSchema = z.object({
  title: BilingualStringSchema.describe(
    'Evocative case-file title in BOTH languages, e.g. {tr:"Kadife Gölge Cinayetleri", en:"The Velvet Shadow Murders"}.',
  ),
  setting: BilingualStringSchema.describe(
    '1-2 sentence setting in BOTH languages. Where + when.',
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
  openingNarration: BilingualStringSchema.describe(
    '4-6 sentences in BOTH languages — this is the text shown on the opening cinematic '
      + 'and read aloud by TTS. WEAVE IN the era, location, and atmospheric details from '
      + 'meta.setting naturally — no separate setting line is displayed, so everything the '
      + 'player should hear about where and when they are must live here. '
      + 'Clear, direct, natural prose. Short sentences. No ornamental metaphors — '
      + 'normal narrator tone in each language.',
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

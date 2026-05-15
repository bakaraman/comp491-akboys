/**
 * reconstruction.ts — Post-game crime-scene reconstruction generator
 *
 * Two-pass design (2026-05-06 v2):
 *
 *   Pass 1 — Events (gpt-5-nano + strict zodResponseFormat).
 *     The AI fills 6-8 chronological beats with roomId/actorNpcId locked
 *     to enums of real world ids. We enrich names server-side after.
 *
 *   Pass 2 — Conclusion (gpt-4o-mini, plain text, no reasoning tokens).
 *     A non-reasoning model gets a tiny prompt summarising the canon
 *     (culprit, motive, evidence) plus the just-generated events, and
 *     returns 3-4 plain Turkish sentences. No JSON, no schema, no
 *     reasoning budget — so the conclusion always completes.
 *
 * Why two passes? Single-call gpt-5-nano kept truncating the conclusion
 * mid-sentence even at max_completion_tokens=5000. Reasoning models
 * count reasoning + output against the same cap, and strict JSON schema
 * generation eats a lot of reasoning. Splitting the conclusion into a
 * dedicated non-reasoning call removes the entire failure mode.
 *
 * The solution (culprit, motive, key evidence) is stated to both passes
 * as canon. The AI's only job is to *retell* the truth, not deduce it.
 *
 * @author AKBOYS Team
 * @since 2026-05-06
 */

import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod.mjs';
import { pickLang } from '@akboys/shared';
import type { WorldData, ReconstructionDTO, ReconstructionEvent } from '@akboys/shared';
import { openaiClient } from '../lib/openai-client.js';
import { withOpenAIRetry } from '../lib/openai-retry.js';
import { logFromCompletion } from '../lib/usage-logger.js';

const DEBUG = '[reconstruction]';
const EVENTS_MODEL = 'gpt-5-nano';
const EVENTS_MAX_TOKENS = 6000;
const CONCLUSION_MODEL = 'gpt-4o-mini';
const CONCLUSION_MAX_TOKENS = 500;

/* ------------------------------------------------------------------ */
/*  Pass-1 schema: events only (no conclusion).                       */
/* ------------------------------------------------------------------ */

interface RawEvents {
  events: Array<{
    turn: number;
    time: string;
    roomId: string;
    actorNpcId: string;
    description: { tr: string; en: string };
    isCulpritAction: boolean;
  }>;
}

function buildEventsSchema(world: WorldData): z.ZodType<RawEvents> {
  const roomIds = world.rooms.map((r) => r.id);
  const npcIds = world.npcs.map((n) => n.id);

  const RoomIdEnum = z.enum(roomIds as [string, ...string[]]);
  const ActorIdEnum = z.enum(['', ...npcIds] as [string, ...string[]]);

  return z.object({
    events: z
      .array(
        z.object({
          turn: z.number().int().min(0),
          time: z
            .string()
            .describe('In-fiction clock, e.g. "23:14". Plausibly chronological across the array.'),
          roomId: RoomIdEnum.describe('MUST be one of the listed room ids — no invention.'),
          actorNpcId: ActorIdEnum.describe(
            'MUST be one of the listed NPC ids, or "" for a beat with no specific actor.',
          ),
          description: z.object({
            tr: z.string().min(15).max(200).describe('1-2 short Turkish sentences. Use ONLY display names — never ids or snake_case.'),
            en: z.string().min(15).max(200).describe('English version — semantically identical to Turkish, same details and tone.'),
          }).describe('Bilingual beat description (#58).'),
          isCulpritAction: z
            .boolean()
            .describe('True when this beat is the killer doing something pivotal.'),
        }),
      )
      .min(6)
      .max(8)
      .describe('Chronological reconstruction beats, 6-8 entries. Earliest first.'),
  }) as z.ZodType<RawEvents>;
}

/* ------------------------------------------------------------------ */
/*  Pass-1 prompt: events                                              */
/* ------------------------------------------------------------------ */

function buildEventsPrompt(world: WorldData, worldStateLog: string[]): { system: string; user: string } {
  const culprit = world.npcs.find((n) => n.id === world.solution.culpritNpcId);
  const keyEv = world.items.find((i) => i.id === world.solution.keyEvidenceId);

  const roomsBlock = world.rooms
    .map((r) => `  • ${r.name} — ${pickLang(r.description, 'tr')}  [id: ${r.id}]`)
    .join('\n');

  const npcsBlock = world.npcs
    .map((n) => {
      const culpritFlag = n.id === world.solution.culpritNpcId ? '  ★KATİL★' : '';
      const lines = [
        `  • ${n.name} — ${pickLang(n.role, 'tr')}${culpritFlag}  [id: ${n.id}]`,
        `      bildiği gerçek: ${pickLang(n.knownInfo, 'tr')}`,
      ];
      if (n.hiddenSecret) lines.push(`      gizli sırrı: ${pickLang(n.hiddenSecret, 'tr')}`);
      return lines.join('\n');
    })
    .join('\n');

  const itemsBlock = world.items
    .map((i) => {
      const tag = i.isRedHerring ? ' (YANILTICI KANIT / RED HERRING)' : i.isEvidence ? ' (KANIT / EVIDENCE)' : '';
      return `  • ${i.name}${tag}`;
    })
    .join('\n');

  const logBlock = worldStateLog.length
    ? `OYUNCU AKSİYONLARI (gerçekten olan, en yenisi altta):\n${worldStateLog.slice(-30).map((e) => `  - ${e}`).join('\n')}`
    : 'OYUNCU AKSİYONLARI: (kayıt yok)';

  const system = `You are the "crime-scene reconstruction" narrator for a finished mystery game. The same world is played by Turkish and English speakers in the same session, so every beat's description must be produced in BOTH languages (#58).

TASK:
- Produce the REAL timeline of the crime as 6-8 chronological beats.
- Each beat has a SHORT description in BOTH Turkish AND English (1-2 sentences each).
- The English MUST be semantically identical to the Turkish — same details, same tone. Native English, not literal translation.
- THE CULPRIT AND MOTIVE ARE ALREADY GIVEN — do not change them, question them, or suggest alternatives. Just retell.
- Beats should follow a believable clock (e.g. 22:30, 22:45, 23:00).
- Culprit-driven beats (poisoning, evidence destruction, escape) get isCulpritAction: true.
- Atmospheric beats or the victim's last moment use actorNpcId: "" (empty string).
- Style: short, concrete, journalist-report tone. No ornament. Plain prose.
- WATCH OUT: items tagged YANILTICI KANIT / RED HERRING are NOT the real evidence — they are deliberate misdirections. If you mention one, you can frame it as the false lead.

NAME RULE (CRITICAL):
- In description.tr and description.en, use ONLY readable proper-noun names — never ids, never snake_case.
  Wrong: "back_hall", "leo_marcus", "cufflink_with_velvet_fiber"
  Right: "Arka Koridor" / "Back Hall", "Leo Marcus", "Kadife Lifli Kol Düğmesi" / "Cufflink with Velvet Fiber"
- Proper-noun names listed below are the SAME in both languages. Do not translate them.
- IDs only go in roomId / actorNpcId JSON fields — never inside description text.

OUTPUT: strict JSON only. No commentary. (Conclusion paragraph is NOT in this call.)`;

  const user = `DÜNYA / WORLD: ${pickLang(world.meta.title, 'tr')} | ${pickLang(world.meta.title, 'en')}
ZEMİN / SETTING: ${pickLang(world.meta.setting, 'tr')} | ${pickLang(world.meta.setting, 'en')}

GERÇEK KATİL / TRUE CULPRIT: ${culprit?.name ?? 'unknown'} (rol/role: ${culprit ? pickLang(culprit.role, 'tr') : '?'}) [id: ${world.solution.culpritNpcId}]
GERÇEK MOTİV / TRUE MOTIVE: ${pickLang(world.solution.motiveShort, 'tr')} | ${pickLang(world.solution.motiveShort, 'en')}
ANAHTAR KANIT / KEY EVIDENCE: ${keyEv?.name ?? 'unknown'}

ROOMS (each beat must reference one of these; use the proper-noun name in text, never the id):
${roomsBlock}

CHARACTERS (each actor must come from this list; use the proper-noun name in text, never the id):
${npcsBlock}

ITEMS (may be referenced by name):
${itemsBlock}

${logBlock}

Now produce the real timeline of the crime. 6-8 chronological beats. Each description must have BOTH tr and en filled in — same content, two languages.
- Only use roomId and actorNpcId values from the lists above.
- Inside description.tr / description.en, use only readable proper-noun names, never ids or snake_case.
- No conclusion paragraph in this call — only fill the events array.`;

  return { system, user };
}

/* ------------------------------------------------------------------ */
/*  Safety net: replace any leaked id with its display name            */
/* ------------------------------------------------------------------ */

function buildScrubber(world: WorldData): (text: string) => string {
  const replacements: Array<{ id: string; name: string }> = [];
  for (const r of world.rooms) replacements.push({ id: r.id, name: r.name });
  for (const n of world.npcs) replacements.push({ id: n.id, name: n.name });
  for (const i of world.items) replacements.push({ id: i.id, name: i.name });
  // Only scrub ids that contain a snake_case marker — bare single-word ids
  // (e.g. "knife") are valid English words and we don't want to false-positive
  // on prose. Velvet Shadow generator always produces snake_case ids for
  // multi-word entities, so this filter is safe in practice.
  const snakeIds = replacements
    .filter((r) => r.id.includes('_'))
    .sort((a, b) => b.id.length - a.id.length);
  return (text: string): string => {
    let out = text;
    for (const { id, name } of snakeIds) {
      const safeId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`\\b${safeId}\\b`, 'g'), name);
    }
    return out;
  };
}

/* ------------------------------------------------------------------ */
/*  Pass-2: conclusion (separate non-reasoning call)                   */
/* ------------------------------------------------------------------ */

/**
 * Plain-text conclusion. gpt-4o-mini is non-reasoning, so the entire
 * max_tokens budget goes to output — no risk of reasoning eating the
 * paragraph and leaving us with a half-sentence.
 */
async function generateConclusionText(
  world: WorldData,
  events: ReconstructionEvent[],
  sessionId?: string,
): Promise<{ tr: string; en: string }> {
  const culprit = world.npcs.find((n) => n.id === world.solution.culpritNpcId);
  const keyEv = world.items.find((i) => i.id === world.solution.keyEvidenceId);

  const eventsBlock = events
    .map((e, i) => {
      const actorPart = e.actorName ? ` ${e.actorName}` : '';
      return `${i + 1}. ${e.time} — ${e.roomName}:${actorPart} TR: ${pickLang(e.description, 'tr')} | EN: ${pickLang(e.description, 'en')}`;
    })
    .join('\n');

  const system = `You are a concise noir mystery narrator. Your job: write a 3-4 sentence CLOSING paragraph in BOTH Turkish and English from the given event chain (#58).

STRICT RULES:
- 3-4 COMPLETE sentences in each language. Every sentence ends with a terminal punctuation mark.
- NEVER leave a sentence half-finished.
- Must include: how the crime was committed, the culprit's FULL NAME, the motive, the key evidence's FULL NAME.
- Use only readable proper-noun names — NEVER snake_case or ids with "_".
- Plain, journalistic summary. No ornament.
- Output a single JSON object: { "tr": "...", "en": "..." }. No headers, no explanation. Both languages must be semantically identical.`;

  const user = `CULPRIT: ${culprit?.name ?? 'unknown'} (role TR: ${culprit ? pickLang(culprit.role, 'tr') : '?'} / role EN: ${culprit ? pickLang(culprit.role, 'en') : '?'})
MOTIVE TR: ${pickLang(world.solution.motiveShort, 'tr')}
MOTIVE EN: ${pickLang(world.solution.motiveShort, 'en')}
KEY EVIDENCE: ${keyEv?.name ?? 'unknown'}
CASE: ${pickLang(world.meta.title, 'tr')} | ${pickLang(world.meta.title, 'en')} — ${pickLang(world.meta.setting, 'tr')} / ${pickLang(world.meta.setting, 'en')}

EVENT CHAIN:
${eventsBlock}

Now write the closing paragraph that summarises the truth above, 3-4 sentences in each language. JSON only, no other text.`;

  const t0 = Date.now();
  const completion = await withOpenAIRetry('reconstruction-conclusion', () =>
    openaiClient().chat.completions.create({
      model: CONCLUSION_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: CONCLUSION_MAX_TOKENS * 2, // bilingual output ~2x size
      temperature: 0.55,
      response_format: { type: 'json_object' },
    }),
  );

  logFromCompletion(completion, {
    model: CONCLUSION_MODEL,
    purpose: 'reconstruction-conclusion',
    durationMs: Date.now() - t0,
    sessionId,
    success: true,
  });

  const choice = completion.choices[0];
  const finishReason = choice?.finish_reason;
  const text = choice?.message?.content?.trim() ?? '';
  if (!text) throw new Error('Conclusion call returned empty content');

  if (finishReason === 'length') {
    console.warn(`${DEBUG} ⚠ conclusion finish_reason=length — bumping CONCLUSION_MAX_TOKENS may help`);
  }

  const parsed = JSON.parse(text);
  if (typeof parsed.tr !== 'string' || typeof parsed.en !== 'string') {
    throw new Error('Conclusion JSON missing tr/en fields');
  }
  console.log(`${DEBUG}   conclusion tr=${parsed.tr.length}c en=${parsed.en.length}c (finish=${finishReason})`);
  return { tr: parsed.tr.trim(), en: parsed.en.trim() };
}

/**
 * Deterministic fallback if the conclusion call fails entirely. Built
 * from solution canon so it's always coherent, just not stylistically
 * great. Better than showing the user nothing.
 */
function fallbackConclusion(world: WorldData): { tr: string; en: string } {
  const culprit = world.npcs.find((n) => n.id === world.solution.culpritNpcId);
  const keyEv = world.items.find((i) => i.id === world.solution.keyEvidenceId);
  const culpritName = culprit?.name ?? 'katil';
  const evidenceName = keyEv?.name ?? 'anahtar kanıt';
  const motiveTr = pickLang(world.solution.motiveShort, 'tr');
  const motiveEn = pickLang(world.solution.motiveShort, 'en');
  return {
    tr: `Cinayet, ${motiveTr} sebebiyle işlendi. Katilin kimliği ${culpritName} olarak belirlendi. Anahtar kanıt: ${evidenceName}.`,
    en: `The crime was committed because ${motiveEn}. The killer was identified as ${culpritName}. Key evidence: ${evidenceName}.`,
  };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                          */
/* ------------------------------------------------------------------ */

export async function generateReconstruction(
  world: WorldData,
  worldStateLog: string[],
  sessionId?: string,
): Promise<ReconstructionDTO> {
  const t0 = Date.now();
  console.log(`${DEBUG} ▶ generating (${world.rooms.length} rooms, ${world.npcs.length} npcs, ${worldStateLog.length} log entries)`);

  /* ---- Pass 1: events (strict JSON, gpt-5-nano) ---- */
  const { system, user } = buildEventsPrompt(world, worldStateLog);
  const schema = buildEventsSchema(world);

  const passT0 = Date.now();
  const completion = await withOpenAIRetry('reconstruction-events', () =>
    openaiClient().chat.completions.create({
      model: EVENTS_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_completion_tokens: EVENTS_MAX_TOKENS,
      reasoning_effort: 'minimal' as 'low',
      response_format: zodResponseFormat(schema, 'crime_reconstruction_events'),
    }),
  );
  logFromCompletion(completion, {
    model: EVENTS_MODEL,
    purpose: 'reconstruction-events',
    durationMs: Date.now() - passT0,
    sessionId,
    success: true,
  });

  const choice = completion.choices[0];
  const finishReason = choice?.finish_reason;
  const raw = choice?.message?.content;
  if (!raw) throw new Error('Reconstruction events call returned empty content');
  if (finishReason === 'length') {
    console.warn(`${DEBUG} ⚠ events finish_reason=length — bumping EVENTS_MAX_TOKENS may help`);
  }

  const parsed = JSON.parse(raw) as RawEvents;
  const scrub = buildScrubber(world);

  const events: ReconstructionEvent[] = parsed.events.map((e) => {
    const room = world.rooms.find((r) => r.id === e.roomId);
    const actor = e.actorNpcId ? world.npcs.find((n) => n.id === e.actorNpcId) : null;
    return {
      turn: e.turn,
      time: e.time,
      roomId: e.roomId,
      roomName: room?.name ?? e.roomId,
      actorNpcId: e.actorNpcId,
      actorName: actor?.name ?? '',
      actorRole: actor ? actor.role : { tr: '', en: '' },
      description: {
        tr: scrub(e.description.tr.trim()),
        en: scrub(e.description.en.trim()),
      },
      isCulpritAction: e.isCulpritAction,
    };
  });

  /* ---- Pass 2: conclusion (bilingual JSON, gpt-4o-mini) ---- */
  let conclusion: { tr: string; en: string };
  try {
    const raw2 = await generateConclusionText(world, events, sessionId);
    const trText = scrub(raw2.tr);
    const enText = scrub(raw2.en);
    // Sanity: terminator check per language.
    const patchTail = (s: string): string => {
      if (!s) return s;
      if (/[.!?…»"')\]]\s*$/.test(s)) return s;
      console.warn(`${DEBUG} ⚠ conclusion lacks terminal punctuation, appending ellipsis. tail="${s.slice(-40)}"`);
      return `${s.replace(/[\s,;:—-]+$/, '')}…`;
    };
    conclusion = { tr: patchTail(trText), en: patchTail(enText) };
  } catch (err) {
    console.error(`${DEBUG} conclusion call failed, using deterministic fallback`, err);
    conclusion = fallbackConclusion(world);
  }

  const dto: ReconstructionDTO = {
    title: world.meta.title,
    events,
    conclusion,
    generatedAt: Date.now(),
  };

  console.log(
    `${DEBUG} ✓ ${events.length} events, conclusion tr=${pickLang(dto.conclusion, 'tr').length}c en=${pickLang(dto.conclusion, 'en').length}c `
      + `(${Date.now() - t0}ms total, events finish=${finishReason})`,
  );
  return dto;
}

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

import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod.mjs';
import type { WorldData, ReconstructionDTO, ReconstructionEvent } from '@akboys/shared';

const DEBUG = '[reconstruction]';
const EVENTS_MODEL = 'gpt-5-nano';
const EVENTS_MAX_TOKENS = 6000;
const CONCLUSION_MODEL = 'gpt-4o-mini';
const CONCLUSION_MAX_TOKENS = 500;

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

/* ------------------------------------------------------------------ */
/*  Pass-1 schema: events only (no conclusion).                       */
/* ------------------------------------------------------------------ */

interface RawEvents {
  events: Array<{
    turn: number;
    time: string;
    roomId: string;
    actorNpcId: string;
    description: string;
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
          description: z
            .string()
            .min(15)
            .max(200)
            .describe('1-2 short Turkish sentences. Use ONLY display names — never ids or snake_case.'),
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
    .map((r) => `  • ${r.name} — ${r.description}  [id: ${r.id}]`)
    .join('\n');

  const npcsBlock = world.npcs
    .map((n) => {
      const culpritFlag = n.id === world.solution.culpritNpcId ? '  ★KATİL★' : '';
      const lines = [
        `  • ${n.name} — ${n.role}${culpritFlag}  [id: ${n.id}]`,
        `      bildiği gerçek: ${n.knownInfo}`,
      ];
      if (n.hiddenSecret) lines.push(`      gizli sırrı: ${n.hiddenSecret}`);
      return lines.join('\n');
    })
    .join('\n');

  const itemsBlock = world.items
    .map((i) => `  • ${i.name}${i.isEvidence ? ' (KANIT)' : ''}`)
    .join('\n');

  const logBlock = worldStateLog.length
    ? `OYUNCU AKSİYONLARI (gerçekten olan, en yenisi altta):\n${worldStateLog.slice(-30).map((e) => `  - ${e}`).join('\n')}`
    : 'OYUNCU AKSİYONLARI: (kayıt yok)';

  const system = `Sen, biten bir cinayet gizemi oyununun "olay yerini yeniden canlandırma" anlatıcısısın.

GÖREVİN:
- Cinayetin GERÇEK timeline'ını kronolojik 6-8 olay halinde üret.
- Olaylar Türkçe, her biri 1-2 KISA cümle.
- KATİL VE MOTİV ZATEN VERİLDİ — değiştirme, sorgulama, alternatif önerme. Sadece anlat.
- Olay sırası mantıklı bir saatle kronolojik olsun (örn. 22:30, 22:45, 23:00).
- Katilin hareketleri (zehir koyma, kanıt yakma, kaçış) için isCulpritAction: true.
- Ortam betimlemesi veya kurban'ın son anı gibi kişi-yok beat'ler için actorNpcId: "" (boş string).
- Stil: kısa, somut, gazeteci raporu gibi. Süsleme yok. Pamuk değil.

İSİM KURALI (ÇOK ÖNEMLİ):
- description alanlarında SADECE OKUNABILIR TÜRKÇE İSİMLER kullan.
- ASLA snake_case yazma. ASLA "_" karakteri içeren id yazma.
  Yanlış: "back_hall", "leo_marcus", "cufflink_with_velvet_fiber"
  Doğru:  "Arka Koridor", "Leo Marcus", "Kadife Lifli Kol Düğmesi"
- ID'ler yalnızca roomId / actorNpcId JSON alanlarına gider — metin içine ASLA.

ÇIKTI: yalnızca strict JSON, başka açıklama yok. (Sonuç paragrafı bu çağrıda YOK.)`;

  const user = `DÜNYA: ${world.meta.title}
ZEMİN: ${world.meta.setting}

GERÇEK KATİL: ${culprit?.name ?? 'unknown'} (rol: ${culprit?.role ?? '?'}) [katil id: ${world.solution.culpritNpcId}]
GERÇEK MOTİV: ${world.solution.motiveShort}
ANAHTAR KANIT: ${keyEv?.name ?? 'unknown'}

ODALAR (her olay bu listedeki bir oda olmalı; metinde ODA ADINI yaz):
${roomsBlock}

KARAKTERLER (her actor bu listeden seçilmeli; metinde KARAKTER ADINI yaz):
${npcsBlock}

EŞYALAR (metinde isim olarak geçebilir):
${itemsBlock}

${logBlock}

Şimdi cinayetin gerçek timeline'ını üret. Kronolojik 6-8 olay, Türkçe.
- Her olay yalnızca yukarıdaki listelerden roomId ve actorNpcId kullansın.
- description'da sadece okunabilir Türkçe isimler kullan, ID veya snake_case yazma.
- Sonuç paragrafı bu çağrıda YOK — sadece events array'i doldur.`;

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
): Promise<string> {
  const culprit = world.npcs.find((n) => n.id === world.solution.culpritNpcId);
  const keyEv = world.items.find((i) => i.id === world.solution.keyEvidenceId);

  const eventsBlock = events
    .map((e, i) => {
      const actorPart = e.actorName ? ` ${e.actorName}` : '';
      return `${i + 1}. ${e.time} — ${e.roomName}:${actorPart} ${e.description}`;
    })
    .join('\n');

  const system = `Sen kısa Türkçe noir polisiye anlatıcısısın. Görevin: verilen olay zincirinden 3-4 cümlelik bir KAPANIŞ paragrafı yazmak.

KESİN KURALLAR:
- 3-4 TAM cümle. Her cümle nokta/ünlem/soru ile bitsin.
- ASLA yarım cümle bırakma. Cümleyi tamamlamadan durma.
- İçinde mutlaka olmalı: cinayetin nasıl işlendiği, katilin TAM ADI, motivi, anahtar kanıtın TAM ADI.
- Sadece okunabilir Türkçe isimler. ASLA snake_case veya "_" içeren id yazma.
- Süsleme yok, gazeteci özeti gibi sade.
- Sadece paragrafı yaz, başlık veya açıklama yazma.`;

  const user = `KATİL: ${culprit?.name ?? 'bilinmiyor'} (rol: ${culprit?.role ?? '?'})
MOTİV: ${world.solution.motiveShort}
ANAHTAR KANIT: ${keyEv?.name ?? 'bilinmiyor'}
KURBAN/ZEMİN: ${world.meta.title} — ${world.meta.setting}

OLAY ZİNCİRİ:
${eventsBlock}

Şimdi yukarıdaki gerçeği özetleyen 3-4 cümlelik kapanış paragrafı yaz. Cümleyi yarıda bırakma.`;

  const completion = await client().chat.completions.create({
    model: CONCLUSION_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: CONCLUSION_MAX_TOKENS,
    temperature: 0.55,
  });

  const choice = completion.choices[0];
  const finishReason = choice?.finish_reason;
  const text = choice?.message?.content?.trim() ?? '';
  if (!text) throw new Error('Conclusion call returned empty content');

  if (finishReason === 'length') {
    console.warn(`${DEBUG} ⚠ conclusion finish_reason=length — bumping CONCLUSION_MAX_TOKENS may help`);
  }
  console.log(`${DEBUG}   conclusion ${text.length} chars (finish=${finishReason})`);
  return text;
}

/**
 * Deterministic fallback if the conclusion call fails entirely. Built
 * from solution canon so it's always coherent, just not stylistically
 * great. Better than showing the user nothing.
 */
function fallbackConclusion(world: WorldData): string {
  const culprit = world.npcs.find((n) => n.id === world.solution.culpritNpcId);
  const keyEv = world.items.find((i) => i.id === world.solution.keyEvidenceId);
  const culpritName = culprit?.name ?? 'katil';
  const evidenceName = keyEv?.name ?? 'anahtar kanıt';
  return `Cinayet, ${world.solution.motiveShort} sebebiyle işlendi. Katilin kimliği ${culpritName} olarak belirlendi. Anahtar kanıt: ${evidenceName}.`;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                          */
/* ------------------------------------------------------------------ */

export async function generateReconstruction(
  world: WorldData,
  worldStateLog: string[],
): Promise<ReconstructionDTO> {
  const t0 = Date.now();
  console.log(`${DEBUG} ▶ generating (${world.rooms.length} rooms, ${world.npcs.length} npcs, ${worldStateLog.length} log entries)`);

  /* ---- Pass 1: events (strict JSON, gpt-5-nano) ---- */
  const { system, user } = buildEventsPrompt(world, worldStateLog);
  const schema = buildEventsSchema(world);

  const completion = await client().chat.completions.create({
    model: EVENTS_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_completion_tokens: EVENTS_MAX_TOKENS,
    reasoning_effort: 'minimal' as 'low',
    response_format: zodResponseFormat(schema, 'crime_reconstruction_events'),
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
      actorRole: actor?.role ?? '',
      description: scrub(e.description.trim()),
      isCulpritAction: e.isCulpritAction,
    };
  });

  /* ---- Pass 2: conclusion (plain text, gpt-4o-mini) ---- */
  let conclusion: string;
  try {
    const raw2 = await generateConclusionText(world, events);
    conclusion = scrub(raw2);
    // Sanity: terminator check. With gpt-4o-mini + 500 tokens this should
    // basically never trigger — but if a network blip cuts the response,
    // we still patch the tail rather than show a half-sentence.
    if (!/[.!?…»"')\]]\s*$/.test(conclusion)) {
      console.warn(`${DEBUG} ⚠ conclusion lacks terminal punctuation, appending ellipsis. tail="${conclusion.slice(-40)}"`);
      conclusion = `${conclusion.replace(/[\s,;:—-]+$/, '')}…`;
    }
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
    `${DEBUG} ✓ ${events.length} events, ${dto.conclusion.length} char conclusion `
      + `(${Date.now() - t0}ms total, events finish=${finishReason})`,
  );
  return dto;
}

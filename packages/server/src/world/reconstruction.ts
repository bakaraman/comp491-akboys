/**
 * reconstruction.ts — Post-game crime-scene reconstruction generator
 *
 * Given a finished session's world + worldStateLog, asks GPT-5-nano to lay
 * out the killer's actual timeline of events. Output is constrained by a
 * strict Zod enum so the AI can only reference rooms and NPCs that really
 * exist in this world — it cannot invent characters or locations. Display
 * names are then enriched server-side from the canonical WorldData.
 *
 * The solution (culprit, motive, key evidence) is stated to the AI as
 * canon, not asked. The AI's only job is to *retell* the truth as a
 * chronological timeline, not to deduce it.
 *
 * Hardening (2026-05-06):
 *   - Tightened event count band (6-8) for predictable token budget.
 *   - max_completion_tokens raised from 2500 → 5000 to leave room after
 *     gpt-5-nano's reasoning tokens (mid-sentence cut on conclusions).
 *   - Prompt names rooms/NPCs/items by display name first, IDs hidden in
 *     a `[id: ...]` suffix and explicitly forbidden in description text.
 *   - scrubIds() post-processes description + conclusion as a safety net,
 *     replacing any leaked `snake_case` ID with its canonical display name.
 *   - finish_reason logged so we can spot truncation immediately.
 *
 * @author AKBOYS Team
 * @since 2026-05-06
 */

import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod.mjs';
import type { WorldData, ReconstructionDTO, ReconstructionEvent } from '@akboys/shared';

const DEBUG = '[reconstruction]';
const MODEL = 'gpt-5-nano';
const MAX_TOKENS = 5000;

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

/* ------------------------------------------------------------------ */
/*  Strict schema — AI cannot reference rooms or NPCs outside the     */
/*  world. We build the enums dynamically from the live WorldData.    */
/* ------------------------------------------------------------------ */

interface RawReconstruction {
  events: Array<{
    turn: number;
    time: string;
    roomId: string;
    actorNpcId: string;
    description: string;
    isCulpritAction: boolean;
  }>;
  conclusion: string;
}

function buildSchema(world: WorldData): z.ZodType<RawReconstruction> {
  const roomIds = world.rooms.map((r) => r.id);
  const npcIds = world.npcs.map((n) => n.id);

  const RoomIdEnum = z.enum(roomIds as [string, ...string[]]);
  // '' means "no actor for this beat" — atmospheric / off-screen events.
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
            .describe(
              '1-2 short Turkish sentences. Use ONLY display names — never ids or snake_case.',
            ),
          isCulpritAction: z
            .boolean()
            .describe('True when this beat is the killer doing something pivotal.'),
        }),
      )
      .min(6)
      .max(8)
      .describe('Chronological reconstruction beats, 6-8 entries. Earliest first.'),
    conclusion: z
      .string()
      .min(60)
      .max(420)
      .describe(
        'Closing paragraph in Turkish, 3-4 complete sentences. MUST end with proper punctuation. '
          + 'Cover: how the murder happened, the killer\'s name, the motive, the key evidence.',
      ),
  }) as z.ZodType<RawReconstruction>;
}

/* ------------------------------------------------------------------ */
/*  Prompt construction                                                */
/* ------------------------------------------------------------------ */

function buildPrompt(world: WorldData, worldStateLog: string[]): { system: string; user: string } {
  const culprit = world.npcs.find((n) => n.id === world.solution.culpritNpcId);
  const keyEv = world.items.find((i) => i.id === world.solution.keyEvidenceId);

  // Display name first, ID in small bracket suffix. Items have NO id shown
  // because the schema doesn't reference them — only their human names matter.
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
- description ve conclusion alanlarında SADECE OKUNABILIR TÜRKÇE İSİMLER kullan.
- ASLA snake_case yazma. ASLA "_" karakteri içeren id yazma.
  Yanlış: "back_hall", "leo_marcus", "cufflink_with_velvet_fiber"
  Doğru:  "Arka Koridor", "Leo Marcus", "Kadife Lifli Kol Düğmesi"
- ID'ler yalnızca roomId / actorNpcId JSON alanlarına gider — metin içine ASLA.

SONUÇ KURALI:
- conclusion alanı 3-4 TAM cümle olmalı, mutlaka nokta/ünlem/soru işareti ile bitsin.
- İçinde olmalı: cinayetin nasıl işlendiği, katilin TAM ADI, motivi, anahtar kanıtın TAM ADI.
- Asla yarım cümle bırakma.

ÇIKTI: yalnızca strict JSON, başka açıklama yok.`;

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
- En sonunda 3-4 cümlelik tam bir conclusion paragrafı yaz: cinayetin nasıl işlendiği, katilin tam adı, motivi, anahtar kanıtın tam adı. Cümleyi yarıda bırakma.`;

  return { system, user };
}

/* ------------------------------------------------------------------ */
/*  Safety net: replace any leaked id with its display name            */
/* ------------------------------------------------------------------ */

/**
 * Last-line defense against the model leaking a raw id into prose. We
 * sort by id-length descending so longer ids are replaced before shorter
 * substrings of them (e.g. "leo_marcus" before "leo").
 */
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
      // Word-boundary-aware: avoids partial replacement inside other words.
      const safeId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(`\\b${safeId}\\b`, 'g'), name);
    }
    return out;
  };
}

/* ------------------------------------------------------------------ */
/*  Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Generate a reconstruction DTO for a finished session. Throws on AI
 * failure — caller should wrap in try/catch and surface a graceful error.
 */
export async function generateReconstruction(
  world: WorldData,
  worldStateLog: string[],
): Promise<ReconstructionDTO> {
  const t0 = Date.now();
  console.log(`${DEBUG} ▶ generating (${world.rooms.length} rooms, ${world.npcs.length} npcs, ${worldStateLog.length} log entries)`);

  const { system, user } = buildPrompt(world, worldStateLog);
  const schema = buildSchema(world);

  const completion = await client().chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_completion_tokens: MAX_TOKENS,
    reasoning_effort: 'minimal' as 'low',
    response_format: zodResponseFormat(schema, 'crime_reconstruction'),
  });

  const choice = completion.choices[0];
  const finishReason = choice?.finish_reason;
  const raw = choice?.message?.content;
  if (!raw) {
    throw new Error('Reconstruction returned empty content');
  }
  if (finishReason === 'length') {
    console.warn(`${DEBUG} ⚠ finish_reason=length — output may be truncated despite ${MAX_TOKENS} token budget`);
  }

  const parsed = JSON.parse(raw) as RawReconstruction;
  const scrub = buildScrubber(world);

  // Server-side enrichment: AI gave us only IDs, we resolve them to display
  // names from the authoritative WorldData. This guarantees the UI shows
  // exactly the same room/character names as in the live game, regardless
  // of what the AI happened to write in its `description` field. We also
  // scrub leaked snake_case ids out of `description` as a safety net.
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

  let conclusion = scrub(parsed.conclusion.trim());
  // Sanity: if the model still managed to cut the conclusion mid-sentence
  // (no terminal punctuation), append an ellipsis so the UI never shows a
  // raw mid-word stop. This is a UX safeguard, not a correctness fix —
  // finish_reason logging above will tell us if we need to bump tokens.
  if (!/[.!?…»"')\]]\s*$/.test(conclusion)) {
    console.warn(`${DEBUG} ⚠ conclusion lacks terminal punctuation, appending ellipsis. tail="${conclusion.slice(-40)}"`);
    conclusion = `${conclusion.replace(/[\s,;:—-]+$/, '')}…`;
  }

  const dto: ReconstructionDTO = {
    title: world.meta.title,
    events,
    conclusion,
    generatedAt: Date.now(),
  };

  console.log(
    `${DEBUG} ✓ ${events.length} events, ${dto.conclusion.length} char conclusion `
      + `(${Date.now() - t0}ms, finish=${finishReason})`,
  );
  return dto;
}

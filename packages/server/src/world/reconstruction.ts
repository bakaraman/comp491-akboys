/**
 * reconstruction.ts — Post-game crime-scene reconstruction generator
 *
 * Given a finished session's world + worldStateLog, asks GPT-5-nano to lay
 * out the killer's actual timeline of events. Output is constrained by a
 * strict Zod enum so the AI can only reference rooms and NPCs that really
 * exist in this world — it cannot invent characters or locations. Display
 * names are then enriched server-side from the canonical WorldData, so a
 * roomId always resolves to its true roomName regardless of what the AI
 * thought it was called.
 *
 * The solution (culprit, motive, key evidence) is stated to the AI as
 * canon, not asked. The AI's only job is to *retell* the truth as a
 * chronological timeline, not to deduce it.
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
const MAX_TOKENS = 2500;

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

  // z.enum needs at least one element; both rooms and npcs are guaranteed
  // non-empty by WorldSchema's `.min()` constraints, but the cast is safe.
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
            .max(280)
            .describe(
              '1-2 short Turkish sentences. State a concrete action or observation. '
                + 'Do not name characters by inventing — use only the listed NPC names if you mention any.',
            ),
          isCulpritAction: z
            .boolean()
            .describe('True when this beat is the killer doing something pivotal.'),
        }),
      )
      .min(4)
      .max(10)
      .describe('Chronological reconstruction beats. Earliest first.'),
    conclusion: z
      .string()
      .min(30)
      .max(400)
      .describe('2-3 Turkish sentences summarising what really happened. Reference culprit + key evidence.'),
  }) as z.ZodType<RawReconstruction>;
}

/* ------------------------------------------------------------------ */
/*  Prompt construction                                                */
/* ------------------------------------------------------------------ */

function buildPrompt(world: WorldData, worldStateLog: string[]): { system: string; user: string } {
  const culprit = world.npcs.find((n) => n.id === world.solution.culpritNpcId);
  const keyEv = world.items.find((i) => i.id === world.solution.keyEvidenceId);

  const roomsBlock = world.rooms
    .map((r) => `  ${r.id} — ${r.name} (${r.description})`)
    .join('\n');

  const npcsBlock = world.npcs
    .map((n) => {
      const culpritFlag = n.id === world.solution.culpritNpcId ? ' [GERÇEK KATİL]' : '';
      return `  ${n.id} — ${n.name}, ${n.role}${culpritFlag}\n`
        + `      bildiği gerçek: ${n.knownInfo}`
        + (n.hiddenSecret ? `\n      gizli sırrı: ${n.hiddenSecret}` : '');
    })
    .join('\n');

  const itemsBlock = world.items
    .map((i) => `  ${i.id} — ${i.name} (in ${i.roomId})${i.isEvidence ? ' [KANIT]' : ''}`)
    .join('\n');

  const logBlock = worldStateLog.length
    ? `OYUNCU AKSİYONLARI (gerçekten olan, en yenisi altta):\n${worldStateLog.slice(-30).map((e) => `  - ${e}`).join('\n')}`
    : 'OYUNCU AKSİYONLARI: (kayıt yok)';

  const system = `Sen, biten bir cinayet gizemi oyununun "olay yerini yeniden canlandırma" anlatıcısısın.

GÖREVİN:
- Cinayetin GERÇEK timeline'ını kronolojik 4-10 olay halinde üret.
- Olaylar Türkçe, her biri 1-2 kısa cümle.
- KATİL VE MOTİV ZATEN VERİLDİ — değiştirme, sorgulama, alternatif önerme. Sadece anlat.
- Oda ve NPC ID'lerini AŞAĞIDAKİ LİSTEDEN seç. Liste dışı isim/oda UYDURMA — JSON şema invalid olur.
- Olay sırası mantıklı bir saatle kronolojik olsun (örn. 22:30, 22:45, 23:00).
- Katilin hareketleri (zehir koyma, kanıt yakma, kaçış) için isCulpritAction: true.
- Ortam betimlemesi veya kurban'ın son anı gibi kişi-yok beat'ler için actorNpcId: "" (boş string).
- Stil: kısa, somut, gazeteci raporu gibi. Süsleme yok. Pamuk değil.

ÇIKTI: yalnızca strict JSON, başka açıklama yok.`;

  const user = `DÜNYA: ${world.meta.title}
ZEMİN: ${world.meta.setting}

GERÇEK KATİL: ${culprit?.name ?? 'unknown'} (id: ${world.solution.culpritNpcId}, rol: ${culprit?.role ?? '?'})
GERÇEK MOTİV: ${world.solution.motiveShort}
ANAHTAR KANIT: ${keyEv?.name ?? 'unknown'} (id: ${world.solution.keyEvidenceId})

ODALAR (sadece bu id'ler kullanılabilir):
${roomsBlock}

KARAKTERLER (sadece bu id'ler kullanılabilir):
${npcsBlock}

EŞYALAR (timeline'da isim olarak geçebilir):
${itemsBlock}

${logBlock}

Şimdi cinayetin gerçek timeline'ını üret. 4-10 olay, kronolojik, Türkçe.
Her olay yalnızca yukarıdaki listelerden roomId ve actorNpcId kullansın.
Sonunda 2-3 cümlelik sonuç paragrafı yaz (katili ve anahtar kanıtı isimle göster).`;

  return { system, user };
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

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error('Reconstruction returned empty content');
  }

  const parsed = JSON.parse(raw) as RawReconstruction;

  // Server-side enrichment: AI gave us only IDs, we resolve them to display
  // names from the authoritative WorldData. This guarantees the UI shows
  // exactly the same room/character names as in the live game, regardless
  // of what the AI happened to write in its `description` field.
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
      description: e.description.trim(),
      isCulpritAction: e.isCulpritAction,
    };
  });

  const dto: ReconstructionDTO = {
    title: world.meta.title,
    events,
    conclusion: parsed.conclusion.trim(),
    generatedAt: Date.now(),
  };

  console.log(`${DEBUG} ✓ ${events.length} events, ${dto.conclusion.length} char conclusion (${Date.now() - t0}ms)`);
  return dto;
}

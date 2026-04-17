/**
 * finale.ts — Live AI finale generation based on how the game actually played
 *
 * When the game ends (victory, wrong accusation, or turn limit), this module
 * generates a personalized Turkish finale narrative by feeding GPT-5.4 the
 * session's actual world state log plus the outcome.
 *
 * Streams chunks via an async generator for incremental playback.
 *
 * @author AKBOYS Team
 * @since 2026-04-17
 */

import OpenAI from 'openai';
import type { WorldData } from '@akboys/shared';

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}
const DEBUG = '[finale]';

export type FinaleOutcome = 'won' | 'lost_wrong' | 'lost_timeout';

export interface GenerateFinaleInput {
  world: WorldData;
  outcome: FinaleOutcome;
  accuserName?: string;
  accusedNpcId?: string;
  wrongAccusedNpcId?: string;
  evidencePresentedId?: string;
  worldStateLog: string[];
  turnCount: number;
  maxTurns: number;
}

function buildFinalePrompt(input: GenerateFinaleInput): { system: string; user: string } {
  const {
    world,
    outcome,
    accuserName,
    accusedNpcId,
    wrongAccusedNpcId,
    evidencePresentedId,
    worldStateLog,
    turnCount,
    maxTurns,
  } = input;

  const culprit = world.npcs.find((n) => n.id === world.solution.culpritNpcId);
  const keyEv = world.items.find((i) => i.id === world.solution.keyEvidenceId);
  const accusedNpc = accusedNpcId ? world.npcs.find((n) => n.id === accusedNpcId) : null;
  const wrongNpc = wrongAccusedNpcId ? world.npcs.find((n) => n.id === wrongAccusedNpcId) : null;
  const evidenceItem = evidencePresentedId ? world.items.find((i) => i.id === evidencePresentedId) : null;

  const system = `You are narrating the FINALE of a noir mystery. Write in flowing, literary Turkish. Channel Chandler + Pamuk.

Write EXACTLY 2 short paragraphs. Maximum 180 Turkish words total. This will be read aloud by TTS — write for the ear. Natural rhythm. Short sentences where dramatic.

Reference SPECIFIC things the team found or missed. Be concrete, not generic. Name the real culprit. Let the mood match the outcome.

Do NOT use list items, headers, or markdown. Prose only. Separate the two paragraphs with a single blank line.`;

  const truthBlock = `WORLD:
Title: ${world.meta.title}
Setting: ${world.meta.setting}

TRUE CULPRIT: ${culprit?.name ?? 'unknown'} (role: ${culprit?.role ?? 'unknown'})
TRUE MOTIVE: ${world.solution.motiveShort}
KEY EVIDENCE: ${keyEv?.name ?? 'unknown'}`;

  const logBlock = worldStateLog.length
    ? `WORLD STATE LOG (actual team actions, most recent last):\n${worldStateLog.slice(-30).map((e) => `- ${e}`).join('\n')}`
    : 'WORLD STATE LOG: (no canonical events recorded)';

  let outcomeBlock = '';
  if (outcome === 'won') {
    outcomeBlock = `OUTCOME: VICTORY. The team accused the real culprit.
Accuser: ${accuserName ?? 'The team'}
Accused: ${accusedNpc?.name ?? culprit?.name ?? 'the culprit'}
Evidence presented: ${evidenceItem?.name ?? 'key evidence'}
Turns used: ${turnCount} of ${maxTurns}

Write a victorious but bittersweet ending. The truth came at a cost. Name the culprit. Reference the evidence. Let the mood lift only slightly at the end — this is noir.`;
  } else if (outcome === 'lost_wrong') {
    outcomeBlock = `OUTCOME: DEFEAT (wrong accusation).
Accuser: ${accuserName ?? 'A detective'}
Wrongly accused: ${wrongNpc?.name ?? 'an innocent'}
True culprit (escaped): ${culprit?.name}
Turns used: ${turnCount} of ${maxTurns}

Write a tragic ending. The wrong person paid the price. The real culprit escaped, perhaps still out there. Describe the aftermath. Mention the wronged innocent and the real culprit by name.`;
  } else {
    outcomeBlock = `OUTCOME: DEFEAT (trail went cold).
Turns exhausted: ${turnCount} of ${maxTurns}
True culprit (never caught): ${culprit?.name}

Write a defeated, reflective ending. Describe how the case slipped away. The city moved on. The culprit was never caught. Short, elegiac paragraphs.`;
  }

  const user = `${truthBlock}\n\n${logBlock}\n\n${outcomeBlock}\n\nWrite the finale now, in Turkish prose only.`;

  return { system, user };
}

/**
 * Stream the finale text chunk by chunk. Caller pipes chunks to the client.
 */
export async function* streamFinale(input: GenerateFinaleInput): AsyncGenerator<string> {
  const { system, user } = buildFinalePrompt(input);
  console.log(`${DEBUG} streaming finale: outcome=${input.outcome}`);

  const t0 = Date.now();
  const stream = await client().chat.completions.create({
    model: 'gpt-5.4-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_completion_tokens: 500,
    temperature: 0.85,
    stream: true,
  });
  console.log(`${DEBUG} stream opened (${Date.now() - t0}ms)`);

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

/** Render full finale text (non-streaming). Useful for saving with session. */
export async function renderFinaleText(input: GenerateFinaleInput): Promise<string> {
  let full = '';
  for await (const chunk of streamFinale(input)) {
    full += chunk;
  }
  return full;
}

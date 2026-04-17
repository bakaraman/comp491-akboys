/**
 * images.ts — Parallel image generation pipeline for a generated world
 *
 * After a world schema is generated, this module kicks off image generation
 * for: (1) the opening atmosphere image (priority — blocks game start),
 * and (2) rooms + NPC portraits (async, non-blocking). Caller is expected
 * to await the opening image and to broadcast async completions via sockets.
 *
 * @author AKBOYS Team
 * @since 2026-04-17
 */

import { generateSceneImage } from '../middleware/openai.js';
import type { WorldData } from '@akboys/shared';

const DEBUG = '[world-images]';

/** Safely generate one image. Single attempt, silent on failure. */
export async function safeGenerateImage(prompt: string, label: string): Promise<string | null> {
  try {
    const url = await generateSceneImage(prompt);
    return url || null;
  } catch (err) {
    console.warn(`${DEBUG} ${label}: failed`, (err as Error).message);
    return null;
  }
}

/** Generate the opening atmosphere image — await this before game start. */
export async function generateOpeningImage(world: WorldData): Promise<string | null> {
  const prompt = `${world.meta.visualStylePrompt}. ${world.meta.openingImagePrompt}`;
  console.log(`${DEBUG} opening: generating`);
  const start = Date.now();
  const url = await safeGenerateImage(prompt, 'opening');
  console.log(`${DEBUG} opening: ${url ? 'ok' : 'failed'} (${Date.now() - start}ms)`);
  return url;
}

/**
 * Generate an opening image from just the host prompt, before world gen finishes.
 * We don't have visualStylePrompt yet, so we bolt on a generic noir style hint.
 * Runs in parallel with world text generation.
 */
export async function generateOpeningImageFromPrompt(hostPrompt: string): Promise<string | null> {
  const styled =
    `${hostPrompt.trim()}. Atmospheric establishing shot, wide angle, no people, ` +
    `cinematic noir lighting, rich shadows, moody color grading, film still, high detail.`;
  console.log(`${DEBUG} opening-early: generating from host prompt`);
  const start = Date.now();
  const url = await safeGenerateImage(styled, 'opening-early');
  console.log(`${DEBUG} opening-early: ${url ? 'ok' : 'failed'} (${Date.now() - start}ms)`);
  return url;
}

export interface RoomImageResult {
  roomId: string;
  url: string | null;
}

/** Generate a single room image. */
export async function generateRoomImage(
  world: WorldData,
  roomId: string,
): Promise<RoomImageResult> {
  const room = world.rooms.find((r) => r.id === roomId);
  if (!room) return { roomId, url: null };
  const prompt = `${world.meta.visualStylePrompt}. ${room.imagePrompt}`;
  const url = await safeGenerateImage(prompt, `room:${roomId}`);
  return { roomId, url };
}

export interface NpcImageResult {
  npcId: string;
  url: string | null;
}

/** Generate a single NPC portrait. */
export async function generateNpcPortrait(
  world: WorldData,
  npcId: string,
): Promise<NpcImageResult> {
  const npc = world.npcs.find((n) => n.id === npcId);
  if (!npc) return { npcId, url: null };
  const prompt = `${world.meta.visualStylePrompt}. ${npc.portraitPrompt}`;
  const url = await safeGenerateImage(prompt, `npc:${npcId}`);
  return { npcId, url };
}

/**
 * Generate all room images in parallel with a callback for each completion.
 * Returns a map of roomId → url (nulls preserved for failures).
 */
export async function generateAllRoomImages(
  world: WorldData,
  onReady?: (result: RoomImageResult) => void,
): Promise<Record<string, string | null>> {
  console.log(`${DEBUG} rooms: starting ${world.rooms.length} parallel generations`);
  const promises = world.rooms.map((room) =>
    generateRoomImage(world, room.id).then((r) => {
      onReady?.(r);
      return r;
    }),
  );
  const results = await Promise.all(promises);
  const map: Record<string, string | null> = {};
  for (const r of results) map[r.roomId] = r.url;
  return map;
}

/**
 * Generate all NPC portraits in parallel with a callback for each completion.
 */
export async function generateAllNpcPortraits(
  world: WorldData,
  onReady?: (result: NpcImageResult) => void,
): Promise<Record<string, string | null>> {
  console.log(`${DEBUG} npcs: starting ${world.npcs.length} parallel generations`);
  const promises = world.npcs.map((npc) =>
    generateNpcPortrait(world, npc.id).then((r) => {
      onReady?.(r);
      return r;
    }),
  );
  const results = await Promise.all(promises);
  const map: Record<string, string | null> = {};
  for (const r of results) map[r.npcId] = r.url;
  return map;
}

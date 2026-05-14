/**
 * session-helpers.ts — Resolve a Scenario object for any session
 *
 * If the session has a generated world, derive a Scenario via the adapter.
 * Otherwise fall back to the legacy SCENARIOS dict by scenarioId.
 *
 * @author AKBOYS Team
 * @since 2026-04-17
 */

import { SCENARIOS } from '@akboys/shared';
import type { Locale, Scenario } from '@akboys/shared';
import type { SessionData } from '../store/SessionStore.js';
import { worldToScenario } from './adapter.js';

export function getScenarioForSession(
  session: SessionData | undefined,
  locale: Locale = 'tr',
): Scenario | undefined {
  if (!session) return undefined;
  if (session.world) return worldToScenario(session.world, locale);
  return SCENARIOS[session.scenarioId];
}

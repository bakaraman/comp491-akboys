/**
 * uiClick.ts — Global UI click sound delegation
 *
 * Installs a single document-level `pointerdown` listener that fires the
 * `ui-click` SFX whenever the user activates a button or button-like
 * element. Centralising it here means individual components don't need
 * to wire onClick handlers; every existing <button> in the codebase
 * picks up the click sound for free.
 *
 * Volume + mute respect the same settings the popover slider drives, so
 * the user can silence clicks without silencing ambient music.
 *
 * @author AKBOYS Team
 * @since 2026-05-06
 */

'use client';

import { useEffect } from 'react';
import { playSfxGlobal } from '@/hooks/useSoundEffects';

let installed = false;

function isClickable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  // closest() checks self + ancestors. Covers <button>, role="button",
  // and disabled buttons (we still skip those below).
  const el = target.closest('button, [role="button"]');
  if (!el) return false;
  // Disabled buttons shouldn't click. Both attribute and aria-disabled handled.
  if (el instanceof HTMLButtonElement && el.disabled) return false;
  if (el.getAttribute('aria-disabled') === 'true') return false;
  return true;
}

function handlePointerDown(event: PointerEvent): void {
  // Only primary-button (left click / single-finger tap) triggers a sound.
  if (event.button !== 0) return;
  if (!isClickable(event.target)) return;
  playSfxGlobal('ui-click');
}

/**
 * Installs the global click listener exactly once per document. Idempotent —
 * calling from multiple components is safe.
 */
export function useUiClickSound(): void {
  useEffect(() => {
    if (installed || typeof document === 'undefined') return;
    document.addEventListener('pointerdown', handlePointerDown, { capture: true });
    installed = true;
    // Intentionally never uninstall — the listener is meant to live for the
    // entire session and across route transitions.
  }, []);
}

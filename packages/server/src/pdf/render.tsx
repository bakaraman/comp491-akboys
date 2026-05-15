/**
 * render.tsx — Bundle fonts + render the case-file PDF to a Buffer (#59)
 *
 * Registers each font family once (module-level guard) so repeated
 * renders share the same Font registry instead of re-loading TTFs.
 *
 * @author AKBOYS Team
 * @since 2026-05-14
 */
import React from 'react';
import { Font, pdf } from '@react-pdf/renderer';

import { CaseFileDocument } from './CaseFileDocument.js';
import { ALL_FONT_FAMILIES, pickTheme } from './genre-theme.js';
import { buildCaseFileContent, type BuildCaseFileContentInput } from './case-file-content.js';

let fontsRegistered = false;

/** Idempotent — runs once per process. */
function registerFontsOnce(): void {
  if (fontsRegistered) return;
  for (const bundle of ALL_FONT_FAMILIES) {
    Font.register({ family: bundle.family, fonts: bundle.fonts });
  }
  // Disable @react-pdf's optional hyphenation so Turkish words aren't
  // arbitrarily broken in the middle of a paragraph.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
  console.log(`[pdf] registered ${ALL_FONT_FAMILIES.length} font families`);
}

/**
 * Render the case-file PDF for a session. The caller is responsible for
 * making sure the reconstruction is cached on the session — content
 * extraction assumes that's already true.
 */
export async function renderCaseFilePdf(input: BuildCaseFileContentInput): Promise<Buffer> {
  registerFontsOnce();
  const content = buildCaseFileContent(input);
  const theme = pickTheme(content.genre);
  const t0 = Date.now();
  // Using JSX here so @react-pdf's DocumentElement types resolve cleanly
  // (its `pdf()` helper expects a `ReactElement<DocumentProps>`, which
  // React.createElement won't infer through a function component).
  const instance = pdf(<CaseFileDocument content={content} theme={theme} />);
  const blob = await instance.toBlob();
  const arr = await blob.arrayBuffer();
  const buf = Buffer.from(arr);
  console.log(
    `[pdf] rendered case-file: ${buf.length} bytes, locale=${content.locale}, theme=${theme.id}, ${Date.now() - t0}ms`,
  );
  // Reference React so the JSX import isn't flagged as unused under
  // tsconfig "react-jsx" (which doesn't auto-import the React identifier).
  void React;
  return buf;
}

/**
 * genre-theme.ts — Visual theme map for the bilingual case-file PDF (#59)
 *
 * Three curated themes that adapt the PDF's typography + color palette to
 * the host prompt's detected genre (`session.detectedGenre`). Anything
 * outside the explicit map falls back to `generic` — a clean serif look
 * that always renders well.
 *
 * Each theme picks an in-repo Google Fonts package (full Unicode TTF, no
 * subset gaps) so Turkish characters (ş ı ğ ü ö ç İ) render correctly in
 * every paragraph.
 *
 * @author AKBOYS Team
 * @since 2026-05-14
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

/**
 * Resolves a TTF inside one of the @expo-google-fonts/* packages to an
 * absolute filesystem path. The wrapping `try/catch` lets the function
 * fall back to a string-path heuristic if `require.resolve` isn't
 * available at runtime (extremely unlikely with `tsx`/`node`).
 */
function resolveFont(pkg: string, family: string, weightSlug: string): string {
  // @expo-google-fonts/<pkg>/<weightSlug>/<Family>_<weightSlug>.ttf
  const subpath = `${weightSlug}/${family}_${weightSlug}.ttf`;
  try {
    return require.resolve(`@expo-google-fonts/${pkg}/${subpath}`);
  } catch {
    // If require.resolve fails, fall back to a path computed relative to
    // this file. tsx serves dist/, so node_modules sits two levels up.
    // (Keeps the code from hard-failing in unexpected envs.)
    return `@expo-google-fonts/${pkg}/${subpath}`;
  }
}

/* ------------------------------------------------------------------ */
/*  Font family bundles — registered once at PDF render time           */
/* ------------------------------------------------------------------ */

export interface FontWeight {
  src: string;
  fontWeight: number;
  fontStyle?: 'italic' | 'normal';
}

export interface FontFamilyBundle {
  family: string;
  fonts: FontWeight[];
}

export const FONT_CORMORANT: FontFamilyBundle = {
  family: 'Cormorant Garamond',
  fonts: [
    { src: resolveFont('cormorant-garamond', 'CormorantGaramond', '400Regular'), fontWeight: 400 },
    { src: resolveFont('cormorant-garamond', 'CormorantGaramond', '400Regular_Italic'), fontWeight: 400, fontStyle: 'italic' },
    { src: resolveFont('cormorant-garamond', 'CormorantGaramond', '700Bold'), fontWeight: 700 },
    { src: resolveFont('cormorant-garamond', 'CormorantGaramond', '700Bold_Italic'), fontWeight: 700, fontStyle: 'italic' },
  ],
};

export const FONT_SPACE_GROTESK: FontFamilyBundle = {
  family: 'Space Grotesk',
  fonts: [
    { src: resolveFont('space-grotesk', 'SpaceGrotesk', '400Regular'), fontWeight: 400 },
    { src: resolveFont('space-grotesk', 'SpaceGrotesk', '500Medium'), fontWeight: 500 },
    { src: resolveFont('space-grotesk', 'SpaceGrotesk', '700Bold'), fontWeight: 700 },
  ],
};

export const FONT_LORA: FontFamilyBundle = {
  family: 'Lora',
  fonts: [
    { src: resolveFont('lora', 'Lora', '400Regular'), fontWeight: 400 },
    { src: resolveFont('lora', 'Lora', '400Regular_Italic'), fontWeight: 400, fontStyle: 'italic' },
    { src: resolveFont('lora', 'Lora', '700Bold'), fontWeight: 700 },
    { src: resolveFont('lora', 'Lora', '700Bold_Italic'), fontWeight: 700, fontStyle: 'italic' },
  ],
};

export const FONT_JETBRAINS: FontFamilyBundle = {
  family: 'JetBrains Mono',
  fonts: [
    { src: resolveFont('jetbrains-mono', 'JetBrainsMono', '400Regular'), fontWeight: 400 },
    { src: resolveFont('jetbrains-mono', 'JetBrainsMono', '700Bold'), fontWeight: 700 },
  ],
};

/**
 * Union of fonts every PDF render needs to register.
 *
 * Space Grotesk is intentionally NOT in this list. Even though it ships
 * weights 300-700 in the @expo-google-fonts package, it does not provide
 * italic variants (it's a single-axis modern sans without an italic
 * style). Registering it caused @react-pdf to throw
 * `Could not resolve font for Space Grotesk, fontWeight 700, fontStyle italic`
 * when the sci-fi theme rendered any italic block (cover heading,
 * conclusion blockquote, room labels).
 *
 * Sci-fi pages now use Cormorant Garamond + JetBrains Mono just like
 * noir; the genre feel comes from the cold-blue/cyan palette below,
 * not from a different typeface.
 */
export const ALL_FONT_FAMILIES: FontFamilyBundle[] = [
  FONT_CORMORANT,
  FONT_LORA,
  FONT_JETBRAINS,
];

/* ------------------------------------------------------------------ */
/*  Theme definitions                                                  */
/* ------------------------------------------------------------------ */

export interface PdfTheme {
  /** Detected-genre label this theme matches. */
  id: 'noir' | 'sci-fi' | 'generic';
  /** Display family for body / headings. */
  serifFamily: string;
  /** Monospace family for metadata, time codes, room ids. */
  monoFamily: string;
  /** Page background fill. */
  pageBg: string;
  /** Body text color. */
  text: string;
  /** Muted text for labels + captions. */
  muted: string;
  /** Accent color used for case-file ornaments, headings, dividers. */
  accent: string;
  /** Strong "danger" tone — culprit borders, verdict damgası. */
  danger: string;
  /** Ornament glyph used between sections. */
  divider: string;
}

export const THEME_NOIR: PdfTheme = {
  id: 'noir',
  serifFamily: 'Cormorant Garamond',
  monoFamily: 'JetBrains Mono',
  pageBg: '#f3ead7',
  text: '#1c1611',
  muted: '#6a5a44',
  accent: '#a87a2c',
  danger: '#7a1a1a',
  divider: '◆',
};

export const THEME_SCI_FI: PdfTheme = {
  id: 'sci-fi',
  /* Cormorant Garamond, not Space Grotesk — see ALL_FONT_FAMILIES note.
   * The sci-fi atmosphere is carried by the cold palette below; using a
   * serif that ships italics keeps the cover heading, blockquote, and
   * room labels from crashing the render. */
  serifFamily: 'Cormorant Garamond',
  monoFamily: 'JetBrains Mono',
  pageBg: '#0c1623',
  text: '#dbe6f4',
  muted: '#7286a2',
  accent: '#6cd5ff',
  danger: '#ff5d6a',
  divider: '◇',
};

export const THEME_GENERIC: PdfTheme = {
  id: 'generic',
  serifFamily: 'Lora',
  monoFamily: 'JetBrains Mono',
  pageBg: '#fbf9f4',
  text: '#1d1815',
  muted: '#75695a',
  accent: '#8a5a2b',
  danger: '#8a2a2a',
  divider: '✦',
};

/**
 * Map a (loosely-typed) detected genre string from the world generator
 * to one of the three concrete themes. Anything we don't have a curated
 * theme for falls through to generic so the PDF always looks intentional.
 *
 * The world generator can emit: 'noir', 'sci-fi', 'gothic',
 * 'cyberpunk', 'western', 'generic'. Demo focus is the three themes
 * below; gothic/cyberpunk/western intentionally land on `generic` for
 * round-one quality control (no Latin-ext gaps from genre-specific
 * fonts).
 */
export function pickTheme(genre: string | undefined): PdfTheme {
  switch (genre) {
    case 'noir':
      return THEME_NOIR;
    case 'sci-fi':
    case 'space':
    case 'cyberpunk':
      // sci-fi palette covers cold/neon settings — cyberpunk gets the same
      // chrome/cyan treatment until we curate a dedicated cyber theme.
      return THEME_SCI_FI;
    default:
      return THEME_GENERIC;
  }
}

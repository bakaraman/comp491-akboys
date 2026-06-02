/**
 * CaseFileDocument.tsx — Premium bilingual case-file PDF document (#59 + #pdf-premium)
 *
 * Renders a 5-page case file from `CaseFileContent` styled like a 1940s
 * declassified police dossier. Every page is framed by hairline corner
 * brackets, banded with a CONFIDENTIAL classification stripe at top, and
 * layered with a faint diagonal "CASE FILE" watermark. Major design
 * elements (added in the premium redesign):
 *
 *   • Bracket Corner Page Frame      — L-shaped strokes at 4 corners
 *   • Classification Header Strip    — top band: CONFIDENTIAL · case# · EYES ONLY
 *   • Diagonal Repeating Watermark   — low-opacity rotated text grid
 *   • Embossed Circular Seal         — bureau seal w/ ring text (cover + verdict)
 *   • Polaroid Cover Photo           — opening image with skewed tape corners
 *   • Double-Ring Portrait Frame     — NPC initials in concentric ring
 *   • Suspect Stamp Overlay          — rotated red ink stamp on culprit
 *   • Hour-Pillar Timeline Spine     — central vertical bar with hour ticks
 *   • Drop Cap                       — first letter of conclusion in 48pt italic
 *   • Polaroid Evidence Card         — white card with tape, for found evidence
 *   • Typewriter Signature Block     — Filed by / Date / Badge with dotted rules
 *   • Ornamental Asterism Divider    — diamond glyph between sections
 *
 * Genre theming (noir / sci-fi / generic) drives palette + accent only.
 * Layout, frames, and stamps are the same shape across themes so the
 * "premium dossier" identity is consistent regardless of mystery type.
 *
 * @author AKBOYS Team
 * @since 2026-05-14 (original) · 2026-05-21 (premium redesign)
 */
import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, Svg, Circle, Line, Path, G } from '@react-pdf/renderer';

import type { PdfTheme } from './genre-theme.js';
import {
  pdfStrings,
  type CaseFileContent,
  type CaseFileEvent,
  type CaseFileItem,
  type CaseFileNpc,
  type PdfStrings,
} from './case-file-content.js';

interface DocProps {
  content: CaseFileContent;
  theme: PdfTheme;
}

/* ====================================================================== */
/*  PALETTE HELPERS                                                       */
/* ====================================================================== */

/** Lightweight RGBA tint without a color library. Tolerates invalid input. */
function transparent(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function blendDanger(theme: PdfTheme): string {
  return transparent(theme.danger, 0.08);
}

/* ====================================================================== */
/*  DECORATIVE PRIMITIVES                                                 */
/* ====================================================================== */

/**
 * L-shaped corner brackets at each page corner — a hairline "exhibit
 * board" frame that suggests forensic precision without a heavy border.
 * Each leg is `armPx` long; the frame inset is `insetPx` from page edge.
 */
function CornerBrackets({ theme, insetPx = 18, armPx = 22 }: { theme: PdfTheme; insetPx?: number; armPx?: number }): React.ReactElement {
  const color = transparent(theme.accent, 0.55);
  const stroke = 0.9;
  // We render a single 595×842 SVG (A4 default) covering the page; absolute
  // positioning keeps it in the right spot regardless of inner layout.
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    >
      <Svg style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} viewBox="0 0 595 842">
        {/* top-left */}
        <Path d={`M${insetPx},${insetPx + armPx} L${insetPx},${insetPx} L${insetPx + armPx},${insetPx}`} stroke={color} strokeWidth={stroke} fill="none" />
        {/* top-right */}
        <Path d={`M${595 - insetPx - armPx},${insetPx} L${595 - insetPx},${insetPx} L${595 - insetPx},${insetPx + armPx}`} stroke={color} strokeWidth={stroke} fill="none" />
        {/* bottom-left */}
        <Path d={`M${insetPx},${842 - insetPx - armPx} L${insetPx},${842 - insetPx} L${insetPx + armPx},${842 - insetPx}`} stroke={color} strokeWidth={stroke} fill="none" />
        {/* bottom-right */}
        <Path d={`M${595 - insetPx - armPx},${842 - insetPx} L${595 - insetPx},${842 - insetPx} L${595 - insetPx},${842 - insetPx - armPx}`} stroke={color} strokeWidth={stroke} fill="none" />
      </Svg>
    </View>
  );
}

/**
 * Diagonal "CASE FILE · VS-XXXX-XXXX" watermark tiled across the page at
 * ~4% opacity. Each row is offset on the x-axis to break the obvious grid
 * pattern. Rotated -28° to evoke real security paper.
 */
function DiagonalWatermark({ theme, label }: { theme: PdfTheme; label: string }): React.ReactElement {
  const rows = 9;
  const cols = 4;
  const rowSpacing = 110;
  const colSpacing = 240;
  const color = transparent(theme.text, 0.045);
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
      }}
    >
      {Array.from({ length: rows }).map((_, r) => (
        <View
          key={r}
          style={{
            position: 'absolute',
            top: r * rowSpacing - 40,
            left: -80 + (r % 2) * 120,
            flexDirection: 'row',
            transform: 'rotate(-28deg)',
          }}
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Text
              key={c}
              style={{
                fontFamily: theme.monoFamily,
                fontSize: 22,
                color,
                letterSpacing: 6,
                marginRight: colSpacing - 220,
                textTransform: 'uppercase',
              }}
            >
              {label}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * Classification stripe band — appears at the top of every page.
 * Left: CONFIDENTIAL · case#. Right: EYES ONLY · page label.
 */
function ClassificationStripe({ theme, leftLabel, rightLabel, caseNumber }: {
  theme: PdfTheme;
  leftLabel: string;
  rightLabel: string;
  caseNumber: string;
}): React.ReactElement {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: transparent(theme.danger, 0.85),
        paddingVertical: 5,
        paddingHorizontal: 10,
        marginBottom: 14,
      }}
    >
      <Text style={{ fontFamily: theme.monoFamily, fontWeight: 700, fontSize: 8, color: theme.pageBg, letterSpacing: 3 }}>
        {leftLabel} · {caseNumber}
      </Text>
      <Text style={{ fontFamily: theme.monoFamily, fontWeight: 700, fontSize: 8, color: theme.pageBg, letterSpacing: 3 }}>
        {rightLabel}
      </Text>
    </View>
  );
}

/**
 * Embossed circular bureau seal — concentric rings + decorative tick
 * marks + centered glyph framed by a diamond. The bureau-name ring text
 * is rendered as individual glyphs positioned around the outer ring
 * (TextPath isn't exported by @react-pdf, so we project each character
 * to its (x,y,rotation) manually). All ink at ~55% accent opacity so the
 * stamp reads as "pressed onto the paper" rather than printed sharp.
 */
function BureauSeal({ theme, sizePx, ringText, centerLabel, accentOverride }: {
  theme: PdfTheme;
  sizePx: number;
  ringText: string;
  centerLabel: string;
  accentOverride?: string;
}): React.ReactElement {
  const color = accentOverride ?? transparent(theme.accent, 0.55);
  const half = sizePx / 2;
  const outerR = half - 3;
  const innerR = half - 12;
  const textR = half - 8;
  // Project each character of ringText onto a circular arc spanning the
  // top half (from -150° to -30°). Each glyph is centered at its (x,y)
  // and rotated tangent to the circle.
  const chars = ringText.split('');
  const startDeg = -150;
  const endDeg = -30;
  const totalDeg = endDeg - startDeg;
  // Only attempt the ring text when the seal is large enough to read it.
  const showRingText = sizePx >= 80 && chars.length > 0;
  const fontSize = Math.max(5, sizePx * 0.055);
  return (
    <Svg width={sizePx} height={sizePx} viewBox={`0 0 ${sizePx} ${sizePx}`}>
      <G>
        <Circle cx={half} cy={half} r={outerR} stroke={color} strokeWidth={1.6} fill="none" />
        <Circle cx={half} cy={half} r={innerR} stroke={color} strokeWidth={0.8} fill="none" />
        {/* Decorative tick marks around the inner ring (8 marks). */}
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i / 8) * 2 * Math.PI - Math.PI / 2;
          const x1 = half + Math.cos(angle) * (innerR - 1);
          const y1 = half + Math.sin(angle) * (innerR - 1);
          const x2 = half + Math.cos(angle) * (innerR - 6);
          const y2 = half + Math.sin(angle) * (innerR - 6);
          return <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={0.6} />;
        })}
        {/* Ring text — per-glyph projection */}
        {showRingText && chars.map((ch, i) => {
          const t = chars.length === 1 ? 0.5 : i / (chars.length - 1);
          const deg = startDeg + t * totalDeg;
          const rad = (deg * Math.PI) / 180;
          const x = half + Math.cos(rad) * textR;
          const y = half + Math.sin(rad) * textR;
          // Tangent rotation: char baseline follows the circle.
          const rot = deg + 90;
          return (
            <Text
              key={i}
              x={x}
              y={y}
              textAnchor="middle"
              fill={color}
              transform={`rotate(${rot}, ${x}, ${y})`}
              style={{ fontFamily: theme.monoFamily, fontWeight: 700, fontSize, letterSpacing: 0 }}
            >
              {ch}
            </Text>
          );
        })}
      </G>
      {/* Centre monogram — single uppercase glyph framed by a tiny diamond. */}
      <G>
        <Path
          d={`M ${half},${half - 9} L ${half + 9},${half} L ${half},${half + 9} L ${half - 9},${half} Z`}
          stroke={color}
          strokeWidth={0.8}
          fill="none"
        />
      </G>
      <Text
        x={half}
        y={half + Math.max(3, sizePx * 0.035)}
        textAnchor="middle"
        fill={color}
        style={{ fontFamily: theme.monoFamily, fontWeight: 700, fontSize: Math.max(8, sizePx * 0.09), letterSpacing: 2 }}
      >
        {centerLabel}
      </Text>
    </Svg>
  );
}

/**
 * The big climax stamp — a circular wet-ink seal with the verdict
 * inside. Replaces the old rectangular ribbon stamp. Renders at the
 * given rotation so it feels hand-pressed.
 */
function VerdictSeal({ label, color, sizePx = 130, rotate = -6 }: {
  label: string;
  color: string;
  sizePx?: number;
  rotate?: number;
}): React.ReactElement {
  const half = sizePx / 2;
  const outerR = half - 2;
  const innerR = half - 10;
  return (
    <View
      style={{
        transform: `rotate(${rotate}deg)`,
        alignSelf: 'center',
        marginTop: 8,
      }}
    >
      <Svg width={sizePx} height={sizePx} viewBox={`0 0 ${sizePx} ${sizePx}`}>
        <Circle cx={half} cy={half} r={outerR} stroke={color} strokeWidth={2.4} fill="none" />
        <Circle cx={half} cy={half} r={innerR} stroke={color} strokeWidth={1} fill="none" />
        {/* Decorative double dashes on top + bottom inner ring. */}
        <Line x1={half - 18} y1={half - innerR + 2} x2={half + 18} y2={half - innerR + 2} stroke={color} strokeWidth={0.6} strokeDasharray="2 3" />
        <Line x1={half - 18} y1={half + innerR - 2} x2={half + 18} y2={half + innerR - 2} stroke={color} strokeWidth={0.6} strokeDasharray="2 3" />
      </Svg>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: sizePx,
          height: sizePx,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            fontFamily: 'JetBrains Mono',
            fontWeight: 700,
            fontSize: Math.max(10, sizePx * 0.105),
            letterSpacing: 2.5,
            color,
            textTransform: 'uppercase',
            textAlign: 'center',
          }}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

/**
 * Asterism divider — a publishing-grade ornament that replaces a plain
 * horizontal rule. Two short hairlines flanking a centered diamond.
 */
function Asterism({ theme }: { theme: PdfTheme }): React.ReactElement {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 14 }}>
      <View style={{ width: 80, height: 0.6, backgroundColor: transparent(theme.muted, 0.6) }} />
      <Text style={{ fontFamily: theme.monoFamily, color: theme.accent, fontSize: 10, marginHorizontal: 10 }}>
        {theme.divider} ◇ {theme.divider}
      </Text>
      <View style={{ width: 80, height: 0.6, backgroundColor: transparent(theme.muted, 0.6) }} />
    </View>
  );
}

/**
 * Section heading with overline tag + italic display title — keeps the
 * original feel but adds a thin accent rule beneath for typographic
 * polish.
 */
function SectionHeading({ label, theme, overline }: { label: string; theme: PdfTheme; overline?: string }): React.ReactElement {
  return (
    <View style={{ marginBottom: 14, alignItems: 'center' }}>
      {overline && (
        <Text
          style={{
            fontFamily: theme.monoFamily,
            fontSize: 8,
            letterSpacing: 5,
            color: theme.muted,
            textTransform: 'uppercase',
            marginBottom: 5,
          }}
        >
          {overline}
        </Text>
      )}
      <Text
        style={{
          fontFamily: theme.serifFamily,
          fontStyle: 'italic',
          fontSize: 28,
          color: theme.text,
          letterSpacing: 0.5,
          marginBottom: 6,
        }}
      >
        {label}
      </Text>
      <View style={{ width: 90, height: 1, backgroundColor: theme.accent }} />
    </View>
  );
}

/**
 * Typewriter-styled signature block — "Filed by ___ / Date ___ / Badge ___"
 * with each value sitting on a dotted underline. Anchors the bottom of
 * pages where it suits (cover, evidence, conclusion).
 */
function SignatureBlock({ theme, s, content }: { theme: PdfTheme; s: PdfStrings; content: CaseFileContent }): React.ReactElement {
  const lead = content.players[0]?.name ?? '—';
  const dateText = formatDate(content.playedOn, content.locale);
  return (
    <View style={{ marginTop: 18, flexDirection: 'row', justifyContent: 'space-between', gap: 14 }}>
      <SignatureField theme={theme} label={`${s.filedBy}`} value={lead} sublabel={s.leadInvestigator} />
      <SignatureField theme={theme} label={`${s.dateLabel}`} value={dateText} />
      <SignatureField theme={theme} label={`${s.badgeLabel}`} value={content.caseNumber} mono />
    </View>
  );
}

function SignatureField({ theme, label, value, sublabel, mono }: {
  theme: PdfTheme;
  label: string;
  value: string;
  sublabel?: string;
  mono?: boolean;
}): React.ReactElement {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ fontFamily: theme.monoFamily, fontSize: 7, color: theme.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 3 }}>
        {label}
      </Text>
      <Text
        style={{
          fontFamily: mono ? theme.monoFamily : theme.serifFamily,
          fontStyle: mono ? 'normal' : 'italic',
          fontSize: 12,
          color: theme.text,
          paddingBottom: 2,
          borderBottomWidth: 0.6,
          borderBottomColor: transparent(theme.muted, 0.5),
          borderBottomStyle: 'dashed',
        }}
      >
        {value}
      </Text>
      {sublabel && (
        <Text style={{ fontFamily: theme.monoFamily, fontSize: 6.5, color: theme.muted, letterSpacing: 1.5, marginTop: 2 }}>
          {sublabel}
        </Text>
      )}
    </View>
  );
}

/**
 * Polaroid photo frame for the opening image on the cover page — white
 * card with a thicker bottom chin, two skewed tape rectangles overlapping
 * the top corners. Lightly rotated to feel "pinned to the corkboard".
 */
function PolaroidPhoto({ src, rotate = -2, widthPx = 280, theme }: {
  src: string;
  rotate?: number;
  widthPx?: number;
  theme: PdfTheme;
}): React.ReactElement {
  const heightPx = Math.round(widthPx * 0.62);
  const tapeColor = transparent(theme.muted, 0.5);
  return (
    <View
      style={{
        alignSelf: 'center',
        transform: `rotate(${rotate}deg)`,
        marginVertical: 16,
      }}
    >
      {/* Card */}
      <View
        style={{
          backgroundColor: '#f6f1e3',
          padding: 9,
          paddingBottom: 28,
          borderRadius: 1,
        }}
      >
        <Image src={src} style={{ width: widthPx, height: heightPx, objectFit: 'cover' }} />
      </View>
      {/* Tape — top left */}
      <View
        style={{
          position: 'absolute',
          top: -8,
          left: 24,
          width: 52,
          height: 16,
          backgroundColor: tapeColor,
          transform: 'rotate(-12deg)',
        }}
      />
      {/* Tape — top right */}
      <View
        style={{
          position: 'absolute',
          top: -6,
          right: 18,
          width: 50,
          height: 16,
          backgroundColor: tapeColor,
          transform: 'rotate(10deg)',
        }}
      />
    </View>
  );
}

/* ====================================================================== */
/*  COVER PAGE                                                            */
/* ====================================================================== */

function CoverPage({ content, theme }: DocProps): React.ReactElement {
  const s = pdfStrings(content.locale);
  return (
    <Page size="A4" style={[styles.page, { backgroundColor: theme.pageBg }]}>
      <DiagonalWatermark theme={theme} label={`${s.caseFileLabel} · ${content.caseNumber}`} />
      <CornerBrackets theme={theme} />

      <ClassificationStripe
        theme={theme}
        leftLabel={s.classified}
        rightLabel={s.eyesOnly}
        caseNumber={content.caseNumber}
      />

      {/* Top row: small bureau seal left, incident date stamp right */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <View style={{ width: 56, height: 56 }}>
          <BureauSeal theme={theme} sizePx={56} ringText={s.bureauName} centerLabel="VS" />
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: theme.monoFamily, fontSize: 7, letterSpacing: 2.5, color: theme.muted, textTransform: 'uppercase', marginBottom: 2 }}>
            {s.incidentDate}
          </Text>
          <Text style={{ fontFamily: theme.monoFamily, fontWeight: 700, fontSize: 11, color: theme.text, letterSpacing: 2 }}>
            {formatDate(content.playedOn, content.locale).toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.coverBody}>
        <Text style={{ fontFamily: theme.monoFamily, color: theme.accent, fontSize: 11, letterSpacing: 6, marginBottom: 18, textTransform: 'uppercase' }}>
          {s.caseFileLabel}
        </Text>
        <Text
          style={{
            fontFamily: theme.serifFamily,
            fontStyle: 'italic',
            fontWeight: 700,
            fontSize: 40,
            color: theme.text,
            textAlign: 'center',
            lineHeight: 1.12,
            marginBottom: 10,
            paddingHorizontal: 30,
          }}
        >
          {content.title}
        </Text>

        {/* Scene / synopsis line */}
        <Text style={{ fontFamily: theme.monoFamily, color: theme.muted, fontSize: 7.5, letterSpacing: 4, marginBottom: 4, textTransform: 'uppercase' }}>
          {s.synopsisLabel}
        </Text>
        <Text
          style={{
            fontFamily: theme.serifFamily,
            fontSize: 13,
            color: theme.muted,
            textAlign: 'center',
            lineHeight: 1.5,
            maxWidth: 430,
            marginBottom: 4,
          }}
        >
          {content.setting}
        </Text>

        {/* Polaroid opening photo */}
        {content.openingImageUrl && (
          <PolaroidPhoto src={content.openingImageUrl} theme={theme} />
        )}

        <Asterism theme={theme} />

        {/* Detectives roster */}
        <Text style={{ fontFamily: theme.monoFamily, fontSize: 8, letterSpacing: 4, color: theme.muted, textTransform: 'uppercase', marginBottom: 8 }}>
          {s.sectionCover}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14, marginBottom: 22 }}>
          {content.players.map((p) => (
            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.color }} />
              <Text style={{ fontFamily: theme.serifFamily, fontSize: 12, color: theme.text }}>
                {p.name}
              </Text>
            </View>
          ))}
        </View>

        <VerdictSeal label={content.verdictLine} color={theme.danger} sizePx={140} rotate={-7} />
      </View>

      <View style={styles.coverFooter}>
        <Text style={{ fontFamily: theme.monoFamily, fontSize: 7.5, color: theme.muted, letterSpacing: 2 }}>
          {s.coverFooter}
        </Text>
        <Text style={{ fontFamily: theme.monoFamily, fontSize: 7.5, color: theme.muted, letterSpacing: 2 }}>
          {s.bureauEst}
        </Text>
      </View>
    </Page>
  );
}

/* ====================================================================== */
/*  DRAMATIS PERSONAE                                                     */
/* ====================================================================== */

function PortraitFrame({ initial, color, theme }: { initial: string; color: string; theme: PdfTheme }): React.ReactElement {
  // Double-ring circular frame: outer thick ring + inner thin ring + 1mm gap.
  return (
    <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: 44, height: 44, borderRadius: 22,
          borderWidth: 1.2, borderColor: color,
        }}
      />
      <View
        style={{
          width: 36, height: 36, borderRadius: 18,
          borderWidth: 0.6, borderColor: color,
          backgroundColor: color,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Text style={{ fontFamily: theme.serifFamily, fontWeight: 700, fontSize: 16, color: theme.pageBg }}>
          {initial}
        </Text>
      </View>
    </View>
  );
}

function SuspectStampOverlay({ label, theme }: { label: string; theme: PdfTheme }): React.ReactElement {
  // Rotated double-stroked rectangle, partly overflowing — feels stamped.
  return (
    <View
      style={{
        position: 'absolute',
        top: 14,
        right: -8,
        transform: 'rotate(-9deg)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderWidth: 1.8,
        borderColor: theme.danger,
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 2, left: 2, right: 2, bottom: 2,
          borderWidth: 0.6,
          borderColor: theme.danger,
        }}
      />
      <Text
        style={{
          fontFamily: theme.monoFamily,
          fontWeight: 700,
          fontSize: 11,
          color: theme.danger,
          letterSpacing: 3,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function NpcCard({ npc, theme, s }: { npc: CaseFileNpc; theme: PdfTheme; s: PdfStrings }): React.ReactElement {
  const accent = npc.isCulprit ? theme.danger : theme.accent;
  return (
    <View
      style={[
        styles.npcCard,
        {
          backgroundColor: npc.isCulprit ? blendDanger(theme) : transparent(theme.text, 0.04),
          borderColor: accent,
          borderWidth: npc.isCulprit ? 1.4 : 0.6,
        },
      ]}
    >
      {npc.isCulprit && <SuspectStampOverlay label={s.suspectStamp} theme={theme} />}

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <PortraitFrame initial={npc.name.charAt(0).toUpperCase()} color={accent} theme={theme} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ fontFamily: theme.serifFamily, fontWeight: 700, fontSize: 14, color: theme.text }}>
            {npc.name}
          </Text>
          <Text style={{ fontFamily: theme.monoFamily, fontSize: 7.5, color: theme.muted, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 2 }}>
            {npc.role}
          </Text>
        </View>
      </View>

      <View style={{ height: 0.4, backgroundColor: transparent(theme.muted, 0.4), marginBottom: 7 }} />

      <Text style={{ fontFamily: theme.serifFamily, fontSize: 10, color: theme.text, lineHeight: 1.55, marginBottom: 6 }}>
        {npc.description}
      </Text>
      {npc.knownInfo.length > 0 && (
        <Text style={{ fontFamily: theme.serifFamily, fontStyle: 'italic', fontSize: 9, color: theme.muted, lineHeight: 1.5 }}>
          {npc.knownInfo}
        </Text>
      )}
    </View>
  );
}

function DramatisPersonaePage({ content, theme }: DocProps): React.ReactElement {
  const s = pdfStrings(content.locale);
  return (
    <Page size="A4" style={[styles.page, { backgroundColor: theme.pageBg }]}>
      <DiagonalWatermark theme={theme} label={`${s.caseFileLabel} · ${content.caseNumber}`} />
      <CornerBrackets theme={theme} />
      <ClassificationStripe theme={theme} leftLabel={s.classified} rightLabel={s.sectionDramatis.toUpperCase()} caseNumber={content.caseNumber} />

      <SectionHeading label={s.sectionDramatis} theme={theme} overline={s.bureauName} />

      <View style={styles.npcGrid}>
        {content.npcs.map((n) => (
          <NpcCard key={n.id} npc={n} theme={theme} s={s} />
        ))}
      </View>

      <PageFooter content={content} theme={theme} />
    </Page>
  );
}

/* ====================================================================== */
/*  CHAIN OF EVENTS — hour-pillar timeline                                */
/* ====================================================================== */

function EventRow({ event, theme, s, index, isLast }: {
  event: CaseFileEvent;
  theme: PdfTheme;
  s: PdfStrings;
  index: number;
  isLast: boolean;
}): React.ReactElement {
  const accent = event.isCulpritAction ? theme.danger : theme.accent;
  return (
    <View style={{ flexDirection: 'row', marginBottom: 14, position: 'relative' }}>
      {/* Left gutter: time stamp box */}
      <View style={{ width: 64, alignItems: 'flex-end', paddingRight: 10, paddingTop: 4 }}>
        <Text style={{ fontFamily: theme.monoFamily, fontWeight: 700, fontSize: 14, color: accent, letterSpacing: 1 }}>
          {event.time}
        </Text>
        <Text style={{ fontFamily: theme.monoFamily, fontSize: 7, color: theme.muted, letterSpacing: 2, marginTop: 2 }}>
          {String(index + 1).padStart(2, '0')}
        </Text>
      </View>

      {/* Centre pillar: node + connector line */}
      <View style={{ width: 28, alignItems: 'center', position: 'relative' }}>
        {/* Vertical line — drawn between nodes only */}
        {!isLast && (
          <View
            style={{
              position: 'absolute',
              top: 18,
              bottom: -14,
              width: 1.4,
              backgroundColor: transparent(accent, 0.45),
            }}
          />
        )}
        {/* Node — filled circle, doubled for culprit moves */}
        <View
          style={{
            width: 14, height: 14, borderRadius: 7,
            backgroundColor: accent,
            marginTop: 4,
          }}
        />
        {event.isCulpritAction && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              width: 22, height: 22, borderRadius: 11,
              borderWidth: 1, borderColor: accent,
            }}
          />
        )}
      </View>

      {/* Body card */}
      <View
        style={{
          flex: 1,
          padding: 10,
          paddingLeft: 12,
          backgroundColor: event.isCulpritAction ? blendDanger(theme) : transparent(theme.text, 0.04),
          borderRadius: 3,
          borderLeftWidth: event.isCulpritAction ? 2.5 : 0,
          borderLeftColor: theme.danger,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 }}>
          <Text style={{ fontFamily: theme.serifFamily, fontStyle: 'italic', fontSize: 12, color: theme.text }}>
            {event.roomName}
          </Text>
          {event.actorName.length > 0 && (
            <Text style={{ fontFamily: theme.monoFamily, fontSize: 8, color: theme.muted, letterSpacing: 1.2, marginLeft: 8, textTransform: 'uppercase' }}>
              · {event.actorRole ? `${event.actorRole} ` : ''}{event.actorName}
            </Text>
          )}
        </View>
        {event.isCulpritAction && (
          <View style={{ alignSelf: 'flex-start', paddingHorizontal: 5, paddingVertical: 2, backgroundColor: theme.danger, marginBottom: 5 }}>
            <Text style={{ fontFamily: theme.monoFamily, fontWeight: 700, fontSize: 6.5, color: theme.pageBg, letterSpacing: 2 }}>
              {s.culpritActionBadge}
            </Text>
          </View>
        )}
        <Text style={{ fontFamily: theme.serifFamily, fontSize: 10, color: theme.text, lineHeight: 1.55 }}>
          {event.description}
        </Text>
      </View>
    </View>
  );
}

function TimelinePage({ content, theme }: DocProps): React.ReactElement {
  const s = pdfStrings(content.locale);
  return (
    <Page size="A4" style={[styles.page, { backgroundColor: theme.pageBg }]}>
      <DiagonalWatermark theme={theme} label={`${s.caseFileLabel} · ${content.caseNumber}`} />
      <CornerBrackets theme={theme} />
      <ClassificationStripe theme={theme} leftLabel={s.classified} rightLabel={s.sectionTimeline.toUpperCase()} caseNumber={content.caseNumber} />

      <SectionHeading label={s.sectionTimeline} theme={theme} overline={s.bureauName} />

      <View>
        {content.events.map((e, i) => (
          <EventRow key={i} event={e} theme={theme} s={s} index={i} isLast={i === content.events.length - 1} />
        ))}
      </View>

      <PageFooter content={content} theme={theme} />
    </Page>
  );
}

/* ====================================================================== */
/*  EVIDENCE — polaroid + plain card mix                                  */
/* ====================================================================== */

function EvidencePolaroid({ item, theme, accent, exhibitTag }: {
  item: CaseFileItem;
  theme: PdfTheme;
  accent: string;
  exhibitTag: string;
}): React.ReactElement {
  return (
    <View
      style={{
        backgroundColor: '#f6f1e3',
        padding: 10,
        paddingBottom: 18,
        marginBottom: 10,
        borderRadius: 1,
        borderWidth: 0.6,
        borderColor: transparent(theme.text, 0.15),
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <Text style={{ fontFamily: theme.serifFamily, fontWeight: 700, fontSize: 11, color: '#1c1611' }}>
          {item.name}
        </Text>
        <Text style={{ fontFamily: theme.monoFamily, fontSize: 7, color: accent, letterSpacing: 2 }}>
          {exhibitTag}
        </Text>
      </View>
      <View style={{ height: 0.4, backgroundColor: transparent('#1c1611', 0.25), marginBottom: 5 }} />
      <Text style={{ fontFamily: theme.serifFamily, fontSize: 9.5, color: '#3a2e22', lineHeight: 1.5 }}>
        {item.description}
      </Text>
    </View>
  );
}

function EvidencePage({ content, theme }: DocProps): React.ReactElement {
  const s = pdfStrings(content.locale);
  return (
    <Page size="A4" style={[styles.page, { backgroundColor: theme.pageBg }]}>
      <DiagonalWatermark theme={theme} label={`${s.caseFileLabel} · ${content.caseNumber}`} />
      <CornerBrackets theme={theme} />
      <ClassificationStripe theme={theme} leftLabel={s.classified} rightLabel={s.sectionEvidence.toUpperCase()} caseNumber={content.caseNumber} />

      <SectionHeading label={s.sectionEvidence} theme={theme} overline={s.bureauName} />

      <View style={{ flexDirection: 'row', gap: 14, marginBottom: 14 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <View style={{ width: 6, height: 6, backgroundColor: theme.accent, marginRight: 6 }} />
            <Text style={{ fontFamily: theme.monoFamily, fontSize: 9, color: theme.accent, letterSpacing: 2.5, textTransform: 'uppercase' }}>
              {s.foundLabel}
            </Text>
          </View>
          {content.evidenceFound.length > 0 ? content.evidenceFound.map((i, idx) => (
            <EvidencePolaroid
              key={i.id}
              item={i}
              theme={theme}
              accent={theme.accent}
              exhibitTag={`EX-A${String(idx + 1).padStart(2, '0')}`}
            />
          )) : (
            <Text style={{ fontFamily: theme.serifFamily, fontStyle: 'italic', fontSize: 10, color: theme.muted }}>
              —
            </Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <View style={{ width: 6, height: 6, backgroundColor: theme.danger, marginRight: 6 }} />
            <Text style={{ fontFamily: theme.monoFamily, fontSize: 9, color: theme.danger, letterSpacing: 2.5, textTransform: 'uppercase' }}>
              {s.missedLabel}
            </Text>
          </View>
          {content.evidenceMissed.length > 0 ? content.evidenceMissed.map((i, idx) => (
            <EvidencePolaroid
              key={i.id}
              item={i}
              theme={theme}
              accent={theme.danger}
              exhibitTag={`EX-B${String(idx + 1).padStart(2, '0')}`}
            />
          )) : (
            <Text style={{ fontFamily: theme.serifFamily, fontStyle: 'italic', fontSize: 10, color: theme.muted }}>
              —
            </Text>
          )}
        </View>
      </View>

      {content.redHerrings.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <View style={{ width: 6, height: 6, backgroundColor: theme.muted, marginRight: 6 }} />
            <Text style={{ fontFamily: theme.monoFamily, fontSize: 9, color: theme.muted, letterSpacing: 2.5, textTransform: 'uppercase' }}>
              {s.redHerringLabel}
            </Text>
          </View>
          {content.redHerrings.map((i, idx) => (
            <EvidencePolaroid
              key={i.id}
              item={i}
              theme={theme}
              accent={theme.muted}
              exhibitTag={`EX-X${String(idx + 1).padStart(2, '0')}`}
            />
          ))}
        </View>
      )}

      <PageFooter content={content} theme={theme} />
    </Page>
  );
}

/* ====================================================================== */
/*  CONCLUSION — final report letter                                      */
/* ====================================================================== */

function ConclusionPage({ content, theme }: DocProps): React.ReactElement {
  const s = pdfStrings(content.locale);
  const conclusionText = (content.conclusion || '').trim();
  const dropCap = conclusionText.charAt(0) || '—';
  const rest = conclusionText.slice(1);

  return (
    <Page size="A4" style={[styles.page, { backgroundColor: theme.pageBg }]}>
      <DiagonalWatermark theme={theme} label={`${s.caseFileLabel} · ${content.caseNumber}`} />
      <CornerBrackets theme={theme} />
      <ClassificationStripe theme={theme} leftLabel={s.classified} rightLabel={s.finalReport} caseNumber={content.caseNumber} />

      <SectionHeading label={s.sectionConclusion} theme={theme} overline={s.finalReport} />

      {/* Letter body — drop-cap first letter, body wraps to the right. */}
      <View
        style={{
          marginTop: 8,
          padding: 20,
          backgroundColor: transparent(theme.text, 0.04),
          borderLeftWidth: 3,
          borderLeftColor: theme.accent,
        }}
      >
        <View style={{ flexDirection: 'row' }}>
          <Text
            style={{
              fontFamily: theme.serifFamily,
              fontStyle: 'italic',
              fontWeight: 700,
              fontSize: 52,
              color: theme.accent,
              lineHeight: 1,
              marginRight: 8,
              marginTop: -4,
            }}
          >
            {dropCap}
          </Text>
          <Text
            style={{
              flex: 1,
              fontFamily: theme.serifFamily,
              fontStyle: 'italic',
              fontSize: 13,
              color: theme.text,
              lineHeight: 1.75,
            }}
          >
            {rest}
          </Text>
        </View>
      </View>

      {/* Motive / key evidence summary strip */}
      <View style={{ flexDirection: 'row', gap: 14, marginTop: 16 }}>
        <View style={{ flex: 1, padding: 10, borderWidth: 0.6, borderColor: transparent(theme.accent, 0.55) }}>
          <Text style={{ fontFamily: theme.monoFamily, fontSize: 7.5, color: theme.muted, letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 4 }}>
            {s.motiveLabel}
          </Text>
          <Text style={{ fontFamily: theme.serifFamily, fontSize: 11, color: theme.text, lineHeight: 1.5 }}>
            {content.motiveShort}
          </Text>
        </View>
        <View style={{ flex: 1, padding: 10, borderWidth: 0.6, borderColor: transparent(theme.accent, 0.55) }}>
          <Text style={{ fontFamily: theme.monoFamily, fontSize: 7.5, color: theme.muted, letterSpacing: 2.5, textTransform: 'uppercase', marginBottom: 4 }}>
            {s.keyEvidenceLabel}
          </Text>
          <Text style={{ fontFamily: theme.serifFamily, fontSize: 11, color: theme.text, lineHeight: 1.5 }}>
            {content.keyEvidenceName}
          </Text>
        </View>
      </View>

      {/* Verdict seal + bureau seal side-by-side */}
      <View style={{ marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }}>
        <VerdictSeal label={content.verdictLine} color={theme.danger} sizePx={130} rotate={6} />
        <View style={{ width: 90, height: 90 }}>
          <BureauSeal theme={theme} sizePx={90} ringText={s.bureauName} centerLabel="VS" />
        </View>
      </View>

      {/* Signature block */}
      <SignatureBlock theme={theme} s={s} content={content} />

      <PageFooter content={content} theme={theme} />
    </Page>
  );
}

/* ====================================================================== */
/*  SHARED HEADER/FOOTER                                                  */
/* ====================================================================== */

function PageFooter({ content, theme }: { content: CaseFileContent; theme: PdfTheme }): React.ReactElement {
  const s = pdfStrings(content.locale);
  return (
    <View style={[styles.footerStrip, { borderColor: transparent(theme.muted, 0.45) }]}>
      <Text style={{ fontFamily: theme.monoFamily, fontSize: 7, color: theme.muted, letterSpacing: 2 }}>
        {s.coverFooter}
      </Text>
      <Text
        render={({ pageNumber, totalPages }) => `${s.pageLabel.toUpperCase()} ${pageNumber} / ${totalPages}`}
        style={{ fontFamily: theme.monoFamily, fontSize: 7, color: theme.muted, letterSpacing: 2 }}
      />
    </View>
  );
}

/* ====================================================================== */
/*  TOP-LEVEL DOCUMENT                                                    */
/* ====================================================================== */

export function CaseFileDocument({ content, theme }: DocProps): React.ReactElement {
  return (
    <Document title={`Velvet Shadow — ${content.title}`} author="The Velvet Shadow">
      <CoverPage content={content} theme={theme} />
      <DramatisPersonaePage content={content} theme={theme} />
      <TimelinePage content={content} theme={theme} />
      <EvidencePage content={content} theme={theme} />
      <ConclusionPage content={content} theme={theme} />
    </Document>
  );
}

/* ====================================================================== */
/*  HELPERS                                                               */
/* ====================================================================== */

function formatDate(ms: number, locale: 'tr' | 'en'): string {
  const d = new Date(ms);
  return d.toLocaleDateString(locale === 'en' ? 'en-US' : 'tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const styles = StyleSheet.create({
  page: {
    padding: '34 42 30 42',
    flexDirection: 'column',
  },
  coverBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
  },
  coverFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.6,
    paddingTop: 6,
  },
  footerStrip: {
    position: 'absolute',
    bottom: 22,
    left: 42,
    right: 42,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.4,
    paddingTop: 4,
  },
  npcGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  npcCard: {
    width: '48.5%',
    padding: 12,
    borderRadius: 4,
    marginBottom: 4,
    position: 'relative',
    overflow: 'hidden',
  },
});

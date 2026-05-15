/**
 * CaseFileDocument.tsx — Premium bilingual case-file PDF document (#59)
 *
 * Renders a multi-page case file from `CaseFileContent` using the
 * @react-pdf/renderer JSX surface. Cover + Dramatis Personae + Chain of
 * Events + Evidence + Conclusion. Adapts colors + typography to the
 * detected genre via `PdfTheme`.
 *
 * Design intent: looks like a noir-era police case file — typewriter
 * monospace for clerical metadata, serif body, an embossed stamp for
 * the verdict. Sci-fi swaps to a corporate "classified report" palette.
 * Generic stays clean serif for everything else.
 *
 * @author AKBOYS Team
 * @since 2026-05-14
 */
import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, Svg, Circle, Rect, Line } from '@react-pdf/renderer';

import type { PdfTheme } from './genre-theme.js';
import {
  pdfStrings,
  type CaseFileContent,
  type CaseFileEvent,
  type CaseFileItem,
  type CaseFileNpc,
} from './case-file-content.js';

interface DocProps {
  content: CaseFileContent;
  theme: PdfTheme;
}

/* ------------------------------------------------------------------ */
/*  Stamp SVG — embossed verdict ribbon used on the cover              */
/* ------------------------------------------------------------------ */

function VerdictStamp({ label, color, rotate = -8 }: { label: string; color: string; rotate?: number }): React.ReactElement {
  // Render with @react-pdf <Svg/> primitives to get a vector stamp.
  return (
    <View
      style={{
        transform: `rotate(${rotate}deg)`,
        alignSelf: 'center',
        marginTop: 12,
      }}
    >
      <Svg width="220" height="120" viewBox="0 0 220 120">
        <Rect x="6" y="6" width="208" height="108" fill="none" stroke={color} strokeWidth="2" rx="6" />
        <Rect x="14" y="14" width="192" height="92" fill="none" stroke={color} strokeWidth="1" rx="3" />
        <Line x1="20" y1="56" x2="200" y2="56" stroke={color} strokeWidth="0.6" strokeDasharray="2 3" />
      </Svg>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 220,
          height: 120,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            fontFamily: 'JetBrains Mono',
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: 3,
            color,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Reusable divider                                                   */
/* ------------------------------------------------------------------ */

function Divider({ theme }: { theme: PdfTheme }): React.ReactElement {
  return (
    <View style={{ marginVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}>
      <View style={{ flex: 1, height: 0.6, backgroundColor: theme.muted, opacity: 0.4 }} />
      <Text style={{ fontFamily: theme.monoFamily, color: theme.accent, fontSize: 10, marginHorizontal: 8 }}>
        {theme.divider}
      </Text>
      <View style={{ flex: 1, height: 0.6, backgroundColor: theme.muted, opacity: 0.4 }} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Section heading                                                    */
/* ------------------------------------------------------------------ */

function SectionHeading({ label, theme }: { label: string; theme: PdfTheme }): React.ReactElement {
  return (
    <View style={{ marginBottom: 14, alignItems: 'center' }}>
      <Text
        style={{
          fontFamily: theme.monoFamily,
          fontSize: 9,
          letterSpacing: 4,
          color: theme.muted,
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        {theme.divider} · · · {theme.divider}
      </Text>
      <Text
        style={{
          fontFamily: theme.serifFamily,
          fontStyle: 'italic',
          fontSize: 26,
          color: theme.text,
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Cover                                                              */
/* ------------------------------------------------------------------ */

function CoverPage({ content, theme }: DocProps): React.ReactElement {
  const s = pdfStrings(content.locale);
  return (
    <Page size="A4" style={[styles.page, { backgroundColor: theme.pageBg }]}>
      {/* Background opening image (dimmed) */}
      {content.openingImageUrl && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: 0.16,
          }}
        >
          <Image src={content.openingImageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </View>
      )}

      {/* Top metadata strip */}
      <View style={[styles.metaStrip, { borderColor: theme.muted }]}>
        <Text style={[styles.metaCode, { fontFamily: theme.monoFamily, color: theme.muted }]}>
          {content.caseNumber}
        </Text>
        <Text style={[styles.metaCode, { fontFamily: theme.monoFamily, color: theme.muted }]}>
          {s.locked}
        </Text>
      </View>

      <View style={styles.coverBody}>
        <Text style={{ fontFamily: theme.monoFamily, color: theme.accent, fontSize: 11, letterSpacing: 5, marginBottom: 28, textTransform: 'uppercase' }}>
          Case File
        </Text>
        <Text
          style={{
            fontFamily: theme.serifFamily,
            fontStyle: 'italic',
            fontWeight: 700,
            fontSize: 38,
            color: theme.text,
            textAlign: 'center',
            lineHeight: 1.15,
            marginBottom: 16,
          }}
        >
          {content.title}
        </Text>
        <Text
          style={{
            fontFamily: theme.serifFamily,
            fontSize: 13,
            color: theme.muted,
            textAlign: 'center',
            lineHeight: 1.5,
            maxWidth: 420,
            marginBottom: 32,
          }}
        >
          {content.setting}
        </Text>

        <Divider theme={theme} />

        <Text
          style={{
            fontFamily: theme.monoFamily,
            fontSize: 9,
            letterSpacing: 3,
            color: theme.muted,
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          {s.sectionCover}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14, marginBottom: 30 }}>
          {content.players.map((p) => (
            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.color }} />
              <Text style={{ fontFamily: theme.serifFamily, fontSize: 12, color: theme.text }}>
                {p.name}
              </Text>
            </View>
          ))}
        </View>

        <VerdictStamp label={content.verdictLine} color={theme.danger} />
      </View>

      <View style={styles.coverFooter}>
        <Text style={{ fontFamily: theme.monoFamily, fontSize: 8, color: theme.muted, letterSpacing: 2 }}>
          {s.coverFooter}
        </Text>
        <Text style={{ fontFamily: theme.monoFamily, fontSize: 8, color: theme.muted, letterSpacing: 1 }}>
          {formatDate(content.playedOn, content.locale)}
        </Text>
      </View>
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/*  Dramatis Personae                                                  */
/* ------------------------------------------------------------------ */

function NpcCard({ npc, theme, locale }: { npc: CaseFileNpc; theme: PdfTheme; locale: 'tr' | 'en' }): React.ReactElement {
  const s = pdfStrings(locale);
  const accent = npc.isCulprit ? theme.danger : theme.accent;
  return (
    <View
      style={[
        styles.npcCard,
        {
          backgroundColor: npc.isCulprit ? blendDanger(theme) : transparent(theme.text, 0.04),
          borderColor: accent,
          borderWidth: npc.isCulprit ? 2 : 0.6,
        },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <View style={{
          width: 32, height: 32, borderRadius: 16,
          backgroundColor: accent, alignItems: 'center', justifyContent: 'center',
          marginRight: 10,
        }}>
          <Text style={{ fontFamily: theme.serifFamily, fontWeight: 700, fontSize: 14, color: theme.pageBg }}>
            {npc.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: theme.serifFamily, fontWeight: 700, fontSize: 14, color: theme.text }}>
            {npc.name}
          </Text>
          <Text style={{ fontFamily: theme.monoFamily, fontSize: 8, color: theme.muted, letterSpacing: 1, textTransform: 'uppercase' }}>
            {npc.role}
          </Text>
        </View>
      </View>
      {npc.isCulprit && (
        <View style={{
          alignSelf: 'flex-start',
          paddingHorizontal: 6, paddingVertical: 2,
          backgroundColor: theme.danger,
          marginBottom: 6,
        }}>
          <Text style={{ fontFamily: theme.monoFamily, fontWeight: 700, fontSize: 7, color: theme.pageBg, letterSpacing: 2 }}>
            {s.trueCulpritBadge}
          </Text>
        </View>
      )}
      <Text style={{ fontFamily: theme.serifFamily, fontSize: 10, color: theme.text, lineHeight: 1.5, marginBottom: 6 }}>
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
      <PageHeader content={content} theme={theme} pageLabel={s.sectionDramatis} />
      <SectionHeading label={s.sectionDramatis} theme={theme} />
      <View style={styles.npcGrid}>
        {content.npcs.map((n) => (
          <NpcCard key={n.id} npc={n} theme={theme} locale={content.locale} />
        ))}
      </View>
      <PageFooter content={content} theme={theme} />
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/*  Chain of events                                                    */
/* ------------------------------------------------------------------ */

function EventCard({ event, theme, locale, index }: { event: CaseFileEvent; theme: PdfTheme; locale: 'tr' | 'en'; index: number }): React.ReactElement {
  const s = pdfStrings(locale);
  const accent = event.isCulpritAction ? theme.danger : theme.accent;
  return (
    <View style={{ flexDirection: 'row', marginBottom: 12 }}>
      {/* Timeline gutter */}
      <View style={{ alignItems: 'center', marginRight: 12, width: 32 }}>
        <View style={{
          width: 18, height: 18, borderRadius: 9,
          backgroundColor: accent,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontFamily: theme.monoFamily, fontWeight: 700, fontSize: 8, color: theme.pageBg }}>
            {index + 1}
          </Text>
        </View>
        <View style={{ flex: 1, width: 1.4, backgroundColor: accent, opacity: 0.45, marginTop: 2 }} />
      </View>

      {/* Body card */}
      <View style={{
        flex: 1,
        padding: 10,
        backgroundColor: event.isCulpritAction ? blendDanger(theme) : transparent(theme.text, 0.04),
        borderRadius: 4,
        borderLeftWidth: event.isCulpritAction ? 3 : 0,
        borderLeftColor: theme.danger,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 }}>
          <Text style={{ fontFamily: theme.monoFamily, fontWeight: 700, fontSize: 13, color: accent, marginRight: 10 }}>
            {event.time}
          </Text>
          <Text style={{ fontFamily: theme.serifFamily, fontStyle: 'italic', fontSize: 11, color: theme.muted }}>
            {event.roomName}
          </Text>
        </View>
        {event.actorName.length > 0 && (
          <Text style={{ fontFamily: theme.monoFamily, fontSize: 8, color: theme.muted, letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' }}>
            {event.actorRole ? `${event.actorRole} · ` : ''}{event.actorName}
          </Text>
        )}
        {event.isCulpritAction && (
          <View style={{
            alignSelf: 'flex-start',
            paddingHorizontal: 6, paddingVertical: 2,
            backgroundColor: theme.danger,
            marginBottom: 5,
          }}>
            <Text style={{ fontFamily: theme.monoFamily, fontWeight: 700, fontSize: 6.5, color: theme.pageBg, letterSpacing: 2 }}>
              {s.culpritActionBadge}
            </Text>
          </View>
        )}
        <Text style={{ fontFamily: theme.serifFamily, fontSize: 10, color: theme.text, lineHeight: 1.5 }}>
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
      <PageHeader content={content} theme={theme} pageLabel={s.sectionTimeline} />
      <SectionHeading label={s.sectionTimeline} theme={theme} />
      <View>
        {content.events.map((e, i) => (
          <EventCard key={i} event={e} theme={theme} locale={content.locale} index={i} />
        ))}
      </View>
      <PageFooter content={content} theme={theme} />
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/*  Evidence                                                           */
/* ------------------------------------------------------------------ */

function EvidenceItem({ item, theme, accent }: { item: CaseFileItem; theme: PdfTheme; accent: string }): React.ReactElement {
  return (
    <View
      style={{
        padding: 8,
        marginBottom: 6,
        backgroundColor: transparent(theme.text, 0.04),
        borderLeftWidth: 2,
        borderLeftColor: accent,
      }}
    >
      <Text style={{ fontFamily: theme.serifFamily, fontWeight: 700, fontSize: 11, color: theme.text, marginBottom: 2 }}>
        {item.name}
      </Text>
      <Text style={{ fontFamily: theme.serifFamily, fontSize: 9.5, color: theme.muted, lineHeight: 1.45 }}>
        {item.description}
      </Text>
    </View>
  );
}

function EvidencePage({ content, theme }: DocProps): React.ReactElement {
  const s = pdfStrings(content.locale);
  return (
    <Page size="A4" style={[styles.page, { backgroundColor: theme.pageBg }]}>
      <PageHeader content={content} theme={theme} pageLabel={s.sectionEvidence} />
      <SectionHeading label={s.sectionEvidence} theme={theme} />

      <View style={{ flexDirection: 'row', gap: 14, marginBottom: 16 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: theme.monoFamily, fontSize: 9, color: theme.accent, marginBottom: 8, letterSpacing: 2, textTransform: 'uppercase' }}>
            ✓ {s.foundLabel}
          </Text>
          {content.evidenceFound.length > 0 ? content.evidenceFound.map((i) => (
            <EvidenceItem key={i.id} item={i} theme={theme} accent={theme.accent} />
          )) : (
            <Text style={{ fontFamily: theme.serifFamily, fontStyle: 'italic', fontSize: 10, color: theme.muted }}>
              —
            </Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: theme.monoFamily, fontSize: 9, color: theme.danger, marginBottom: 8, letterSpacing: 2, textTransform: 'uppercase' }}>
            ✗ {s.missedLabel}
          </Text>
          {content.evidenceMissed.length > 0 ? content.evidenceMissed.map((i) => (
            <EvidenceItem key={i.id} item={i} theme={theme} accent={theme.danger} />
          )) : (
            <Text style={{ fontFamily: theme.serifFamily, fontStyle: 'italic', fontSize: 10, color: theme.muted }}>
              —
            </Text>
          )}
        </View>
      </View>

      {content.redHerrings.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <Text style={{ fontFamily: theme.monoFamily, fontSize: 9, color: theme.muted, marginBottom: 8, letterSpacing: 2, textTransform: 'uppercase' }}>
            ⚠ {s.redHerringLabel}
          </Text>
          {content.redHerrings.map((i) => (
            <EvidenceItem key={i.id} item={i} theme={theme} accent={theme.muted} />
          ))}
        </View>
      )}

      <PageFooter content={content} theme={theme} />
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/*  Conclusion                                                         */
/* ------------------------------------------------------------------ */

function ConclusionPage({ content, theme }: DocProps): React.ReactElement {
  const s = pdfStrings(content.locale);
  return (
    <Page size="A4" style={[styles.page, { backgroundColor: theme.pageBg }]}>
      <PageHeader content={content} theme={theme} pageLabel={s.sectionConclusion} />
      <SectionHeading label={s.sectionConclusion} theme={theme} />

      <View
        style={{
          marginVertical: 18,
          padding: 22,
          backgroundColor: transparent(theme.text, 0.04),
          borderLeftWidth: 3,
          borderLeftColor: theme.accent,
        }}
      >
        <Text style={{
          fontFamily: theme.serifFamily,
          fontStyle: 'italic',
          fontSize: 13,
          color: theme.text,
          lineHeight: 1.7,
        }}>
          {content.conclusion}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: theme.monoFamily, fontSize: 8, color: theme.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
            {s.motiveLabel}
          </Text>
          <Text style={{ fontFamily: theme.serifFamily, fontSize: 11, color: theme.text, lineHeight: 1.5 }}>
            {content.motiveShort}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: theme.monoFamily, fontSize: 8, color: theme.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>
            {s.keyEvidenceLabel}
          </Text>
          <Text style={{ fontFamily: theme.serifFamily, fontSize: 11, color: theme.text, lineHeight: 1.5 }}>
            {content.keyEvidenceName}
          </Text>
        </View>
      </View>

      <View style={{ marginTop: 28, alignItems: 'center' }}>
        <VerdictStamp label={content.verdictLine} color={theme.danger} rotate={5} />
      </View>

      <PageFooter content={content} theme={theme} />
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared header/footer                                               */
/* ------------------------------------------------------------------ */

function PageHeader({ content, theme, pageLabel }: { content: CaseFileContent; theme: PdfTheme; pageLabel: string }): React.ReactElement {
  return (
    <View style={[styles.headerStrip, { borderColor: theme.muted }]}>
      <Text style={{ fontFamily: theme.monoFamily, fontSize: 8, color: theme.muted, letterSpacing: 2 }}>
        {content.caseNumber}
      </Text>
      <Text style={{ fontFamily: theme.monoFamily, fontSize: 8, color: theme.muted, letterSpacing: 2, textTransform: 'uppercase' }}>
        {pageLabel}
      </Text>
    </View>
  );
}

function PageFooter({ content, theme }: { content: CaseFileContent; theme: PdfTheme }): React.ReactElement {
  const s = pdfStrings(content.locale);
  return (
    <View style={[styles.footerStrip, { borderColor: theme.muted }]}>
      <Text style={{ fontFamily: theme.monoFamily, fontSize: 7, color: theme.muted, letterSpacing: 1.5 }}>
        {s.coverFooter}
      </Text>
      <Text
        render={({ pageNumber, totalPages }) => `${s.pageLabel} ${pageNumber} / ${totalPages}`}
        style={{ fontFamily: theme.monoFamily, fontSize: 7, color: theme.muted, letterSpacing: 1.5 }}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Top-level document                                                 */
/* ------------------------------------------------------------------ */

export function CaseFileDocument({ content, theme }: DocProps): React.ReactElement {
  return (
    <Document title={`Velvet Shadow — ${content.title}`} author="AKBOYS · COMP 491">
      <CoverPage content={content} theme={theme} />
      <DramatisPersonaePage content={content} theme={theme} />
      <TimelinePage content={content} theme={theme} />
      <EvidencePage content={content} theme={theme} />
      <ConclusionPage content={content} theme={theme} />
    </Document>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(ms: number, locale: 'tr' | 'en'): string {
  const d = new Date(ms);
  return d.toLocaleDateString(locale === 'en' ? 'en-US' : 'tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Lightweight RGBA tint without bringing in a color lib. */
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

const styles = StyleSheet.create({
  page: {
    padding: '32 38 28 38',
    flexDirection: 'column',
  },
  metaStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 0.6,
    paddingBottom: 6,
    marginBottom: 24,
  },
  metaCode: {
    fontSize: 9,
    letterSpacing: 2,
  },
  coverBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
  },
  coverFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.6,
    paddingTop: 6,
  },
  headerStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 0.4,
    paddingBottom: 4,
    marginBottom: 18,
  },
  footerStrip: {
    position: 'absolute',
    bottom: 18,
    left: 38,
    right: 38,
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
    padding: 10,
    borderRadius: 4,
    marginBottom: 4,
  },
});

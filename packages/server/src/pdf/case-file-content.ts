/**
 * case-file-content.ts — Extract a typed, locale-flattened payload for the PDF (#59)
 *
 * Reads the ended session + cached reconstruction + finale and produces a
 * single immutable object the PDF document component can render without
 * touching session state. All bilingual fields are flattened to the
 * caller's locale here so the JSX side stays simple.
 *
 * @author AKBOYS Team
 * @since 2026-05-14
 */
import { pickLang } from '@akboys/shared';
import type { Locale, WorldData, ReconstructionDTO } from '@akboys/shared';
import type { SessionData } from '../store/SessionStore.js';

/* ------------------------------------------------------------------ */
/*  Typed content shape                                                */
/* ------------------------------------------------------------------ */

export type CaseFileVerdict = 'solved' | 'wrong_accusation' | 'turn_limit' | 'unknown';

export interface CaseFilePlayer {
  id: string;
  name: string;
  color: string;
  /** "you" badge is rendered separately at the call site; PDF stays neutral. */
  visitedRoomCount: number;
}

export interface CaseFileNpc {
  id: string;
  name: string;
  role: string;
  description: string;
  knownInfo: string;
  isCulprit: boolean;
}

export interface CaseFileItem {
  id: string;
  name: string;
  description: string;
  isEvidence: boolean;
  isRedHerring: boolean;
  /** True if any player ever moved through the room this item lives in. Heuristic, used to split found/missed. */
  reachable: boolean;
}

export interface CaseFileEvent {
  time: string;
  roomName: string;
  actorName: string;
  actorRole: string;
  description: string;
  isCulpritAction: boolean;
}

export interface CaseFileContent {
  locale: Locale;
  caseNumber: string;
  title: string;
  setting: string;
  openingNarration: string;
  openingImageUrl: string | null;
  players: CaseFilePlayer[];
  verdict: CaseFileVerdict;
  verdictLine: string;
  npcs: CaseFileNpc[];
  events: CaseFileEvent[];
  conclusion: string;
  culpritName: string;
  motiveShort: string;
  keyEvidenceName: string;
  evidenceFound: CaseFileItem[];
  evidenceMissed: CaseFileItem[];
  redHerrings: CaseFileItem[];
  playedOn: number;
  genre: string;
}

/* ------------------------------------------------------------------ */
/*  Strings the PDF needs in two languages (kept tiny + co-located)    */
/* ------------------------------------------------------------------ */

const STRINGS = {
  tr: {
    caseFilePrefix: 'VS',
    verdictSolved: 'Dava Çözüldü',
    verdictWrong: 'Dava Kaybedildi',
    verdictTimeout: 'İzler Soğudu',
    verdictUnknown: 'Dosya Açık',
    sectionDramatis: 'Dramatis Personae',
    sectionTimeline: 'Olay Zinciri',
    sectionEvidence: 'Deliller',
    sectionConclusion: 'Sonuç',
    sectionCover: 'Dedektifler',
    foundLabel: 'Bulunan Deliller',
    missedLabel: 'Kaçırılan Deliller',
    redHerringLabel: 'Yanıltıcı İzler',
    trueCulpritBadge: 'GERÇEK KATİL',
    culpritActionBadge: 'KATİLİN HAREKETİ',
    keyEvidenceLabel: 'Anahtar Delil',
    motiveLabel: 'Saik',
    coverFooter: 'Velvet Shadow · AKBOYS · COMP 491',
    pageLabel: 'Sayfa',
    locked: 'Mühürlü Dosya',
  },
  en: {
    caseFilePrefix: 'VS',
    verdictSolved: 'Case Solved',
    verdictWrong: 'Case Lost',
    verdictTimeout: 'The Trail Went Cold',
    verdictUnknown: 'Case Open',
    sectionDramatis: 'Dramatis Personae',
    sectionTimeline: 'Chain of Events',
    sectionEvidence: 'Evidence',
    sectionConclusion: 'Conclusion',
    sectionCover: 'Detectives',
    foundLabel: 'Evidence Found',
    missedLabel: 'Evidence Missed',
    redHerringLabel: 'False Leads',
    trueCulpritBadge: 'TRUE CULPRIT',
    culpritActionBadge: "KILLER'S MOVE",
    keyEvidenceLabel: 'Key Evidence',
    motiveLabel: 'Motive',
    coverFooter: 'Velvet Shadow · AKBOYS · COMP 491',
    pageLabel: 'Page',
    locked: 'Sealed Case File',
  },
} as const;

export type PdfStrings = (typeof STRINGS)[Locale];

export function pdfStrings(locale: Locale): PdfStrings {
  return STRINGS[locale];
}

/* ------------------------------------------------------------------ */
/*  Extractor                                                          */
/* ------------------------------------------------------------------ */

export interface BuildCaseFileContentInput {
  session: SessionData;
  world: WorldData;
  reconstruction: ReconstructionDTO;
  locale: Locale;
}

/**
 * Build the typed PDF payload. Pure — no fetches, no LLM calls. The
 * reconstruction is assumed to already be cached on the session (the
 * endpoint guarantees this before invoking the extractor).
 */
export function buildCaseFileContent(input: BuildCaseFileContentInput): CaseFileContent {
  const { session, world, reconstruction, locale } = input;
  const verdict = derivedVerdict(session);
  const culprit = world.npcs.find((n) => n.id === world.solution.culpritNpcId);
  const keyEvidence = world.items.find((i) => i.id === world.solution.keyEvidenceId);

  /* Players — visitedRoomCount is a soft per-player coverage metric;
   * not displayed prominently but useful for the cover footer. */
  const players: CaseFilePlayer[] = Array.from(session.players.values()).map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    visitedRoomCount: p.visitedRooms.length,
  }));

  /* NPCs — culprit highlighted; knownInfo localized. */
  const npcs: CaseFileNpc[] = world.npcs.map((n) => ({
    id: n.id,
    name: n.name,
    role: pickLang(n.role, locale),
    description: pickLang(n.description, locale),
    knownInfo: pickLang(n.knownInfo, locale),
    isCulprit: n.isCulprit,
  }));

  /* Events — reconstruction is already locale-aware via pickLang. */
  const events: CaseFileEvent[] = reconstruction.events.map((e) => ({
    time: e.time,
    roomName: e.roomName,
    actorName: e.actorName,
    actorRole: pickLang(e.actorRole, locale),
    description: pickLang(e.description, locale),
    isCulpritAction: e.isCulpritAction,
  }));

  /* Items — split into found / missed / red herring. "Reachable" is a
   * heuristic: any room visited by any player is reachable. */
  const allVisitedRoomIds = new Set<string>();
  for (const p of session.players.values()) {
    for (const r of p.visitedRooms) allVisitedRoomIds.add(r);
  }

  const items: CaseFileItem[] = world.items.map((i) => ({
    id: i.id,
    name: i.name,
    description: pickLang(i.description, locale),
    isEvidence: i.isEvidence,
    isRedHerring: i.isRedHerring,
    reachable: allVisitedRoomIds.has(i.roomId),
  }));

  const evidence = items.filter((i) => i.isEvidence && !i.isRedHerring);
  const evidenceFound = evidence.filter((i) => i.reachable);
  const evidenceMissed = evidence.filter((i) => !i.reachable);
  const redHerrings = items.filter((i) => i.isRedHerring);

  const s = pdfStrings(locale);
  const verdictLine = (() => {
    switch (verdict) {
      case 'solved': return s.verdictSolved;
      case 'wrong_accusation': return s.verdictWrong;
      case 'turn_limit': return s.verdictTimeout;
      default: return s.verdictUnknown;
    }
  })();

  const caseNumber = `${s.caseFilePrefix}-${session.id.slice(0, 4).toUpperCase()}-${session.id.slice(-4).toUpperCase()}`;

  return {
    locale,
    caseNumber,
    title: pickLang(world.meta.title, locale),
    setting: pickLang(world.meta.setting, locale),
    openingNarration: pickLang(world.openingNarration, locale),
    openingImageUrl: session.openingImageUrl,
    players,
    verdict,
    verdictLine,
    npcs,
    events,
    conclusion: pickLang(reconstruction.conclusion, locale),
    culpritName: culprit?.name ?? '',
    motiveShort: pickLang(world.solution.motiveShort, locale),
    keyEvidenceName: keyEvidence?.name ?? '',
    evidenceFound,
    evidenceMissed,
    redHerrings,
    playedOn: session.createdAt,
    genre: session.detectedGenre ?? 'generic',
  };
}

function derivedVerdict(session: SessionData): CaseFileVerdict {
  if (session.state !== 'ended') return 'unknown';
  const reason = session.gameState.endReason;
  if (reason === 'solved') return 'solved';
  if (reason === 'wrong_accusation') return 'wrong_accusation';
  if (reason === 'turn_limit') return 'turn_limit';
  return 'unknown';
}

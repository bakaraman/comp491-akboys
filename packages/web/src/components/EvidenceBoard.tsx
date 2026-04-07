/**
 * EvidenceBoard.tsx — Detective journal panel with Evidence and Suspects tabs
 *
 * Works in both single-player (REST data) and multiplayer (Socket.IO data) modes.
 * - Evidence tab: shows discovered evidence items, with Share button in MP
 * - Suspects tab: shows scenario NPCs with Visited status and Accuse button
 *
 * @author AKBOYS Team
 * @since 2026-04-07
 */

'use client';

import React, { useState, useEffect } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface EvidenceItem {
  id: string;
  name: string;
  description: string;
  roomId: string;
  roomName?: string;
}

export interface SuspectInfo {
  id: string;
  name: string;
  description: string;
  roomId: string;
  roomName?: string;
  visited: boolean;
}

export interface SharedEvidenceEntry {
  evidenceId: string;
  sharedByPlayerId: string;
  sharedByPlayerName: string;
  sharedByPlayerColor: string;
  timestamp: number;
}

interface EvidenceBoardProps {
  mode: 'singleplayer' | 'multiplayer';
  isOpen: boolean;
  onClose: () => void;

  /** All evidence items from the scenario (isEvidence: true) */
  allEvidence: EvidenceItem[];

  /** IDs the current player has discovered (SP: gameState, MP: own inventory) */
  discoveredIds: string[];

  /** All scenario NPCs */
  suspects: SuspectInfo[];

  /** MP only: evidence shared by teammates */
  sharedEvidence?: SharedEvidenceEntry[];

  /** MP only: callback to share an evidence item */
  onShareEvidence?: (evidenceId: string) => void;

  /** SP: open accuse modal with suspect pre-selected */
  onAccuse?: (suspectId: string) => void;

  /** MP: propose accusation (disabled for now) */
  onProposeAccusation?: (suspectId: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function EvidenceBoard({
  mode,
  isOpen,
  onClose,
  allEvidence,
  discoveredIds,
  suspects,
  sharedEvidence = [],
  onShareEvidence,
  onAccuse,
  onProposeAccusation,
}: EvidenceBoardProps) {
  const [tab, setTab] = useState<'evidence' | 'suspects'>('evidence');

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  // Build discovered evidence list
  const myEvidence = allEvidence.filter((e) => discoveredIds.includes(e.id));

  // In MP: also include evidence shared by teammates (that I haven't found myself)
  const sharedIds = sharedEvidence.map((s) => s.evidenceId);
  const teammateEvidence = mode === 'multiplayer'
    ? allEvidence.filter((e) => sharedIds.includes(e.id) && !discoveredIds.includes(e.id))
    : [];

  const totalVisible = myEvidence.length + teammateEvidence.length;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)',
          zIndex: 70, transition: 'opacity 0.3s',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: '65%', maxWidth: '640px', minWidth: '340px',
        backgroundColor: '#0d0d0d',
        borderLeft: '1px solid #2a2520',
        zIndex: 71,
        display: 'flex', flexDirection: 'column',
        animation: 'slideInRight 0.3s ease-out',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid #1a1815',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{
              margin: 0, fontSize: '20px', color: '#d4a843',
              fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 'normal',
            }}>
              Detective Journal
            </h2>
            <p style={{
              margin: '4px 0 0', fontSize: '11px', color: '#5a5545',
              fontFamily: 'monospace', letterSpacing: '1px', textTransform: 'uppercase',
            }}>
              {totalVisible} evidence found
              {mode === 'multiplayer' && teammateEvidence.length > 0 &&
                ` \u00B7 ${teammateEvidence.length} shared by team`}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: '#5a5545',
              fontSize: '20px', cursor: 'pointer', padding: '4px 8px',
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#d4a843'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#5a5545'; }}
          >
            \u2715
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', borderBottom: '1px solid #1a1815',
        }}>
          {(['evidence', 'suspects'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '12px',
                backgroundColor: 'transparent',
                border: 'none',
                borderBottom: tab === t ? '2px solid #d4a843' : '2px solid transparent',
                color: tab === t ? '#d4a843' : '#5a5545',
                fontSize: '12px', fontFamily: 'monospace',
                letterSpacing: '2px', textTransform: 'uppercase',
                cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              {t === 'evidence' ? `Evidence (${totalVisible})` : `Suspects (${suspects.length})`}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '20px 24px',
        }}>
          {tab === 'evidence' && (
            <EvidenceTab
              mode={mode}
              myEvidence={myEvidence}
              teammateEvidence={teammateEvidence}
              sharedEvidence={sharedEvidence}
              discoveredIds={discoveredIds}
              onShareEvidence={onShareEvidence}
            />
          )}
          {tab === 'suspects' && (
            <SuspectsTab
              mode={mode}
              suspects={suspects}
              onAccuse={onAccuse}
              onProposeAccusation={onProposeAccusation}
            />
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Evidence Tab                                                       */
/* ------------------------------------------------------------------ */

function EvidenceTab({
  mode,
  myEvidence,
  teammateEvidence,
  sharedEvidence,
  discoveredIds,
  onShareEvidence,
}: {
  mode: 'singleplayer' | 'multiplayer';
  myEvidence: EvidenceItem[];
  teammateEvidence: EvidenceItem[];
  sharedEvidence: SharedEvidenceEntry[];
  discoveredIds: string[];
  onShareEvidence?: (evidenceId: string) => void;
}) {
  if (myEvidence.length === 0 && teammateEvidence.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '48px 20px',
        color: '#4a4540', fontFamily: 'Georgia, serif', fontStyle: 'italic',
      }}>
        <div style={{ fontSize: '36px', marginBottom: '16px', opacity: 0.4 }}>
          {'\uD83D\uDD0D'}
        </div>
        <p style={{ fontSize: '15px', lineHeight: '1.6' }}>
          No evidence discovered yet.
        </p>
        <p style={{ fontSize: '13px', marginTop: '8px' }}>
          Explore rooms and investigate to find clues.
        </p>
      </div>
    );
  }

  const isSharedByMe = (evidenceId: string) =>
    sharedEvidence.some((s) => s.evidenceId === evidenceId && discoveredIds.includes(evidenceId));

  const getSharer = (evidenceId: string) =>
    sharedEvidence.find((s) => s.evidenceId === evidenceId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* My evidence */}
      {myEvidence.map((item) => {
        const shared = isSharedByMe(item.id);
        return (
          <EvidenceCard
            key={item.id}
            item={item}
            origin="self"
            showShare={mode === 'multiplayer' && !shared}
            sharedLabel={shared ? 'Shared with team' : undefined}
            onShare={() => onShareEvidence?.(item.id)}
          />
        );
      })}

      {/* Teammate shared evidence */}
      {teammateEvidence.length > 0 && (
        <>
          <div style={{
            fontSize: '10px', color: '#5a5545', fontFamily: 'monospace',
            letterSpacing: '2px', textTransform: 'uppercase',
            padding: '12px 0 4px', borderTop: '1px solid #1a1815', marginTop: '4px',
          }}>
            Shared by teammates
          </div>
          {teammateEvidence.map((item) => {
            const sharer = getSharer(item.id);
            return (
              <EvidenceCard
                key={item.id}
                item={item}
                origin="team"
                sharerName={sharer?.sharedByPlayerName}
                sharerColor={sharer?.sharedByPlayerColor}
              />
            );
          })}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Evidence Card                                                      */
/* ------------------------------------------------------------------ */

function EvidenceCard({
  item,
  origin,
  showShare = false,
  sharedLabel,
  sharerName,
  sharerColor,
  onShare,
}: {
  item: EvidenceItem;
  origin: 'self' | 'team';
  showShare?: boolean;
  sharedLabel?: string;
  sharerName?: string;
  sharerColor?: string;
  onShare?: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '16px',
        backgroundColor: hovered ? '#151210' : '#111',
        border: `1px solid ${origin === 'team' ? '#1a2a3a' : '#2a2520'}`,
        borderRadius: '10px',
        transition: 'all 0.2s',
        borderLeftWidth: '3px',
        borderLeftColor: origin === 'team' ? (sharerColor || '#5ba3cf') : '#d4a843',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: '15px', color: '#e8e0d4',
            fontFamily: 'Georgia, serif', marginBottom: '6px',
          }}>
            {item.name}
          </div>
          <div style={{
            fontSize: '13px', color: '#8a8070', lineHeight: '1.5',
            fontFamily: 'Georgia, serif', fontStyle: 'italic',
          }}>
            {item.description}
          </div>
          <div style={{
            marginTop: '8px', fontSize: '11px', color: '#5a5545',
            fontFamily: 'monospace', display: 'flex', gap: '12px', flexWrap: 'wrap',
          }}>
            {item.roomName && (
              <span>Found in: {item.roomName}</span>
            )}
            {sharerName && (
              <span style={{ color: sharerColor || '#5ba3cf' }}>
                Shared by {sharerName}
              </span>
            )}
            {sharedLabel && (
              <span style={{ color: '#5bcf7f' }}>{'\u2713'} {sharedLabel}</span>
            )}
          </div>
        </div>

        {showShare && onShare && (
          <button
            onClick={onShare}
            style={{
              marginLeft: '12px', padding: '6px 12px',
              backgroundColor: 'transparent',
              border: '1px solid #2a3a4a',
              borderRadius: '6px', color: '#5ba3cf',
              fontSize: '11px', fontFamily: 'monospace',
              cursor: 'pointer', whiteSpace: 'nowrap',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#1a2a3a';
              e.currentTarget.style.borderColor = '#5ba3cf';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.borderColor = '#2a3a4a';
            }}
          >
            Share
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Suspects Tab                                                       */
/* ------------------------------------------------------------------ */

function SuspectsTab({
  mode,
  suspects,
  onAccuse,
  onProposeAccusation,
}: {
  mode: 'singleplayer' | 'multiplayer';
  suspects: SuspectInfo[];
  onAccuse?: (suspectId: string) => void;
  onProposeAccusation?: (suspectId: string) => void;
}) {
  if (suspects.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '48px 20px',
        color: '#4a4540', fontFamily: 'Georgia, serif', fontStyle: 'italic',
      }}>
        <div style={{ fontSize: '36px', marginBottom: '16px', opacity: 0.4 }}>
          {'\uD83D\uDC64'}
        </div>
        <p style={{ fontSize: '15px', lineHeight: '1.6' }}>
          No suspects encountered yet.
        </p>
        <p style={{ fontSize: '13px', marginTop: '8px' }}>
          Visit rooms and meet the characters.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {suspects.map((npc) => (
        <SuspectCard
          key={npc.id}
          npc={npc}
          mode={mode}
          onAccuse={onAccuse}
          onProposeAccusation={onProposeAccusation}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Suspect Card                                                       */
/* ------------------------------------------------------------------ */

function SuspectCard({
  npc,
  mode,
  onAccuse,
  onProposeAccusation,
}: {
  npc: SuspectInfo;
  mode: 'singleplayer' | 'multiplayer';
  onAccuse?: (suspectId: string) => void;
  onProposeAccusation?: (suspectId: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '16px',
        backgroundColor: hovered ? '#151210' : '#111',
        border: '1px solid #2a2520',
        borderRadius: '10px',
        transition: 'all 0.2s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{
              fontSize: '15px', color: '#e8e0d4',
              fontFamily: 'Georgia, serif',
            }}>
              {npc.name}
            </span>
          </div>
          <div style={{
            fontSize: '13px', color: '#8a8070', lineHeight: '1.5',
            fontFamily: 'Georgia, serif', fontStyle: 'italic',
          }}>
            {npc.description}
          </div>
          <div style={{
            marginTop: '8px', fontSize: '11px', color: '#5a5545',
            fontFamily: 'monospace',
          }}>
            Location: {npc.roomName || npc.roomId}
          </div>
        </div>
      </div>

      {/* Accuse button area */}
      <div style={{ marginTop: '12px', position: 'relative' }}>
        {mode === 'singleplayer' ? (
          <button
            onClick={() => onAccuse?.(npc.id)}
            style={{
              padding: '8px 16px',
              backgroundColor: 'transparent',
              border: '1px solid #3a2020',
              borderRadius: '6px', color: '#d46868',
              fontSize: '11px', fontFamily: 'monospace',
              letterSpacing: '1px', textTransform: 'uppercase',
              cursor: 'pointer', transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#2a1515';
              e.currentTarget.style.borderColor = '#d46868';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.borderColor = '#3a2020';
            }}
          >
            Accuse
          </button>
        ) : (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
              disabled
              onMouseEnter={() => setTooltipVisible(true)}
              onMouseLeave={() => setTooltipVisible(false)}
              style={{
                padding: '8px 16px',
                backgroundColor: 'transparent',
                border: '1px solid #1a1815',
                borderRadius: '6px', color: '#3a3530',
                fontSize: '11px', fontFamily: 'monospace',
                letterSpacing: '1px', textTransform: 'uppercase',
                cursor: 'not-allowed',
              }}
            >
              Propose Accusation
            </button>
            {tooltipVisible && (
              <div style={{
                position: 'absolute', bottom: '100%', left: 0,
                marginBottom: '6px', padding: '8px 12px',
                backgroundColor: '#1a1815', border: '1px solid #2a2520',
                borderRadius: '6px', color: '#8a8070',
                fontSize: '11px', fontFamily: 'monospace',
                whiteSpace: 'nowrap', zIndex: 10,
              }}>
                Coming soon — waiting for backend
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

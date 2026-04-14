/**
 * GameMap.tsx — Atmospheric themed maps (SP)
 *
 * Fully illustrated SVG maps with per-scenario visual identity.
 * Uses Google Fonts for themed typography (Special Elite, Cinzel,
 * Orbitron, Pirata One, Rye, Audiowide).
 *
 * @author AKBOYS Team
 * @since 2026-04-08
 */

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { MAP_LAYOUTS, type ScenarioMapLayout } from '@/lib/map-layouts';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MapRoom {
  id: string;
  name: string;
  exits: Record<string, string>;
}

export interface MapNPC {
  id: string;
  name: string;
  roomId: string;
}

export interface MapTeammate {
  id: string;
  name: string;
  color: string;
  currentRoomId: string;
  isConnected: boolean;
}

interface GameMapProps {
  isOpen: boolean;
  onClose: () => void;
  scenarioId: string;
  rooms: MapRoom[];
  npcs: MapNPC[];
  currentRoomId: string;
  visitedRooms: string[];
  onTravel: (roomName: string) => void;
  disabled?: boolean;

  /** Multiplayer-only */
  mode?: 'singleplayer' | 'multiplayer';
  teammates?: MapTeammate[];
  myName?: string;
  myColor?: string;
}

type ThemeKey = 'noir' | 'haunted' | 'space' | 'pirate' | 'western' | 'cyberpunk';

function resolveTheme(scenarioId: string): ThemeKey {
  if (['noir', 'haunted', 'space', 'pirate', 'western', 'cyberpunk'].includes(scenarioId)) {
    return scenarioId as ThemeKey;
  }
  return 'noir';
}

/* ------------------------------------------------------------------ */
/*  Theme config                                                       */
/* ------------------------------------------------------------------ */

interface Theme {
  title: string;
  subtitle: string;
  panelBg: string;
  headerBg: string;
  footerBg: string;
  borderColor: string;
  mutedText: string;
  accent: string;
  visitedText: string;
  titleFont: string;
  bodyFont: string;
}

const THEMES: Record<ThemeKey, Theme> = {
  noir: {
    title: 'Case Evidence Board',
    subtitle: 'Classified — Chicago P.D.',
    panelBg: '#1a130a',
    headerBg: '#0f0a05',
    footerBg: '#0a0704',
    borderColor: '#3a2a15',
    mutedText: '#9a8560',
    accent: '#e8b850',
    visitedText: '#2a1a08',
    titleFont: `'Special Elite', 'Courier New', monospace`,
    bodyFont: `'Special Elite', 'Courier New', monospace`,
  },
  haunted: {
    title: 'The Manor Floor Plan',
    subtitle: 'Surveyed MCMLXXVII',
    panelBg: '#0a0710',
    headerBg: '#06040a',
    footerBg: '#040308',
    borderColor: '#2a2038',
    mutedText: '#8a75a0',
    accent: '#c090e8',
    visitedText: '#e0c8f0',
    titleFont: `'Cinzel', 'Georgia', serif`,
    bodyFont: `'Cinzel', 'Georgia', serif`,
  },
  space: {
    title: 'Station Zero // Schematic',
    subtitle: 'SEC-01 / DECK-A / REV 7.2',
    panelBg: '#050810',
    headerBg: '#030508',
    footerBg: '#020406',
    borderColor: '#1a3040',
    mutedText: '#60a0c8',
    accent: '#70d8f8',
    visitedText: '#c8e8ff',
    titleFont: `'Orbitron', 'Arial', sans-serif`,
    bodyFont: `'Orbitron', 'Arial', sans-serif`,
  },
  pirate: {
    title: 'The Crimson Tide — Chart',
    subtitle: 'Aye, X Marks the Spot',
    panelBg: '#1a1206',
    headerBg: '#100a04',
    footerBg: '#0a0602',
    borderColor: '#3a2810',
    mutedText: '#a88550',
    accent: '#f0a848',
    visitedText: '#2a1808',
    titleFont: `'Pirata One', 'Georgia', serif`,
    bodyFont: `'IM Fell English', 'Georgia', serif`,
  },
  western: {
    title: 'Dust & Ashes — Town Plan',
    subtitle: 'Frontier Survey, Eighteen-Seventy',
    panelBg: '#1a1408',
    headerBg: '#100a05',
    footerBg: '#0a0603',
    borderColor: '#3a2a15',
    mutedText: '#b89058',
    accent: '#f0b450',
    visitedText: '#2a1a08',
    titleFont: `'Rye', 'Georgia', serif`,
    bodyFont: `'IM Fell English', 'Georgia', serif`,
  },
  cyberpunk: {
    title: 'NEON GHOSTS // GRID-07',
    subtitle: '// 2087.04.08 :: SCTR-7 :: ACTIVE',
    panelBg: '#080410',
    headerBg: '#060208',
    footerBg: '#040106',
    borderColor: '#40104a',
    mutedText: '#a060d0',
    accent: '#f050d8',
    visitedText: '#f8b0f0',
    titleFont: `'Audiowide', 'Arial', sans-serif`,
    bodyFont: `'Orbitron', 'Arial', sans-serif`,
  },
};

/* ------------------------------------------------------------------ */
/*  Room ICONS — per-scenario SVG path art                             */
/* ------------------------------------------------------------------ */

const ROOM_ICONS: Record<string, string> = {
  // Noir rooms
  office:    'M 2 4 h 12 v 8 h -12 z M 4 6 h 8 v 2 h -8 z M 4 10 h 4 v 1 h -4 z',
  street:    'M 2 8 L 14 8 M 2 11 L 14 11 M 4 6 L 4 13 M 10 6 L 10 13',
  lounge:    'M 3 5 h 10 v 3 h -10 z M 3 8 v 5 M 13 8 v 5 M 6 10 L 10 10 M 6 12 L 10 12',
  backstage: 'M 4 3 L 12 3 M 4 3 L 2 14 L 14 14 L 12 3 M 8 6 L 8 12',
  alley:     'M 3 3 h 3 v 11 h -3 z M 10 3 h 3 v 11 h -3 z M 3 7 L 13 7',

  // Haunted rooms
  foyer:        'M 8 2 L 4 6 V 14 H 12 V 6 Z M 7 10 H 9 V 14 H 7 Z',
  library:      'M 3 3 h 2 v 11 h -2 z M 6 3 h 2 v 11 h -2 z M 9 3 h 2 v 11 h -2 z M 12 3 h 2 v 11 h -2 z',
  study:        'M 3 11 h 10 v 2 h -10 z M 5 3 h 6 v 8 h -6 z M 7 6 h 2 v 3 h -2 z',
  dining_hall:  'M 2 7 h 12 v 2 h -12 z M 3 9 v 4 M 13 9 v 4 M 5 5 L 11 5',
  cellar:       'M 3 6 h 10 v 7 h -10 z M 7 3 L 9 3 L 9 6 L 7 6 Z M 3 9 h 10 M 6 11 L 10 11',

  // Space rooms
  bridge:    'M 3 6 Q 8 2 13 6 V 12 H 3 Z M 5 8 h 2 v 2 h -2 z M 9 8 h 2 v 2 h -2 z',
  corridor:  'M 2 6 L 14 6 M 2 10 L 14 10 M 4 3 L 4 13 M 8 3 L 8 13 M 12 3 L 12 13',
  lab:       'M 5 4 L 11 4 L 11 8 L 12 12 L 4 12 L 5 8 Z M 7 6 h 2 v 2 h -2 z',
  quarters:  'M 3 5 h 4 v 6 h -4 z M 9 5 h 4 v 6 h -4 z M 3 13 h 10',
  cargo:     'M 3 4 h 4 v 4 h -4 z M 9 4 h 4 v 4 h -4 z M 3 9 h 4 v 4 h -4 z M 9 9 h 4 v 4 h -4 z',

  // Pirate rooms
  main_deck:      'M 2 8 Q 8 4 14 8 L 14 12 L 2 12 Z M 8 3 L 8 8 M 5 5 L 8 3 L 11 5',
  captains_cabin: 'M 3 5 h 10 v 8 h -10 z M 6 7 h 4 v 3 h -4 z M 5 11 h 6 M 8 3 v 2',
  gun_deck:       'M 2 9 h 12 v 3 h -12 z M 4 7 h 2 v 2 h -2 z M 10 7 h 2 v 2 h -2 z',
  cargo_hold:     'M 3 6 h 10 v 7 h -10 z M 5 8 h 2 v 3 h -2 z M 9 8 h 2 v 3 h -2 z',
  crows_nest:     'M 8 2 L 5 5 L 5 8 L 11 8 L 11 5 Z M 8 8 L 8 14 M 6 14 L 10 14',

  // Western rooms
  saloon:         'M 2 7 h 12 v 6 h -12 z M 5 7 v -3 M 9 7 v -3 M 7 9 h 2 v 4 h -2 z',
  main_street:    'M 2 6 L 14 6 M 2 10 L 14 10 M 4 8 h 2 M 8 8 h 2 M 12 8 h 2',
  sheriff_office: 'M 4 6 h 8 v 7 h -8 z M 7 9 L 9 9 L 9 13 L 7 13 Z M 6 3 L 10 3 L 10 6 L 6 6 Z',
  general_store:  'M 3 5 h 10 v 8 h -10 z M 5 7 h 2 v 2 h -2 z M 9 7 h 2 v 2 h -2 z M 6 11 h 4',
  stable:         'M 3 4 L 8 2 L 13 4 L 13 13 L 3 13 Z M 6 7 h 4 v 6 h -4 z',

  // Cyberpunk rooms
  noodle_bar:   'M 3 7 Q 8 4 13 7 V 12 H 3 Z M 5 9 h 2 v 2 h -2 z M 9 9 h 2 v 2 h -2 z',
  market:       'M 2 8 h 12 v 4 h -12 z M 4 4 L 4 8 M 8 4 L 8 8 M 12 4 L 12 8',
  server_room:  'M 4 4 h 8 v 2 h -8 z M 4 7 h 8 v 2 h -8 z M 4 10 h 8 v 2 h -8 z',
  rooftop:      'M 2 13 h 12 M 4 6 v 7 M 8 3 v 10 M 12 8 v 5',
  penthouse:    'M 3 4 h 10 v 3 h -10 z M 3 7 h 10 v 6 h -10 z M 7 10 h 2 v 3 h -2 z',
};

/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */

export function GameMap({
  isOpen, onClose, scenarioId, rooms, npcs, currentRoomId, visitedRooms,
  onTravel, disabled = false,
  mode = 'singleplayer',
  teammates = [],
  myName,
  myColor,
}: GameMapProps) {
  const [hoveredRoomId, setHoveredRoomId] = useState<string | null>(null);
  const [traveling, setTraveling] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Reset traveling state when position actually changes
  useEffect(() => {
    setTraveling(null);
  }, [currentRoomId]);

  const layout: ScenarioMapLayout | undefined = MAP_LAYOUTS[scenarioId];
  const themeKey = resolveTheme(scenarioId);
  const theme = THEMES[themeKey];

  const currentRoom = rooms.find((r) => r.id === currentRoomId);
  const adjacentIds = useMemo(() => {
    if (!currentRoom) return new Set<string>();
    return new Set(Object.values(currentRoom.exits));
  }, [currentRoom]);

  const npcsByRoom = useMemo(() => {
    const map: Record<string, MapNPC[]> = {};
    for (const npc of npcs) {
      if (!map[npc.roomId]) map[npc.roomId] = [];
      map[npc.roomId].push(npc);
    }
    return map;
  }, [npcs]);

  // Teammates grouped by room — but only show in rooms *I* have visited
  const visibleTeammatesByRoom = useMemo(() => {
    const map: Record<string, MapTeammate[]> = {};
    if (mode !== 'multiplayer') return map;
    const visitedSet = new Set(visitedRooms);
    for (const t of teammates) {
      if (!visitedSet.has(t.currentRoomId)) continue; // fog of war personal
      if (!map[t.currentRoomId]) map[t.currentRoomId] = [];
      map[t.currentRoomId].push(t);
    }
    return map;
  }, [teammates, visitedRooms, mode]);

  if (!isOpen) return null;

  // Build edges
  const edgeSet = new Set<string>();
  const edges: Array<{ from: string; to: string; fromVisited: boolean; toVisited: boolean }> = [];
  if (layout) {
    for (const room of rooms) {
      if (!layout.rooms[room.id]) continue;
      for (const targetId of Object.values(room.exits)) {
        const key = [room.id, targetId].sort().join('::');
        if (edgeSet.has(key)) continue;
        edgeSet.add(key);
        if (!layout.rooms[targetId]) continue;
        edges.push({
          from: room.id,
          to: targetId,
          fromVisited: visitedRooms.includes(room.id),
          toVisited: visitedRooms.includes(targetId),
        });
      }
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Special+Elite&family=Cinzel:wght@400;700&family=Orbitron:wght@400;700;900&family=Pirata+One&family=IM+Fell+English:ital@0;1&family=Rye&family=Audiowide&display=swap');
        @keyframes mapSlideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes mapFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      <div onClick={onClose} style={backdropStyle} />
      <div style={{
        ...panelStyle,
        width: mode === 'multiplayer' ? '78%' : '68%',
        maxWidth: mode === 'multiplayer' ? '1100px' : '900px',
        backgroundColor: theme.panelBg, fontFamily: theme.bodyFont,
      }}>
        <Header theme={theme} onClose={onClose} visitedCount={visitedRooms.length} totalCount={rooms.length} />

        {/* Main area: map + (optional) team sidebar */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Map canvas */}
          <div style={{
            flex: 1, overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '12px 16px',
          }}>
            {layout ? (
              <svg
                viewBox={`0 0 ${layout.viewBox.width} ${layout.viewBox.height}`}
                style={{
                  width: '100%', height: '100%',
                  display: 'block',
                  filter: 'drop-shadow(0 12px 32px rgba(0,0,0,0.7))',
                }}
              >
                <defs>
                  <ThemeDefs themeKey={themeKey} />
                </defs>

                <ThemeBackground themeKey={themeKey} viewBox={layout.viewBox} />
                <ThemeOrnaments themeKey={themeKey} viewBox={layout.viewBox} theme={theme} />

                {/* Edges */}
                {edges.map(({ from, to, fromVisited, toVisited }) => {
                  const a = layout.rooms[from];
                  const b = layout.rooms[to];
                  if (!a || !b) return null;
                  return (
                    <ThemedEdge
                      key={`${from}-${to}`}
                      themeKey={themeKey}
                      from={a} to={b}
                      bothVisited={fromVisited && toVisited}
                      theme={theme}
                    />
                  );
                })}

                {/* Rooms */}
                {rooms.map((room) => {
                  const pos = layout.rooms[room.id];
                  if (!pos) return null;
                  const isVisited = visitedRooms.includes(room.id);
                  const isCurrent = room.id === currentRoomId;
                  const isAdjacent = adjacentIds.has(room.id);
                  const isHovered = hoveredRoomId === room.id;
                  const isTraveling = traveling === room.id;
                  const clickable = isAdjacent && !disabled && !isCurrent && !traveling;
                  const npcNames = isVisited ? (npcsByRoom[room.id] || []).map((n) => n.name) : [];
                  const teammatesHere = visibleTeammatesByRoom[room.id] || [];

                  return (
                    <ThemedRoom
                      key={room.id}
                      themeKey={themeKey}
                      theme={theme}
                      room={room}
                      pos={pos}
                      isVisited={isVisited}
                      isCurrent={isCurrent}
                      isAdjacent={isAdjacent}
                      isHovered={isHovered}
                      isTraveling={isTraveling}
                      clickable={clickable}
                      npcNames={npcNames}
                      teammatesHere={teammatesHere}
                      onMouseEnter={() => setHoveredRoomId(room.id)}
                      onMouseLeave={() => setHoveredRoomId(null)}
                      onClick={() => {
                        if (clickable) {
                          setTraveling(room.id);
                          onTravel(room.name);
                          setTimeout(() => onClose(), 250);
                        }
                      }}
                    />
                  );
                })}
              </svg>
            ) : (
              <div style={{ color: theme.mutedText, fontFamily: theme.bodyFont, fontStyle: 'italic' }}>
                Map not available.
              </div>
            )}
          </div>

          {/* Team sidebar (MP only) */}
          {mode === 'multiplayer' && (
            <TeamSidebar
              theme={theme}
              teammates={teammates}
              rooms={rooms}
              visitedRooms={visitedRooms}
              currentRoomId={currentRoomId}
              myName={myName}
              myColor={myColor}
            />
          )}
        </div>

        {/* Footer */}
        <Footer theme={theme} />
      </div>
    </>
  );
}

/* ================================================================== */
/*  HEADER & FOOTER                                                    */
/* ================================================================== */

function Header({
  theme, onClose, visitedCount, totalCount,
}: {
  theme: Theme;
  onClose: () => void;
  visitedCount: number;
  totalCount: number;
}) {
  return (
    <div style={{
      padding: '22px 28px 18px',
      borderBottom: `1px solid ${theme.borderColor}`,
      backgroundColor: theme.headerBg,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
    }}>
      <div>
        <h2 style={{
          margin: 0, fontSize: '22px', color: theme.accent,
          fontFamily: theme.titleFont, fontWeight: 'normal',
          letterSpacing: '1px',
          textShadow: `0 0 20px ${theme.accent}33`,
        }}>
          {theme.title}
        </h2>
        <p style={{
          margin: '6px 0 0', fontSize: '10px', color: theme.mutedText,
          fontFamily: theme.bodyFont, letterSpacing: '2px', textTransform: 'uppercase',
        }}>
          {theme.subtitle} &nbsp;&middot;&nbsp; {visitedCount}/{totalCount} Discovered
        </p>
      </div>
      <button
        onClick={onClose}
        style={{
          background: 'none', border: `1px solid ${theme.borderColor}`,
          width: '32px', height: '32px', borderRadius: '4px',
          color: theme.mutedText, fontSize: '14px', cursor: 'pointer',
          transition: 'all 0.2s', fontFamily: 'monospace',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.accent; e.currentTarget.style.color = theme.accent; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.borderColor; e.currentTarget.style.color = theme.mutedText; }}
      >
        {'\u2715'}
      </button>
    </div>
  );
}

function Footer({ theme }: { theme: Theme }) {
  return (
    <div style={{
      padding: '12px 28px',
      borderTop: `1px solid ${theme.borderColor}`,
      backgroundColor: theme.footerBg,
      display: 'flex', gap: '20px', flexWrap: 'wrap',
      fontSize: '10px', fontFamily: theme.bodyFont,
      color: theme.mutedText, letterSpacing: '1.5px', textTransform: 'uppercase',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <svg width="12" height="12" viewBox="0 0 12 12">
          <circle cx="6" cy="6" r="4" fill={theme.accent}>
            <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
          </circle>
        </svg>
        You
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <svg width="12" height="12" viewBox="0 0 12 12">
          <rect x="1" y="1" width="10" height="10" rx="2" fill={theme.accent} opacity="0.25" stroke={theme.accent} strokeWidth="1.2" />
        </svg>
        Visited
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <svg width="12" height="12" viewBox="0 0 12 12">
          <rect x="1" y="1" width="10" height="10" rx="2" fill="none" stroke={theme.mutedText} strokeWidth="1.2" strokeDasharray="2 2" opacity="0.5" />
        </svg>
        Unknown
      </span>
      <span style={{ marginLeft: 'auto', color: theme.mutedText, fontStyle: 'italic', textTransform: 'none', letterSpacing: '0.5px' }}>
        Click an adjacent node to travel
      </span>
    </div>
  );
}

/* ================================================================== */
/*  TEAM SIDEBAR (MP only)                                             */
/* ================================================================== */

function TeamSidebar({
  theme, teammates, rooms, visitedRooms, currentRoomId, myName, myColor,
}: {
  theme: Theme;
  teammates: MapTeammate[];
  rooms: MapRoom[];
  visitedRooms: string[];
  currentRoomId: string;
  myName?: string;
  myColor?: string;
}) {
  const roomNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of rooms) m[r.id] = r.name;
    return m;
  }, [rooms]);

  const myRoomName = roomNameMap[currentRoomId] || currentRoomId;
  const visitedSet = new Set(visitedRooms);

  return (
    <div style={{
      width: '220px',
      borderLeft: `1px solid ${theme.borderColor}`,
      backgroundColor: theme.headerBg,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Sidebar header */}
      <div style={{
        padding: '14px 16px 10px',
        borderBottom: `1px solid ${theme.borderColor}`,
      }}>
        <div style={{
          fontSize: '11px', color: theme.mutedText,
          fontFamily: 'monospace', letterSpacing: '2px', textTransform: 'uppercase',
        }}>
          Team
        </div>
        <div style={{
          fontSize: '13px', color: theme.accent,
          fontFamily: theme.titleFont, marginTop: '2px',
          letterSpacing: '1px',
        }}>
          {teammates.length + 1} Detectives
        </div>
      </div>

      {/* Team list */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '12px 10px',
        display: 'flex', flexDirection: 'column', gap: '8px',
      }}>
        {/* Me first */}
        {myName && (
          <TeamMemberRow
            theme={theme}
            name={myName}
            color={myColor || theme.accent}
            locationLabel={myRoomName}
            isConnected={true}
            isSelf={true}
          />
        )}

        {/* Other teammates */}
        {teammates.map((t) => {
          const visible = visitedSet.has(t.currentRoomId);
          return (
            <TeamMemberRow
              key={t.id}
              theme={theme}
              name={t.name}
              color={t.color}
              locationLabel={visible ? (roomNameMap[t.currentRoomId] || t.currentRoomId) : 'Unknown'}
              locationUnknown={!visible}
              isConnected={t.isConnected}
            />
          );
        })}
      </div>

      {/* Footer hint */}
      <div style={{
        padding: '10px 14px',
        borderTop: `1px solid ${theme.borderColor}`,
        fontSize: '9px', color: theme.mutedText,
        fontFamily: theme.bodyFont, fontStyle: 'italic',
        opacity: 0.75, lineHeight: '1.5',
      }}>
        Teammate locations only visible in rooms you've explored.
      </div>
    </div>
  );
}

function TeamMemberRow({
  theme, name, color, locationLabel, locationUnknown = false, isConnected, isSelf = false,
}: {
  theme: Theme;
  name: string;
  color: string;
  locationLabel: string;
  locationUnknown?: boolean;
  isConnected: boolean;
  isSelf?: boolean;
}) {
  return (
    <div style={{
      padding: '10px 12px',
      backgroundColor: isSelf ? `${theme.accent}15` : `${theme.borderColor}33`,
      border: `1px solid ${isSelf ? theme.accent : theme.borderColor}`,
      borderRadius: '8px',
      display: 'flex', alignItems: 'center', gap: '10px',
      transition: 'all 0.2s',
    }}>
      {/* Avatar badge */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%',
          backgroundColor: color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '13px', fontFamily: 'monospace', fontWeight: 'bold',
          color: '#0a0604',
          boxShadow: isSelf ? `0 0 12px ${color}88` : `0 2px 6px rgba(0,0,0,0.4)`,
          opacity: isConnected ? 1 : 0.4,
          border: isSelf ? `2px solid ${theme.accent}` : `2px solid ${theme.headerBg}`,
        }}>
          {name.charAt(0).toUpperCase()}
        </div>
        {/* Online/offline indicator */}
        <div style={{
          position: 'absolute', bottom: '-1px', right: '-1px',
          width: '10px', height: '10px', borderRadius: '50%',
          backgroundColor: isConnected ? '#5bcf7f' : '#5a5545',
          border: `1.5px solid ${theme.headerBg}`,
        }} />
      </div>

      {/* Name + location */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '12px', color: isSelf ? theme.accent : '#e0d8c8',
          fontFamily: theme.titleFont, fontWeight: isSelf ? 'bold' : 'normal',
          letterSpacing: '0.5px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {name}
          {isSelf && <span style={{ fontSize: '9px', color: theme.mutedText, marginLeft: '6px', fontWeight: 'normal' }}>(you)</span>}
        </div>
        <div style={{
          fontSize: '10px', color: theme.mutedText,
          fontFamily: 'monospace', letterSpacing: '0.5px',
          marginTop: '2px',
          fontStyle: locationUnknown ? 'italic' : 'normal',
          opacity: locationUnknown ? 0.6 : 0.9,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {locationUnknown ? '\u2753 Unknown' : locationLabel}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  THEME DEFS — filters, patterns, gradients                          */
/* ================================================================== */

function ThemeDefs({ themeKey }: { themeKey: ThemeKey }) {
  return (
    <>
      <filter id="mapGlow">
        <feGaussianBlur stdDeviation="4" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="mapSoftBlur"><feGaussianBlur stdDeviation="2" /></filter>
      <filter id="mapStrongBlur"><feGaussianBlur stdDeviation="6" /></filter>

      {themeKey === 'noir' && (
        <>
          <filter id="corkTexture">
            <feTurbulence baseFrequency="0.9" numOctaves="3" seed="7" />
            <feColorMatrix values="0 0 0 0 0.35 0 0 0 0 0.22 0 0 0 0 0.10 0 0 0 0.55 0" />
          </filter>
          <radialGradient id="corkVignette" cx="50%" cy="50%" r="75%">
            <stop offset="0%" stopColor="#3a2a15" stopOpacity="0" />
            <stop offset="100%" stopColor="#0a0503" stopOpacity="0.9" />
          </radialGradient>
          <filter id="photoPaper">
            <feTurbulence baseFrequency="0.7" numOctaves="2" seed="3" />
            <feColorMatrix values="0 0 0 0 0.95 0 0 0 0 0.90 0 0 0 0 0.78 0 0 0 0.06 0" />
          </filter>
        </>
      )}

      {themeKey === 'haunted' && (
        <>
          <radialGradient id="candleLight" cx="50%" cy="30%" r="90%">
            <stop offset="0%" stopColor="#4a2838" stopOpacity="0.5" />
            <stop offset="70%" stopColor="#1a0a20" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#040208" stopOpacity="1" />
          </radialGradient>
          <pattern id="gothicBrick" width="28" height="14" patternUnits="userSpaceOnUse">
            <line x1="0" y1="7" x2="28" y2="7" stroke="#3a2a48" strokeWidth="0.4" opacity="0.4" />
            <line x1="14" y1="0" x2="14" y2="7" stroke="#3a2a48" strokeWidth="0.4" opacity="0.4" />
            <line x1="0" y1="7" x2="0" y2="14" stroke="#3a2a48" strokeWidth="0.4" opacity="0.4" />
          </pattern>
          <filter id="agedParchment">
            <feTurbulence baseFrequency="0.02" numOctaves="2" seed="4" />
            <feColorMatrix values="0 0 0 0 0.15 0 0 0 0 0.10 0 0 0 0 0.18 0 0 0 0.3 0" />
          </filter>
        </>
      )}

      {themeKey === 'space' && (
        <>
          <pattern id="techGrid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e4868" strokeWidth="0.5" opacity="0.5" />
          </pattern>
          <pattern id="techFineGrid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#1a3050" strokeWidth="0.3" opacity="0.35" />
          </pattern>
          <radialGradient id="techGlow" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#0a2a4a" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#02060c" stopOpacity="0.8" />
          </radialGradient>
          <linearGradient id="scanLine" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#70d8f8" stopOpacity="0" />
            <stop offset="50%" stopColor="#70d8f8" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#70d8f8" stopOpacity="0" />
          </linearGradient>
        </>
      )}

      {themeKey === 'pirate' && (
        <>
          <filter id="parchmentNoise">
            <feTurbulence baseFrequency="0.015" numOctaves="4" seed="15" />
            <feColorMatrix values="0 0 0 0 0.65 0 0 0 0 0.45 0 0 0 0 0.20 0 0 0 0.35 0" />
          </filter>
          <radialGradient id="parchmentAge" cx="50%" cy="50%" r="80%">
            <stop offset="0%" stopColor="#f0c878" stopOpacity="0" />
            <stop offset="70%" stopColor="#4a2810" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#1a0a04" stopOpacity="0.7" />
          </radialGradient>
          <pattern id="seaWave" width="60" height="18" patternUnits="userSpaceOnUse">
            <path d="M 0 9 Q 15 3, 30 9 T 60 9" fill="none" stroke="#6a4018" strokeWidth="0.7" opacity="0.25" />
            <path d="M 0 13 Q 15 7, 30 13 T 60 13" fill="none" stroke="#6a4018" strokeWidth="0.5" opacity="0.18" />
          </pattern>
          <pattern id="islandGrass" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M 0 6 L 2 4 M 4 6 L 6 4" fill="none" stroke="#5a3818" strokeWidth="0.8" opacity="0.4" />
          </pattern>
        </>
      )}

      {themeKey === 'western' && (
        <>
          <filter id="dustNoise">
            <feTurbulence baseFrequency="0.04" numOctaves="2" seed="11" />
            <feColorMatrix values="0 0 0 0 0.55 0 0 0 0 0.38 0 0 0 0 0.18 0 0 0 0.35 0" />
          </filter>
          <radialGradient id="desertSun" cx="30%" cy="20%" r="90%">
            <stop offset="0%" stopColor="#f0b060" stopOpacity="0.18" />
            <stop offset="50%" stopColor="#8a5820" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#2a1408" stopOpacity="0.75" />
          </radialGradient>
          <pattern id="woodGrain" width="80" height="6" patternUnits="userSpaceOnUse">
            <line x1="0" y1="3" x2="80" y2="3" stroke="#4a2e14" strokeWidth="0.3" opacity="0.3" />
            <line x1="0" y1="5" x2="80" y2="5" stroke="#4a2e14" strokeWidth="0.2" opacity="0.2" />
          </pattern>
        </>
      )}

      {themeKey === 'cyberpunk' && (
        <>
          <linearGradient id="citySky" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1a0840" stopOpacity="1" />
            <stop offset="50%" stopColor="#0a0420" stopOpacity="1" />
            <stop offset="100%" stopColor="#030108" stopOpacity="1" />
          </linearGradient>
          <pattern id="neonGrid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#50188a" strokeWidth="0.5" opacity="0.7" />
          </pattern>
          <pattern id="neonFineGrid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#30106a" strokeWidth="0.3" opacity="0.4" />
          </pattern>
          <linearGradient id="horizonGlow" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f050d8" stopOpacity="0" />
            <stop offset="50%" stopColor="#f050d8" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#f050d8" stopOpacity="0" />
          </linearGradient>
        </>
      )}
    </>
  );
}

/* ================================================================== */
/*  BACKGROUND — per theme                                             */
/* ================================================================== */

function ThemeBackground({
  themeKey, viewBox,
}: {
  themeKey: ThemeKey;
  viewBox: { width: number; height: number };
}) {
  const W = viewBox.width;
  const H = viewBox.height;

  if (themeKey === 'noir') {
    return (
      <>
        <rect width={W} height={H} fill="#4a3018" />
        <rect width={W} height={H} filter="url(#corkTexture)" />
        <rect width={W} height={H} fill="url(#corkVignette)" />
      </>
    );
  }

  if (themeKey === 'haunted') {
    return (
      <>
        <rect width={W} height={H} fill="#0a0712" />
        <rect width={W} height={H} fill="url(#gothicBrick)" />
        <rect width={W} height={H} filter="url(#agedParchment)" opacity="0.6" />
        <rect width={W} height={H} fill="url(#candleLight)" />
      </>
    );
  }

  if (themeKey === 'space') {
    return (
      <>
        <rect width={W} height={H} fill="#02060c" />
        <rect width={W} height={H} fill="url(#techFineGrid)" />
        <rect width={W} height={H} fill="url(#techGrid)" />
        <rect width={W} height={H} fill="url(#techGlow)" />
        {/* Stars scattered */}
        {[...Array(30)].map((_, i) => {
          const x = ((i * 137) % W);
          const y = ((i * 271) % H);
          return <circle key={i} cx={x} cy={y} r={((i % 3) * 0.3) + 0.4} fill="#70d8f8" opacity={0.2 + ((i % 5) * 0.1)} />;
        })}
      </>
    );
  }

  if (themeKey === 'pirate') {
    return (
      <>
        <rect width={W} height={H} fill="#d0a860" />
        <rect width={W} height={H} filter="url(#parchmentNoise)" />
        <rect width={W} height={H} fill="url(#seaWave)" />
        {/* Torn edge illusion at corners */}
        <rect width={W} height={H} fill="url(#parchmentAge)" />
      </>
    );
  }

  if (themeKey === 'western') {
    return (
      <>
        <rect width={W} height={H} fill="#a88050" />
        <rect width={W} height={H} filter="url(#dustNoise)" />
        <rect width={W} height={H} fill="url(#desertSun)" />
        {/* Horizon line with mountain silhouette */}
        <path
          d={`M 0 ${H * 0.22} Q ${W * 0.2} ${H * 0.14}, ${W * 0.35} ${H * 0.20} Q ${W * 0.5} ${H * 0.15}, ${W * 0.65} ${H * 0.21} Q ${W * 0.85} ${H * 0.17}, ${W} ${H * 0.22} L ${W} 0 L 0 0 Z`}
          fill="#5a3818"
          opacity="0.25"
        />
      </>
    );
  }

  if (themeKey === 'cyberpunk') {
    return (
      <>
        <rect width={W} height={H} fill="url(#citySky)" />
        <rect width={W} height={H} fill="url(#neonFineGrid)" />
        <rect width={W} height={H} fill="url(#neonGrid)" />
        {/* City skyline silhouette */}
        <g opacity="0.6">
          <rect x="0" y={H * 0.7} width={W * 0.12} height={H * 0.3} fill="#050208" />
          <rect x={W * 0.12} y={H * 0.6} width={W * 0.08} height={H * 0.4} fill="#050208" />
          <rect x={W * 0.2} y={H * 0.75} width={W * 0.1} height={H * 0.25} fill="#050208" />
          <rect x={W * 0.3} y={H * 0.55} width={W * 0.09} height={H * 0.45} fill="#050208" />
          <rect x={W * 0.39} y={H * 0.68} width={W * 0.07} height={H * 0.32} fill="#050208" />
          <rect x={W * 0.46} y={H * 0.58} width={W * 0.12} height={H * 0.42} fill="#050208" />
          <rect x={W * 0.58} y={H * 0.72} width={W * 0.08} height={H * 0.28} fill="#050208" />
          <rect x={W * 0.66} y={H * 0.63} width={W * 0.09} height={H * 0.37} fill="#050208" />
          <rect x={W * 0.75} y={H * 0.68} width={W * 0.11} height={H * 0.32} fill="#050208" />
          <rect x={W * 0.86} y={H * 0.57} width={W * 0.14} height={H * 0.43} fill="#050208" />
        </g>
        {/* Horizon glow */}
        <rect x="0" y={H * 0.55} width={W} height={H * 0.2} fill="url(#horizonGlow)" opacity="0.6" />
        {/* Scattered neon window dots */}
        {[...Array(40)].map((_, i) => {
          const x = (i * 73) % W;
          const y = H * 0.6 + ((i * 31) % (H * 0.4));
          const color = i % 3 === 0 ? '#f050d8' : i % 3 === 1 ? '#50d8f0' : '#f0d850';
          return <rect key={i} x={x} y={y} width="2" height="2" fill={color} opacity={0.5 + ((i % 4) * 0.1)} />;
        })}
      </>
    );
  }

  return <rect width={W} height={H} fill="#0a0a0a" />;
}

/* ================================================================== */
/*  ORNAMENTS — Decorative scene-setters                               */
/* ================================================================== */

function ThemeOrnaments({
  themeKey, viewBox, theme,
}: {
  themeKey: ThemeKey;
  viewBox: { width: number; height: number };
  theme: Theme;
}) {
  const W = viewBox.width;
  const H = viewBox.height;

  if (themeKey === 'noir') {
    return (
      <g pointerEvents="none">
        {/* CONFIDENTIAL stamp rotated */}
        <g transform={`translate(${W - 80}, ${H - 80}) rotate(-15)`} opacity="0.35">
          <rect x="-55" y="-20" width="110" height="40" fill="none" stroke="#a81818" strokeWidth="3" />
          <rect x="-50" y="-15" width="100" height="30" fill="none" stroke="#a81818" strokeWidth="1" />
          <text x="0" y="5" textAnchor="middle" fill="#a81818" fontFamily="'Special Elite', monospace" fontSize="16" fontWeight="bold" letterSpacing="3">CONFIDENTIAL</text>
        </g>
        {/* Coffee ring stains */}
        <g transform={`translate(60, ${H - 70})`} opacity="0.22">
          <circle r="42" fill="none" stroke="#3a1a08" strokeWidth="2.5" />
          <circle r="36" fill="none" stroke="#3a1a08" strokeWidth="0.8" />
          <circle r="28" fill="none" stroke="#3a1a08" strokeWidth="0.5" opacity="0.6" />
        </g>
        {/* Thumbtacks on corners */}
        {[[24, 24], [W - 24, 24]].map(([x, y], i) => (
          <g key={i} transform={`translate(${x}, ${y})`}>
            <circle r="6" fill="#8a1010" />
            <circle r="4" fill="#c82020" />
            <circle cx="-1.5" cy="-1.5" r="1.5" fill="#f8a8a8" opacity="0.8" />
          </g>
        ))}
        {/* Coffee stain bottom-right */}
        <g transform={`translate(${W - 200}, 60)`} opacity="0.18">
          <ellipse rx="28" ry="18" fill="#3a1a08" />
          <ellipse cx="30" cy="5" rx="8" ry="5" fill="#3a1a08" />
        </g>
      </g>
    );
  }

  if (themeKey === 'haunted') {
    return (
      <g pointerEvents="none">
        {/* Ornate corner flourishes */}
        {[[30, 30, 1, 1], [W - 30, 30, -1, 1], [30, H - 30, 1, -1], [W - 30, H - 30, -1, -1]].map(([x, y, sx, sy], i) => (
          <g key={i} transform={`translate(${x}, ${y}) scale(${sx}, ${sy})`} opacity="0.5" stroke={theme.accent} fill="none" strokeWidth="1.2">
            <path d="M 0 0 L 50 0 M 0 0 L 0 50" />
            <path d="M 0 0 Q 20 5, 25 25 Q 5 20, 0 0" />
            <path d="M 25 25 L 40 40 M 25 25 Q 35 20, 50 25" />
            <circle cx="0" cy="0" r="3" fill={theme.accent} opacity="0.7" />
            <circle cx="50" cy="0" r="2" fill={theme.accent} opacity="0.5" />
            <circle cx="0" cy="50" r="2" fill={theme.accent} opacity="0.5" />
          </g>
        ))}
        {/* Candle icons top-center */}
        <g transform={`translate(${W / 2}, 20)`} opacity="0.5">
          <line x1="-50" y1="0" x2="-40" y2="0" stroke={theme.accent} strokeWidth="0.6" />
          <line x1="40" y1="0" x2="50" y2="0" stroke={theme.accent} strokeWidth="0.6" />
          <circle cx="0" cy="0" r="4" fill="none" stroke={theme.accent} strokeWidth="1" />
          <circle cx="0" cy="0" r="1.5" fill={theme.accent} />
        </g>
      </g>
    );
  }

  if (themeKey === 'space') {
    return (
      <g pointerEvents="none">
        {/* Technical corner markers */}
        {[[20, 20, 1, 1], [W - 20, 20, -1, 1], [20, H - 20, 1, -1], [W - 20, H - 20, -1, -1]].map(([x, y, sx, sy], i) => (
          <g key={i} transform={`translate(${x}, ${y}) scale(${sx}, ${sy})`}>
            <path d="M 0 0 L 20 0 M 0 0 L 0 20" fill="none" stroke={theme.accent} strokeWidth="1" opacity="0.8" />
            <rect x="3" y="3" width="4" height="4" fill={theme.accent} opacity="0.6" />
          </g>
        ))}
        {/* Technical readout text */}
        <text x={30} y={H / 2 + 5} fill={theme.accent} fontSize="8" fontFamily="'Orbitron', monospace" opacity="0.4" transform={`rotate(-90, 30, ${H / 2})`}>INTERNAL STRUCTURE MAP v4.2</text>
        {/* Scan line animation */}
        <rect x="0" y="0" width={W} height="40" fill="url(#scanLine)">
          <animate attributeName="y" values={`0;${H - 40};0`} dur="8s" repeatCount="indefinite" />
        </rect>
        {/* Crosshair center */}
        <g opacity="0.2" transform={`translate(${W / 2}, ${H / 2})`}>
          <line x1="-12" y1="0" x2="12" y2="0" stroke={theme.accent} strokeWidth="0.4" />
          <line x1="0" y1="-12" x2="0" y2="12" stroke={theme.accent} strokeWidth="0.4" />
          <circle r="20" fill="none" stroke={theme.accent} strokeWidth="0.3" />
        </g>
      </g>
    );
  }

  if (themeKey === 'pirate') {
    return (
      <g pointerEvents="none">
        {/* Compass rose */}
        <g transform={`translate(${W - 80}, ${H - 80})`} opacity="0.85">
          <circle r="38" fill="#d0a868" opacity="0.4" />
          <circle r="34" fill="none" stroke="#3a1808" strokeWidth="1.5" />
          <circle r="28" fill="none" stroke="#3a1808" strokeWidth="0.8" />
          {/* 8-point compass */}
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
            const isCardinal = angle % 90 === 0;
            const length = isCardinal ? 30 : 18;
            const rad = (angle - 90) * Math.PI / 180;
            return (
              <g key={angle}>
                <line x1="0" y1="0" x2={Math.cos(rad) * length} y2={Math.sin(rad) * length}
                  stroke="#3a1808" strokeWidth={isCardinal ? 1.8 : 0.8} opacity={isCardinal ? 0.85 : 0.5} />
                {isCardinal && (
                  <polygon
                    points={`${Math.cos(rad) * length},${Math.sin(rad) * length} ${Math.cos(rad + 0.15) * (length - 10)},${Math.sin(rad + 0.15) * (length - 10)} ${Math.cos(rad - 0.15) * (length - 10)},${Math.sin(rad - 0.15) * (length - 10)}`}
                    fill="#3a1808" opacity="0.75"
                  />
                )}
              </g>
            );
          })}
          {/* N label */}
          <text y="-42" textAnchor="middle" fill="#2a1004" fontSize="12" fontFamily="'Pirata One', serif" fontWeight="bold">N</text>
          <text y="48" textAnchor="middle" fill="#2a1004" fontSize="9" fontFamily="'Pirata One', serif" opacity="0.7">S</text>
          <text x="42" y="3" textAnchor="start" fill="#2a1004" fontSize="9" fontFamily="'Pirata One', serif" opacity="0.7">E</text>
          <text x="-42" y="3" textAnchor="end" fill="#2a1004" fontSize="9" fontFamily="'Pirata One', serif" opacity="0.7">W</text>
        </g>
        {/* Sea monster doodle */}
        <g transform={`translate(80, ${H - 60})`} opacity="0.45">
          <path d="M 0 0 Q 15 -15, 30 0 T 60 0 T 90 0" fill="none" stroke="#3a1808" strokeWidth="1.2" />
          <path d="M -10 -8 Q -5 -14, 0 -8" fill="none" stroke="#3a1808" strokeWidth="1.2" />
          <circle cx="-6" cy="-10" r="1" fill="#3a1808" />
          <path d="M 8 -4 L 12 -8" fill="none" stroke="#3a1808" strokeWidth="1" />
        </g>
        {/* X marks the spot */}
        <g transform={`translate(${W - 100}, 60) rotate(18)`} opacity="0.7">
          <line x1="-15" y1="-15" x2="15" y2="15" stroke="#a01818" strokeWidth="3.5" strokeLinecap="round" />
          <line x1="15" y1="-15" x2="-15" y2="15" stroke="#a01818" strokeWidth="3.5" strokeLinecap="round" />
        </g>
        {/* Ship silhouette top-left */}
        <g transform={`translate(60, 50)`} opacity="0.35">
          <path d="M -25 5 L 25 5 L 20 15 L -20 15 Z" fill="#3a1808" />
          <line x1="0" y1="-18" x2="0" y2="5" stroke="#3a1808" strokeWidth="1.5" />
          <path d="M 0 -18 L 0 5 L 15 0 Z" fill="#3a1808" opacity="0.5" />
          <path d="M 0 -14 L 0 3 L -12 -2 Z" fill="#3a1808" opacity="0.4" />
        </g>
        {/* Title banner */}
        <g transform={`translate(${W / 2}, 24)`} opacity="0.7">
          <text textAnchor="middle" fill="#2a1004" fontSize="13" fontFamily="'Pirata One', serif" letterSpacing="3">
            {'\u2693 HERE BE TREASURE \u2693'}
          </text>
        </g>
      </g>
    );
  }

  if (themeKey === 'western') {
    return (
      <g pointerEvents="none">
        {/* Sun with rays */}
        <g transform="translate(60, 60)" opacity="0.55">
          <circle r="16" fill="#f0b060" />
          <circle r="16" fill={theme.accent} filter="url(#mapGlow)" opacity="0.5" />
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((a) => (
            <line key={a} x1="0" y1="0"
              x2={Math.cos(a * Math.PI / 180) * 26} y2={Math.sin(a * Math.PI / 180) * 26}
              stroke="#f0b060" strokeWidth={a % 60 === 0 ? 2 : 1} strokeLinecap="round" opacity="0.7" />
          ))}
        </g>
        {/* Cactus left */}
        <g transform={`translate(40, ${H - 70})`} opacity="0.5">
          <path d="M 0 0 L 0 -40 M -8 -28 Q -8 -18, 0 -18 M 8 -22 Q 8 -12, 0 -12"
            fill="none" stroke="#2a1808" strokeWidth="3" strokeLinecap="round" />
        </g>
        {/* Cactus right */}
        <g transform={`translate(${W - 50}, ${H - 60})`} opacity="0.45">
          <path d="M 0 0 L 0 -30 M -7 -22 L -7 -14 L 0 -14"
            fill="none" stroke="#2a1808" strokeWidth="2.5" strokeLinecap="round" />
        </g>
        {/* Wagon wheel */}
        <g transform={`translate(${W - 80}, ${H - 60})`} opacity="0.35">
          <circle r="22" fill="none" stroke="#2a1808" strokeWidth="2" />
          <circle r="18" fill="none" stroke="#2a1808" strokeWidth="1" />
          <circle r="4" fill="#2a1808" />
          {[0, 45, 90, 135].map((a) => (
            <line key={a} x1={Math.cos(a * Math.PI / 180) * 22} y1={Math.sin(a * Math.PI / 180) * 22}
              x2={Math.cos((a + 180) * Math.PI / 180) * 22} y2={Math.sin((a + 180) * Math.PI / 180) * 22}
              stroke="#2a1808" strokeWidth="1.5" />
          ))}
        </g>
        {/* Tumbleweed suggestion - small circle texture */}
        <g transform={`translate(${W / 2 + 120}, ${H - 80})`} opacity="0.3">
          <circle r="8" fill="none" stroke="#5a3818" strokeWidth="1" />
          <circle r="5" fill="none" stroke="#5a3818" strokeWidth="0.6" />
        </g>
        {/* Title banner "WANTED"-style */}
        <g transform={`translate(${W / 2}, 28)`} opacity="0.75">
          <text textAnchor="middle" fill="#2a1808" fontSize="14" fontFamily="'Rye', serif" letterSpacing="6">
            — FRONTIER TOWN —
          </text>
        </g>
      </g>
    );
  }

  if (themeKey === 'cyberpunk') {
    return (
      <g pointerEvents="none">
        {/* Neon frame brackets */}
        {[[12, 12, 1, 1], [W - 12, 12, -1, 1], [12, H - 12, 1, -1], [W - 12, H - 12, -1, -1]].map(([x, y, sx, sy], i) => (
          <g key={i} transform={`translate(${x}, ${y}) scale(${sx}, ${sy})`}>
            <path d="M 0 0 L 30 0 M 0 0 L 0 30" fill="none" stroke={theme.accent} strokeWidth="2.5" />
            <path d="M 0 0 L 30 0 M 0 0 L 0 30" fill="none" stroke={theme.accent} strokeWidth="5" opacity="0.3" filter="url(#mapSoftBlur)" />
          </g>
        ))}
        {/* HUD text readouts */}
        <text x={24} y={H - 18} fill={theme.accent} fontSize="10" fontFamily="'Orbitron', monospace" opacity="0.85" letterSpacing="2">
          {'>>'} GRID-07 :: SCAN_ACTIVE
        </text>
        <text x={W - 24} y={H - 18} textAnchor="end" fill="#50d8f0" fontSize="10" fontFamily="'Orbitron', monospace" opacity="0.75" letterSpacing="2">
          [{'{'} LINK_OK {'}'}]
        </text>
        <text x={24} y={30} fill={theme.accent} fontSize="9" fontFamily="'Orbitron', monospace" opacity="0.7" letterSpacing="1">
          2087.04.08 / 00:42:17
        </text>
        <text x={W - 24} y={30} textAnchor="end" fill="#50d8f0" fontSize="9" fontFamily="'Orbitron', monospace" opacity="0.6" letterSpacing="1">
          SGNL:++++ / ENC:AES-512
        </text>
        {/* Crosshair center */}
        <g transform={`translate(${W / 2}, ${H / 2})`} opacity="0.15">
          <circle r="26" fill="none" stroke={theme.accent} strokeWidth="1" />
          <line x1="-32" y1="0" x2="-18" y2="0" stroke={theme.accent} strokeWidth="1.2" />
          <line x1="18" y1="0" x2="32" y2="0" stroke={theme.accent} strokeWidth="1.2" />
          <line x1="0" y1="-32" x2="0" y2="-18" stroke={theme.accent} strokeWidth="1.2" />
          <line x1="0" y1="18" x2="0" y2="32" stroke={theme.accent} strokeWidth="1.2" />
        </g>
      </g>
    );
  }

  return null;
}

/* ================================================================== */
/*  EDGE — Connection styles per theme                                 */
/* ================================================================== */

function ThemedEdge({
  themeKey, from, to, bothVisited, theme,
}: {
  themeKey: ThemeKey;
  from: { x: number; y: number };
  to: { x: number; y: number };
  bothVisited: boolean;
  theme: Theme;
}) {
  if (themeKey === 'noir') {
    // Red string — slight curve
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2 - 8;
    return (
      <>
        <path d={`M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`}
          fill="none" stroke="#a01818" strokeWidth={bothVisited ? 2 : 0}
          opacity={bothVisited ? 0.7 : 0} strokeLinecap="round" />
        {!bothVisited && (
          <line x1={from.x} y1={from.y} x2={to.x} y2={to.y}
            stroke="#4a3018" strokeWidth="1" opacity="0.35" strokeDasharray="3 4" />
        )}
      </>
    );
  }

  if (themeKey === 'pirate') {
    // Hand-drawn dotted trail
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const perpX = -dy / len * 6;
    const perpY = dx / len * 6;
    return (
      <path d={`M ${from.x} ${from.y} Q ${midX + perpX} ${midY + perpY} ${to.x} ${to.y}`}
        fill="none" stroke={bothVisited ? '#3a1808' : '#5a3818'}
        strokeWidth={bothVisited ? 2 : 1.2}
        strokeDasharray={bothVisited ? '2 3' : '1 4'}
        opacity={bothVisited ? 0.85 : 0.4}
        strokeLinecap="round" />
    );
  }

  if (themeKey === 'cyberpunk') {
    return (
      <>
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke={theme.accent} strokeWidth="6" opacity={bothVisited ? 0.25 : 0.1}
          filter="url(#mapSoftBlur)" />
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke={bothVisited ? theme.accent : '#60205a'}
          strokeWidth={bothVisited ? 1.5 : 1}
          strokeDasharray={bothVisited ? undefined : '4 4'}
          opacity={bothVisited ? 1 : 0.5} />
      </>
    );
  }

  if (themeKey === 'space') {
    return (
      <>
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke={bothVisited ? theme.accent : '#2a4a6a'}
          strokeWidth={bothVisited ? 2.5 : 1}
          opacity={bothVisited ? 0.75 : 0.4}
          strokeDasharray={bothVisited ? undefined : '2 3'} />
        <circle cx={from.x} cy={from.y} r="3" fill="none" stroke={theme.accent} strokeWidth="1" opacity="0.5" />
        <circle cx={to.x} cy={to.y} r="3" fill="none" stroke={theme.accent} strokeWidth="1" opacity="0.5" />
      </>
    );
  }

  if (themeKey === 'haunted') {
    return (
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y}
        stroke={bothVisited ? theme.accent : '#2a2038'}
        strokeWidth={bothVisited ? 2 : 1}
        opacity={bothVisited ? 0.7 : 0.35}
        strokeDasharray={bothVisited ? '6 2' : '2 5'}
        strokeLinecap="round" />
    );
  }

  if (themeKey === 'western') {
    // Dusty dirt road
    return (
      <>
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke="#5a3818" strokeWidth={bothVisited ? 7 : 3.5}
          opacity={bothVisited ? 0.5 : 0.25}
          strokeLinecap="round" />
        <line x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke="#6a4818" strokeWidth={bothVisited ? 3 : 1.5}
          opacity={bothVisited ? 0.7 : 0.3}
          strokeDasharray={bothVisited ? '6 4' : '3 5'}
          strokeLinecap="round" />
      </>
    );
  }

  return (
    <line x1={from.x} y1={from.y} x2={to.x} y2={to.y}
      stroke={theme.accent} strokeWidth={bothVisited ? 2 : 1}
      opacity={bothVisited ? 0.7 : 0.3}
      strokeDasharray={bothVisited ? undefined : '3 3'} />
  );
}

/* ================================================================== */
/*  ROOM NODE — Per-theme card rendering                               */
/* ================================================================== */

function ThemedRoom({
  themeKey, theme, room, pos, isVisited, isCurrent, isAdjacent, isHovered, isTraveling, clickable, npcNames,
  teammatesHere = [],
  onMouseEnter, onMouseLeave, onClick,
}: {
  themeKey: ThemeKey;
  theme: Theme;
  room: MapRoom;
  pos: { x: number; y: number };
  isVisited: boolean;
  isCurrent: boolean;
  isAdjacent: boolean;
  isHovered: boolean;
  isTraveling: boolean;
  clickable: boolean;
  npcNames: string[];
  teammatesHere?: MapTeammate[];
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
}) {
  const W = 158;
  const H = 82;
  const x = pos.x - W / 2;
  const y = pos.y - H / 2;
  const iconPath = ROOM_ICONS[room.id] || '';

  const displayName = isVisited ? room.name : '???';
  const npcLine = npcNames.length === 0 ? null : npcNames.length === 1 ? npcNames[0] : `${npcNames.length} characters`;

  // Determine rotation for noir polaroid effect
  const rotation = themeKey === 'noir' ? ((pos.x * 7 + pos.y * 3) % 7) - 3 : 0;

  return (
    <g
      transform={`translate(${x}, ${y}) ${rotation !== 0 ? `rotate(${rotation}, ${W / 2}, ${H / 2})` : ''}`}
      style={{ cursor: clickable ? 'pointer' : 'default', opacity: isTraveling ? 0.5 : 1, transition: 'opacity 0.25s' }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={clickable ? onClick : undefined}
    >
      {/* Glow for current / hover */}
      {(isCurrent || (clickable && isHovered)) && (
        <rect x="-8" y="-8" width={W + 16} height={H + 16} rx="10"
          fill="none" stroke={theme.accent} strokeWidth="3"
          opacity={isCurrent ? 0.4 : 0.25} filter="url(#mapGlow)" />
      )}

      {/* Card body — theme-specific */}
      <RoomCardShape
        themeKey={themeKey}
        theme={theme}
        W={W} H={H}
        isVisited={isVisited}
        isCurrent={isCurrent}
        isHovered={isHovered}
        isAdjacent={isAdjacent}
      />

      {/* Room icon */}
      {isVisited && iconPath && (
        <g transform="translate(14, 14)">
          <path d={iconPath}
            fill="none" stroke={theme.visitedText} strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ opacity: 0.8 }}
          />
        </g>
      )}

      {/* Room name */}
      <text
        x={W / 2}
        y={npcLine ? H / 2 + 2 : H / 2 + 6}
        textAnchor="middle"
        fill={clickable && isHovered ? theme.accent : (isVisited ? theme.visitedText : theme.mutedText)}
        fontSize={isVisited ? 14 : 16}
        fontFamily={theme.titleFont}
        fontWeight={themeKey === 'cyberpunk' || themeKey === 'space' ? 'bold' : 'normal'}
        letterSpacing={themeKey === 'cyberpunk' ? '1.5' : themeKey === 'space' ? '1' : '0.5'}
        style={{
          userSelect: 'none',
          pointerEvents: 'none',
          transition: 'fill 0.2s',
        }}
      >
        {displayName}
      </text>

      {/* NPC line */}
      {npcLine && (
        <text
          x={W / 2}
          y={H / 2 + 18}
          textAnchor="middle"
          fill={theme.mutedText}
          fontSize="9"
          fontFamily="monospace"
          letterSpacing="1"
          style={{ userSelect: 'none', pointerEvents: 'none', opacity: 0.85 }}
        >
          {npcLine.toUpperCase().slice(0, 24)}
        </text>
      )}

      {/* Current position star */}
      {isCurrent && (
        <g transform={`translate(${W / 2}, -14)`} pointerEvents="none">
          <circle r="12" fill={theme.accent} opacity="0.3">
            <animate attributeName="r" values="8;16;8" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.5;0.1;0.5" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle r="7" fill={theme.accent} />
          <path d="M 0 -4 L 1.2 -1.2 L 4 -1.2 L 1.8 1 L 2.6 4 L 0 2.4 L -2.6 4 L -1.8 1 L -4 -1.2 L -1.2 -1.2 Z"
            fill={theme.panelBg} transform="scale(0.85)" />
        </g>
      )}

      {/* Travel arrow for adjacent */}
      {clickable && !isCurrent && (
        <g transform={`translate(${W - 16}, 16)`} pointerEvents="none" style={{ opacity: isHovered ? 1 : 0.8 }}>
          <circle r="9" fill={theme.accent} opacity={isHovered ? 1 : 0.85} />
          <circle r="9" fill="none" stroke={theme.accent} strokeWidth="1.5" opacity="0.5" filter="url(#mapGlow)" />
          <path d="M -3 -4 L 4 0 L -3 4 Z" fill={theme.panelBg} transform="translate(0.8, 0)" />
        </g>
      )}

      {/* Traveling state */}
      {isTraveling && (
        <text x={W / 2} y={H + 20} textAnchor="middle"
          fill={theme.accent} fontSize="10" fontFamily={theme.bodyFont}
          fontStyle="italic" style={{ pointerEvents: 'none' }}>
          traveling...
        </text>
      )}

      {/* Teammate avatars — bottom of card, horizontally stacked */}
      {teammatesHere.length > 0 && (
        <g transform={`translate(${W / 2}, ${H + 2})`} pointerEvents="none">
          {teammatesHere.map((t, i) => {
            const spacing = 22;
            const totalWidth = (teammatesHere.length - 1) * spacing;
            const offsetX = -totalWidth / 2 + i * spacing;
            return (
              <g key={t.id} transform={`translate(${offsetX}, 10)`}>
                {/* Ring glow */}
                <circle r="11" fill={t.color} opacity="0.3" filter="url(#mapSoftBlur)" />
                {/* Badge */}
                <circle r="9" fill={t.color} stroke={theme.panelBg} strokeWidth="1.5"
                  opacity={t.isConnected ? 1 : 0.4} />
                {/* Initial */}
                <text y="3" textAnchor="middle" fill="#0a0604"
                  fontSize="10" fontFamily="monospace" fontWeight="bold"
                  style={{ opacity: t.isConnected ? 1 : 0.5 }}>
                  {t.name.charAt(0).toUpperCase()}
                </text>
                {/* Offline indicator */}
                {!t.isConnected && (
                  <line x1="-6" y1="-6" x2="6" y2="6" stroke="#2a1005" strokeWidth="1.5" opacity="0.7" />
                )}
              </g>
            );
          })}
        </g>
      )}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/*  Room card shape — per theme visual                                 */
/* ------------------------------------------------------------------ */

function RoomCardShape({
  themeKey, theme, W, H, isVisited, isCurrent, isHovered, isAdjacent,
}: {
  themeKey: ThemeKey;
  theme: Theme;
  W: number;
  H: number;
  isVisited: boolean;
  isCurrent: boolean;
  isHovered: boolean;
  isAdjacent: boolean;
}) {
  const borderColor = isCurrent
    ? theme.accent
    : (isAdjacent && isHovered)
      ? theme.accent
      : (isVisited ? theme.accent : theme.mutedText);
  const borderWidth = isCurrent ? 2.8 : (isAdjacent && isHovered ? 2.5 : 1.4);
  const borderOpacity = isVisited ? 1 : 0.4;

  if (themeKey === 'noir') {
    // Polaroid photo style
    return (
      <>
        {/* Photo shadow */}
        <rect x="3" y="4" width={W} height={H} rx="2" fill="#050302" opacity="0.5" />
        {/* Photo border (cream) */}
        <rect width={W} height={H} rx="2"
          fill={isVisited ? '#f0e0c0' : '#3a2a15'}
          stroke={borderColor} strokeWidth={borderWidth} strokeOpacity={borderOpacity} />
        {/* Inner photo area */}
        <rect x="6" y="6" width={W - 12} height={H - 22} rx="1"
          fill={isVisited ? '#d8b878' : '#1a1008'}
          opacity={isVisited ? 1 : 0.8} />
        {/* Paper texture */}
        {isVisited && (
          <rect width={W} height={H} rx="2" filter="url(#photoPaper)" opacity="0.25" pointerEvents="none" />
        )}
        {/* Thumbtack */}
        <g transform={`translate(${W / 2}, 2)`} pointerEvents="none">
          <circle r="4" fill="#8a1010" />
          <circle r="3" fill="#c82020" />
          <circle cx="-1" cy="-1" r="1" fill="#f8a8a8" opacity="0.8" />
        </g>
      </>
    );
  }

  if (themeKey === 'haunted') {
    // Gothic arch
    return (
      <>
        <path
          d={`M 0 24 Q 0 0, ${W / 2} 0 Q ${W} 0, ${W} 24 L ${W} ${H} L 0 ${H} Z`}
          fill={isVisited ? '#180d22' : '#0a0510'}
          stroke={borderColor} strokeWidth={borderWidth} strokeOpacity={borderOpacity}
        />
        {/* Inner line ornament */}
        {isVisited && (
          <path
            d={`M 6 26 Q 6 6, ${W / 2} 6 Q ${W - 6} 6, ${W - 6} 26 L ${W - 6} ${H - 6} L 6 ${H - 6} Z`}
            fill="none" stroke={theme.accent} strokeWidth="0.6" opacity="0.4"
          />
        )}
        {/* Keystone at top */}
        {isVisited && (
          <>
            <rect x={W / 2 - 5} y="0" width="10" height="6" fill={theme.accent} opacity="0.5" />
            <circle cx={W / 2} cy="3" r="1.5" fill={theme.accent} opacity="0.8" />
          </>
        )}
      </>
    );
  }

  if (themeKey === 'space') {
    // Tech panel
    return (
      <>
        <rect width={W} height={H} rx="3"
          fill={isVisited ? '#0a1828' : '#030810'}
          stroke={borderColor} strokeWidth={borderWidth} strokeOpacity={borderOpacity} />
        {/* Top accent bar */}
        {isVisited && (
          <>
            <rect x="0" y="0" width={W} height="3" fill={theme.accent} opacity="0.7" />
            {/* Rivets */}
            {[[6, 6], [W - 6, 6], [6, H - 6], [W - 6, H - 6]].map(([cx, cy], i) => (
              <circle key={i} cx={cx} cy={cy} r="1.5" fill={theme.accent} opacity="0.65" />
            ))}
            {/* Room code */}
            <text x={W - 8} y="14" textAnchor="end" fill={theme.mutedText}
              fontSize="7" fontFamily="'Orbitron', monospace" opacity="0.6" letterSpacing="1">
              MOD-{((W + H) % 9000 + 1000).toString()}
            </text>
          </>
        )}
      </>
    );
  }

  if (themeKey === 'pirate') {
    // Aged wooden sign
    return (
      <>
        {/* Wood plank body */}
        <rect width={W} height={H} rx="4"
          fill={isVisited ? '#c89858' : '#3a2a14'}
          stroke={borderColor} strokeWidth={borderWidth} strokeOpacity={borderOpacity} />
        {/* Wood grain lines */}
        {isVisited && (
          <>
            <line x1="0" y1={H / 3} x2={W} y2={H / 3} stroke="#5a3818" strokeWidth="0.4" opacity="0.35" />
            <line x1="0" y1={2 * H / 3} x2={W} y2={2 * H / 3} stroke="#5a3818" strokeWidth="0.4" opacity="0.35" />
            {/* Corner nails */}
            {[[6, 6], [W - 6, 6], [6, H - 6], [W - 6, H - 6]].map(([cx, cy], i) => (
              <g key={i}>
                <circle cx={cx} cy={cy} r="2" fill="#3a1808" />
                <circle cx={cx - 0.6} cy={cy - 0.6} r="0.7" fill="#8a6028" opacity="0.7" />
              </g>
            ))}
          </>
        )}
      </>
    );
  }

  if (themeKey === 'western') {
    // Wooden building with pitched roof
    return (
      <>
        {/* Roof */}
        <polygon
          points={`4,16 ${W / 2},2 ${W - 4},16`}
          fill={isVisited ? '#8a5820' : '#2a1808'}
          stroke={borderColor} strokeWidth={borderWidth} strokeOpacity={borderOpacity} />
        {/* Body */}
        <rect x="0" y="16" width={W} height={H - 16} rx="2"
          fill={isVisited ? '#d8a868' : '#2a1808'}
          stroke={borderColor} strokeWidth={borderWidth} strokeOpacity={borderOpacity} />
        {/* Wood grain */}
        {isVisited && <rect x="0" y="16" width={W} height={H - 16} rx="2" fill="url(#woodGrain)" />}
        {/* Windows */}
        {isVisited && (
          <>
            <rect x="10" y={H - 28} width="10" height="10" fill="#3a2a15" stroke="#6a4818" strokeWidth="0.8" />
            <line x1="15" y1={H - 28} x2="15" y2={H - 18} stroke="#6a4818" strokeWidth="0.5" />
            <line x1="10" y1={H - 23} x2="20" y2={H - 23} stroke="#6a4818" strokeWidth="0.5" />
            <rect x={W - 20} y={H - 28} width="10" height="10" fill="#3a2a15" stroke="#6a4818" strokeWidth="0.8" />
            <line x1={W - 15} y1={H - 28} x2={W - 15} y2={H - 18} stroke="#6a4818" strokeWidth="0.5" />
            <line x1={W - 20} y1={H - 23} x2={W - 10} y2={H - 23} stroke="#6a4818" strokeWidth="0.5" />
          </>
        )}
      </>
    );
  }

  if (themeKey === 'cyberpunk') {
    // Holographic panel with bracket corners
    return (
      <>
        {/* Outer glow */}
        <rect width={W} height={H} rx="3"
          fill="none" stroke={theme.accent} strokeWidth="4"
          opacity={isVisited ? 0.15 : 0.05} filter="url(#mapSoftBlur)" />
        {/* Main panel */}
        <rect width={W} height={H} rx="3"
          fill={isVisited ? '#150826' : '#08040f'}
          stroke={borderColor} strokeWidth={borderWidth} strokeOpacity={borderOpacity} />
        {/* Inner panel line */}
        {isVisited && (
          <rect x="3" y="3" width={W - 6} height={H - 6} rx="2"
            fill="none" stroke={theme.accent} strokeWidth="0.5" opacity="0.4" />
        )}
        {/* Corner brackets */}
        {isVisited && (
          <g stroke={theme.accent} strokeWidth="2" fill="none">
            <path d="M 0 10 L 0 0 L 10 0" />
            <path d={`M ${W - 10} 0 L ${W} 0 L ${W} 10`} />
            <path d={`M 0 ${H - 10} L 0 ${H} L 10 ${H}`} />
            <path d={`M ${W - 10} ${H} L ${W} ${H} L ${W} ${H - 10}`} />
          </g>
        )}
        {/* Horizontal scan lines */}
        {isVisited && (
          <g opacity="0.15">
            <line x1="0" y1={H / 3} x2={W} y2={H / 3} stroke={theme.accent} strokeWidth="0.3" />
            <line x1="0" y1={2 * H / 3} x2={W} y2={2 * H / 3} stroke={theme.accent} strokeWidth="0.3" />
          </g>
        )}
      </>
    );
  }

  return (
    <rect width={W} height={H} rx="6"
      fill={isVisited ? '#1a1410' : '#0a0805'}
      stroke={borderColor} strokeWidth={borderWidth} strokeOpacity={borderOpacity} />
  );
}

/* ------------------------------------------------------------------ */
/*  Shared styles                                                      */
/* ------------------------------------------------------------------ */

const backdropStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)',
  zIndex: 70, backdropFilter: 'blur(3px)',
};

const panelStyle: React.CSSProperties = {
  position: 'fixed', top: 0, right: 0, bottom: 0,
  width: '68%', maxWidth: '900px', minWidth: '400px',
  borderLeft: '1px solid #2a2520',
  zIndex: 71,
  display: 'flex', flexDirection: 'column',
  animation: 'mapSlideIn 0.35s ease-out',
  boxShadow: '-12px 0 40px rgba(0,0,0,0.6)',
};

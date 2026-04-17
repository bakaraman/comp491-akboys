/**
 * Minimap.tsx — Compact SVG room graph for the procedural world
 *
 * Renders every room as a node, exits as edges, player positions as
 * colored dots. Visited rooms are opaque, unvisited rooms are faded.
 * No images — pure SVG. Small panel that sits in a corner of the game UI.
 *
 * @author AKBOYS Team
 * @since 2026-04-17
 */

'use client';

import React, { useMemo } from 'react';
import { T } from '@/lib/tr';

export interface MinimapRoom {
  id: string;
  name: string;
  exits: Record<string, string | null>;
}

export interface MinimapPlayer {
  id: string;
  name: string;
  color: string;
  currentRoomId: string;
  visitedRooms: string[];
}

export interface MinimapProps {
  rooms: MinimapRoom[];
  players: MinimapPlayer[];
  myPlayerId: string | null;
  onClose?: () => void;
}

interface LayoutNode {
  id: string;
  name: string;
  x: number;
  y: number;
}

/**
 * Lay out rooms on a grid using BFS from room 0. Nodes are placed on a 4-wide grid.
 */
function layout(rooms: MinimapRoom[]): LayoutNode[] {
  if (rooms.length === 0) return [];
  const W = 4;
  const positions = new Map<string, { x: number; y: number }>();

  const start = rooms[0].id;
  const queue: string[] = [start];
  positions.set(start, { x: 0, y: 0 });

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const room = rooms.find((r) => r.id === cur);
    if (!room) continue;
    const pos = positions.get(cur)!;

    const dirOffsets: Record<string, { dx: number; dy: number }> = {
      north: { dx: 0, dy: -1 },
      south: { dx: 0, dy: 1 },
      east: { dx: 1, dy: 0 },
      west: { dx: -1, dy: 0 },
      up: { dx: 0, dy: -1 },
      down: { dx: 0, dy: 1 },
    };

    for (const [dir, target] of Object.entries(room.exits)) {
      if (!target || positions.has(target)) continue;
      const off = dirOffsets[dir] ?? { dx: 1, dy: 0 };
      let tx = pos.x + off.dx;
      let ty = pos.y + off.dy;
      // Try to avoid collisions
      let tries = 0;
      while (
        Array.from(positions.values()).some((p) => p.x === tx && p.y === ty) &&
        tries < 8
      ) {
        tx += 1;
        tries++;
      }
      positions.set(target, { x: tx, y: ty });
      queue.push(target);
    }
  }

  // Rooms not reached via BFS — drop them into a grid row below
  let fallbackRow = 0;
  let fallbackCol = 0;
  for (const r of rooms) {
    if (!positions.has(r.id)) {
      let maxY = 0;
      for (const p of positions.values()) if (p.y > maxY) maxY = p.y;
      positions.set(r.id, { x: fallbackCol, y: maxY + 2 });
      fallbackCol = (fallbackCol + 1) % W;
      if (fallbackCol === 0) fallbackRow++;
    }
  }

  return rooms.map((r) => ({
    id: r.id,
    name: r.name,
    x: positions.get(r.id)!.x,
    y: positions.get(r.id)!.y,
  }));
}

export function Minimap({ rooms, players, myPlayerId, onClose }: MinimapProps) {
  const nodes = useMemo(() => layout(rooms), [rooms]);

  const me = players.find((p) => p.id === myPlayerId);
  const teamRooms = new Set(
    players.flatMap((p) => (p.id === myPlayerId ? [] : [p.currentRoomId])),
  );
  const visited = new Set(me?.visitedRooms ?? []);

  // Normalize coords into a 0-based grid
  const minX = Math.min(...nodes.map((n) => n.x), 0);
  const minY = Math.min(...nodes.map((n) => n.y), 0);
  const gridNodes = nodes.map((n) => ({ ...n, x: n.x - minX, y: n.y - minY }));
  const cols = Math.max(...gridNodes.map((n) => n.x), 0) + 1;
  const rowsCount = Math.max(...gridNodes.map((n) => n.y), 0) + 1;

  const cellW = 110;
  const cellH = 64;
  const pad = 20;
  const W = cols * cellW + pad * 2;
  const H = rowsCount * cellH + pad * 2;

  // Build edges
  const edges: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  for (const room of rooms) {
    const from = gridNodes.find((n) => n.id === room.id);
    if (!from) continue;
    for (const target of Object.values(room.exits)) {
      if (!target) continue;
      const to = gridNodes.find((n) => n.id === target);
      if (!to) continue;
      edges.push({
        x1: pad + from.x * cellW + cellW / 2,
        y1: pad + from.y * cellH + cellH / 2,
        x2: pad + to.x * cellW + cellW / 2,
        y2: pad + to.y * cellH + cellH / 2,
      });
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: '70px',
        right: '16px',
        width: `${Math.min(W, 460)}px`,
        maxWidth: '90vw',
        backgroundColor: '#0d0d0d',
        border: '1px solid #2a2520',
        borderRadius: '12px',
        padding: '12px',
        zIndex: 40,
        boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}
      >
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: '11px',
            letterSpacing: '2px',
            color: '#5a5545',
            textTransform: 'uppercase',
          }}
        >
          {T.minimap.title}
        </span>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#6a6050',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            ×
          </button>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        {/* edges */}
        {edges.map((e, i) => (
          <line
            key={i}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke="#3a3530"
            strokeWidth="1.5"
          />
        ))}

        {/* rooms */}
        {gridNodes.map((node) => {
          const isMine = node.id === me?.currentRoomId;
          const wasVisited = visited.has(node.id);
          const hasTeammate = teamRooms.has(node.id);

          return (
            <g key={node.id} transform={`translate(${pad + node.x * cellW},${pad + node.y * cellH})`}>
              <rect
                x="6"
                y="8"
                width={cellW - 12}
                height={cellH - 16}
                rx="8"
                ry="8"
                fill={isMine ? '#1a1510' : wasVisited ? '#141210' : '#0a0a0a'}
                stroke={
                  isMine
                    ? '#d4a843'
                    : hasTeammate
                    ? '#5ba3cf'
                    : wasVisited
                    ? '#3a3530'
                    : '#1e1e1e'
                }
                strokeWidth={isMine ? 2 : 1}
                opacity={wasVisited || isMine ? 1 : 0.45}
              />
              <text
                x={cellW / 2}
                y={cellH / 2 + 2}
                textAnchor="middle"
                fontFamily="Georgia, serif"
                fontSize="12"
                fill={isMine ? '#d4a843' : wasVisited ? '#b0a080' : '#5a5545'}
                style={{ pointerEvents: 'none' }}
              >
                {node.name.length > 16 ? `${node.name.slice(0, 15)}…` : node.name}
              </text>
              {/* Player dots */}
              {players
                .filter((p) => p.currentRoomId === node.id)
                .map((p, i) => (
                  <circle
                    key={p.id}
                    cx={cellW - 14 - i * 10}
                    cy={12}
                    r="4"
                    fill={p.color}
                    stroke="#0a0a0a"
                    strokeWidth="1"
                  />
                ))}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div
        style={{
          marginTop: '10px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '10px',
          fontFamily: 'monospace',
          color: '#5a5545',
          flexWrap: 'wrap',
        }}
      >
        <span>
          <span style={{ color: '#d4a843' }}>●</span> {T.minimap.youAreHere}
        </span>
        <span>
          <span style={{ color: '#b0a080' }}>■</span> {T.minimap.visited}
        </span>
        <span>
          <span style={{ color: '#5a5545' }}>▢</span> {T.minimap.unvisited}
        </span>
      </div>
    </div>
  );
}

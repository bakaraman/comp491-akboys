/**
 * replay/[sessionId]/page.tsx — Scrubbable post-game replay viewer
 *
 * Fetches /api/chat/replay/:sessionId for ended sessions and renders a
 * timeline scrubber with Play / Pause / 1x / 2x / 5x speed controls.
 * Accessible without a player account when the session is ended.
 *
 * Issue #52 — spectator mode + finished-session replay
 *
 * @author AKBOYS Team
 * @since 2026-05-07
 */

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface HistoryMessage {
  role: string;
  content: string;
  playerId?: string;
  playerName?: string;
  playerColor?: string;
  messageType?: string;
  timestamp: number;
  visibleTo?: string[];
}

interface ReplayData {
  sessionId: string;
  state: string;
  history: HistoryMessage[];
  world: {
    meta: { title: string; setting: string };
    openingNarration: string;
  } | null;
  reconstruction: {
    title: string;
    conclusion: string;
    events: Array<{
      turn: number;
      time: string;
      roomId: string;
      roomName: string;
      actorName: string;
      description: string;
      isCulpritAction: boolean;
    }>;
  } | null;
  players: Array<{ id: string; name: string; color: string }>;
  mpTurnCount: number;
  createdAt: number;
  lastActivityAt: number;
}

const SPEEDS = [1, 2, 5] as const;
type Speed = (typeof SPEEDS)[number];

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function roleLabel(msg: HistoryMessage): string {
  if (msg.role === 'assistant') return msg.playerName || 'Anlatıcı';
  if (msg.role === 'user') return msg.playerName || 'Oyuncu';
  return 'Sistem';
}

function roleColor(msg: HistoryMessage): string {
  if (msg.role === 'assistant') return '#d4a843';
  if (msg.playerColor) return msg.playerColor;
  return '#7a6a50';
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export default function ReplayPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params?.sessionId as string;

  const [data, setData] = useState<ReplayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Playback state
  const [cursor, setCursor] = useState(0);           // index into data.history
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [showReconstruction, setShowReconstruction] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  /* ---- Fetch replay data ---- */
  useEffect(() => {
    if (!sessionId) return;
    fetch(`${API_BASE}/api/chat/replay/${sessionId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error || `HTTP ${res.status}`);
          setLoading(false);
          return;
        }
        const json = (await res.json()) as ReplayData;
        // Sort history by timestamp
        json.history = json.history
          .filter((m) => m.timestamp)
          .sort((a, b) => a.timestamp - b.timestamp);
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, [sessionId]);

  /* ---- Auto-scroll as cursor advances ---- */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [cursor]);

  /* ---- Playback interval ---- */
  const stopPlayback = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setPlaying(false);
  }, []);

  const startPlayback = useCallback(() => {
    if (!data) return;
    setPlaying(true);
    intervalRef.current = setInterval(() => {
      setCursor((prev) => {
        if (prev >= data.history.length - 1) {
          stopPlayback();
          return prev;
        }
        return prev + 1;
      });
    }, 1200 / speed);
  }, [data, speed, stopPlayback]);

  useEffect(() => {
    if (playing) {
      stopPlayback();
      startPlayback();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed]);

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  const togglePlay = () => {
    if (playing) stopPlayback();
    else startPlayback();
  };

  /* ---- Render ---- */

  if (loading) return (
    <div style={styles.center}>
      <div style={styles.spinner} />
      <p style={{ color: '#7a6a50', marginTop: 16 }}>Replay yükleniyor…</p>
    </div>
  );

  if (error) return (
    <div style={styles.center}>
      <p style={{ color: '#e07878', fontSize: 15 }}>{error}</p>
      <button onClick={() => router.push('/')} style={styles.btnSecondary}>
        Ana Sayfaya Dön
      </button>
    </div>
  );

  if (!data) return null;

  const total = data.history.length;
  const visibleMessages = data.history.slice(0, cursor + 1);
  const atEnd = cursor >= total - 1;

  return (
    <div style={styles.root}>
      {/* ── Header ── */}
      <div style={styles.header}>
        <div>
          <div style={styles.title}>{data.world?.meta.title || 'Oyun Tekrarı'}</div>
          <div style={styles.subtitle}>{data.world?.meta.setting || ''}</div>
        </div>
        <button onClick={() => router.push('/')} style={styles.btnSecondary}>
          Ana Sayfa
        </button>
      </div>

      {/* ── Two-column layout ── */}
      <div style={styles.columns}>

        {/* ── Left: chat timeline ── */}
        <div style={styles.chatColumn}>
          <div style={styles.chatScroll}>
            {visibleMessages.map((msg, i) => (
              <div key={i} style={{
                ...styles.msgRow,
                opacity: i === cursor ? 1 : 0.8,
                borderLeft: i === cursor ? `3px solid ${roleColor(msg)}` : '3px solid transparent',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ ...styles.msgRole, color: roleColor(msg) }}>
                    {roleLabel(msg)}
                  </span>
                  <span style={styles.msgTime}>{formatTime(msg.timestamp)}</span>
                </div>
                <div style={styles.msgContent}>{msg.content}</div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* ── Controls ── */}
          <div style={styles.controls}>
            {/* Scrubber */}
            <input
              type="range"
              min={0}
              max={total - 1}
              value={cursor}
              onChange={(e) => {
                stopPlayback();
                setCursor(Number(e.target.value));
              }}
              style={styles.scrubber}
            />
            <div style={styles.scrubberLabels}>
              <span>Mesaj 1</span>
              <span>{cursor + 1} / {total}</span>
              <span>Mesaj {total}</span>
            </div>

            {/* Playback buttons */}
            <div style={styles.btnRow}>
              <button
                onClick={togglePlay}
                style={{ ...styles.btnPrimary, minWidth: 90 }}
              >
                {playing ? '⏸ Duraklat' : atEnd ? '↩ Başa Dön' : '▶ Oynat'}
              </button>
              {atEnd && (
                <button
                  onClick={() => { stopPlayback(); setCursor(0); }}
                  style={styles.btnSecondary}
                >
                  ↩ Baştan
                </button>
              )}
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  style={{
                    ...styles.btnSpeed,
                    backgroundColor: speed === s ? '#2a2010' : 'transparent',
                    color: speed === s ? '#d4a843' : '#7a6a50',
                    border: speed === s ? '1px solid #d4a843' : '1px solid #2a2520',
                  }}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: session info + reconstruction ── */}
        <div style={styles.sideColumn}>
          {/* Players */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>Oyuncular</div>
            {data.players.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: p.color, flexShrink: 0 }} />
                <span style={{ color: '#c8b89a', fontSize: 13 }}>{p.name}</span>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div style={styles.card}>
            <div style={styles.cardTitle}>Oyun Bilgisi</div>
            <div style={styles.statRow}><span>Toplam tur</span><span>{data.mpTurnCount}</span></div>
            <div style={styles.statRow}><span>Mesaj sayısı</span><span>{total}</span></div>
            <div style={styles.statRow}>
              <span>Oynandı</span>
              <span>{new Date(data.createdAt).toLocaleDateString('tr-TR')}</span>
            </div>
          </div>

          {/* Reconstruction */}
          {data.reconstruction && (
            <div style={styles.card}>
              <div style={styles.cardTitle}>Gerçekte Ne Oldu</div>
              {!showReconstruction ? (
                <button
                  onClick={() => setShowReconstruction(true)}
                  style={styles.btnPrimary}
                >
                  Olay Zincirini Göster
                </button>
              ) : (
                <>
                  {data.reconstruction.events.map((ev, i) => (
                    <div key={i} style={{
                      marginBottom: 12,
                      paddingLeft: 10,
                      borderLeft: ev.isCulpritAction ? '2px solid #cf5b5b' : '2px solid #2a2520',
                    }}>
                      <div style={{ fontSize: 11, color: '#5a5040', marginBottom: 2 }}>
                        {ev.time} — {ev.roomName}
                      </div>
                      <div style={{ fontSize: 12, color: '#c8b89a' }}>
                        {ev.actorName && <strong style={{ color: ev.isCulpritAction ? '#cf5b5b' : '#d4a843' }}>{ev.actorName}: </strong>}
                        {ev.description}
                      </div>
                    </div>
                  ))}
                  <div style={{ marginTop: 12, padding: '10px', backgroundColor: '#0f0f0f', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, color: '#7a6a50', marginBottom: 4 }}>Sonuç</div>
                    <div style={{ fontSize: 13, color: '#c8b89a' }}>{data.reconstruction.conclusion}</div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = {
  root: {
    minHeight: '100vh',
    backgroundColor: '#0a0a0a',
    color: '#e8e0d4',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    display: 'flex' as const,
    flexDirection: 'column' as const,
  },
  center: {
    minHeight: '100vh',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#0a0a0a',
    gap: 16,
  },
  spinner: {
    width: 36,
    height: 36,
    border: '3px solid #2a2520',
    borderTopColor: '#d4a843',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  header: {
    padding: '16px 24px',
    borderBottom: '1px solid #1e1a14',
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    backgroundColor: '#0d0d0d',
  },
  title: {
    fontSize: 20,
    color: '#d4a843',
    fontFamily: 'Georgia, serif',
    fontStyle: 'italic' as const,
  },
  subtitle: {
    fontSize: 12,
    color: '#5a5040',
    marginTop: 2,
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
  },
  columns: {
    flex: 1,
    display: 'flex' as const,
    gap: 0,
    overflow: 'hidden' as const,
    height: 'calc(100vh - 70px)',
  },
  chatColumn: {
    flex: 1,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    borderRight: '1px solid #1e1a14',
  },
  chatScroll: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '16px 20px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 12,
  },
  msgRow: {
    padding: '10px 14px',
    backgroundColor: '#0f0f0f',
    borderRadius: 8,
    transition: 'border-color 0.2s, opacity 0.2s',
  },
  msgRole: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.5px',
  },
  msgTime: {
    fontSize: 10,
    color: '#3a3530',
  },
  msgContent: {
    fontSize: 13,
    color: '#c8b89a',
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap' as const,
  },
  controls: {
    padding: '14px 20px',
    borderTop: '1px solid #1e1a14',
    backgroundColor: '#0d0d0d',
  },
  scrubber: {
    width: '100%',
    accentColor: '#d4a843',
    cursor: 'pointer',
  },
  scrubberLabels: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    fontSize: 10,
    color: '#3a3530',
    marginTop: 4,
    marginBottom: 10,
  },
  btnRow: {
    display: 'flex' as const,
    gap: 8,
    flexWrap: 'wrap' as const,
  },
  btnPrimary: {
    padding: '9px 18px',
    backgroundColor: '#d4a843',
    color: '#0a0a0a',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  btnSecondary: {
    padding: '9px 18px',
    backgroundColor: 'transparent',
    color: '#7a6a50',
    border: '1px solid #2a2520',
    borderRadius: 8,
    fontSize: 13,
    cursor: 'pointer',
    transition: 'border-color 0.15s',
  },
  btnSpeed: {
    padding: '9px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  sideColumn: {
    width: 300,
    overflowY: 'auto' as const,
    padding: '16px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 14,
  },
  card: {
    backgroundColor: '#0f0f0f',
    border: '1px solid #1e1a14',
    borderRadius: 10,
    padding: '14px 16px',
  },
  cardTitle: {
    fontSize: 11,
    color: '#7a6a50',
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    marginBottom: 10,
  },
  statRow: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    fontSize: 12,
    color: '#c8b89a',
    marginBottom: 6,
  },
} as const;

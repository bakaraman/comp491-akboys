/**
 * /admin/usage — Live OpenAI usage dashboard.
 *
 * Reads the `openai_usage` Firestore collection in real time. Every call
 * the server makes shows up here within ~1s. Aggregates: total tokens
 * (today + window), estimated cost, breakdown by purpose and model,
 * and a live tail of the most recent 200 calls.
 *
 * Auth: when NEXT_PUBLIC_FIREBASE_AUTH_ENABLED=true we require a signed-in
 * user. With auth off (local dev) the page is open.
 */

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { authEnabled, getFirestoreClient, subscribeToAuth } from '@/lib/firebase';

interface UsageRow {
  id: string;
  timestamp: number;
  model: string;
  purpose: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  durationMs: number;
  sessionId: string | null;
  success: boolean;
  errorTag: string | null;
}

const WINDOW_SIZE = 200;

function decode(snap: QueryDocumentSnapshot<DocumentData>): UsageRow {
  const d = snap.data();
  return {
    id: snap.id,
    timestamp: Number(d.timestamp ?? 0),
    model: String(d.model ?? '?'),
    purpose: String(d.purpose ?? '?'),
    inputTokens: Number(d.inputTokens ?? 0),
    outputTokens: Number(d.outputTokens ?? 0),
    reasoningTokens: Number(d.reasoningTokens ?? 0),
    totalTokens: Number(d.totalTokens ?? 0),
    estimatedCostUsd: Number(d.estimatedCostUsd ?? 0),
    durationMs: Number(d.durationMs ?? 0),
    sessionId: d.sessionId ?? null,
    success: d.success !== false,
    errorTag: d.errorTag ?? null,
  };
}

function startOfUtcDay(ts: number): boolean {
  const d = new Date(ts);
  const today = new Date();
  return (
    d.getUTCFullYear() === today.getUTCFullYear()
    && d.getUTCMonth() === today.getUTCMonth()
    && d.getUTCDate() === today.getUTCDate()
  );
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtCost(c: number): string {
  if (c < 0.0001) return '<$0.0001';
  if (c < 0.01) return `$${c.toFixed(4)}`;
  return `$${c.toFixed(3)}`;
}

const PURPOSE_COLORS: Record<string, string> = {
  narrator: '#d4a843',
  'narrator-structured': '#c8894a',
  'narrator-nonstream': '#b97f3f',
  suggestion: '#8b6c2a',
  worldgen: '#e8e0d4',
  'reconstruction-events': '#9a9080',
  'reconstruction-conclusion': '#7a7060',
  finale: '#ff8c5a',
  tts: '#6a9bd1',
  image: '#a263d4',
};

function colorFor(purpose: string): string {
  return PURPOSE_COLORS[purpose] ?? '#9a9080';
}

export default function UsageDashboardPage() {
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'no-firestore' | 'auth-required' | 'error'>('loading');
  const [err, setErr] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean>(!authEnabled());

  useEffect(() => {
    if (!authEnabled()) return;
    const unsub = subscribeToAuth((u) => setSignedIn(!!u));
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (authEnabled() && !signedIn) {
      setStatus('auth-required');
      return;
    }
    const fs = getFirestoreClient();
    if (!fs) {
      setStatus('no-firestore');
      return;
    }
    const q = query(collection(fs, 'openai_usage'), orderBy('timestamp', 'desc'), limit(WINDOW_SIZE));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRows(snap.docs.map(decode));
        setStatus('ready');
      },
      (e) => {
        console.error('[usage] snapshot error', e);
        setErr(e.message);
        setStatus('error');
      },
    );
    return () => unsub();
  }, [signedIn]);

  const today = useMemo(() => rows.filter((r) => startOfUtcDay(r.timestamp)), [rows]);
  const byPurpose = useMemo(() => {
    const map = new Map<string, { calls: number; tokens: number; cost: number }>();
    for (const r of today) {
      const cur = map.get(r.purpose) ?? { calls: 0, tokens: 0, cost: 0 };
      cur.calls += 1;
      cur.tokens += r.totalTokens;
      cur.cost += r.estimatedCostUsd;
      map.set(r.purpose, cur);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].cost - a[1].cost);
  }, [today]);

  const byModel = useMemo(() => {
    const map = new Map<string, { calls: number; tokens: number; cost: number }>();
    for (const r of today) {
      const cur = map.get(r.model) ?? { calls: 0, tokens: 0, cost: 0 };
      cur.calls += 1;
      cur.tokens += r.totalTokens;
      cur.cost += r.estimatedCostUsd;
      map.set(r.model, cur);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].cost - a[1].cost);
  }, [today]);

  const totals = useMemo(() => {
    const t = { calls: 0, input: 0, output: 0, reasoning: 0, cost: 0, errors: 0 };
    for (const r of today) {
      t.calls += 1;
      t.input += r.inputTokens;
      t.output += r.outputTokens;
      t.reasoning += r.reasoningTokens;
      t.cost += r.estimatedCostUsd;
      if (!r.success) t.errors += 1;
    }
    return t;
  }, [today]);

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.h1}>OpenAI Usage Dashboard</h1>
          <p style={styles.sub}>
            Live from Firestore · son {WINDOW_SIZE} çağrı · bugün UTC
          </p>
        </div>
        <Link href="/" style={styles.backLink}>← Anasayfa</Link>
      </header>

      {status === 'loading' && <p style={styles.notice}>Bağlanıyor...</p>}
      {status === 'no-firestore' && (
        <p style={styles.notice}>
          Firestore client başlatılamadı. <code>NEXT_PUBLIC_FIREBASE_PROJECT_ID</code> ortam değişkenini kontrol et.
        </p>
      )}
      {status === 'auth-required' && (
        <p style={styles.notice}>
          Auth açık. Önce <Link href="/login" style={{ color: 'var(--accent-gold)' }}>giriş yap</Link>.
        </p>
      )}
      {status === 'error' && (
        <p style={{ ...styles.notice, color: '#ff8c5a' }}>Hata: {err}</p>
      )}

      {status === 'ready' && (
        <>
          <section style={styles.kpiGrid}>
            <Kpi label="Bugün çağrı" value={totals.calls.toLocaleString('tr-TR')} />
            <Kpi label="Bugün maliyet (≈)" value={fmtCost(totals.cost)} accent="#d4a843" />
            <Kpi label="Input token" value={totals.input.toLocaleString('tr-TR')} />
            <Kpi label="Output token" value={totals.output.toLocaleString('tr-TR')} />
            <Kpi label="Reasoning token" value={totals.reasoning.toLocaleString('tr-TR')} />
            <Kpi label="Hata" value={totals.errors.toLocaleString('tr-TR')} accent={totals.errors ? '#ff8c5a' : undefined} />
          </section>

          <section style={styles.twoCol}>
            <div style={styles.card}>
              <h2 style={styles.h2}>Amaç bazında (bugün)</h2>
              <BreakdownTable rows={byPurpose} colorFor={colorFor} />
            </div>
            <div style={styles.card}>
              <h2 style={styles.h2}>Model bazında (bugün)</h2>
              <BreakdownTable rows={byModel} />
            </div>
          </section>

          <section style={styles.card}>
            <h2 style={styles.h2}>Son çağrılar</h2>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Saat</th>
                    <th style={styles.th}>Model</th>
                    <th style={styles.th}>Amaç</th>
                    <th style={styles.thNum}>Input</th>
                    <th style={styles.thNum}>Output</th>
                    <th style={styles.thNum}>Reason</th>
                    <th style={styles.thNum}>Süre</th>
                    <th style={styles.thNum}>Maliyet</th>
                    <th style={styles.th}>Session</th>
                    <th style={styles.th}>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} style={r.success ? undefined : { background: '#3a1a1a' }}>
                      <td style={styles.td}>{fmtTime(r.timestamp)}</td>
                      <td style={styles.td}>{r.model}</td>
                      <td style={{ ...styles.td, color: colorFor(r.purpose) }}>{r.purpose}</td>
                      <td style={styles.tdNum}>{r.inputTokens.toLocaleString('tr-TR')}</td>
                      <td style={styles.tdNum}>{r.outputTokens.toLocaleString('tr-TR')}</td>
                      <td style={styles.tdNum}>{r.reasoningTokens.toLocaleString('tr-TR')}</td>
                      <td style={styles.tdNum}>{(r.durationMs / 1000).toFixed(1)}s</td>
                      <td style={styles.tdNum}>{fmtCost(r.estimatedCostUsd)}</td>
                      <td style={styles.tdMono}>{r.sessionId ? r.sessionId.slice(0, 8) : '—'}</td>
                      <td style={styles.td}>
                        {r.success ? 'ok' : <span style={{ color: '#ff8c5a' }}>{r.errorTag ?? 'fail'}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && (
                <p style={styles.empty}>Henüz çağrı kaydı yok. Bir oyun başlat, log akmaya başlasın.</p>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={styles.kpi}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={{ ...styles.kpiValue, color: accent ?? 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

interface BreakdownRow {
  calls: number;
  tokens: number;
  cost: number;
}

function BreakdownTable({
  rows,
  colorFor,
}: {
  rows: Array<[string, BreakdownRow]>;
  colorFor?: (k: string) => string;
}) {
  if (rows.length === 0) return <p style={styles.empty}>Veri yok.</p>;
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>Anahtar</th>
          <th style={styles.thNum}>Çağrı</th>
          <th style={styles.thNum}>Token</th>
          <th style={styles.thNum}>Maliyet</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td style={{ ...styles.td, color: colorFor?.(k) ?? 'var(--text-primary)' }}>{k}</td>
            <td style={styles.tdNum}>{v.calls.toLocaleString('tr-TR')}</td>
            <td style={styles.tdNum}>{v.tokens.toLocaleString('tr-TR')}</td>
            <td style={styles.tdNum}>{fmtCost(v.cost)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    padding: '24px 32px 48px',
    maxWidth: 1400,
    margin: '0 auto',
    color: 'var(--text-primary)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 28,
    paddingBottom: 16,
    borderBottom: '1px solid var(--border-dark)',
  },
  h1: { fontSize: 26, fontFamily: 'Georgia, serif', color: 'var(--accent-gold)' },
  sub: { color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 },
  backLink: { color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 14 },
  h2: { fontSize: 16, marginBottom: 12, color: 'var(--accent-amber)' },
  notice: {
    padding: '16px 20px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-dark)',
    borderRadius: 6,
    margin: '24px 0',
  },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
    marginBottom: 24,
  },
  kpi: {
    padding: '14px 18px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-dark)',
    borderRadius: 6,
  },
  kpiLabel: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  kpiValue: { fontSize: 24, fontFamily: 'Georgia, serif', marginTop: 4 },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
    gap: 16,
    marginBottom: 24,
  },
  card: {
    padding: 18,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-dark)',
    borderRadius: 6,
    marginBottom: 16,
  },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left',
    padding: '8px 10px',
    borderBottom: '1px solid var(--border-dark)',
    color: 'var(--text-secondary)',
    fontWeight: 'normal',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  thNum: {
    textAlign: 'right',
    padding: '8px 10px',
    borderBottom: '1px solid var(--border-dark)',
    color: 'var(--text-secondary)',
    fontWeight: 'normal',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  td: { padding: '6px 10px', borderBottom: '1px solid #1f1c18' },
  tdNum: { padding: '6px 10px', borderBottom: '1px solid #1f1c18', textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  tdMono: { padding: '6px 10px', borderBottom: '1px solid #1f1c18', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 },
  empty: { color: 'var(--text-secondary)', padding: '12px 4px', fontSize: 13 },
};

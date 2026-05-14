/**
 * useVoiceChat.ts — V-key push-to-talk voice chat (#48)
 *
 * WebRTC mesh: each peer establishes a direct RTCPeerConnection to every
 * other voice participant. Socket.IO is signaling-only — it relays SDP
 * and ICE between peers but never carries audio.
 *
 * The hook handles:
 *   - getUserMedia + per-peer RTCPeerConnection lifecycle
 *   - Voice mesh join/leave via voice:* socket events
 *   - V-key push-to-talk (toggles MediaStreamTrack.enabled on send tracks)
 *   - Talking-peer detection via Web Audio AnalyserNode RMS sampling
 *
 * Browser/permission failure modes degrade gracefully:
 *   - No WebRTC support: hook is a no-op, returns inert state
 *   - Mic permission denied: same — user can't speak or hear (kept
 *     simple for v1; receive-only mode is future work)
 *
 * Mounted at the session page level so it has access to sessionId,
 * myPlayerId, and the live player list. Pass `enabled` to gate it on
 * gameplay state (e.g. only true once the game has started).
 *
 * @author AKBOYS Team
 * @since 2026-05-07
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSocket } from '@/lib/socket';

const DEBUG = '[voice]';
const TALKING_THRESHOLD = 0.04; // RMS threshold for "is talking" (0..1)
const TALKING_SAMPLE_MS = 200;
const RECONNECT_AFTER_MS = 5000;

const STORAGE_INPUT = 'velvet-voice-input';
const STORAGE_OUTPUT = 'velvet-voice-output';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];

export type VoiceStatus = 'idle' | 'connecting' | 'ready' | 'denied' | 'unsupported';

export interface UseVoiceChatArgs {
  sessionId: string;
  myPlayerId: string | null;
  /** Enable voice — set true once the game state allows it (e.g. playing). */
  enabled: boolean;
}

export interface UseVoiceChatReturn {
  status: VoiceStatus;
  /** Player ids who are currently transmitting (audible above threshold). */
  talkingPeerIds: Set<string>;
  /** True while the local user is holding the PTT key. */
  isTransmitting: boolean;
  /** Available input devices (mic). Empty until permission has been granted. */
  inputDevices: MediaDeviceInfo[];
  /** Available output devices (speakers/headphones). */
  outputDevices: MediaDeviceInfo[];
  /** Currently selected input device id (or null = system default). */
  selectedInputId: string | null;
  /** Currently selected output device id (or null = system default). */
  selectedOutputId: string | null;
  setSelectedInputId: (id: string | null) => void;
  setSelectedOutputId: (id: string | null) => void;
}

/* ------------------------------------------------------------------ */
/*  Capability detection                                              */
/* ------------------------------------------------------------------ */

function isWebRTCSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.RTCPeerConnection
      && navigator.mediaDevices
      && typeof navigator.mediaDevices.getUserMedia === 'function',
  );
}

/* ------------------------------------------------------------------ */
/*  Hook                                                              */
/* ------------------------------------------------------------------ */

export function useVoiceChat({ sessionId, myPlayerId, enabled }: UseVoiceChatArgs): UseVoiceChatReturn {
  const supported = useMemo(() => isWebRTCSupported(), []);

  const [status, setStatus] = useState<VoiceStatus>(supported ? 'idle' : 'unsupported');
  const [talkingPeerIds, setTalkingPeerIds] = useState<Set<string>>(new Set());
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputIdState] = useState<string | null>(null);
  const [selectedOutputId, setSelectedOutputIdState] = useState<string | null>(null);

  /* ---- refs (mutable runtime state) ---- */
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const analysersRef = useRef<Map<string, AnalyserNode>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const talkingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const isTransmittingRef = useRef(false); // for closure-stable read in event handlers
  const joinedRef = useRef(false);
  const cancelRef = useRef(false);

  /* ---- localStorage hydration (mic/speaker prefs) ---- */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const i = localStorage.getItem(STORAGE_INPUT);
      const o = localStorage.getItem(STORAGE_OUTPUT);
      if (i) setSelectedInputIdState(i);
      if (o) setSelectedOutputIdState(o);
    } catch {
      // localStorage unavailable, fall back to defaults
    }
  }, []);

  const setSelectedInputId = useCallback((id: string | null) => {
    setSelectedInputIdState(id);
    try {
      if (id) localStorage.setItem(STORAGE_INPUT, id);
      else localStorage.removeItem(STORAGE_INPUT);
    } catch { /* ignore */ }
  }, []);

  const setSelectedOutputId = useCallback((id: string | null) => {
    setSelectedOutputIdState(id);
    try {
      if (id) localStorage.setItem(STORAGE_OUTPUT, id);
      else localStorage.removeItem(STORAGE_OUTPUT);
    } catch { /* ignore */ }
  }, []);

  /* ---- helpers ---- */

  const refreshDevices = useCallback(async () => {
    if (!supported) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputDevices(devices.filter((d) => d.kind === 'audioinput'));
      setOutputDevices(devices.filter((d) => d.kind === 'audiooutput'));
    } catch (err) {
      console.warn(`${DEBUG} enumerateDevices failed`, err);
    }
  }, [supported]);

  const teardownPeer = useCallback((peerId: string) => {
    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) {
      try { pc.close(); } catch { /* ignore */ }
      peerConnectionsRef.current.delete(peerId);
    }
    const audio = remoteAudiosRef.current.get(peerId);
    if (audio) {
      try {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
      } catch { /* ignore */ }
      remoteAudiosRef.current.delete(peerId);
    }
    const analyser = analysersRef.current.get(peerId);
    if (analyser) {
      try { analyser.disconnect(); } catch { /* ignore */ }
      analysersRef.current.delete(peerId);
    }
    const reconnectTimer = reconnectTimersRef.current.get(peerId);
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimersRef.current.delete(peerId);
    }
    setTalkingPeerIds((prev) => {
      if (!prev.has(peerId)) return prev;
      const next = new Set(prev);
      next.delete(peerId);
      return next;
    });
  }, []);

  /* ---- main effect: lifecycle ---- */
  useEffect(() => {
    if (!enabled || !supported || !myPlayerId) return;

    cancelRef.current = false;
    let mounted = true;
    setStatus('connecting');
    const socket = getSocket();

    /* -- request mic + start mesh --
     *
     * A previous device id may live in localStorage but the device itself
     * could be gone (unplugged USB mic, different machine, permission
     * reset). With `deviceId: { exact: ... }` the browser throws
     * OverconstrainedError instead of falling back to default. We catch
     * that explicitly and retry once with a relaxed constraint, then
     * clear the stale selectedInputId so subsequent boots don't repeat
     * the same dance.
     */
    async function acquireStream(): Promise<MediaStream> {
      const preferred: MediaStreamConstraints = {
        audio: selectedInputId
          ? { deviceId: { exact: selectedInputId }, echoCancellation: true, noiseSuppression: true }
          : { echoCancellation: true, noiseSuppression: true },
      };
      try {
        return await navigator.mediaDevices.getUserMedia(preferred);
      } catch (err) {
        const error = err as Error;
        if (selectedInputId && error.name === 'OverconstrainedError') {
          console.warn(
            `${DEBUG} OverconstrainedError for deviceId=${selectedInputId.slice(0, 8)} — falling back to default device`,
          );
          // Clear the stale selection so the next session doesn't trip again.
          setSelectedInputId(null);
          return navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
          });
        }
        throw err;
      }
    }

    async function init() {
      try {
        const stream = await acquireStream();
        if (cancelRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        // Start with mic muted — only V-key transmits.
        stream.getAudioTracks().forEach((t) => { t.enabled = false; });
        localStreamRef.current = stream;

        // Lazy-create the AudioContext used for speaking detection.
        if (!audioContextRef.current) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
          audioContextRef.current = new Ctor();
        }

        await refreshDevices();

        // Announce ourselves to the mesh and learn current peers.
        socket.emit('voice:join', { sessionId, playerId: myPlayerId! });
        joinedRef.current = true;

        if (mounted) setStatus('ready');
        startTalkingTimer();
      } catch (err) {
        const error = err as Error;
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          if (mounted) setStatus('denied');
          console.warn(`${DEBUG} mic permission denied`);
        } else {
          if (mounted) setStatus('denied');
          console.error(`${DEBUG} init failed`, err);
        }
      }
    }

    /* -- per-peer RTCPeerConnection setup -- */
    function createPeerConnection(remotePlayerId: string, isInitiator: boolean): RTCPeerConnection {
      const existing = peerConnectionsRef.current.get(remotePlayerId);
      if (existing) {
        try { existing.close(); } catch { /* ignore */ }
      }
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerConnectionsRef.current.set(remotePlayerId, pc);

      // Add local audio track if available (so the remote can hear us when
      // we PTT). Track starts muted (.enabled = false).
      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getAudioTracks()) {
          pc.addTrack(track, localStreamRef.current);
        }
      }

      pc.onicecandidate = (e) => {
        const c = e.candidate;
        socket.emit('voice:ice-candidate', {
          sessionId,
          fromPlayerId: myPlayerId!,
          toPlayerId: remotePlayerId,
          candidate: c
            ? {
                candidate: c.candidate ?? '',
                sdpMid: c.sdpMid ?? null,
                sdpMLineIndex: c.sdpMLineIndex ?? null,
              }
            : null,
        });
      };

      pc.ontrack = (e) => {
        const stream = e.streams[0];
        if (!stream) return;

        // Hidden <audio> element plays the remote stream. We append to body
        // so it survives React render cycles.
        let audio = remoteAudiosRef.current.get(remotePlayerId);
        if (!audio) {
          audio = document.createElement('audio');
          audio.autoplay = true;
          audio.setAttribute('playsinline', 'true');
          audio.dataset.voicePeerId = remotePlayerId;
          audio.style.display = 'none';
          document.body.appendChild(audio);
          remoteAudiosRef.current.set(remotePlayerId, audio);
        }
        audio.srcObject = stream;
        // Explicit play() — some browsers do not honour the autoplay
        // attribute when srcObject is set programmatically after the
        // element is created. If autoplay policy blocks, we surface it.
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch((err) => {
            console.warn(`${DEBUG} audio.play() blocked for peer ${remotePlayerId.slice(0, 6)}:`, err?.name ?? err);
          });
        }
        // Resume the AudioContext if suspended (Chrome's autoplay rules).
        if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume().catch(() => { /* user gesture may be needed */ });
        }

        // Apply speaker device if user picked one and the browser supports it.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const setSinkId = (audio as any).setSinkId as ((id: string) => Promise<void>) | undefined;
        if (selectedOutputId && typeof setSinkId === 'function') {
          setSinkId.call(audio, selectedOutputId).catch(() => { /* device may have vanished */ });
        }

        // Wire up speaking detection.
        const audioCtx = audioContextRef.current;
        if (audioCtx) {
          try {
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);
            analysersRef.current.set(remotePlayerId, analyser);
          } catch (err) {
            console.warn(`${DEBUG} analyser setup failed for ${remotePlayerId.slice(0, 6)}`, err);
          }
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          console.warn(`${DEBUG} peer ${remotePlayerId.slice(0, 6)} state=${pc.connectionState}, will retry in ${RECONNECT_AFTER_MS}ms`);
          const existingTimer = reconnectTimersRef.current.get(remotePlayerId);
          if (existingTimer) clearTimeout(existingTimer);
          const t = setTimeout(() => {
            reconnectTimersRef.current.delete(remotePlayerId);
            // Best-effort retry: tear down + recreate as initiator.
            teardownPeer(remotePlayerId);
            void renegotiate(remotePlayerId);
          }, RECONNECT_AFTER_MS);
          reconnectTimersRef.current.set(remotePlayerId, t);
        }
      };

      if (isInitiator) {
        void renegotiate(remotePlayerId, pc);
      }

      return pc;
    }

    async function renegotiate(remotePlayerId: string, pcArg?: RTCPeerConnection): Promise<void> {
      const pc = pcArg ?? createPeerConnection(remotePlayerId, false);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('voice:offer', {
          sessionId,
          fromPlayerId: myPlayerId!,
          toPlayerId: remotePlayerId,
          sdp: { type: offer.type, sdp: offer.sdp ?? '' },
        });
      } catch (err) {
        console.error(`${DEBUG} renegotiate failed`, err);
      }
    }

    /* -- talking detector (RMS sampling) -- */
    function startTalkingTimer() {
      if (talkingTimerRef.current) return;
      const buf = new Uint8Array(256);
      talkingTimerRef.current = setInterval(() => {
        const next = new Set<string>();
        for (const [peerId, analyser] of analysersRef.current) {
          analyser.getByteTimeDomainData(buf);
          let sumSq = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128; // normalize to -1..1
            sumSq += v * v;
          }
          const rms = Math.sqrt(sumSq / buf.length);
          if (rms > TALKING_THRESHOLD) next.add(peerId);
        }
        setTalkingPeerIds((prev) => {
          if (prev.size === next.size && [...prev].every((id) => next.has(id))) return prev;
          return next;
        });
      }, TALKING_SAMPLE_MS);
    }

    /* -- socket signaling listeners -- */
    const onParticipants = (data: { peerIds: string[] }) => {
      // We just joined. For each existing peer, create a connection AS
      // INITIATOR — we send the offer.
      for (const peerId of data.peerIds) {
        if (peerId === myPlayerId) continue;
        createPeerConnection(peerId, true);
      }
    };

    const onPeerJoined = (data: { peerId: string }) => {
      // Someone else joined. They will send us an offer; we wait passively.
      // But we still build the PC slot so onTrack/iceCandidate work.
      if (data.peerId === myPlayerId) return;
      createPeerConnection(data.peerId, false);
    };

    const onPeerLeft = (data: { peerId: string }) => {
      teardownPeer(data.peerId);
    };

    const onOffer = async (data: { fromPlayerId: string; sdp: { type: string; sdp: string } }) => {
      let pc = peerConnectionsRef.current.get(data.fromPlayerId);
      if (!pc) {
        pc = createPeerConnection(data.fromPlayerId, false);
      }
      try {
        await pc.setRemoteDescription({ type: data.sdp.type as RTCSdpType, sdp: data.sdp.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('voice:answer', {
          sessionId,
          fromPlayerId: myPlayerId!,
          toPlayerId: data.fromPlayerId,
          sdp: { type: answer.type, sdp: answer.sdp ?? '' },
        });
      } catch (err) {
        console.error(`${DEBUG} answer failed`, err);
      }
    };

    const onAnswer = async (data: { fromPlayerId: string; sdp: { type: string; sdp: string } }) => {
      const pc = peerConnectionsRef.current.get(data.fromPlayerId);
      if (!pc) return;
      try {
        await pc.setRemoteDescription({ type: data.sdp.type as RTCSdpType, sdp: data.sdp.sdp });
      } catch (err) {
        console.error(`${DEBUG} setRemote(answer) failed`, err);
      }
    };

    const onIce = async (data: {
      fromPlayerId: string;
      candidate: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null } | null;
    }) => {
      const pc = peerConnectionsRef.current.get(data.fromPlayerId);
      if (!pc || !data.candidate) return;
      try {
        await pc.addIceCandidate(data.candidate);
      } catch (err) {
        // ICE candidates can race the SDP exchange; tolerate.
        console.warn(`${DEBUG} addIceCandidate failed`, err);
      }
    };

    socket.on('voice:participants', onParticipants);
    socket.on('voice:peer-joined', onPeerJoined);
    socket.on('voice:peer-left', onPeerLeft);
    socket.on('voice:offer', onOffer);
    socket.on('voice:answer', onAnswer);
    socket.on('voice:ice-candidate', onIce);

    /* -- kick off initialization -- */
    void init();

    /* -- cleanup -- */
    return () => {
      mounted = false;
      cancelRef.current = true;
      socket.off('voice:participants', onParticipants);
      socket.off('voice:peer-joined', onPeerJoined);
      socket.off('voice:peer-left', onPeerLeft);
      socket.off('voice:offer', onOffer);
      socket.off('voice:answer', onAnswer);
      socket.off('voice:ice-candidate', onIce);

      if (joinedRef.current && socket.connected) {
        socket.emit('voice:leave', { sessionId, playerId: myPlayerId! });
      }
      joinedRef.current = false;

      if (talkingTimerRef.current) {
        clearInterval(talkingTimerRef.current);
        talkingTimerRef.current = null;
      }
      for (const t of reconnectTimersRef.current.values()) clearTimeout(t);
      reconnectTimersRef.current.clear();

      for (const peerId of [...peerConnectionsRef.current.keys()]) {
        teardownPeer(peerId);
      }

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }

      if (audioContextRef.current) {
        try { void audioContextRef.current.close(); } catch { /* ignore */ }
        audioContextRef.current = null;
      }

      setTalkingPeerIds(new Set());
      setIsTransmitting(false);
      isTransmittingRef.current = false;
      setStatus(supported ? 'idle' : 'unsupported');
    };
  // selectedInputId/selectedOutputId rebuild changes the local stream;
  // we restart the whole effect rather than try to swap tracks live.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, supported, sessionId, myPlayerId, selectedInputId]);

  /* ---- Apply output device to all existing remote audios when changed ---- */
  useEffect(() => {
    if (!selectedOutputId) return;
    for (const audio of remoteAudiosRef.current.values()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const setSinkId = (audio as any).setSinkId as ((id: string) => Promise<void>) | undefined;
      if (typeof setSinkId === 'function') {
        setSinkId.call(audio, selectedOutputId).catch(() => { /* tolerate */ });
      }
    }
  }, [selectedOutputId]);

  /* ---- V-key push-to-talk ---- */
  useEffect(() => {
    if (!enabled || !supported) return;

    function isTypingTarget(target: EventTarget | null): boolean {
      if (!target) return false;
      if (target instanceof HTMLInputElement) return true;
      if (target instanceof HTMLTextAreaElement) return true;
      if (target instanceof HTMLElement && target.isContentEditable) return true;
      return false;
    }

    function setTransmit(on: boolean) {
      if (isTransmittingRef.current === on) return;
      isTransmittingRef.current = on;
      setIsTransmitting(on);
      const stream = localStreamRef.current;
      if (!stream) return;
      stream.getAudioTracks().forEach((t) => { t.enabled = on; });
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'v' && e.key !== 'V') return;
      if (e.repeat) return; // ignore key-repeat firings
      if (isTypingTarget(e.target)) return; // user is typing 'v' into a field — pass through
      e.preventDefault();
      setTransmit(true);
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key !== 'v' && e.key !== 'V') return;
      if (isTypingTarget(e.target)) return;
      setTransmit(false);
    }

    function onBlur() {
      // If the window loses focus mid-transmit, drop the mic so we don't
      // become a hot mic the moment focus returns.
      setTransmit(false);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      // Ensure we leave with mic muted on unmount.
      isTransmittingRef.current = false;
      const stream = localStreamRef.current;
      if (stream) stream.getAudioTracks().forEach((t) => { t.enabled = false; });
    };
  }, [enabled, supported]);

  return {
    status,
    talkingPeerIds,
    isTransmitting,
    inputDevices,
    outputDevices,
    selectedInputId,
    selectedOutputId,
    setSelectedInputId,
    setSelectedOutputId,
  };
}

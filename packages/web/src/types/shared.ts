/**
 * shared.ts — Frontend-local copies of shared type contracts
 *
 * App Hosting currently builds the web package in isolation, so the
 * frontend keeps the small subset of shared contracts it needs here.
 * These mirror the multiplayer and game-state DTOs used over the wire.
 */

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface GameState {
  currentRoomId: string;
  inventory: string[];
  visitedRooms: string[];
  conversationHistory: ChatMessage[];
  isGameOver: boolean;
  status: 'playing' | 'won' | 'lost';
  turnCount: number;
  discoveredEvidence: string[];
  endReason?: 'solved' | 'wrong_accusation' | 'turn_limit' | 'fatal_choice';
}

export interface PlayerDataDTO {
  id: string;
  name: string;
  currentRoomId: string;
  inventory: string[];
  visitedRooms: string[];
  isConnected: boolean;
  color: string;
}

export interface CommMessageDTO {
  id: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  content: string;
  timestamp: number;
  mode: 'room' | 'direct';
  targetPlayerId?: string;
  targetPlayerName?: string;
  roomId: string;
  visibleTo: string[];
}

export interface ClientToServerEvents {
  'player:join': (
    data: { sessionId: string; playerName: string },
    callback: (response: { success: boolean; playerId?: string; error?: string }) => void,
  ) => void;
  'player:action': (data: { sessionId: string; playerId: string; message: string }) => void;
  'player:typing': (data: { sessionId: string; playerId: string; isTyping: boolean }) => void;
  'player:rejoin': (
    data: { sessionId: string; playerId: string },
    callback: (response: { success: boolean; error?: string }) => void,
  ) => void;
  'game:start': (
    data: { sessionId: string; playerId: string },
    callback: (response: { success: boolean; error?: string }) => void,
  ) => void;
  'scenario:select': (data: { sessionId: string; playerId: string; scenarioId: string }) => void;
  'scenario:vote': (data: { sessionId: string; playerId: string; scenarioId: string }) => void;
  'scenario:confirm': (
    data: { sessionId: string; playerId: string; scenarioId: string },
    callback: (response: { success: boolean; error?: string }) => void,
  ) => void;
  'comm:room': (data: { sessionId: string; playerId: string; content: string }) => void;
  'comm:direct': (
    data: { sessionId: string; playerId: string; targetPlayerId: string; content: string },
  ) => void;
  'evidence:share': (data: { sessionId: string; playerId: string; evidenceId: string }) => void;
}

export interface SessionStateDTO {
  id: string;
  scenarioId: string;
  scenarioTitle: string;
  roomCode?: string;
  players: PlayerDataDTO[];
  history: Array<{
    role: string;
    content: string;
    playerId?: string;
    playerName?: string;
    playerColor?: string;
  }>;
  state: 'lobby' | 'voting' | 'playing' | 'ended';
  selectedScenarioId?: string | null;
  scenarioVotes?: Record<string, string[]>;
  commHistory?: CommMessageDTO[];
  sharedEvidence?: SharedEvidenceEntry[];
}

export interface SharedEvidenceEntry {
  evidenceId: string;
  sharedByPlayerId: string;
  sharedByPlayerName: string;
  sharedByPlayerColor: string;
  timestamp: number;
}

export interface ServerToClientEvents {
  'game:started': (data: {
    sessionId: string;
    scenarioTitle: string;
    players: PlayerDataDTO[];
  }) => void;
  'narrator:chunk': (data: { content: string; fullText: string; targetPlayerId?: string }) => void;
  'narrator:done': (data: {
    fullText: string;
    suggestions: string[];
    targetPlayerId?: string;
  }) => void;
  'narrator:observed': (data: { text: string; actorName: string; roomId: string }) => void;
  'narrator:error': (data: { message: string }) => void;
  'player:joined': (data: { player: PlayerDataDTO; allPlayers: PlayerDataDTO[] }) => void;
  'player:left': (data: {
    playerId: string;
    playerName: string;
    allPlayers: PlayerDataDTO[];
  }) => void;
  'player:reconnected': (data: {
    playerId: string;
    playerName: string;
    allPlayers: PlayerDataDTO[];
  }) => void;
  'player:typing-update': (data: {
    playerId: string;
    playerName: string;
    isTyping: boolean;
  }) => void;
  'action:queued': (data: {
    playerId: string;
    playerName: string;
    playerColor: string;
    message: string;
    queueSize: number;
    timeRemaining: number;
  }) => void;
  'action:batch-countdown': (data: { timeRemaining: number; queueSize: number }) => void;
  'session:state': (data: { session: SessionStateDTO }) => void;
  'session:error': (data: { message: string }) => void;
  'scenario:updated': (data: {
    selectedScenarioId: string | null;
    votes: Record<string, string[]>;
  }) => void;
  'comm:message': (data: CommMessageDTO) => void;
  'evidence:shared': (data: SharedEvidenceEntry) => void;
}

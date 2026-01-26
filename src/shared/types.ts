// Shared types for casino wheel app

// ============================================
// Core Game Types
// ============================================

/** A player in the game */
export type Player = {
  readonly id: string;
  readonly name: string;
  readonly bet: string | null; // ID of player they bet on
  readonly isHost: boolean;
};

/** Game phase - controls what actions are available */
export type Phase = "waiting" | "betting" | "spinning" | "result";

/** Complete game state - broadcast to all clients on every change */
export type GameState = {
  readonly players: readonly Player[];
  readonly phase: Phase;
  readonly winner: string | null; // Player ID
  readonly bettingEndsAt: number | null; // Unix timestamp
};

// ============================================
// Client -> Server Messages
// ============================================

export type JoinMessage = {
  readonly type: "join";
  readonly name: string;
};

export type PlaceBetMessage = {
  readonly type: "placeBet";
  readonly targetId: string;
};

export type StartBettingMessage = {
  readonly type: "startBetting";
};

export type SpinMessage = {
  readonly type: "spin";
};

export type ResetMessage = {
  readonly type: "reset";
};

/** All possible messages from client to server */
export type ClientMessage =
  | JoinMessage
  | PlaceBetMessage
  | StartBettingMessage
  | SpinMessage
  | ResetMessage;

// ============================================
// Server -> Client Messages
// ============================================

/** Full state update - sent after every state change */
export type StateMessage = {
  readonly type: "state";
  readonly state: GameState;
  readonly playerId: string;
};

/** Spin result - triggers wheel animation on client */
export type SpinResultMessage = {
  readonly type: "spinResult";
  readonly winnerId: string;
};

/** Error notification */
export type ErrorMessage = {
  readonly type: "error";
  readonly message: string;
};

/** All possible messages from server to client */
export type ServerMessage = StateMessage | SpinResultMessage | ErrorMessage;

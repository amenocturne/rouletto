// Shared types for casino wheel app

// ============================================
// Core Game Types
// ============================================

/** A candidate is a name on the wheel (can be added by admin) */
export type Candidate = {
	readonly id: string;
	readonly name: string;
};

/** A spectator is a connected user who can watch and bet */
export type Spectator = {
	readonly id: string;
	readonly name: string;
	readonly bet: string | null; // Candidate ID they bet on
};

/** Game phase - controls what actions are available */
export type Phase = "waiting" | "betting" | "spinning" | "result";

/** Complete game state - broadcast to all clients on every change */
export type GameState = {
	readonly spectators: readonly Spectator[];
	readonly candidates: readonly Candidate[];
	readonly phase: Phase;
	readonly winner: string | null; // Candidate ID
	readonly bettingEndsAt: number | null; // Unix timestamp
};

/** A room containing a game session */
export type Room = {
	readonly id: string;
	readonly adminId: string;
	readonly gameState: GameState;
};

// ============================================
// Client -> Server Messages
// ============================================

export type CreateRoomMessage = {
	readonly type: "createRoom";
};

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

export type AddCandidatesMessage = {
	readonly type: "addCandidates";
	readonly names: string; // Newline-separated names from textarea
};

export type RemoveCandidateMessage = {
	readonly type: "removeCandidate";
	readonly candidateId: string;
};

/** All possible messages from client to server */
export type ClientMessage =
	| CreateRoomMessage
	| JoinMessage
	| PlaceBetMessage
	| StartBettingMessage
	| SpinMessage
	| ResetMessage
	| AddCandidatesMessage
	| RemoveCandidateMessage;

// ============================================
// Server -> Client Messages
// ============================================

/** Room created response - sent after room creation */
export type RoomCreatedMessage = {
	readonly type: "roomCreated";
	readonly roomId: string;
};

/** Room error - sent when room doesn't exist */
export type RoomErrorMessage = {
	readonly type: "roomError";
	readonly message: string;
};

/** Full state update - sent after every state change */
export type StateMessage = {
	readonly type: "state";
	readonly state: GameState;
	readonly spectatorId: string;
	readonly isAdmin: boolean;
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

/** Sound synchronization message */
export type PlaySoundMessage = {
	readonly type: "playSound";
	readonly sound: "spin" | "reveal";
};

/** All possible messages from server to client */
export type ServerMessage =
	| RoomCreatedMessage
	| RoomErrorMessage
	| StateMessage
	| SpinResultMessage
	| ErrorMessage
	| PlaySoundMessage;

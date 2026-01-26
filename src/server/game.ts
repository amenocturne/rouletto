// Game state management - pure functions for state transitions

import type { Candidate, GameState, Spectator } from "../shared/types";

// ============================================
// Initial State
// ============================================

/** Creates the initial game state */
export const createInitialState = (): GameState => ({
	spectators: [],
	candidates: [],
	phase: "waiting",
	winner: null,
	bettingEndsAt: null,
});

// ============================================
// Spectator Functions
// ============================================

/** Adds a spectator to the game. */
export const addSpectator = (state: GameState, spectator: Spectator): GameState => ({
	...state,
	spectators: [...state.spectators, spectator],
});

/** Removes a spectator from the game. */
export const removeSpectator = (state: GameState, spectatorId: string): GameState => {
	const spectatorExists = state.spectators.some((s) => s.id === spectatorId);
	if (!spectatorExists) {
		return state;
	}

	return {
		...state,
		spectators: state.spectators.filter((s) => s.id !== spectatorId),
	};
};

// ============================================
// Candidate Functions
// ============================================

/** Adds candidates from newline-separated text. */
export const addCandidates = (state: GameState, namesText: string): GameState => {
	// Parse newline-separated names, trim whitespace, filter empty
	const names = namesText
		.split("\n")
		.map((n) => n.trim())
		.filter((n) => n.length > 0);

	if (names.length === 0) {
		return state;
	}

	const newCandidates: readonly Candidate[] = names.map((name) => ({
		id: crypto.randomUUID(),
		name,
	}));

	return {
		...state,
		candidates: [...state.candidates, ...newCandidates],
	};
};

/** Removes a candidate. Also clears any bets on this candidate. */
export const removeCandidate = (state: GameState, candidateId: string): GameState => {
	const candidateExists = state.candidates.some((c) => c.id === candidateId);
	if (!candidateExists) {
		return state;
	}

	return {
		...state,
		candidates: state.candidates.filter((c) => c.id !== candidateId),
		spectators: state.spectators.map((s) => (s.bet === candidateId ? { ...s, bet: null } : s)),
	};
};

// ============================================
// Betting Functions
// ============================================

/** Places a bet for a spectator on a candidate. Only works during betting phase. */
export const placeBet = (state: GameState, spectatorId: string, candidateId: string): GameState => {
	// Can only bet during betting phase
	if (state.phase !== "betting") {
		return state;
	}

	// Candidate must exist
	const candidateExists = state.candidates.some((c) => c.id === candidateId);
	if (!candidateExists) {
		return state;
	}

	// Spectator must exist
	const spectatorExists = state.spectators.some((s) => s.id === spectatorId);
	if (!spectatorExists) {
		return state;
	}

	return {
		...state,
		spectators: state.spectators.map((s) =>
			s.id === spectatorId ? { ...s, bet: candidateId } : s,
		),
	};
};

// ============================================
// Phase Transition Functions
// ============================================

/** Starts the betting phase with a specified end time. Only works from waiting phase. */
export const startBetting = (state: GameState, endsAt: number): GameState => {
	if (state.phase !== "waiting") {
		return state;
	}
	return {
		...state,
		phase: "betting",
		bettingEndsAt: endsAt,
		winner: null,
	};
};

/** Transitions to the spinning phase. Only works from betting phase. */
export const startSpinning = (state: GameState): GameState => {
	if (state.phase !== "betting") {
		return state;
	}
	return {
		...state,
		phase: "spinning",
		bettingEndsAt: null,
	};
};

/** Sets the winner and transitions to result phase. Winner must exist in candidates. */
export const setResult = (state: GameState, winnerId: string): GameState => {
	const winnerExists = state.candidates.some((c) => c.id === winnerId);
	if (!winnerExists) {
		return state;
	}
	return {
		...state,
		phase: "result",
		winner: winnerId,
	};
};

/** Resets the game to waiting phase, clears bets and winner, keeps spectators and candidates. */
export const resetGame = (state: GameState): GameState => ({
	...state,
	phase: "waiting",
	winner: null,
	bettingEndsAt: null,
	spectators: state.spectators.map((s) => ({ ...s, bet: null })),
});

// ============================================
// Winner Selection
// ============================================

/** Selects a random candidate ID from the candidates array. Returns null if no candidates. */
export const selectRandomWinner = (
	candidates: readonly Candidate[],
	randomValue: number,
): string | null => {
	if (candidates.length === 0) {
		return null;
	}
	const randomIndex = Math.floor(randomValue * candidates.length);
	return candidates[randomIndex].id;
};

// ============================================
// Validation Helpers
// ============================================

/** Returns true if the spectator can place a bet (betting phase and spectator exists). */
export const canPlaceBet = (state: GameState, spectatorId: string): boolean => {
	if (state.phase !== "betting") {
		return false;
	}
	return state.spectators.some((s) => s.id === spectatorId);
};

/** Returns true if betting can start (waiting phase and has candidates). */
export const canStartBetting = (state: GameState): boolean => {
	if (state.phase !== "waiting") {
		return false;
	}
	return state.candidates.length > 0;
};

/** Returns true if the wheel can spin (betting phase). */
export const canSpin = (state: GameState): boolean => {
	return state.phase === "betting";
};

/** Returns true if the game can be reset (result phase). */
export const canReset = (state: GameState): boolean => {
	return state.phase === "result";
};

// Game state management - pure functions for state transitions

import type { GameState, Player } from "../shared/types";

// ============================================
// Initial State
// ============================================

/** Creates the initial game state */
export const createInitialState = (): GameState => ({
	players: [],
	phase: "waiting",
	winner: null,
	bettingEndsAt: null,
});

// ============================================
// State Transition Functions
// ============================================

/** Adds a player to the game. First player becomes host. */
export const addPlayer = (state: GameState, player: Player): GameState => {
	const isFirstPlayer = state.players.length === 0;
	const newPlayer: Player = {
		...player,
		isHost: isFirstPlayer,
	};
	return {
		...state,
		players: [...state.players, newPlayer],
	};
};

/** Removes a player from the game. If host leaves, next player becomes host. Also removes bets on the removed player. */
export const removePlayer = (state: GameState, playerId: string): GameState => {
	const playerIndex = state.players.findIndex((p) => p.id === playerId);
	if (playerIndex === -1) {
		return state;
	}

	const removedPlayer = state.players[playerIndex];
	const remainingPlayers = state.players.filter((p) => p.id !== playerId);

	// Clear bets that were placed on the removed player
	const playersWithClearedBets = remainingPlayers.map((p) =>
		p.bet === playerId ? { ...p, bet: null } : p,
	);

	// If removed player was host, assign host to the next player
	const finalPlayers =
		removedPlayer.isHost && playersWithClearedBets.length > 0
			? playersWithClearedBets.map((p, index) => (index === 0 ? { ...p, isHost: true } : p))
			: playersWithClearedBets;

	return {
		...state,
		players: finalPlayers,
	};
};

/** Places a bet for a player on another player. Only works during betting phase. */
export const placeBet = (state: GameState, playerId: string, targetId: string): GameState => {
	// Can only bet during betting phase
	if (state.phase !== "betting") {
		return state;
	}

	// Target player must exist
	const targetExists = state.players.some((p) => p.id === targetId);
	if (!targetExists) {
		return state;
	}

	// Player must exist
	const playerExists = state.players.some((p) => p.id === playerId);
	if (!playerExists) {
		return state;
	}

	return {
		...state,
		players: state.players.map((p) => (p.id === playerId ? { ...p, bet: targetId } : p)),
	};
};

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

/** Sets the winner and transitions to result phase. Winner must exist in players. */
export const setResult = (state: GameState, winnerId: string): GameState => {
	const winnerExists = state.players.some((p) => p.id === winnerId);
	if (!winnerExists) {
		return state;
	}
	return {
		...state,
		phase: "result",
		winner: winnerId,
	};
};

/** Resets the game to waiting phase, clears bets and winner, keeps players. */
export const resetGame = (state: GameState): GameState => ({
	...state,
	phase: "waiting",
	winner: null,
	bettingEndsAt: null,
	players: state.players.map((p) => ({ ...p, bet: null })),
});

// ============================================
// Winner Selection
// ============================================

/** Selects a random player ID from the players array. Returns null if no players. */
export const selectRandomWinner = (
	players: readonly Player[],
	randomValue: number,
): string | null => {
	if (players.length === 0) {
		return null;
	}
	const randomIndex = Math.floor(randomValue * players.length);
	return players[randomIndex].id;
};

// ============================================
// Validation Helpers
// ============================================

/** Returns true if the player can place a bet (betting phase and player exists). */
export const canPlaceBet = (state: GameState, playerId: string): boolean => {
	if (state.phase !== "betting") {
		return false;
	}
	return state.players.some((p) => p.id === playerId);
};

/** Returns true if the player can start betting (waiting phase and player is host). */
export const canStartBetting = (state: GameState, playerId: string): boolean => {
	if (state.phase !== "waiting") {
		return false;
	}
	const player = state.players.find((p) => p.id === playerId);
	return player?.isHost === true;
};

/** Returns true if the player can spin (betting phase and player is host). */
export const canSpin = (state: GameState, playerId: string): boolean => {
	if (state.phase !== "betting") {
		return false;
	}
	const player = state.players.find((p) => p.id === playerId);
	return player?.isHost === true;
};

/** Returns true if the player can reset the game (result phase and player is host). */
export const canReset = (state: GameState, playerId: string): boolean => {
	if (state.phase !== "result") {
		return false;
	}
	const player = state.players.find((p) => p.id === playerId);
	return player?.isHost === true;
};

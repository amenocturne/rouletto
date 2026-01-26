// Unit tests for game state management

import { describe, expect, test } from "bun:test";
import type { Candidate, Spectator } from "../shared/types";
import {
	addCandidates,
	addSpectator,
	canPlaceBet,
	canReset,
	canSpin,
	canStartBetting,
	createInitialState,
	placeBet,
	removeCandidate,
	removeSpectator,
	resetGame,
	selectRandomWinner,
	setResult,
	startBetting,
	startSpinning,
} from "./game";

// ============================================
// Helper Functions
// ============================================

const createSpectator = (id: string, name: string, bet: string | null = null): Spectator => ({
	id,
	name,
	bet,
});

const createCandidate = (id: string, name: string): Candidate => ({
	id,
	name,
});

// ============================================
// Initial State Tests
// ============================================

describe("createInitialState", () => {
	test("creates empty state with waiting phase", () => {
		const state = createInitialState();
		expect(state.spectators).toEqual([]);
		expect(state.candidates).toEqual([]);
		expect(state.phase).toBe("waiting");
		expect(state.winner).toBeNull();
		expect(state.bettingEndsAt).toBeNull();
	});
});

// ============================================
// Add Spectator Tests
// ============================================

describe("addSpectator", () => {
	test("adds spectator to empty state", () => {
		const state = createInitialState();
		const spectator = createSpectator("1", "Alice");
		const newState = addSpectator(state, spectator);

		expect(newState.spectators).toHaveLength(1);
		expect(newState.spectators[0].id).toBe("1");
		expect(newState.spectators[0].name).toBe("Alice");
	});

	test("adds multiple spectators", () => {
		let state = createInitialState();
		state = addSpectator(state, createSpectator("1", "Alice"));
		state = addSpectator(state, createSpectator("2", "Bob"));

		expect(state.spectators).toHaveLength(2);
	});

	test("does not mutate original state", () => {
		const state = createInitialState();
		const spectator = createSpectator("1", "Alice");
		const newState = addSpectator(state, spectator);

		expect(state.spectators).toHaveLength(0);
		expect(newState.spectators).toHaveLength(1);
		expect(state).not.toBe(newState);
	});
});

// ============================================
// Remove Spectator Tests
// ============================================

describe("removeSpectator", () => {
	test("removes spectator from state", () => {
		let state = createInitialState();
		state = addSpectator(state, createSpectator("1", "Alice"));
		state = addSpectator(state, createSpectator("2", "Bob"));

		const newState = removeSpectator(state, "2");

		expect(newState.spectators).toHaveLength(1);
		expect(newState.spectators[0].id).toBe("1");
	});

	test("returns same state if spectator not found", () => {
		let state = createInitialState();
		state = addSpectator(state, createSpectator("1", "Alice"));

		const newState = removeSpectator(state, "nonexistent");

		expect(newState).toBe(state);
	});

	test("handles removing last spectator", () => {
		let state = createInitialState();
		state = addSpectator(state, createSpectator("1", "Alice"));

		const newState = removeSpectator(state, "1");

		expect(newState.spectators).toHaveLength(0);
	});

	test("does not mutate original state", () => {
		let state = createInitialState();
		state = addSpectator(state, createSpectator("1", "Alice"));
		state = addSpectator(state, createSpectator("2", "Bob"));

		const newState = removeSpectator(state, "2");

		expect(state.spectators).toHaveLength(2);
		expect(newState.spectators).toHaveLength(1);
	});
});

// ============================================
// Add Candidates Tests
// ============================================

describe("addCandidates", () => {
	test("adds candidates from newline-separated text", () => {
		const state = createInitialState();
		const newState = addCandidates(state, "Alice\nBob\nCharlie");

		expect(newState.candidates).toHaveLength(3);
		expect(newState.candidates[0].name).toBe("Alice");
		expect(newState.candidates[1].name).toBe("Bob");
		expect(newState.candidates[2].name).toBe("Charlie");
	});

	test("trims whitespace from names", () => {
		const state = createInitialState();
		const newState = addCandidates(state, "  Alice  \n  Bob  ");

		expect(newState.candidates).toHaveLength(2);
		expect(newState.candidates[0].name).toBe("Alice");
		expect(newState.candidates[1].name).toBe("Bob");
	});

	test("filters empty lines", () => {
		const state = createInitialState();
		const newState = addCandidates(state, "Alice\n\n\nBob\n  \nCharlie");

		expect(newState.candidates).toHaveLength(3);
	});

	test("returns same state for empty input", () => {
		const state = createInitialState();
		const newState = addCandidates(state, "   \n  \n  ");

		expect(newState).toBe(state);
	});

	test("appends to existing candidates", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice\nBob");
		state = addCandidates(state, "Charlie\nDiana");

		expect(state.candidates).toHaveLength(4);
	});

	test("assigns unique IDs to candidates", () => {
		const state = createInitialState();
		const newState = addCandidates(state, "Alice\nBob");

		expect(newState.candidates[0].id).not.toBe(newState.candidates[1].id);
	});

	test("does not mutate original state", () => {
		const state = createInitialState();
		const newState = addCandidates(state, "Alice");

		expect(state.candidates).toHaveLength(0);
		expect(newState.candidates).toHaveLength(1);
	});
});

// ============================================
// Remove Candidate Tests
// ============================================

describe("removeCandidate", () => {
	test("removes candidate from state", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice\nBob");

		const candidateId = state.candidates[1].id;
		const newState = removeCandidate(state, candidateId);

		expect(newState.candidates).toHaveLength(1);
		expect(newState.candidates[0].name).toBe("Alice");
	});

	test("returns same state if candidate not found", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice");

		const newState = removeCandidate(state, "nonexistent");

		expect(newState).toBe(state);
	});

	test("clears bets on removed candidate", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice\nBob");
		state = addSpectator(state, createSpectator("s1", "Spectator1"));
		state = addSpectator(state, createSpectator("s2", "Spectator2"));

		const candidateId = state.candidates[0].id;

		// Start betting and place bets
		state = startBetting(state, Date.now() + 60000);
		state = placeBet(state, "s1", candidateId);
		state = placeBet(state, "s2", candidateId);

		// Reset to waiting to remove candidate
		state = { ...state, phase: "waiting" as const };
		const newState = removeCandidate(state, candidateId);

		expect(newState.spectators.find((s) => s.id === "s1")?.bet).toBeNull();
		expect(newState.spectators.find((s) => s.id === "s2")?.bet).toBeNull();
	});

	test("does not mutate original state", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice\nBob");

		const candidateId = state.candidates[0].id;
		const newState = removeCandidate(state, candidateId);

		expect(state.candidates).toHaveLength(2);
		expect(newState.candidates).toHaveLength(1);
	});
});

// ============================================
// Place Bet Tests
// ============================================

describe("placeBet", () => {
	test("places bet during betting phase", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice\nBob");
		state = addSpectator(state, createSpectator("s1", "Spectator1"));
		state = startBetting(state, Date.now() + 60000);

		const candidateId = state.candidates[0].id;
		const newState = placeBet(state, "s1", candidateId);

		expect(newState.spectators.find((s) => s.id === "s1")?.bet).toBe(candidateId);
	});

	test("allows changing bet", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice\nBob");
		state = addSpectator(state, createSpectator("s1", "Spectator1"));
		state = startBetting(state, Date.now() + 60000);

		const candidateId1 = state.candidates[0].id;
		const candidateId2 = state.candidates[1].id;

		state = placeBet(state, "s1", candidateId1);
		expect(state.spectators.find((s) => s.id === "s1")?.bet).toBe(candidateId1);

		state = placeBet(state, "s1", candidateId2);
		expect(state.spectators.find((s) => s.id === "s1")?.bet).toBe(candidateId2);
	});

	test("does not place bet if not in betting phase", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice");
		state = addSpectator(state, createSpectator("s1", "Spectator1"));

		const candidateId = state.candidates[0].id;
		const newState = placeBet(state, "s1", candidateId);

		expect(newState.spectators.find((s) => s.id === "s1")?.bet).toBeNull();
	});

	test("does not place bet on non-existent candidate", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice");
		state = addSpectator(state, createSpectator("s1", "Spectator1"));
		state = startBetting(state, Date.now() + 60000);

		const newState = placeBet(state, "s1", "nonexistent");

		expect(newState.spectators.find((s) => s.id === "s1")?.bet).toBeNull();
	});

	test("does not place bet for non-existent spectator", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice");
		state = startBetting(state, Date.now() + 60000);

		const candidateId = state.candidates[0].id;
		const newState = placeBet(state, "nonexistent", candidateId);

		// State should remain unchanged
		expect(newState).toEqual(state);
	});
});

// ============================================
// Phase Transition Tests
// ============================================

describe("startBetting", () => {
	test("transitions to betting phase with end time", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice");

		const endsAt = Date.now() + 60000;
		const newState = startBetting(state, endsAt);

		expect(newState.phase).toBe("betting");
		expect(newState.bettingEndsAt).toBe(endsAt);
	});

	test("clears winner when starting new betting phase", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice");
		state = startBetting(state, Date.now() + 60000);
		state = startSpinning(state);
		const candidateId = state.candidates[0].id;
		state = setResult(state, candidateId);

		// Reset and start betting again
		state = resetGame(state);
		const newState = startBetting(state, Date.now() + 60000);

		expect(newState.winner).toBeNull();
	});

	test("does not transition if not in waiting phase", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice");
		state = startBetting(state, Date.now() + 60000);

		// Already in betting phase, try to start betting again
		const newState = startBetting(state, Date.now() + 120000);

		expect(newState).toBe(state);
		expect(newState.phase).toBe("betting");
	});

	test("does not transition from spinning phase", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice");
		state = startBetting(state, Date.now() + 60000);
		state = startSpinning(state);

		const newState = startBetting(state, Date.now() + 120000);

		expect(newState).toBe(state);
		expect(newState.phase).toBe("spinning");
	});

	test("does not transition from result phase", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice");
		state = startBetting(state, Date.now() + 60000);
		state = startSpinning(state);
		const candidateId = state.candidates[0].id;
		state = setResult(state, candidateId);

		const newState = startBetting(state, Date.now() + 120000);

		expect(newState).toBe(state);
		expect(newState.phase).toBe("result");
	});
});

describe("startSpinning", () => {
	test("transitions to spinning phase", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice");
		state = startBetting(state, Date.now() + 60000);

		const newState = startSpinning(state);

		expect(newState.phase).toBe("spinning");
		expect(newState.bettingEndsAt).toBeNull();
	});

	test("does not transition from waiting phase", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice");

		const newState = startSpinning(state);

		expect(newState).toBe(state);
		expect(newState.phase).toBe("waiting");
	});

	test("does not transition from spinning phase", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice");
		state = startBetting(state, Date.now() + 60000);
		state = startSpinning(state);

		const newState = startSpinning(state);

		expect(newState).toBe(state);
		expect(newState.phase).toBe("spinning");
	});

	test("does not transition from result phase", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice");
		state = startBetting(state, Date.now() + 60000);
		state = startSpinning(state);
		const candidateId = state.candidates[0].id;
		state = setResult(state, candidateId);

		const newState = startSpinning(state);

		expect(newState).toBe(state);
		expect(newState.phase).toBe("result");
	});
});

describe("setResult", () => {
	test("sets winner and transitions to result phase", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice\nBob");
		state = startBetting(state, Date.now() + 60000);
		state = startSpinning(state);

		const candidateId = state.candidates[1].id;
		const newState = setResult(state, candidateId);

		expect(newState.phase).toBe("result");
		expect(newState.winner).toBe(candidateId);
	});

	test("does not set non-existent winner", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice\nBob");
		state = startBetting(state, Date.now() + 60000);
		state = startSpinning(state);

		const newState = setResult(state, "nonexistent");

		expect(newState).toBe(state);
		expect(newState.phase).toBe("spinning");
		expect(newState.winner).toBeNull();
	});
});

describe("resetGame", () => {
	test("resets to waiting phase", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice\nBob");
		state = addSpectator(state, createSpectator("s1", "Spectator1"));
		state = startBetting(state, Date.now() + 60000);
		state = placeBet(state, "s1", state.candidates[0].id);
		state = startSpinning(state);
		state = setResult(state, state.candidates[1].id);

		const newState = resetGame(state);

		expect(newState.phase).toBe("waiting");
		expect(newState.winner).toBeNull();
		expect(newState.bettingEndsAt).toBeNull();
	});

	test("clears all bets", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice\nBob");
		state = addSpectator(state, createSpectator("s1", "Spectator1"));
		state = addSpectator(state, createSpectator("s2", "Spectator2"));
		state = startBetting(state, Date.now() + 60000);
		state = placeBet(state, "s1", state.candidates[0].id);
		state = placeBet(state, "s2", state.candidates[1].id);
		state = startSpinning(state);
		state = setResult(state, state.candidates[0].id);

		const newState = resetGame(state);

		expect(newState.spectators.every((s) => s.bet === null)).toBe(true);
	});

	test("keeps spectators and candidates", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice\nBob");
		state = addSpectator(state, createSpectator("s1", "Spectator1"));
		state = addSpectator(state, createSpectator("s2", "Spectator2"));
		state = startBetting(state, Date.now() + 60000);
		state = startSpinning(state);
		state = setResult(state, state.candidates[0].id);

		const newState = resetGame(state);

		expect(newState.spectators).toHaveLength(2);
		expect(newState.candidates).toHaveLength(2);
	});
});

// ============================================
// Winner Selection Tests
// ============================================

describe("selectRandomWinner", () => {
	test("returns null for empty candidates", () => {
		const winner = selectRandomWinner([], 0.5);
		expect(winner).toBeNull();
	});

	test("returns the only candidate when one candidate", () => {
		const candidates = [createCandidate("1", "Alice")];
		const winner = selectRandomWinner(candidates, 0.5);
		expect(winner).toBe("1");
	});

	test("returns first candidate when randomValue is 0", () => {
		const candidates = [
			createCandidate("1", "Alice"),
			createCandidate("2", "Bob"),
			createCandidate("3", "Charlie"),
		];
		const winner = selectRandomWinner(candidates, 0);
		expect(winner).toBe("1");
	});

	test("returns last candidate when randomValue is close to 1", () => {
		const candidates = [
			createCandidate("1", "Alice"),
			createCandidate("2", "Bob"),
			createCandidate("3", "Charlie"),
		];
		const winner = selectRandomWinner(candidates, 0.99);
		expect(winner).toBe("3");
	});

	test("returns middle candidate with appropriate randomValue", () => {
		const candidates = [
			createCandidate("1", "Alice"),
			createCandidate("2", "Bob"),
			createCandidate("3", "Charlie"),
		];
		const winner = selectRandomWinner(candidates, 0.5);
		expect(winner).toBe("2");
	});
});

// ============================================
// Validation Helper Tests
// ============================================

describe("canPlaceBet", () => {
	test("returns true during betting phase for existing spectator", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice");
		state = addSpectator(state, createSpectator("s1", "Spectator1"));
		state = startBetting(state, Date.now() + 60000);

		expect(canPlaceBet(state, "s1")).toBe(true);
	});

	test("returns false during waiting phase", () => {
		let state = createInitialState();
		state = addSpectator(state, createSpectator("s1", "Spectator1"));

		expect(canPlaceBet(state, "s1")).toBe(false);
	});

	test("returns false for non-existent spectator", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice");
		state = addSpectator(state, createSpectator("s1", "Spectator1"));
		state = startBetting(state, Date.now() + 60000);

		expect(canPlaceBet(state, "nonexistent")).toBe(false);
	});
});

describe("canStartBetting", () => {
	test("returns true in waiting phase with candidates", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice");

		expect(canStartBetting(state)).toBe(true);
	});

	test("returns false with no candidates", () => {
		const state = createInitialState();
		expect(canStartBetting(state)).toBe(false);
	});

	test("returns false if not in waiting phase", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice");
		state = startBetting(state, Date.now() + 60000);

		expect(canStartBetting(state)).toBe(false);
	});
});

describe("canSpin", () => {
	test("returns true in betting phase", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice");
		state = startBetting(state, Date.now() + 60000);

		expect(canSpin(state)).toBe(true);
	});

	test("returns false if not in betting phase", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice");

		expect(canSpin(state)).toBe(false);
	});
});

describe("canReset", () => {
	test("returns true in result phase", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice");
		state = startBetting(state, Date.now() + 60000);
		state = startSpinning(state);
		state = setResult(state, state.candidates[0].id);

		expect(canReset(state)).toBe(true);
	});

	test("returns false if not in result phase", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice");
		state = startBetting(state, Date.now() + 60000);

		expect(canReset(state)).toBe(false);
	});
});

// ============================================
// Edge Cases
// ============================================

describe("edge cases", () => {
	test("full game flow", () => {
		let state = createInitialState();

		// Admin adds candidates
		state = addCandidates(state, "Alice\nBob\nCharlie");
		expect(state.candidates).toHaveLength(3);

		// Spectators join
		state = addSpectator(state, createSpectator("s1", "Spectator1"));
		state = addSpectator(state, createSpectator("s2", "Spectator2"));
		state = addSpectator(state, createSpectator("s3", "Spectator3"));
		expect(state.spectators).toHaveLength(3);

		// Start betting
		const endsAt = Date.now() + 60000;
		state = startBetting(state, endsAt);
		expect(state.phase).toBe("betting");

		// Place bets
		const candidateIds = state.candidates.map((c) => c.id);
		state = placeBet(state, "s1", candidateIds[0]);
		state = placeBet(state, "s2", candidateIds[0]);
		state = placeBet(state, "s3", candidateIds[1]);

		expect(state.spectators.find((s) => s.id === "s1")?.bet).toBe(candidateIds[0]);
		expect(state.spectators.find((s) => s.id === "s2")?.bet).toBe(candidateIds[0]);
		expect(state.spectators.find((s) => s.id === "s3")?.bet).toBe(candidateIds[1]);

		// Spin
		state = startSpinning(state);
		expect(state.phase).toBe("spinning");

		// Result
		state = setResult(state, candidateIds[0]);
		expect(state.phase).toBe("result");
		expect(state.winner).toBe(candidateIds[0]);

		// Reset
		state = resetGame(state);
		expect(state.phase).toBe("waiting");
		expect(state.winner).toBeNull();
		expect(state.spectators.every((s) => s.bet === null)).toBe(true);
		expect(state.spectators).toHaveLength(3);
		expect(state.candidates).toHaveLength(3);
	});

	test("single candidate game", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice");
		state = addSpectator(state, createSpectator("s1", "Spectator1"));

		expect(canStartBetting(state)).toBe(true);

		state = startBetting(state, Date.now() + 60000);
		state = placeBet(state, "s1", state.candidates[0].id);
		state = startSpinning(state);
		state = setResult(state, state.candidates[0].id);

		expect(state.winner).toBe(state.candidates[0].id);
	});

	test("spectator leaving with active bet", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice\nBob");
		state = addSpectator(state, createSpectator("s1", "Spectator1"));
		state = addSpectator(state, createSpectator("s2", "Spectator2"));
		state = startBetting(state, Date.now() + 60000);
		state = placeBet(state, "s1", state.candidates[0].id);
		state = placeBet(state, "s2", state.candidates[0].id);

		// Spectator leaves
		state = removeSpectator(state, "s1");

		expect(state.spectators).toHaveLength(1);
		expect(state.spectators[0].id).toBe("s2");
		// Other spectator's bet remains
		expect(state.spectators[0].bet).toBe(state.candidates[0].id);
	});

	test("candidate removed clears bets on that candidate only", () => {
		let state = createInitialState();
		state = addCandidates(state, "Alice\nBob");
		state = addSpectator(state, createSpectator("s1", "Spectator1"));
		state = addSpectator(state, createSpectator("s2", "Spectator2"));
		state = startBetting(state, Date.now() + 60000);

		const aliceId = state.candidates[0].id;
		const bobId = state.candidates[1].id;

		state = placeBet(state, "s1", aliceId); // Bet on Alice
		state = placeBet(state, "s2", bobId); // Bet on Bob

		// Reset to waiting to remove candidate
		state = { ...state, phase: "waiting" as const };
		state = removeCandidate(state, aliceId);

		expect(state.spectators.find((s) => s.id === "s1")?.bet).toBeNull();
		expect(state.spectators.find((s) => s.id === "s2")?.bet).toBe(bobId);
	});
});

// Unit tests for game state management

import { describe, expect, test } from "bun:test";
import type { Player } from "../shared/types";
import {
  addPlayer,
  canPlaceBet,
  canReset,
  canSpin,
  canStartBetting,
  createInitialState,
  placeBet,
  removePlayer,
  resetGame,
  selectRandomWinner,
  setResult,
  startBetting,
  startSpinning,
} from "./game";

// ============================================
// Helper Functions
// ============================================

const createPlayer = (
  id: string,
  name: string,
  isHost = false,
  bet: string | null = null
): Player => ({
  id,
  name,
  isHost,
  bet,
});

// ============================================
// Initial State Tests
// ============================================

describe("createInitialState", () => {
  test("creates empty state with waiting phase", () => {
    const state = createInitialState();
    expect(state.players).toEqual([]);
    expect(state.phase).toBe("waiting");
    expect(state.winner).toBeNull();
    expect(state.bettingEndsAt).toBeNull();
  });
});

// ============================================
// Add Player Tests
// ============================================

describe("addPlayer", () => {
  test("adds player to empty state", () => {
    const state = createInitialState();
    const player = createPlayer("1", "Alice");
    const newState = addPlayer(state, player);

    expect(newState.players).toHaveLength(1);
    expect(newState.players[0].id).toBe("1");
    expect(newState.players[0].name).toBe("Alice");
  });

  test("first player becomes host", () => {
    const state = createInitialState();
    const player = createPlayer("1", "Alice", false);
    const newState = addPlayer(state, player);

    expect(newState.players[0].isHost).toBe(true);
  });

  test("second player is not host", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = addPlayer(state, createPlayer("2", "Bob"));

    expect(state.players[0].isHost).toBe(true);
    expect(state.players[1].isHost).toBe(false);
  });

  test("does not mutate original state", () => {
    const state = createInitialState();
    const player = createPlayer("1", "Alice");
    const newState = addPlayer(state, player);

    expect(state.players).toHaveLength(0);
    expect(newState.players).toHaveLength(1);
    expect(state).not.toBe(newState);
  });
});

// ============================================
// Remove Player Tests
// ============================================

describe("removePlayer", () => {
  test("removes player from state", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = addPlayer(state, createPlayer("2", "Bob"));

    const newState = removePlayer(state, "2");

    expect(newState.players).toHaveLength(1);
    expect(newState.players[0].id).toBe("1");
  });

  test("returns same state if player not found", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));

    const newState = removePlayer(state, "nonexistent");

    expect(newState.players).toHaveLength(1);
  });

  test("transfers host to next player when host leaves", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = addPlayer(state, createPlayer("2", "Bob"));
    state = addPlayer(state, createPlayer("3", "Charlie"));

    // Alice is host, remove her
    const newState = removePlayer(state, "1");

    expect(newState.players).toHaveLength(2);
    expect(newState.players[0].id).toBe("2");
    expect(newState.players[0].isHost).toBe(true);
    expect(newState.players[1].isHost).toBe(false);
  });

  test("clears bets on removed player", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = addPlayer(state, createPlayer("2", "Bob"));
    state = addPlayer(state, createPlayer("3", "Charlie"));

    // Start betting and place bets
    state = startBetting(state, Date.now() + 60000);
    state = placeBet(state, "1", "2"); // Alice bets on Bob
    state = placeBet(state, "3", "2"); // Charlie bets on Bob

    // Remove Bob
    const newState = removePlayer(state, "2");

    expect(newState.players).toHaveLength(2);
    expect(newState.players.find((p) => p.id === "1")?.bet).toBeNull();
    expect(newState.players.find((p) => p.id === "3")?.bet).toBeNull();
  });

  test("handles removing last player", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));

    const newState = removePlayer(state, "1");

    expect(newState.players).toHaveLength(0);
  });

  test("does not mutate original state", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = addPlayer(state, createPlayer("2", "Bob"));

    const newState = removePlayer(state, "2");

    expect(state.players).toHaveLength(2);
    expect(newState.players).toHaveLength(1);
  });
});

// ============================================
// Place Bet Tests
// ============================================

describe("placeBet", () => {
  test("places bet during betting phase", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = addPlayer(state, createPlayer("2", "Bob"));
    state = startBetting(state, Date.now() + 60000);

    const newState = placeBet(state, "1", "2");

    expect(newState.players.find((p) => p.id === "1")?.bet).toBe("2");
  });

  test("allows betting on yourself", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = startBetting(state, Date.now() + 60000);

    const newState = placeBet(state, "1", "1");

    expect(newState.players.find((p) => p.id === "1")?.bet).toBe("1");
  });

  test("allows changing bet", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = addPlayer(state, createPlayer("2", "Bob"));
    state = addPlayer(state, createPlayer("3", "Charlie"));
    state = startBetting(state, Date.now() + 60000);

    state = placeBet(state, "1", "2");
    expect(state.players.find((p) => p.id === "1")?.bet).toBe("2");

    state = placeBet(state, "1", "3");
    expect(state.players.find((p) => p.id === "1")?.bet).toBe("3");
  });

  test("does not place bet if not in betting phase", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = addPlayer(state, createPlayer("2", "Bob"));

    // In waiting phase
    const newState = placeBet(state, "1", "2");
    expect(newState.players.find((p) => p.id === "1")?.bet).toBeNull();
  });

  test("does not place bet on non-existent player", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = startBetting(state, Date.now() + 60000);

    const newState = placeBet(state, "1", "nonexistent");

    expect(newState.players.find((p) => p.id === "1")?.bet).toBeNull();
  });

  test("does not place bet for non-existent player", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = startBetting(state, Date.now() + 60000);

    const newState = placeBet(state, "nonexistent", "1");

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
    state = addPlayer(state, createPlayer("1", "Alice"));

    const endsAt = Date.now() + 60000;
    const newState = startBetting(state, endsAt);

    expect(newState.phase).toBe("betting");
    expect(newState.bettingEndsAt).toBe(endsAt);
  });

  test("clears winner when starting new betting phase", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = startBetting(state, Date.now() + 60000);
    state = startSpinning(state);
    state = setResult(state, "1");

    // Reset and start betting again
    state = resetGame(state);
    const newState = startBetting(state, Date.now() + 60000);

    expect(newState.winner).toBeNull();
  });

  test("does not transition if not in waiting phase", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = startBetting(state, Date.now() + 60000);

    // Already in betting phase, try to start betting again
    const newState = startBetting(state, Date.now() + 120000);

    expect(newState).toBe(state);
    expect(newState.phase).toBe("betting");
  });

  test("does not transition from spinning phase", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = startBetting(state, Date.now() + 60000);
    state = startSpinning(state);

    const newState = startBetting(state, Date.now() + 120000);

    expect(newState).toBe(state);
    expect(newState.phase).toBe("spinning");
  });

  test("does not transition from result phase", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = startBetting(state, Date.now() + 60000);
    state = startSpinning(state);
    state = setResult(state, "1");

    const newState = startBetting(state, Date.now() + 120000);

    expect(newState).toBe(state);
    expect(newState.phase).toBe("result");
  });
});

describe("startSpinning", () => {
  test("transitions to spinning phase", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = startBetting(state, Date.now() + 60000);

    const newState = startSpinning(state);

    expect(newState.phase).toBe("spinning");
    expect(newState.bettingEndsAt).toBeNull();
  });

  test("does not transition from waiting phase", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));

    const newState = startSpinning(state);

    expect(newState).toBe(state);
    expect(newState.phase).toBe("waiting");
  });

  test("does not transition from spinning phase", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = startBetting(state, Date.now() + 60000);
    state = startSpinning(state);

    const newState = startSpinning(state);

    expect(newState).toBe(state);
    expect(newState.phase).toBe("spinning");
  });

  test("does not transition from result phase", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = startBetting(state, Date.now() + 60000);
    state = startSpinning(state);
    state = setResult(state, "1");

    const newState = startSpinning(state);

    expect(newState).toBe(state);
    expect(newState.phase).toBe("result");
  });
});

describe("setResult", () => {
  test("sets winner and transitions to result phase", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = addPlayer(state, createPlayer("2", "Bob"));
    state = startBetting(state, Date.now() + 60000);
    state = startSpinning(state);

    const newState = setResult(state, "2");

    expect(newState.phase).toBe("result");
    expect(newState.winner).toBe("2");
  });

  test("does not set non-existent winner", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = addPlayer(state, createPlayer("2", "Bob"));
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
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = addPlayer(state, createPlayer("2", "Bob"));
    state = startBetting(state, Date.now() + 60000);
    state = placeBet(state, "1", "2");
    state = startSpinning(state);
    state = setResult(state, "2");

    const newState = resetGame(state);

    expect(newState.phase).toBe("waiting");
    expect(newState.winner).toBeNull();
    expect(newState.bettingEndsAt).toBeNull();
  });

  test("clears all bets", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = addPlayer(state, createPlayer("2", "Bob"));
    state = startBetting(state, Date.now() + 60000);
    state = placeBet(state, "1", "2");
    state = placeBet(state, "2", "1");
    state = startSpinning(state);
    state = setResult(state, "2");

    const newState = resetGame(state);

    expect(newState.players.every((p) => p.bet === null)).toBe(true);
  });

  test("keeps players", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = addPlayer(state, createPlayer("2", "Bob"));
    state = startBetting(state, Date.now() + 60000);
    state = startSpinning(state);
    state = setResult(state, "2");

    const newState = resetGame(state);

    expect(newState.players).toHaveLength(2);
    expect(newState.players[0].id).toBe("1");
    expect(newState.players[1].id).toBe("2");
  });
});

// ============================================
// Winner Selection Tests
// ============================================

describe("selectRandomWinner", () => {
  test("returns null for empty players", () => {
    const winner = selectRandomWinner([], 0.5);
    expect(winner).toBeNull();
  });

  test("returns the only player when one player", () => {
    const players = [createPlayer("1", "Alice")];
    const winner = selectRandomWinner(players, 0.5);
    expect(winner).toBe("1");
  });

  test("returns first player when randomValue is 0", () => {
    const players = [
      createPlayer("1", "Alice"),
      createPlayer("2", "Bob"),
      createPlayer("3", "Charlie"),
    ];
    const winner = selectRandomWinner(players, 0);
    expect(winner).toBe("1");
  });

  test("returns last player when randomValue is close to 1", () => {
    const players = [
      createPlayer("1", "Alice"),
      createPlayer("2", "Bob"),
      createPlayer("3", "Charlie"),
    ];
    const winner = selectRandomWinner(players, 0.99);
    expect(winner).toBe("3");
  });

  test("returns middle player with appropriate randomValue", () => {
    const players = [
      createPlayer("1", "Alice"),
      createPlayer("2", "Bob"),
      createPlayer("3", "Charlie"),
    ];
    const winner = selectRandomWinner(players, 0.5);
    expect(winner).toBe("2");
  });
});

// ============================================
// Validation Helper Tests
// ============================================

describe("canPlaceBet", () => {
  test("returns true during betting phase for existing player", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = startBetting(state, Date.now() + 60000);

    expect(canPlaceBet(state, "1")).toBe(true);
  });

  test("returns false during waiting phase", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));

    expect(canPlaceBet(state, "1")).toBe(false);
  });

  test("returns false for non-existent player", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = startBetting(state, Date.now() + 60000);

    expect(canPlaceBet(state, "nonexistent")).toBe(false);
  });
});

describe("canStartBetting", () => {
  test("returns true for host in waiting phase with players", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));

    expect(canStartBetting(state, "1")).toBe(true);
  });

  test("returns false for non-host", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = addPlayer(state, createPlayer("2", "Bob"));

    expect(canStartBetting(state, "2")).toBe(false);
  });

  test("returns false if not in waiting phase", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = startBetting(state, Date.now() + 60000);

    expect(canStartBetting(state, "1")).toBe(false);
  });

  test("returns false with no players", () => {
    const state = createInitialState();
    expect(canStartBetting(state, "1")).toBe(false);
  });
});

describe("canSpin", () => {
  test("returns true for host in betting phase", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = startBetting(state, Date.now() + 60000);

    expect(canSpin(state, "1")).toBe(true);
  });

  test("returns false for non-host", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = addPlayer(state, createPlayer("2", "Bob"));
    state = startBetting(state, Date.now() + 60000);

    expect(canSpin(state, "2")).toBe(false);
  });

  test("returns false if not in betting phase", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));

    expect(canSpin(state, "1")).toBe(false);
  });
});

describe("canReset", () => {
  test("returns true for host in result phase", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = startBetting(state, Date.now() + 60000);
    state = startSpinning(state);
    state = setResult(state, "1");

    expect(canReset(state, "1")).toBe(true);
  });

  test("returns false for non-host", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = addPlayer(state, createPlayer("2", "Bob"));
    state = startBetting(state, Date.now() + 60000);
    state = startSpinning(state);
    state = setResult(state, "1");

    expect(canReset(state, "2")).toBe(false);
  });

  test("returns false if not in result phase", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = startBetting(state, Date.now() + 60000);

    expect(canReset(state, "1")).toBe(false);
  });
});

// ============================================
// Edge Cases
// ============================================

describe("edge cases", () => {
  test("full game flow", () => {
    let state = createInitialState();

    // Players join
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = addPlayer(state, createPlayer("2", "Bob"));
    state = addPlayer(state, createPlayer("3", "Charlie"));

    expect(state.players).toHaveLength(3);
    expect(state.players[0].isHost).toBe(true);

    // Start betting
    const endsAt = Date.now() + 60000;
    state = startBetting(state, endsAt);
    expect(state.phase).toBe("betting");

    // Place bets
    state = placeBet(state, "1", "2");
    state = placeBet(state, "2", "2");
    state = placeBet(state, "3", "1");

    expect(state.players.find((p) => p.id === "1")?.bet).toBe("2");
    expect(state.players.find((p) => p.id === "2")?.bet).toBe("2");
    expect(state.players.find((p) => p.id === "3")?.bet).toBe("1");

    // Spin
    state = startSpinning(state);
    expect(state.phase).toBe("spinning");

    // Result
    state = setResult(state, "2");
    expect(state.phase).toBe("result");
    expect(state.winner).toBe("2");

    // Reset
    state = resetGame(state);
    expect(state.phase).toBe("waiting");
    expect(state.winner).toBeNull();
    expect(state.players.every((p) => p.bet === null)).toBe(true);
    expect(state.players).toHaveLength(3);
  });

  test("single player game", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));

    expect(canStartBetting(state, "1")).toBe(true);

    state = startBetting(state, Date.now() + 60000);
    state = placeBet(state, "1", "1");
    state = startSpinning(state);
    state = setResult(state, "1");

    expect(state.winner).toBe("1");
  });

  test("host leaving during betting phase", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = addPlayer(state, createPlayer("2", "Bob"));
    state = startBetting(state, Date.now() + 60000);
    state = placeBet(state, "2", "1"); // Bob bets on Alice

    // Alice (host) leaves
    state = removePlayer(state, "1");

    expect(state.players).toHaveLength(1);
    expect(state.players[0].isHost).toBe(true);
    expect(state.players[0].bet).toBeNull(); // Bet on Alice cleared
  });

  test("multiple host transfers", () => {
    let state = createInitialState();
    state = addPlayer(state, createPlayer("1", "Alice"));
    state = addPlayer(state, createPlayer("2", "Bob"));
    state = addPlayer(state, createPlayer("3", "Charlie"));

    // Remove first host
    state = removePlayer(state, "1");
    expect(state.players[0].id).toBe("2");
    expect(state.players[0].isHost).toBe(true);

    // Remove second host
    state = removePlayer(state, "2");
    expect(state.players[0].id).toBe("3");
    expect(state.players[0].isHost).toBe(true);
  });
});

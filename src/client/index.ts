import type { ClientMessage, GameState, Phase, ServerMessage } from "../shared/types";

// State management
let currentState: GameState | null = null;
let myPlayerId: string | null = null;
let ws: WebSocket | null = null;
let countdownInterval: number | null = null;

// WebSocket connection
const connect = (): void => {
	const submitBtn = document.querySelector(
		"#join-form button",
	) as HTMLButtonElement | null;
	if (submitBtn) submitBtn.disabled = true;

	ws = new WebSocket(`ws://${window.location.host}`);

	ws.onopen = () => {
		console.log("Connected");
		if (submitBtn) submitBtn.disabled = false;
	};
	ws.onclose = () => {
		console.log("Disconnected");
		// Clear countdown interval on disconnect
		if (countdownInterval !== null) {
			clearInterval(countdownInterval);
			countdownInterval = null;
		}
		// Show user-visible feedback
		const app = document.getElementById("app");
		if (app) {
			app.innerHTML =
				'<div class="screen" style="text-align:center;padding:2rem;"><h2>Disconnected</h2><p>Reconnecting...</p></div>';
		}
		// Auto-reconnect after delay
		setTimeout(() => {
			window.location.reload();
		}, 2000);
	};
	ws.onerror = (e) => console.error("WebSocket error:", e);
	ws.onmessage = (event) => {
		try {
			const message: ServerMessage = JSON.parse(event.data);
			handleServerMessage(message);
		} catch (e) {
			console.error("Failed to parse message:", e);
		}
	};
};

// Message handler
const handleServerMessage = (message: ServerMessage): void => {
	switch (message.type) {
		case "state":
			myPlayerId = message.playerId;
			currentState = message.state;
			render();
			break;
		case "spinResult":
			// Will handle wheel animation later
			console.log("Winner:", message.winnerId);
			break;
		case "error":
			alert(message.message);
			break;
	}
};

// Send helper
const send = (message: ClientMessage): void => {
	if (ws && ws.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify(message));
	}
};

// Join form handling
const setupJoinForm = (): void => {
	const form = document.getElementById("join-form") as HTMLFormElement;
	const input = document.getElementById("name-input") as HTMLInputElement;

	form.addEventListener("submit", (e) => {
		e.preventDefault();
		const name = input.value.trim();
		if (name) {
			send({ type: "join", name });
		}
	});
};

// Helper to prevent XSS
const escapeHtml = (text: string): string => {
	const div = document.createElement("div");
	div.textContent = text;
	return div.innerHTML;
};

// Render player list
const renderPlayerList = (): void => {
	const container = document.getElementById("player-list");
	if (!container || !currentState) return;

	container.innerHTML = "";

	const me = currentState.players.find((p) => p.id === myPlayerId);
	const canBet = currentState.phase === "betting";

	for (const player of currentState.players) {
		const div = document.createElement("div");
		div.className = "player-card";
		if (player.id === myPlayerId) div.classList.add("is-me");
		if (player.isHost) div.classList.add("is-host");
		if (me?.bet === player.id) div.classList.add("my-bet");
		if (player.bet !== null) div.classList.add("has-bet");
		if (canBet) div.classList.add("can-bet");

		div.innerHTML = `
			<span class="player-name">${escapeHtml(player.name)}</span>
			${player.isHost ? '<span class="host-badge">Host</span>' : ""}
			${player.bet !== null ? '<span class="bet-indicator">🎯</span>' : ""}
		`;

		// Click to bet
		if (canBet) {
			div.addEventListener("click", () => {
				send({ type: "placeBet", targetId: player.id });
			});
		}

		container.appendChild(div);
	}
};

// Render host controls
const renderHostControls = (): void => {
	const container = document.getElementById("host-controls");
	if (!container || !currentState) return;

	container.innerHTML = "";

	const me = currentState.players.find((p) => p.id === myPlayerId);
	if (!me?.isHost) return;

	if (currentState.phase === "waiting") {
		const btn = document.createElement("button");
		btn.className = "host-btn";
		btn.textContent = "Start Betting";
		btn.addEventListener("click", () => send({ type: "startBetting" }));
		container.appendChild(btn);
	}

	if (currentState.phase === "betting") {
		const btn = document.createElement("button");
		btn.className = "host-btn";
		btn.textContent = "Spin the Wheel!";
		btn.addEventListener("click", () => send({ type: "spin" }));
		container.appendChild(btn);
	}
};

// Render countdown during betting
const renderCountdown = (): void => {
	const container = document.getElementById("countdown");
	if (!container || !currentState) return;

	if (countdownInterval !== null) {
		clearInterval(countdownInterval);
		countdownInterval = null;
	}

	if (currentState.phase !== "betting" || !currentState.bettingEndsAt) {
		container.textContent = "";
		return;
	}

	const bettingEndsAt = currentState.bettingEndsAt; // Capture value locally

	const updateCountdown = (): void => {
		const now = Date.now();
		const remaining = Math.max(0, Math.ceil((bettingEndsAt - now) / 1000));
		container.textContent = `Time remaining: ${remaining}s`;

		if (remaining <= 0 && countdownInterval !== null) {
			clearInterval(countdownInterval);
			countdownInterval = null;
		}
	};

	updateCountdown();
	countdownInterval = window.setInterval(updateCountdown, 1000);
};

// Get human-readable phase text
const getPhaseText = (phase: Phase): string => {
	switch (phase) {
		case "waiting":
			return "Waiting for players...";
		case "betting":
			return "Place your bets!";
		case "spinning":
			return "Spinning...";
		case "result":
			return "Result!";
		default:
			return phase;
	}
};

// Main render function
const render = (): void => {
	if (!currentState) return;

	// Show/hide screens
	const joinScreen = document.getElementById("join-screen");
	const gameScreen = document.getElementById("game-screen");

	if (!joinScreen || !gameScreen) return;

	const hasJoined = currentState.players.some((p) => p.id === myPlayerId);
	joinScreen.classList.toggle("hidden", hasJoined);
	gameScreen.classList.toggle("hidden", !hasJoined);

	if (!hasJoined) return;

	// Update phase indicator
	const phaseIndicator = document.getElementById("phase-indicator");
	if (phaseIndicator) {
		phaseIndicator.textContent = getPhaseText(currentState.phase);
	}

	renderPlayerList();
	renderHostControls();
	renderCountdown();
};

// Initialize on load
const init = (): void => {
	connect();
	setupJoinForm();
};

document.addEventListener("DOMContentLoaded", init);

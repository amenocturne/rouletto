import type { ClientMessage, GameState, ServerMessage } from "../shared/types";

// State management
let currentState: GameState | null = null;
let myPlayerId: string | null = null;
let ws: WebSocket | null = null;

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

	for (const player of currentState.players) {
		const div = document.createElement("div");
		div.className = "player-card";
		if (player.id === myPlayerId) div.classList.add("is-me");
		if (player.isHost) div.classList.add("is-host");

		div.innerHTML = `
			<span class="player-name">${escapeHtml(player.name)}</span>
			${player.isHost ? '<span class="host-badge">Host</span>' : ""}
		`;
		container.appendChild(div);
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
		phaseIndicator.textContent = `Phase: ${currentState.phase}`;
	}

	// Render player list
	renderPlayerList();
};

// Initialize on load
const init = (): void => {
	connect();
	setupJoinForm();
};

document.addEventListener("DOMContentLoaded", init);

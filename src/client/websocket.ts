/**
 * WebSocket connection management for the casino wheel app.
 * Handles connection, reconnection, and message sending/receiving.
 */

import type { ClientMessage, ServerMessage, GameState } from "../shared/types";
import { stopAllAudio, playWheelRotationSound, playShowNextHostSound } from "./audio";
import { spinWheel, resetWheelState, getPixiApp, getGlowTickerCallback } from "./wheel";

// Base path for all routes
const BASE_PATH = "/rouletto";

// WebSocket instance
let ws: WebSocket | null = null;

// Callback references (set by index.ts)
let onStateUpdate: ((state: GameState, spectatorId: string, isAdmin: boolean) => void) | null =
	null;
let onRoomCreated: ((roomId: string) => void) | null = null;
let onRoomError: ((message: string) => void) | null = null;
let onError: ((message: string) => void) | null = null;
let onConnectionOpen: (() => void) | null = null;

/** Get the WebSocket instance */
export const getWebSocket = (): WebSocket | null => ws;

/** Set callback for state updates */
export const setOnStateUpdate = (
	callback: (state: GameState, spectatorId: string, isAdmin: boolean) => void,
): void => {
	onStateUpdate = callback;
};

/** Set callback for room creation */
export const setOnRoomCreated = (callback: (roomId: string) => void): void => {
	onRoomCreated = callback;
};

/** Set callback for room errors */
export const setOnRoomError = (callback: (message: string) => void): void => {
	onRoomError = callback;
};

/** Set callback for general errors */
export const setOnError = (callback: (message: string) => void): void => {
	onError = callback;
};

/** Set callback for connection open */
export const setOnConnectionOpen = (callback: () => void): void => {
	onConnectionOpen = callback;
};

/** Handle incoming server messages */
const handleServerMessage = (
	message: ServerMessage,
	getCurrentCandidates: () => readonly { readonly id: string; readonly name: string }[],
): void => {
	switch (message.type) {
		case "roomCreated":
			if (onRoomCreated) onRoomCreated(message.roomId);
			break;
		case "roomError":
			if (onRoomError) onRoomError(message.message);
			break;
		case "state":
			if (onStateUpdate) {
				onStateUpdate(message.state, message.spectatorId, message.isAdmin);
			}
			break;
		case "spinResult":
			spinWheel(message.winnerId, getCurrentCandidates());
			break;
		case "error":
			if (onError) onError(message.message);
			break;
		case "playSound":
			if (message.sound === "spin") {
				playWheelRotationSound();
			} else if (message.sound === "reveal") {
				playShowNextHostSound();
			}
			break;
	}
};

/** Connect to WebSocket server */
export const connect = (
	roomIdParam: string | undefined,
	getCurrentCandidates: () => readonly { readonly id: string; readonly name: string }[],
): void => {
	const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	const wsUrl = roomIdParam
		? `${protocol}//${window.location.host}${BASE_PATH}/?room=${roomIdParam}`
		: `${protocol}//${window.location.host}${BASE_PATH}/`;

	ws = new WebSocket(wsUrl);

	ws.onopen = () => {
		console.log("Connected");
		if (onConnectionOpen) onConnectionOpen();
	};

	ws.onclose = () => {
		console.log("Disconnected");
		stopAllAudio();

		// Cleanup Pixi
		const pixiApp = getPixiApp();
		const glowTickerCallback = getGlowTickerCallback();
		if (glowTickerCallback && pixiApp) {
			pixiApp.ticker.remove(glowTickerCallback);
		}
		resetWheelState();

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
			handleServerMessage(message, getCurrentCandidates);
		} catch (e) {
			console.error("Failed to parse message:", e);
		}
	};
};

/** Send a message to the server */
export const send = (message: ClientMessage): void => {
	if (ws && ws.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify(message));
	}
};

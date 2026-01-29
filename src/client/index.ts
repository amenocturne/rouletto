/**
 * Main entry point for the casino wheel client.
 * Coordinates state management, WebSocket communication, and UI rendering.
 */

import type { GameState } from "../shared/types";

// Module imports
import {
	loadVolumeSettings,
	initAudio,
	enableAudio,
	playAddUserSound,
	playRemoveUserSound,
	playVoteSound,
} from "./audio";
import { createCardBorder } from "./cardBorder";
import {
	connect,
	send,
	getWebSocket,
	setOnStateUpdate,
	setOnRoomCreated,
	setOnRoomError,
	setOnError,
	setOnConnectionOpen,
} from "./websocket";
import {
	showLandingPage,
	showJoinScreen,
	showRoomError,
	render,
	renderSettingsPanel,
	createCRTOverlay,
	hideLoadingOverlay,
} from "./ui";

// Base path for all routes
const BASE_PATH = "/rouletto";

// State management
let currentState: GameState | null = null;
let mySpectatorId: string | null = null;
let isAdmin = false;

// Room state
let roomId: string | null = null;

// Pixi initialization flag (shared with UI module via reference)
const isPixiInitializing = { value: false };

/** Get current candidates (for websocket module) */
const getCurrentCandidates = (): readonly { readonly id: string; readonly name: string }[] => {
	return currentState?.candidates ?? [];
};

/** Handle state updates from server */
const handleStateUpdate = (state: GameState, spectatorId: string, admin: boolean): void => {
	// Detect user joins/leaves by comparing counts
	const previousSpectatorCount = currentState?.spectators.length ?? 0;
	const newSpectatorCount = state.spectators.length;
	const previousCandidateCount = currentState?.candidates.length ?? 0;
	const newCandidateCount = state.candidates.length;

	// Only play sounds after we've joined (have a spectatorId)
	if (mySpectatorId) {
		if (newSpectatorCount > previousSpectatorCount) {
			playAddUserSound();
		} else if (newSpectatorCount < previousSpectatorCount) {
			playRemoveUserSound();
		} else if (newCandidateCount < previousCandidateCount) {
			// Candidate was removed
			playRemoveUserSound();
		}

		// Detect when someone (other than us) places a bet
		if (currentState && state.phase === "betting") {
			for (const newSpec of state.spectators) {
				// Skip ourselves - we already play the sound on click
				if (newSpec.id === mySpectatorId) continue;

				const oldSpec = currentState.spectators.find((s) => s.id === newSpec.id);
				// Play sound if bet changed (new bet or changed bet)
				if (newSpec.bet && newSpec.bet !== oldSpec?.bet) {
					playVoteSound();
					break; // Only play once even if multiple bets change
				}
			}
		}
	}

	mySpectatorId = spectatorId;
	isAdmin = admin;
	currentState = state;
	renderApp();
};

/** Handle room creation */
const handleRoomCreated = (newRoomId: string): void => {
	roomId = newRoomId;
	// Update URL without reload
	window.history.pushState({}, "", `${BASE_PATH}/room/${roomId}`);
	// Show join screen to enter name
	showJoinScreen(roomId, send, currentState, renderApp, isPixiInitializing);
};

/** Handle room error */
const handleRoomError = (message: string): void => {
	showRoomError(message, () => showLandingPageWithConnectFn());
};

/** Handle general error */
const handleError = (message: string): void => {
	alert(message);
};

/** Handle connection open */
const handleConnectionOpen = (): void => {
	// Re-enable buttons if they were disabled
	const createBtn = document.getElementById("create-room-btn") as HTMLButtonElement | null;
	const submitBtn = document.querySelector("#join-form button") as HTMLButtonElement | null;
	if (createBtn) createBtn.disabled = false;
	if (submitBtn) submitBtn.disabled = false;
};

/** Connect with room ID */
const connectWithRoom = (roomIdParam?: string): void => {
	connect(roomIdParam, getCurrentCandidates);
};

/** Show landing page with proper connect function */
const showLandingPageWithConnectFn = (): void => {
	// Reset state when going to landing page
	currentState = null;
	mySpectatorId = null;
	isAdmin = false;

	showLandingPage(() => connectWithRoom(), send, getWebSocket);
};

/** Main render function wrapper */
const renderApp = (): void => {
	render(currentState, mySpectatorId, isAdmin, send, isPixiInitializing);
};

/** Initialize on load */
const init = async (): Promise<void> => {
	// Wait for fonts to be ready (prevents flash of unstyled text)
	await document.fonts.ready;

	// Create decorative card border (await to prevent flash)
	await createCardBorder();

	// Setup WebSocket callbacks
	setOnStateUpdate(handleStateUpdate);
	setOnRoomCreated(handleRoomCreated);
	setOnRoomError(handleRoomError);
	setOnError(handleError);
	setOnConnectionOpen(handleConnectionOpen);

	loadVolumeSettings();
	initAudio();
	enableAudio();
	renderSettingsPanel();
	createCRTOverlay();

	const path = window.location.pathname;
	const roomMatch = path.match(/^\/rouletto\/room\/([a-z0-9]+)$/i);

	if (roomMatch) {
		// We're in a room - connect and show join screen
		roomId = roomMatch[1].toLowerCase();
		connectWithRoom(roomId);
		showJoinScreen(roomId, send, currentState, renderApp, isPixiInitializing);
	} else {
		// Landing page - show create room button
		showLandingPageWithConnectFn();
	}

	// Hide loading overlay after app is rendered
	hideLoadingOverlay();
};

document.addEventListener("DOMContentLoaded", init);

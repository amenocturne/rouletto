/**
 * UI rendering and DOM manipulation for the casino wheel app.
 * Handles screen transitions, form setup, and UI components.
 */

import type { GameState, ClientMessage } from "../shared/types";
import {
	getPixiApp,
	initPixi,
	drawWheel,
	disableGlowEffects,
	renderWheel,
	resetWheelState,
} from "./wheel";
import { getMusicVolume, getSfxVolume, setMusicVolume, setSfxVolume } from "./audio";

// Base path for all routes
const BASE_PATH = "/rouletto";

// UI state
let shouldFocusCandidateInput = false;
let hasInitiallyFocusedCandidateInput = false;
let lastCandidatesJson = ""; // Cache to avoid redrawing wheel unnecessarily
let lastCandidatesListJson = ""; // Cache to avoid rebuilding candidates list DOM

// Chip colors for betting display
const CHIP_COLORS = ["", "blue", "green", "purple", "orange"];

/** Helper to prevent XSS */
export const escapeHtml = (text: string): string => {
	const div = document.createElement("div");
	div.textContent = text;
	return div.innerHTML;
};

/** Get a chip color based on spectator index */
const getChipColor = (spectatorIndex: number): string => {
	return CHIP_COLORS[spectatorIndex % CHIP_COLORS.length];
};

/** Reset UI-related state when navigating away from game */
export const resetUIState = (): void => {
	lastCandidatesJson = "";
	lastCandidatesListJson = "";
	hasInitiallyFocusedCandidateInput = false;
	shouldFocusCandidateInput = false;
};

/** Reset all Pixi state when navigating away from game */
export const resetPixiState = (): void => {
	resetWheelState();
	resetUIState();
};

/** Show room error screen */
export const showRoomError = (
	_errorMessage: string,
	showLandingPageFn: () => void,
): void => {
	resetPixiState();

	const app = document.getElementById("app");
	if (!app) return;

	app.innerHTML = `
		<div id="error-screen" class="screen">
			<h1>Room Not Found</h1>
			<button id="go-home-btn" class="host-btn">Go to Home</button>
		</div>
	`;

	const goHomeBtn = document.getElementById("go-home-btn") as HTMLButtonElement | null;
	if (goHomeBtn) {
		goHomeBtn.onclick = () => {
			window.history.pushState({}, "", `${BASE_PATH}/`);
			showLandingPageFn();
		};
		goHomeBtn.focus();
	}
};

/** Show landing page */
export const showLandingPage = (
	connectFn: () => void,
	sendFn: (msg: ClientMessage) => void,
	getWs: () => WebSocket | null,
): void => {
	resetPixiState();

	const app = document.getElementById("app");
	if (!app) return;

	app.innerHTML = `
		<div id="landing-screen" class="screen">
			<h1>Rouletto</h1>
			<button id="create-room-btn" class="host-btn">Create New Room</button>
		</div>
	`;

	const createBtn = document.getElementById("create-room-btn") as HTMLButtonElement | null;
	if (createBtn) {
		createBtn.onclick = () => {
			createBtn.disabled = true;
			connectFn();
			// Wait for connection, then send createRoom
			const checkConnection = (): void => {
				const ws = getWs();
				if (ws && ws.readyState === WebSocket.OPEN) {
					sendFn({ type: "createRoom" });
				} else if (ws && ws.readyState === WebSocket.CONNECTING) {
					setTimeout(checkConnection, 50);
				}
			};
			checkConnection();
		};
		createBtn.focus();
	}
};

/** Show join screen (for entering name) */
export const showJoinScreen = (
	roomId: string | null,
	sendFn: (msg: ClientMessage) => void,
	currentState: GameState | null,
	renderFn: () => void,
	isPixiInitializing: { value: boolean },
): void => {
	const app = document.getElementById("app");
	if (!app) return;

	// Build the share URL section only if we have a roomId
	const shareSection = roomId
		? `
		<div class="share-section">
			<p>Share this link with others:</p>
			<div class="share-url">
				<input type="text" id="share-url-input" value="${window.location.href}" readonly>
				<button type="button" id="copy-url-btn" class="copy-btn">Copy</button>
			</div>
		</div>
	`
		: "";

	app.innerHTML = `
		<div id="join-screen" class="screen">
			<h1>Rouletto</h1>
			${shareSection}
			<form id="join-form">
				<div class="form-title">Enter the Game</div>
				<input type="text" id="name-input" placeholder="Your name" required maxlength="20">
				<label class="join-option">
					<span class="checkbox-chip"><input type="checkbox" id="spectator-mode"></span>
					<span>Spectator</span>
				</label>
				<button type="submit">Join Game</button>
			</form>
		</div>
		<div id="game-screen" class="screen hidden">
			<div class="game-layout">
				<div class="game-left">
					<div class="wheel-title">Spin to Win</div>
					<div class="wheel-row">
						<div id="action-controls"></div>
						<div id="wheel-container"></div>
					</div>
				</div>
				<div class="game-right">
					<div class="panel-header">
						<h3>Players</h3>
						<span id="admin-badge" class="admin-badge hidden">Admin</span>
					</div>
					<div id="admin-controls"></div>
					<div id="candidates-list"></div>
				</div>
			</div>
			<div id="result-overlay" class="hidden"></div>
		</div>
	`;

	setupJoinForm(sendFn);

	// Setup copy button
	const copyBtn = document.getElementById("copy-url-btn");
	const shareInput = document.getElementById("share-url-input") as HTMLInputElement | null;
	if (copyBtn && shareInput) {
		copyBtn.onclick = () => {
			shareInput.select();
			navigator.clipboard.writeText(shareInput.value).then(() => {
				copyBtn.textContent = "Copied!";
				setTimeout(() => {
					copyBtn.textContent = "Copy";
				}, 2000);
			});
		};
	}

	// Pre-initialize Pixi so wheel is ready when user joins
	const pixiApp = getPixiApp();
	if (!pixiApp && !isPixiInitializing.value) {
		isPixiInitializing.value = true;
		initPixi().then(() => {
			isPixiInitializing.value = false;
			// If user already joined while we were initializing, re-render
			if (currentState) {
				renderFn();
			}
		});
	}
};

/** Join form handling */
const setupJoinForm = (sendFn: (msg: ClientMessage) => void): void => {
	const form = document.getElementById("join-form") as HTMLFormElement | null;
	const input = document.getElementById("name-input") as HTMLInputElement | null;
	const spectatorCheckbox = document.getElementById("spectator-mode") as HTMLInputElement | null;

	if (!form || !input) return;

	form.addEventListener("submit", (e) => {
		e.preventDefault();
		const name = input.value.trim();
		// Inverted logic: if spectator mode is checked, joinAsPlayer is false
		const joinAsPlayer = !(spectatorCheckbox?.checked ?? false);
		if (name) {
			sendFn({ type: "join", name, joinAsPlayer });
		}
	});

	// Auto-focus the name input on page load
	input.focus();
};

/** Render admin controls (add candidates input) */
export const renderAdminControls = (
	currentState: GameState | null,
	isAdmin: boolean,
	sendFn: (msg: ClientMessage) => void,
): void => {
	const container = document.getElementById("admin-controls");
	if (!container || !currentState) return;

	// Only rebuild if phase or admin status changed
	const shouldShowControls = isAdmin && currentState.phase === "waiting";
	const currentlyShowing = container.innerHTML !== "";

	if (!shouldShowControls) {
		if (currentlyShowing) {
			container.innerHTML = "";
		}
		return;
	}

	// Skip rebuild if controls already exist (preserves input focus/value)
	if (currentlyShowing && !shouldFocusCandidateInput) {
		return;
	}

	container.innerHTML = `
		<div class="add-candidate-row">
			<input type="text" id="candidate-input" placeholder="Add name..." maxlength="20">
			<button id="add-candidate-btn">+</button>
		</div>
	`;

	const addBtn = document.getElementById("add-candidate-btn");
	const input = document.getElementById("candidate-input") as HTMLInputElement | null;

	const addCandidate = (): void => {
		if (input?.value.trim()) {
			// Set flag to refocus after re-render
			shouldFocusCandidateInput = true;
			sendFn({ type: "addCandidates", names: input.value.trim() });
			input.value = "";
		}
	};

	if (addBtn && input) {
		addBtn.onclick = addCandidate;
		input.onkeydown = (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				addCandidate();
			}
		};

		// Auto-focus on first render as admin, or after adding a candidate
		if (!hasInitiallyFocusedCandidateInput || shouldFocusCandidateInput) {
			hasInitiallyFocusedCandidateInput = true;
			shouldFocusCandidateInput = false;
			input.focus();
		}
	}
};

/** Render betting chips for a candidate */
const renderBettingChips = (
	candidateId: string,
	currentState: GameState,
	mySpectatorId: string | null,
): string => {
	// Find all spectators who bet on this candidate
	const bettors = currentState.spectators.filter((s) => s.bet === candidateId);
	if (bettors.length === 0) return "";

	const chips = bettors
		.map((bettor) => {
			const spectatorIndex = currentState.spectators.findIndex((s) => s.id === bettor.id);
			const colorClass = getChipColor(spectatorIndex);
			const initial = bettor.name.charAt(0).toUpperCase();
			const isMe = bettor.id === mySpectatorId;
			return `<div class="chip ${colorClass}" title="${escapeHtml(bettor.name)}${isMe ? " (You)" : ""}">${initial}</div>`;
		})
		.join("");

	return `<div class="chips-container">${chips}</div>`;
};

/** Render players list (candidates on wheel + spectators greyed out) */
export const renderCandidatesList = (
	currentState: GameState | null,
	mySpectatorId: string | null,
	isAdmin: boolean,
	sendFn: (msg: ClientMessage) => void,
): void => {
	const container = document.getElementById("candidates-list");
	if (!container || !currentState) return;

	// Build a cache key that includes all data affecting the render
	const cacheKey = JSON.stringify({
		candidates: currentState.candidates,
		spectators: currentState.spectators.map((s) => ({ id: s.id, name: s.name, bet: s.bet })),
		phase: currentState.phase,
		isAdmin,
		mySpectatorId,
	});

	// Skip rebuild if nothing changed
	if (cacheKey === lastCandidatesListJson) {
		return;
	}
	lastCandidatesListJson = cacheKey;

	container.innerHTML = "";

	const me = currentState.spectators.find((s) => s.id === mySpectatorId);
	const canBet = currentState.phase === "betting";

	// Get candidate names to identify which spectators are also candidates
	const candidateNames = new Set(currentState.candidates.map((c) => c.name.toLowerCase()));

	// Render candidates (on the wheel)
	for (const candidate of currentState.candidates) {
		const div = document.createElement("div");
		div.className = "candidate-card";

		if (me?.bet === candidate.id) div.classList.add("my-bet");
		if (canBet) div.classList.add("can-bet");

		// Get betting chips HTML
		const chipsHtml = renderBettingChips(candidate.id, currentState, mySpectatorId);

		div.innerHTML = `
			<span class="candidate-name">${escapeHtml(candidate.name)}</span>
			${chipsHtml}
			${isAdmin && currentState.phase === "waiting" ? '<button class="remove-candidate-btn">X</button>' : ""}
		`;

		// Click to bet during betting phase
		if (canBet) {
			div.addEventListener("click", (e) => {
				// Don't bet if clicking the remove button
				if ((e.target as HTMLElement).classList.contains("remove-candidate-btn")) return;
				sendFn({ type: "placeBet", targetId: candidate.id });
			});
		}

		// Remove candidate button (admin only during waiting)
		const removeBtn = div.querySelector(".remove-candidate-btn");
		if (removeBtn) {
			removeBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				sendFn({ type: "removeCandidate", candidateId: candidate.id });
			});
		}

		container.appendChild(div);
	}

	// Render spectators who are NOT candidates (greyed out)
	const pureSpectators = currentState.spectators.filter(
		(s) => !candidateNames.has(s.name.toLowerCase()),
	);

	for (const spectator of pureSpectators) {
		const div = document.createElement("div");
		div.className = "candidate-card spectator-only";

		if (spectator.id === mySpectatorId) div.classList.add("is-me");

		div.innerHTML = `
			<span class="candidate-name">${escapeHtml(spectator.name)}</span>
			${spectator.id === mySpectatorId ? '<span class="you-badge">You</span>' : ""}
		`;

		container.appendChild(div);
	}

	// Show message if no players at all
	if (currentState.candidates.length === 0 && pureSpectators.length === 0) {
		container.innerHTML = '<p class="no-candidates">No players yet. Admin can add names above.</p>';
	}
};

/** Render action controls (start betting, spin lever) */
export const renderActionControls = (
	currentState: GameState | null,
	isAdmin: boolean,
	sendFn: (msg: ClientMessage) => void,
): void => {
	const container = document.getElementById("action-controls");
	if (!container || !currentState) return;

	// Show start betting button in waiting phase
	if (currentState.phase === "waiting" && currentState.candidates.length > 0) {
		container.innerHTML = "";
		const btn = document.createElement("button");
		btn.className = "host-btn";
		btn.textContent = "Start Betting";
		if (isAdmin) {
			btn.addEventListener("click", () => sendFn({ type: "startBetting" }));
		} else {
			btn.disabled = true;
		}
		container.appendChild(btn);
		return;
	}

	// Show lever during betting, spinning, and result phases (all users)
	if (
		currentState.phase === "betting" ||
		currentState.phase === "spinning" ||
		currentState.phase === "result"
	) {
		// Only admin can interact with lever during betting phase
		const isInteractive = isAdmin && currentState.phase === "betting";
		const isPulled = currentState.phase === "spinning" || currentState.phase === "result";

		// Check if lever already exists - preserve it to avoid visual flash
		const leverContainer = container.querySelector(".lever-container") as HTMLElement | null;
		const handle = document.getElementById("lever-handle");

		if (leverContainer && handle) {
			// Update existing lever classes
			if (isInteractive) {
				leverContainer.classList.remove("disabled");
			} else {
				leverContainer.classList.add("disabled");
			}

			if (isPulled) {
				handle.classList.add("pulled");
			}

			// Update label
			const label = leverContainer.querySelector(".lever-label");
			if (label) {
				if (isInteractive) {
					label.textContent = "Pull to Spin";
				} else if (!isAdmin && currentState.phase === "betting") {
					label.textContent = "Waiting...";
				} else {
					label.textContent = "";
				}
			}
		} else {
			// Create new lever
			container.innerHTML = "";
			const lever = document.createElement("div");
			lever.className = `lever-container${isInteractive ? "" : " disabled"}`;
			// Determine label text
			let labelText = "";
			if (isInteractive) {
				labelText = "Pull to Spin";
			} else if (!isAdmin && currentState.phase === "betting") {
				labelText = "Waiting...";
			}
			lever.innerHTML = `
				<div class="lever-slot">
					<div class="lever-track"></div>
					<div class="lever-handle${isPulled ? " pulled" : ""}" id="lever-handle">
						<div class="lever-ball"></div>
						<div class="lever-stick"></div>
					</div>
				</div>
				<div class="lever-label">${labelText}</div>
			`;

			if (isInteractive) {
				lever.onclick = () => {
					const handle = document.getElementById("lever-handle");
					if (!handle || handle.classList.contains("pulled")) return;

					// Pull down and stay down
					handle.classList.add("pulled");

					// Send spin message after pull animation
					setTimeout(() => {
						sendFn({ type: "spin" });
					}, 300);
				};
			}

			container.appendChild(lever);
		}
		return;
	}

	// Clear for other phases (waiting with no candidates, or non-admin in waiting)
	container.innerHTML = "";
};

/** Render results overlay with winner display */
export const renderResultOverlay = (
	currentState: GameState | null,
	mySpectatorId: string | null,
	isAdmin: boolean,
	sendFn: (msg: ClientMessage) => void,
): void => {
	const overlay = document.getElementById("result-overlay");
	if (!overlay || !currentState) return;

	// Only show in result phase
	if (currentState.phase !== "result") {
		overlay.classList.add("hidden");
		overlay.innerHTML = "";
		return;
	}

	// Don't re-render if already showing (avoid flicker)
	if (!overlay.classList.contains("hidden") && overlay.innerHTML !== "") {
		return;
	}

	overlay.classList.remove("hidden");

	// Find winner candidate
	const winner = currentState.candidates.find((c) => c.id === currentState.winner);
	if (!winner) return;

	// Find spectators who guessed correctly
	const correctGuessers = currentState.spectators.filter((s) => s.bet === currentState.winner);

	overlay.innerHTML = `
		<div class="result-card">
			<h1 class="result-title">Next Host</h1>
			<div class="winner-name">${escapeHtml(winner.name)}</div>

			${
				correctGuessers.length > 0
					? `
				<div class="correct-guessers">
					<h3>Correct Guesses:</h3>
					<ul>
						${correctGuessers.map((s) => `<li>${escapeHtml(s.name)}${s.id === mySpectatorId ? " (You!)" : ""}</li>`).join("")}
					</ul>
				</div>
			`
					: '<p class="no-guessers">No one guessed correctly!</p>'
			}

			${
				isAdmin
					? `
				<button class="play-again-btn" id="play-again-btn">Play Again</button>
			`
					: '<p class="waiting-text">Waiting for admin to start new round...</p>'
			}
		</div>
	`;

	// Add event listener for play again button
	const playAgainBtn = document.getElementById("play-again-btn") as HTMLButtonElement | null;
	if (playAgainBtn) {
		playAgainBtn.onclick = () => {
			sendFn({ type: "reset" });
		};
		playAgainBtn.focus();
	}
};

/** Main render function */
export const render = (
	currentState: GameState | null,
	mySpectatorId: string | null,
	isAdmin: boolean,
	sendFn: (msg: ClientMessage) => void,
	isPixiInitializing: { value: boolean },
): void => {
	if (!currentState) return;

	// Show/hide screens
	const joinScreen = document.getElementById("join-screen");
	const gameScreen = document.getElementById("game-screen");

	if (!joinScreen || !gameScreen) return;

	const hasJoined = currentState.spectators.some((s) => s.id === mySpectatorId);

	if (!hasJoined) {
		joinScreen.classList.remove("hidden");
		gameScreen.classList.add("hidden");
		return;
	}

	// Wait for Pixi to be ready before showing game screen
	const pixiApp = getPixiApp();
	if (!pixiApp) {
		if (!isPixiInitializing.value) {
			// Start Pixi initialization
			isPixiInitializing.value = true;
			initPixi().then(() => {
				isPixiInitializing.value = false;
				// Re-render once Pixi is ready
				render(currentState, mySpectatorId, isAdmin, sendFn, isPixiInitializing);
			});
		}
		// Don't show game screen yet - wait for Pixi
		return;
	}

	// Pixi is ready - draw wheel if candidates changed
	const candidatesJson = JSON.stringify(currentState.candidates);
	if (candidatesJson !== lastCandidatesJson) {
		lastCandidatesJson = candidatesJson;
		drawWheel(currentState.candidates);
		// Manual render since ticker is stopped when wheel is static
		renderWheel();
	}

	// Show game screen
	joinScreen.classList.add("hidden");
	gameScreen.classList.remove("hidden");

	// Show/hide admin badge
	const adminBadge = document.getElementById("admin-badge");
	if (adminBadge) {
		adminBadge.classList.toggle("hidden", !isAdmin);
	}

	// If phase is waiting, reset glow and disable filter for performance
	if (currentState.phase === "waiting") {
		disableGlowEffects();
	}

	renderAdminControls(currentState, isAdmin, sendFn);
	renderCandidatesList(currentState, mySpectatorId, isAdmin, sendFn);
	renderActionControls(currentState, isAdmin, sendFn);
	renderResultOverlay(currentState, mySpectatorId, isAdmin, sendFn);
};

/** Render settings panel for volume controls */
export const renderSettingsPanel = (): void => {
	// Check if already exists
	if (document.getElementById("settings-panel")) return;

	const musicVol = getMusicVolume();
	const sfxVol = getSfxVolume();

	const panel = document.createElement("div");
	panel.id = "settings-panel";
	panel.className = "settings-panel";
	panel.innerHTML = `
		<button id="settings-toggle" class="settings-toggle" title="Sound Settings">
			<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
				<path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
				<path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
			</svg>
		</button>
		<div id="settings-dropdown" class="settings-dropdown hidden">
			<div class="settings-header">Sound Settings</div>
			<div class="volume-control">
				<label>Music</label>
				<input type="range" id="music-volume" min="0" max="100" value="${musicVol * 100}">
				<span id="music-volume-value">${Math.round(musicVol * 100)}%</span>
			</div>
			<div class="volume-control">
				<label>Effects</label>
				<input type="range" id="sfx-volume" min="0" max="100" value="${sfxVol * 100}">
				<span id="sfx-volume-value">${Math.round(sfxVol * 100)}%</span>
			</div>
		</div>
	`;

	document.body.appendChild(panel);

	// Toggle dropdown
	const toggleBtn = document.getElementById("settings-toggle");
	if (toggleBtn) {
		toggleBtn.onclick = () => {
			const dropdown = document.getElementById("settings-dropdown");
			if (dropdown) dropdown.classList.toggle("hidden");
		};
	}

	// Music volume slider
	const musicSlider = document.getElementById("music-volume") as HTMLInputElement;
	if (musicSlider) {
		musicSlider.oninput = () => {
			const volume = Number.parseInt(musicSlider.value, 10) / 100;
			const valueDisplay = document.getElementById("music-volume-value");
			if (valueDisplay) valueDisplay.textContent = `${musicSlider.value}%`;
			setMusicVolume(volume);
		};
	}

	// SFX volume slider
	const sfxSlider = document.getElementById("sfx-volume") as HTMLInputElement;
	if (sfxSlider) {
		sfxSlider.oninput = () => {
			const volume = Number.parseInt(sfxSlider.value, 10) / 100;
			const valueDisplay = document.getElementById("sfx-volume-value");
			if (valueDisplay) valueDisplay.textContent = `${sfxSlider.value}%`;
			setSfxVolume(volume);
		};
	}
};

/** Create CRT overlay element */
export const createCRTOverlay = (): void => {
	const crt = document.createElement("div");
	crt.className = "crt-overlay";
	document.body.appendChild(crt);
};

/** Hide loading overlay with fade animation */
export const hideLoadingOverlay = (): void => {
	const overlay = document.getElementById("loading-overlay");
	if (!overlay) return;

	// Small delay to ensure DOM is painted
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			overlay.classList.add("fade-out");
			// Remove from DOM after transition completes
			setTimeout(() => {
				overlay.classList.add("removed");
			}, 400);
		});
	});
};

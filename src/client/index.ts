import * as PIXI from "pixi.js";
import { CRTFilter, GlowFilter } from "pixi-filters";
import type { ClientMessage, GameState, Phase, Player, ServerMessage } from "../shared/types";

// State management
let currentState: GameState | null = null;
let myPlayerId: string | null = null;
let ws: WebSocket | null = null;
let countdownInterval: number | null = null;

// Pixi.js wheel state
let pixiApp: PIXI.Application | null = null;
let wheelContainer: PIXI.Container | null = null;
let isPixiInitializing = false;
let isSpinning = false;
let wheelGlowFilter: GlowFilter | null = null;
let glowTickerCallback: (() => void) | null = null;

// Audio state
let spinSound: HTMLAudioElement | null = null;
let revealSound: HTMLAudioElement | null = null;
let audioEnabled = false;

// Audio functions
const initAudio = (): void => {
	// Create audio elements
	spinSound = new Audio("/sounds/spin.mp3");
	spinSound.loop = true;

	revealSound = new Audio("/sounds/reveal.mp3");

	// Preload
	spinSound.load();
	revealSound.load();
};

const enableAudio = (): void => {
	if (audioEnabled) return;

	const unlock = (): void => {
		if (spinSound) {
			spinSound
				.play()
				.then(() => {
					spinSound?.pause();
					if (spinSound) spinSound.currentTime = 0;
					audioEnabled = true;
					console.log("Audio unlocked");
					document.removeEventListener("click", unlock);
					document.removeEventListener("touchstart", unlock);
				})
				.catch(() => {
					// Keep trying on next interaction
				});
		}
	};

	document.addEventListener("click", unlock);
	document.addEventListener("touchstart", unlock);
};

const playSpinSound = (): void => {
	if (!audioEnabled || !spinSound) return;
	spinSound.currentTime = 0;
	spinSound.play().catch((e) => console.warn("Spin sound failed:", e));
};

const stopSpinSound = (): void => {
	if (!spinSound) return;
	spinSound.pause();
	spinSound.currentTime = 0;
};

const playRevealSound = (): void => {
	if (!audioEnabled || !revealSound) return;
	stopSpinSound();
	revealSound.currentTime = 0;
	revealSound.play().catch((e) => console.warn("Reveal sound failed:", e));
};

// WebSocket connection
const connect = (): void => {
	const submitBtn = document.querySelector("#join-form button") as HTMLButtonElement | null;
	if (submitBtn) submitBtn.disabled = true;

	ws = new WebSocket(`ws://${window.location.host}`);

	ws.onopen = () => {
		console.log("Connected");
		if (submitBtn) submitBtn.disabled = false;
	};
	ws.onclose = () => {
		console.log("Disconnected");
		stopSpinSound(); // Stop any playing audio
		// Clear countdown interval on disconnect
		if (countdownInterval !== null) {
			clearInterval(countdownInterval);
			countdownInterval = null;
		}
		// Cleanup Pixi
		if (glowTickerCallback && pixiApp) {
			pixiApp.ticker.remove(glowTickerCallback);
			glowTickerCallback = null;
		}
		if (pixiApp) {
			pixiApp.destroy(true, { children: true, texture: true });
			pixiApp = null;
			wheelContainer = null;
			wheelGlowFilter = null;
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
			spinWheel(message.winnerId);
			break;
		case "error":
			alert(message.message);
			break;
		case "playSound":
			if (message.sound === "spin") {
				playSpinSound();
			} else if (message.sound === "reveal") {
				playRevealSound();
			}
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

// Easing function for smooth deceleration
const easeOutCubic = (t: number): number => {
	return 1 - (1 - t) ** 3;
};

// Spin animation constants
const SPIN_DURATION = 5000; // 5 seconds
const EXTRA_ROTATIONS = 4; // Number of full rotations before landing

// Pulse glow effect on winner reveal
const pulseWinnerGlow = (): void => {
	if (!wheelGlowFilter || !pixiApp) return;

	// Remove previous callback if exists (prevents accumulation)
	if (glowTickerCallback) {
		pixiApp.ticker.remove(glowTickerCallback);
	}

	let intensity = 1.5;
	let increasing = true;

	glowTickerCallback = (): void => {
		if (!wheelGlowFilter) return;

		if (increasing) {
			intensity += 0.05;
			if (intensity >= 4) increasing = false;
		} else {
			intensity -= 0.05;
			if (intensity <= 1.5) increasing = true;
		}

		wheelGlowFilter.outerStrength = intensity;
	};

	pixiApp.ticker.add(glowTickerCallback);
};

// Spin the wheel to land on the winner
const spinWheel = (winnerId: string): void => {
	if (!wheelContainer || !currentState || isSpinning) return;
	isSpinning = true;

	const players = currentState.players;
	const winnerIndex = players.findIndex((p) => p.id === winnerId);
	if (winnerIndex === -1) {
		isSpinning = false;
		return;
	}

	// Calculate target angle to land on winner's segment
	// Segments start at -PI/2 (top), pointer is at top
	const segmentAngle = (2 * Math.PI) / players.length;

	// Add small random offset within segment so it doesn't always land dead center
	// ±30% of segment width
	const randomOffset = (Math.random() - 0.5) * segmentAngle * 0.6;

	// Winner's segment center is at: winnerIndex * segmentAngle + segmentAngle/2
	const winnerSegmentCenter = winnerIndex * segmentAngle + segmentAngle / 2 + randomOffset;

	// The wheel needs to rotate so the winner segment aligns with the pointer at top
	// If winner is at angle θ from top, we need to rotate by (2π - θ) to bring it to top
	const targetAngle = 2 * Math.PI - winnerSegmentCenter;
	const totalRotation = EXTRA_ROTATIONS * 2 * Math.PI + targetAngle;

	// Animation state - normalize to prevent accumulated rotation from becoming very large
	const startRotation = wheelContainer.rotation % (2 * Math.PI);
	const startTime = performance.now();
	const container = wheelContainer; // Capture reference for closure

	const animate = (currentTime: number): void => {
		const elapsed = currentTime - startTime;
		const progress = Math.min(elapsed / SPIN_DURATION, 1);
		const easedProgress = easeOutCubic(progress);

		container.rotation = startRotation + totalRotation * easedProgress;

		if (progress < 1) {
			requestAnimationFrame(animate);
		} else {
			// Animation complete - wheel landed on winner
			isSpinning = false;
			console.log("Spin complete, winner:", winnerId);
			pulseWinnerGlow();
		}
	};

	requestAnimationFrame(animate);
};

// Segment colors for the wheel
const SEGMENT_COLORS = [
	0xe74c3c, // red
	0x3498db, // blue
	0x2ecc71, // green
	0x9b59b6, // purple
	0xf39c12, // orange
	0x1abc9c, // teal
	0xe91e63, // pink
	0x00bcd4, // cyan
];

const getSegmentColor = (index: number): number => {
	return SEGMENT_COLORS[index % SEGMENT_COLORS.length];
};

// Draw pointer (fixed at top, doesn't rotate)
const drawPointer = (): void => {
	if (!pixiApp) return;

	const pointer = new PIXI.Graphics();
	pointer.poly([200, 10, 190, 30, 210, 30]);
	pointer.fill({ color: 0xffd700 });
	pointer.stroke({ color: 0x000000, width: 2 });

	pixiApp.stage.addChild(pointer);
};

// Draw the wheel with player segments
const drawWheel = (players: readonly Player[]): void => {
	if (!wheelContainer || !pixiApp) return;

	// Clear previous wheel
	wheelContainer.removeChildren();

	if (players.length === 0) return;

	const radius = 180;
	const segmentAngle = (2 * Math.PI) / players.length;

	for (let i = 0; i < players.length; i++) {
		const player = players[i];
		const startAngle = i * segmentAngle - Math.PI / 2; // Start from top
		const endAngle = startAngle + segmentAngle;

		// Draw segment
		const segment = new PIXI.Graphics();
		segment.moveTo(0, 0);
		segment.arc(0, 0, radius, startAngle, endAngle);
		segment.lineTo(0, 0);
		segment.fill({ color: getSegmentColor(i) });
		segment.stroke({ color: 0xffffff, width: 2 });

		wheelContainer.addChild(segment);

		// Add player name text
		const midAngle = startAngle + segmentAngle / 2;
		const textRadius = radius * 0.65;
		const text = new PIXI.Text({
			text: player.name.slice(0, 10), // Truncate long names
			style: {
				fontFamily: "Arial",
				fontSize: Math.max(8, Math.min(16, 120 / players.length)),
				fill: 0xffffff,
				fontWeight: "bold",
			},
		});
		text.anchor.set(0.5);
		text.x = Math.cos(midAngle) * textRadius;
		text.y = Math.sin(midAngle) * textRadius;
		text.rotation = midAngle + Math.PI / 2; // Align text along radius

		wheelContainer.addChild(text);
	}

	// Add center circle
	const center = new PIXI.Graphics();
	center.circle(0, 0, 25);
	center.fill({ color: 0x1a1a2e });
	center.stroke({ color: 0xffd700, width: 3 });
	wheelContainer.addChild(center);
};

// Initialize Pixi.js application
const initPixi = async (): Promise<void> => {
	const container = document.getElementById("wheel-container");
	if (!container || pixiApp) return;

	pixiApp = new PIXI.Application();
	await pixiApp.init({
		width: 400,
		height: 400,
		backgroundAlpha: 0,
		antialias: true,
	});

	container.appendChild(pixiApp.canvas);

	// Add CRT filter to entire stage for retro effect
	const crtFilter = new CRTFilter({
		curvature: 1,
		lineWidth: 1,
		lineContrast: 0.2,
		verticalLine: false,
		noise: 0.1,
		noiseSize: 1,
		vignetting: 0.3,
		vignettingAlpha: 0.7,
		vignettingBlur: 0.5,
		time: 0,
	});
	pixiApp.stage.filters = [crtFilter];

	// Animate CRT filter time for subtle scanline movement
	pixiApp.ticker.add(() => {
		crtFilter.time += 0.5;
	});

	// Create wheel container centered
	wheelContainer = new PIXI.Container();
	wheelContainer.x = 200;
	wheelContainer.y = 200;
	pixiApp.stage.addChild(wheelContainer);

	// Add glow filter to wheel container
	wheelGlowFilter = new GlowFilter({
		distance: 15,
		outerStrength: 1.5,
		innerStrength: 0.5,
		color: 0x00ff88,
		quality: 0.3,
	});
	wheelContainer.filters = [wheelGlowFilter];

	// Draw pointer/arrow at top (fixed, doesn't rotate)
	drawPointer();
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

// Render results overlay
const renderResultOverlay = (): void => {
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

	// Find winner
	const winner = currentState.players.find((p) => p.id === currentState.winner);
	if (!winner) return;

	// Find players who guessed correctly
	const correctGuessers = currentState.players.filter((p) => p.bet === currentState.winner);

	// Check if current player is host
	const me = currentState.players.find((p) => p.id === myPlayerId);
	const isHost = me?.isHost ?? false;

	overlay.innerHTML = `
		<div class="result-content">
			<h1 class="result-title">Next Host</h1>
			<div class="winner-name">${escapeHtml(winner.name)}</div>

			${
				correctGuessers.length > 0
					? `
				<div class="correct-guessers">
					<h3>Correct Guesses:</h3>
					<ul>
						${correctGuessers.map((p) => `<li>${escapeHtml(p.name)}${p.id === myPlayerId ? " (You!)" : ""}</li>`).join("")}
					</ul>
				</div>
			`
					: '<p class="no-guessers">No one guessed correctly!</p>'
			}

			${
				isHost
					? `
				<button class="play-again-btn" id="play-again-btn">Play Again</button>
			`
					: '<p class="waiting-text">Waiting for host to start new round...</p>'
			}
		</div>
	`;

	// Add event listener for play again button
	const playAgainBtn = document.getElementById("play-again-btn");
	if (playAgainBtn) {
		playAgainBtn.onclick = () => {
			send({ type: "reset" });
		};
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

	// Initialize Pixi if needed
	if (!pixiApp && !isPixiInitializing) {
		isPixiInitializing = true;
		initPixi().then(() => {
			isPixiInitializing = false;
			if (currentState) drawWheel(currentState.players);
		});
	} else if (pixiApp) {
		drawWheel(currentState.players);
	}

	// Update phase indicator
	const phaseIndicator = document.getElementById("phase-indicator");
	if (phaseIndicator) {
		phaseIndicator.textContent = getPhaseText(currentState.phase);
	}

	// If phase is waiting, reset glow to normal
	if (currentState.phase === "waiting" && wheelGlowFilter && pixiApp) {
		if (glowTickerCallback) {
			pixiApp.ticker.remove(glowTickerCallback);
			glowTickerCallback = null;
		}
		wheelGlowFilter.outerStrength = 1.5;
	}

	renderPlayerList();
	renderHostControls();
	renderCountdown();
	renderResultOverlay();
};

// Initialize on load
const init = (): void => {
	initAudio();
	enableAudio();
	connect();
	setupJoinForm();
};

document.addEventListener("DOMContentLoaded", init);

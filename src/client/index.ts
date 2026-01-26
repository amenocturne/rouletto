import * as PIXI from "pixi.js";
import { CRTFilter, GlowFilter } from "pixi-filters";
import type { Candidate, ClientMessage, GameState, ServerMessage } from "../shared/types";

// State management
let currentState: GameState | null = null;
let mySpectatorId: string | null = null;
let isAdmin = false;
let ws: WebSocket | null = null;
let countdownInterval: number | null = null;

// Room state
let roomId: string | null = null;

// UI state
let shouldFocusCandidateInput = false;
let hasInitiallyFocusedCandidateInput = false;

// Pixi.js wheel state
let pixiApp: PIXI.Application | null = null;
let wheelContainer: PIXI.Container | null = null;
let isPixiInitializing = false;
let isSpinning = false;
let wheelGlowFilter: GlowFilter | null = null;
let glowTickerCallback: (() => void) | null = null;
let lastCandidatesJson: string = ""; // Cache to avoid redrawing wheel unnecessarily

// Audio state
let spinSound: HTMLAudioElement | null = null;
let revealSound: HTMLAudioElement | null = null;
let audioEnabled = false;

// Volume settings (0-1)
let musicVolume = 0.2; // Default 20%
let sfxVolume = 0.2; // Default 20%

// Volume settings management
const loadVolumeSettings = (): void => {
	const saved = localStorage.getItem("casinoWheelVolume");
	if (saved) {
		const settings = JSON.parse(saved);
		musicVolume = settings.music ?? 0.2;
		sfxVolume = settings.sfx ?? 0.2;
	}
	applyVolume();
};

const saveVolumeSettings = (): void => {
	localStorage.setItem(
		"casinoWheelVolume",
		JSON.stringify({
			music: musicVolume,
			sfx: sfxVolume,
		}),
	);
};

const applyVolume = (): void => {
	if (spinSound) spinSound.volume = sfxVolume;
	if (revealSound) revealSound.volume = sfxVolume;
	// If we add background music later, apply musicVolume to it
};

// Audio functions
const initAudio = (): void => {
	// Create audio elements
	spinSound = new Audio("/sounds/spin.mp3");
	spinSound.loop = true;
	spinSound.volume = sfxVolume;

	revealSound = new Audio("/sounds/reveal.mp3");
	revealSound.volume = sfxVolume;

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
const connect = (roomIdParam?: string): void => {
	const wsUrl = roomIdParam
		? `ws://${window.location.host}?room=${roomIdParam}`
		: `ws://${window.location.host}`;

	ws = new WebSocket(wsUrl);

	ws.onopen = () => {
		console.log("Connected");
		// Re-enable buttons if they were disabled
		const createBtn = document.getElementById("create-room-btn") as HTMLButtonElement | null;
		const submitBtn = document.querySelector("#join-form button") as HTMLButtonElement | null;
		if (createBtn) createBtn.disabled = false;
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
		case "roomCreated":
			roomId = message.roomId;
			// Update URL without reload
			window.history.pushState({}, "", `/room/${roomId}`);
			// Show join screen to enter name
			showJoinScreen();
			break;
		case "roomError":
			showRoomError(message.message);
			break;
		case "state":
			mySpectatorId = message.spectatorId;
			isAdmin = message.isAdmin;
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

// Show room error screen
const showRoomError = (_errorMessage: string): void => {
	const app = document.getElementById("app");
	if (!app) return;

	app.innerHTML = `
		<div id="error-screen" class="screen">
			<h1>Room Not Found</h1>
			<a href="/" class="host-btn">Go to Home</a>
		</div>
	`;
};

// Show landing page
const showLandingPage = (): void => {
	const app = document.getElementById("app");
	if (!app) return;

	app.innerHTML = `
		<div id="landing-screen" class="screen">
			<h1>Casino Wheel</h1>
			<button id="create-room-btn" class="host-btn">Create New Room</button>
		</div>
	`;

	const createBtn = document.getElementById("create-room-btn");
	if (createBtn) {
		createBtn.onclick = () => {
			(createBtn as HTMLButtonElement).disabled = true;
			connect();
			// Wait for connection, then send createRoom
			const checkConnection = (): void => {
				if (ws && ws.readyState === WebSocket.OPEN) {
					send({ type: "createRoom" });
				} else if (ws && ws.readyState === WebSocket.CONNECTING) {
					setTimeout(checkConnection, 50);
				}
			};
			checkConnection();
		};
	}
};

// Show join screen (for entering name)
const showJoinScreen = (): void => {
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
			<h1>Casino Wheel</h1>
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
					<div id="wheel-container"></div>
					<div id="action-controls"></div>
					<div id="countdown"></div>
				</div>
				<div class="game-right">
					<div class="panel-header">
						<h3>Candidates</h3>
						<span id="admin-badge" class="admin-badge hidden">Admin</span>
					</div>
					<div id="admin-controls"></div>
					<div id="candidates-list"></div>
					<div id="spectators-section">
						<h3>Watching</h3>
						<div id="spectators-list"></div>
					</div>
				</div>
			</div>
			<div id="result-overlay" class="hidden"></div>
		</div>
	`;

	setupJoinForm();

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
};

// Join form handling
const setupJoinForm = (): void => {
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
			send({ type: "join", name, joinAsPlayer });
		}
	});
};

// Helper to prevent XSS
const escapeHtml = (text: string): string => {
	const div = document.createElement("div");
	div.textContent = text;
	return div.innerHTML;
};

// Add mouse tracking for 3D tilt effect (Balatro-style)
const addTiltEffect = (element: HTMLElement): void => {
	element.addEventListener("mousemove", (e) => {
		const rect = element.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		const centerX = rect.width / 2;
		const centerY = rect.height / 2;
		const rotateX = (y - centerY) / 20;
		const rotateY = (centerX - x) / 20;
		element.style.transform = `perspective(500px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
	});

	element.addEventListener("mouseleave", () => {
		element.style.transform = "";
	});
};

// Render admin controls (add candidates input)
const renderAdminControls = (): void => {
	const container = document.getElementById("admin-controls");
	if (!container || !currentState) return;

	container.innerHTML = "";

	if (!isAdmin || currentState.phase !== "waiting") {
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
			send({ type: "addCandidates", names: input.value.trim() });
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

// Chip colors for betting display
const CHIP_COLORS = ["", "blue", "green", "purple", "orange"];

// Get a chip color based on spectator index
const getChipColor = (spectatorIndex: number): string => {
	return CHIP_COLORS[spectatorIndex % CHIP_COLORS.length];
};

// Render betting chips for a candidate
const renderBettingChips = (candidateId: string): string => {
	if (!currentState) return "";

	// Find all spectators who bet on this candidate
	const bettors = currentState.spectators.filter((s) => s.bet === candidateId);
	if (bettors.length === 0) return "";

	const chips = bettors
		.map((bettor) => {
			const spectatorIndex = currentState?.spectators.findIndex((s) => s.id === bettor.id) ?? 0;
			const colorClass = getChipColor(spectatorIndex);
			const initial = bettor.name.charAt(0).toUpperCase();
			const isMe = bettor.id === mySpectatorId;
			return `<div class="chip ${colorClass}" title="${escapeHtml(bettor.name)}${isMe ? " (You)" : ""}">${initial}</div>`;
		})
		.join("");

	return `<div class="chips-container">${chips}</div>`;
};

// Render candidates list (wheel entries)
const renderCandidatesList = (): void => {
	const container = document.getElementById("candidates-list");
	if (!container || !currentState) return;

	container.innerHTML = "";

	if (currentState.candidates.length === 0) {
		container.innerHTML =
			'<p class="no-candidates">No candidates yet. Admin can add names above.</p>';
		return;
	}

	const me = currentState.spectators.find((s) => s.id === mySpectatorId);
	const canBet = currentState.phase === "betting";

	for (const candidate of currentState.candidates) {
		const div = document.createElement("div");
		div.className = "candidate-card";

		if (me?.bet === candidate.id) div.classList.add("my-bet");
		if (canBet) div.classList.add("can-bet");

		// Get betting chips HTML
		const chipsHtml = renderBettingChips(candidate.id);

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
				send({ type: "placeBet", targetId: candidate.id });
			});
		}

		// Remove candidate button (admin only during waiting)
		const removeBtn = div.querySelector(".remove-candidate-btn");
		if (removeBtn) {
			removeBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				send({ type: "removeCandidate", candidateId: candidate.id });
			});
		}

		// Add interactive tilt effect (Balatro-style)
		addTiltEffect(div);

		container.appendChild(div);
	}
};

// Render spectators list (connected users who are not candidates)
const renderSpectatorsList = (): void => {
	const container = document.getElementById("spectators-list");
	if (!container || !currentState) return;

	container.innerHTML = "";

	// Get candidate names to filter out spectators who are also candidates
	const candidateNames = new Set(currentState.candidates.map((c) => c.name.toLowerCase()));

	// Filter spectators who are not candidates
	const pureSpectators = currentState.spectators.filter(
		(s) => !candidateNames.has(s.name.toLowerCase()),
	);

	if (pureSpectators.length === 0) {
		container.innerHTML = '<p class="no-spectators">No spectators yet.</p>';
		return;
	}

	for (const spectator of pureSpectators) {
		const div = document.createElement("div");
		div.className = "spectator-card";

		if (spectator.id === mySpectatorId) div.classList.add("is-me");
		if (spectator.bet !== null) div.classList.add("has-bet");

		// Find candidate name if they have a bet
		const betCandidate = spectator.bet
			? currentState.candidates.find((c) => c.id === spectator.bet)
			: null;

		div.innerHTML = `
			<span class="spectator-name">${escapeHtml(spectator.name)}</span>
			${spectator.id === mySpectatorId ? '<span class="you-badge">You</span>' : ""}
			${spectator.bet !== null ? `<span class="bet-indicator" title="Bet on ${betCandidate ? escapeHtml(betCandidate.name) : "someone"}">*</span>` : ""}
		`;

		container.appendChild(div);
	}
};

// Render action controls (start betting, spin lever)
const renderActionControls = (): void => {
	const container = document.getElementById("action-controls");
	if (!container || !currentState) return;

	container.innerHTML = "";

	if (!isAdmin) return;

	if (currentState.phase === "waiting" && currentState.candidates.length > 0) {
		const btn = document.createElement("button");
		btn.className = "host-btn";
		btn.textContent = "Start Betting";
		btn.addEventListener("click", () => send({ type: "startBetting" }));
		container.appendChild(btn);
	}

	if (currentState.phase === "betting") {
		// Create slot machine lever instead of button
		const lever = document.createElement("div");
		lever.className = "lever-container";
		lever.innerHTML = `
			<div class="lever-slot">
				<div class="lever-track"></div>
				<div class="lever-handle" id="lever-handle">
					<div class="lever-ball"></div>
					<div class="lever-stick"></div>
				</div>
			</div>
			<div class="lever-label">Pull to Spin</div>
		`;

		lever.onclick = () => {
			const handle = document.getElementById("lever-handle");
			if (!handle || handle.classList.contains("pulled")) return;

			// Pull down
			handle.classList.add("pulled");

			// Release and spring back after delay
			setTimeout(() => {
				handle.classList.remove("pulled");
				handle.classList.add("released");

				// Send spin message
				send({ type: "spin" });

				// Clean up animation class
				setTimeout(() => {
					handle.classList.remove("released");
				}, 400);
			}, 300);
		};

		container.appendChild(lever);
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

	const candidates = currentState.candidates;
	const winnerIndex = candidates.findIndex((c) => c.id === winnerId);
	if (winnerIndex === -1) {
		isSpinning = false;
		return;
	}

	// Calculate target angle to land on winner's segment
	// Segments start at -PI/2 (top), pointer is at top
	const segmentAngle = (2 * Math.PI) / candidates.length;

	// Add small random offset within segment so it doesn't always land dead center
	// +/-30% of segment width
	const randomOffset = (Math.random() - 0.5) * segmentAngle * 0.6;

	// Winner's segment center is at: winnerIndex * segmentAngle + segmentAngle/2
	const winnerSegmentCenter = winnerIndex * segmentAngle + segmentAngle / 2 + randomOffset;

	// The wheel needs to rotate so the winner segment aligns with the pointer at top
	// If winner is at angle theta from top, we need to rotate by (2pi - theta) to bring it to top
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

// Segment colors for the wheel - vibrant casino-style colors
const SEGMENT_COLORS = [
	0xdc143c, // crimson red
	0x1e90ff, // dodger blue
	0x32cd32, // lime green
	0x9400d3, // dark violet
	0xff8c00, // dark orange
	0x00ced1, // dark turquoise
	0xff1493, // deep pink
	0xffd700, // gold
];

const getSegmentColor = (index: number): number => {
	return SEGMENT_COLORS[index % SEGMENT_COLORS.length];
};

// Draw pointer (fixed at top, doesn't rotate) - leather flapper style
const drawPointer = (): void => {
	if (!pixiApp) return;

	const centerX = 300;

	// Mounting bracket (brass)
	const bracket = new PIXI.Graphics();
	bracket.rect(centerX - 14, 0, 28, 24);
	bracket.fill({ color: 0xdaa520 }); // goldenrod (brass)
	bracket.stroke({ color: 0xffd700, width: 2 });
	pixiApp.stage.addChild(bracket);

	// Main pointer body (leather flapper triangle)
	const pointer = new PIXI.Graphics();
	pointer.moveTo(centerX, 20);
	pointer.lineTo(centerX - 20, 60);
	pointer.lineTo(centerX + 20, 60);
	pointer.closePath();
	pointer.fill({ color: 0x8b0000 }); // dark red (leather)
	pointer.stroke({ color: 0xffd700, width: 2 }); // gold outline
	pixiApp.stage.addChild(pointer);
};

// Draw the wheel with candidate segments - casino style
const drawWheel = (candidates: readonly Candidate[]): void => {
	if (!wheelContainer || !pixiApp) return;

	// Clear previous wheel
	wheelContainer.removeChildren();

	if (candidates.length === 0) return;

	const radius = 270;
	const segmentAngle = (2 * Math.PI) / candidates.length;

	// Draw outer wooden rim (dark brown with texture effect)
	const outerRim = new PIXI.Graphics();
	outerRim.circle(0, 0, radius + 20);
	outerRim.fill({ color: 0x4a3728 }); // dark wood brown
	outerRim.circle(0, 0, radius + 15);
	outerRim.stroke({ color: 0xffd700, width: 3 }); // gold inner edge
	wheelContainer.addChild(outerRim);

	// Draw segments
	for (let i = 0; i < candidates.length; i++) {
		const candidate = candidates[i];
		const startAngle = i * segmentAngle - Math.PI / 2; // Start from top
		const endAngle = startAngle + segmentAngle;

		// Segment fill
		const segment = new PIXI.Graphics();
		segment.moveTo(0, 0);
		segment.arc(0, 0, radius, startAngle, endAngle);
		segment.lineTo(0, 0);
		segment.fill({ color: getSegmentColor(i) });

		// Segment border
		segment.moveTo(0, 0);
		segment.arc(0, 0, radius, startAngle, endAngle);
		segment.lineTo(0, 0);
		segment.stroke({ color: 0xffffff, width: 2 });
		wheelContainer.addChild(segment);

		// Add peg/divider at segment edge (the little bumps that make clicking sounds)
		const pegAngle = startAngle;
		const pegX = Math.cos(pegAngle) * (radius - 5);
		const pegY = Math.sin(pegAngle) * (radius - 5);
		const peg = new PIXI.Graphics();
		peg.circle(pegX, pegY, 4);
		peg.fill({ color: 0xffd700 }); // gold peg
		peg.stroke({ color: 0x000000, width: 1 });
		wheelContainer.addChild(peg);

		// Player name text
		const midAngle = startAngle + segmentAngle / 2;
		const textRadius = radius * 0.6;
		const text = new PIXI.Text({
			text: candidate.name.slice(0, 12), // Truncate long names
			style: {
				fontFamily: "Arial Black, Arial",
				fontSize: Math.max(10, Math.min(18, 140 / candidates.length)),
				fill: 0xffffff,
				fontWeight: "bold",
				stroke: { color: 0x000000, width: 3 },
			},
		});
		text.anchor.set(0.5);
		text.x = Math.cos(midAngle) * textRadius;
		text.y = Math.sin(midAngle) * textRadius;
		// Rotate text to be readable (flip if on bottom half of wheel)
		let textRotation = midAngle + Math.PI / 2;
		// Normalize angle to check if text would be upside down
		// Text is upside down when midAngle points to bottom half (between π/2 and 3π/2)
		const normalizedAngle = ((midAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
		if (normalizedAngle >= Math.PI / 2 && normalizedAngle <= (3 * Math.PI) / 2) {
			textRotation += Math.PI; // Flip text to be readable
		}
		text.rotation = textRotation;
		wheelContainer.addChild(text);
	}

	// Ornate center hub
	// Outer ring (wood)
	const hubOuter = new PIXI.Graphics();
	hubOuter.circle(0, 0, 35);
	hubOuter.fill({ color: 0x4a3728 }); // wood
	hubOuter.stroke({ color: 0xffd700, width: 3 });
	wheelContainer.addChild(hubOuter);

	// Inner brass cone effect
	const hubInner = new PIXI.Graphics();
	hubInner.circle(0, 0, 25);
	hubInner.fill({ color: 0xdaa520 }); // goldenrod
	hubInner.stroke({ color: 0xffd700, width: 2 });
	wheelContainer.addChild(hubInner);

	// Center jewel (ruby red)
	const centerJewel = new PIXI.Graphics();
	centerJewel.circle(0, 0, 10);
	centerJewel.fill({ color: 0xff0000 }); // ruby red
	centerJewel.stroke({ color: 0xffd700, width: 2 });
	wheelContainer.addChild(centerJewel);
};

// Initialize Pixi.js application
const initPixi = async (): Promise<void> => {
	const container = document.getElementById("wheel-container");
	if (!container || pixiApp) return;

	pixiApp = new PIXI.Application();
	await pixiApp.init({
		width: 600,
		height: 600,
		backgroundAlpha: 0,
		antialias: true,
	});

	container.appendChild(pixiApp.canvas);

	// CRT filter disabled - using CSS scanlines for whole page instead
	// const crtFilter = new CRTFilter({
	// 	curvature: 1.5,
	// 	lineWidth: 0.5,
	// 	lineContrast: 0.15,
	// 	verticalLine: false,
	// 	noise: 0.08,
	// 	noiseSize: 1.2,
	// 	vignetting: 0.25,
	// 	vignettingAlpha: 0.6,
	// 	vignettingBlur: 0.4,
	// 	time: 0,
	// });
	// pixiApp.stage.filters = [crtFilter];

	// Create wheel container centered
	wheelContainer = new PIXI.Container();
	wheelContainer.x = 300;
	wheelContainer.y = 300;
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

// Render results overlay with flying card animation
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

	const hasJoined = currentState.spectators.some((s) => s.id === mySpectatorId);
	joinScreen.classList.toggle("hidden", hasJoined);
	gameScreen.classList.toggle("hidden", !hasJoined);

	if (!hasJoined) return;

	// Initialize Pixi if needed
	if (!pixiApp && !isPixiInitializing) {
		isPixiInitializing = true;
		initPixi().then(() => {
			isPixiInitializing = false;
			if (currentState) {
				lastCandidatesJson = JSON.stringify(currentState.candidates);
				drawWheel(currentState.candidates);
			}
		});
	} else if (pixiApp) {
		// Only redraw wheel if candidates changed
		const candidatesJson = JSON.stringify(currentState.candidates);
		if (candidatesJson !== lastCandidatesJson) {
			lastCandidatesJson = candidatesJson;
			drawWheel(currentState.candidates);
		}
	}

	// Show/hide admin badge
	const adminBadge = document.getElementById("admin-badge");
	if (adminBadge) {
		adminBadge.classList.toggle("hidden", !isAdmin);
	}

	// If phase is waiting, reset glow to normal
	if (currentState.phase === "waiting" && wheelGlowFilter && pixiApp) {
		if (glowTickerCallback) {
			pixiApp.ticker.remove(glowTickerCallback);
			glowTickerCallback = null;
		}
		wheelGlowFilter.outerStrength = 1.5;
	}

	renderAdminControls();
	renderCandidatesList();
	renderSpectatorsList();
	renderActionControls();
	renderCountdown();
	renderResultOverlay();
};

// Render settings panel for volume controls
const renderSettingsPanel = (): void => {
	// Check if already exists
	if (document.getElementById("settings-panel")) return;

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
				<input type="range" id="music-volume" min="0" max="100" value="${musicVolume * 100}">
				<span id="music-volume-value">${Math.round(musicVolume * 100)}%</span>
			</div>
			<div class="volume-control">
				<label>Effects</label>
				<input type="range" id="sfx-volume" min="0" max="100" value="${sfxVolume * 100}">
				<span id="sfx-volume-value">${Math.round(sfxVolume * 100)}%</span>
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
			musicVolume = Number.parseInt(musicSlider.value, 10) / 100;
			const valueDisplay = document.getElementById("music-volume-value");
			if (valueDisplay) valueDisplay.textContent = `${musicSlider.value}%`;
			applyVolume();
			saveVolumeSettings();
		};
	}

	// SFX volume slider
	const sfxSlider = document.getElementById("sfx-volume") as HTMLInputElement;
	if (sfxSlider) {
		sfxSlider.oninput = () => {
			sfxVolume = Number.parseInt(sfxSlider.value, 10) / 100;
			const valueDisplay = document.getElementById("sfx-volume-value");
			if (valueDisplay) valueDisplay.textContent = `${sfxSlider.value}%`;
			applyVolume();
			saveVolumeSettings();
		};
	}
};

// Create CRT overlay element
const createCRTOverlay = (): void => {
	const crt = document.createElement("div");
	crt.className = "crt-overlay";
	document.body.appendChild(crt);
};

// Initialize on load
const init = (): void => {
	loadVolumeSettings();
	initAudio();
	enableAudio();
	renderSettingsPanel();
	createCRTOverlay();

	const path = window.location.pathname;
	const roomMatch = path.match(/^\/room\/([a-z0-9]+)$/i);

	if (roomMatch) {
		// We're in a room - connect and show join screen
		roomId = roomMatch[1].toLowerCase();
		connect(roomId);
		showJoinScreen();
	} else {
		// Landing page - show create room button
		showLandingPage();
	}
};

document.addEventListener("DOMContentLoaded", init);

import { resolve } from "node:path";
import type { ServerWebSocket } from "bun";
import type {
	ClientMessage,
	ErrorMessage,
	JoinMessage,
	PlaceBetMessage,
	ServerMessage,
	SpinResultMessage,
	StateMessage,
} from "../shared/types";
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

// WebSocket data type - stores player ID for each connection
type WebSocketData = {
	readonly playerId: string;
};

// Store active WebSocket connections: playerId -> WebSocket
const connections = new Map<string, ServerWebSocket<WebSocketData>>();

// Game state - single mutable reference at module level
let gameState = createInitialState();

// Store active timer for cleanup
let spinTimer: ReturnType<typeof setTimeout> | null = null;

// Constants
const BETTING_DURATION_MS = 60000; // 60 seconds
const SPIN_DURATION_MS = 5000; // 5 seconds

// Parse and validate client messages
const parseClientMessage = (raw: string): ClientMessage | null => {
	try {
		const msg = JSON.parse(raw);
		// Validate message structure
		if (typeof msg !== "object" || msg === null || !msg.type) return null;
		// Validate each message type
		switch (msg.type) {
			case "join":
				if (typeof msg.name !== "string") return null;
				return msg as JoinMessage;
			case "placeBet":
				if (typeof msg.targetId !== "string") return null;
				return msg as PlaceBetMessage;
			case "startBetting":
				return msg as ClientMessage;
			case "spin":
				return msg as ClientMessage;
			case "reset":
				return msg as ClientMessage;
			default:
				return null;
		}
	} catch {
		return null;
	}
};

// Broadcast state to all connected clients
const broadcastState = (): void => {
	for (const [playerId, ws] of connections.entries()) {
		const msg: StateMessage = { type: "state", state: gameState, playerId };
		try {
			ws.send(JSON.stringify(msg));
		} catch {
			// Connection may have closed
		}
	}
};

// Send error message to a specific client
const sendError = (
	ws: ServerWebSocket<WebSocketData>,
	message: string,
): void => {
	const errorMsg: ErrorMessage = { type: "error", message };
	try {
		ws.send(JSON.stringify(errorMsg));
	} catch {
		// Connection may have closed
	}
};

// Clear all active timers
const clearTimers = (): void => {
	if (spinTimer !== null) {
		clearTimeout(spinTimer);
		spinTimer = null;
	}
};

// Check if a path is safe (prevents directory traversal attacks)
const isPathSafe = (requestedPath: string, baseDir: string): boolean => {
	const resolvedBase = resolve(baseDir);
	const resolvedPath = resolve(requestedPath);
	return resolvedPath.startsWith(resolvedBase);
};

// Broadcast a message to all connected clients
const broadcast = (message: ServerMessage): void => {
	const data = JSON.stringify(message);
	for (const ws of connections.values()) {
		try {
			ws.send(data);
		} catch {
			// Connection may have closed
		}
	}
};

// Handle client messages
const handleMessage = (
	ws: ServerWebSocket<WebSocketData>,
	message: ClientMessage,
): void => {
	const playerId = ws.data.playerId;

	// For non-join messages, verify player has joined
	if (message.type !== "join") {
		const playerExists = gameState.players.some((p) => p.id === playerId);
		if (!playerExists) {
			sendError(ws, "You must join the game first");
			return;
		}
	}

	switch (message.type) {
		case "join": {
			// Create player and add to state
			const player = {
				id: playerId,
				name: message.name,
				bet: null,
				isHost: false, // addPlayer will set this to true if first player
			};
			gameState = addPlayer(gameState, player);
			broadcastState();
			break;
		}

		case "placeBet": {
			if (!canPlaceBet(gameState, playerId)) {
				sendError(ws, "Cannot place bet at this time");
				return;
			}
			gameState = placeBet(gameState, playerId, message.targetId);
			broadcastState();
			break;
		}

		case "startBetting": {
			if (!canStartBetting(gameState, playerId)) {
				sendError(ws, "Only the host can start betting during waiting phase");
				return;
			}
			const bettingEndsAt = Date.now() + BETTING_DURATION_MS;
			gameState = startBetting(gameState, bettingEndsAt);
			broadcastState();
			break;
		}

		case "spin": {
			if (!canSpin(gameState, playerId)) {
				sendError(ws, "Only the host can spin during betting phase");
				return;
			}

			// Transition to spinning phase
			gameState = startSpinning(gameState);

			// Select random winner
			const winnerId = selectRandomWinner(gameState.players, Math.random());
			if (winnerId === null) {
				sendError(ws, "Cannot spin with no players");
				return;
			}

			// Broadcast spin result (triggers wheel animation on clients)
			const spinResultMsg: SpinResultMessage = {
				type: "spinResult",
				winnerId,
			};
			broadcast(spinResultMsg);
			broadcastState();

			// After spin animation completes, set result and broadcast final state
			spinTimer = setTimeout(() => {
				spinTimer = null;
				// Check if winner still exists before setting result
				const winnerExists = gameState.players.some((p) => p.id === winnerId);
				if (winnerExists) {
					gameState = setResult(gameState, winnerId);
				} else {
					// Winner disconnected - reset to waiting phase
					gameState = resetGame(gameState);
				}
				broadcastState();
			}, SPIN_DURATION_MS);
			break;
		}

		case "reset": {
			if (!canReset(gameState, playerId)) {
				sendError(ws, "Only the host can reset during result phase");
				return;
			}

			// Clear any active timers
			clearTimers();

			gameState = resetGame(gameState);
			broadcastState();
			break;
		}
	}
};

// Get content type based on file extension
const getContentType = (path: string): string => {
	if (path.endsWith(".html")) return "text/html";
	if (path.endsWith(".js")) return "application/javascript";
	if (path.endsWith(".css")) return "text/css";
	if (path.endsWith(".json")) return "application/json";
	if (path.endsWith(".mp3")) return "audio/mpeg";
	if (path.endsWith(".wav")) return "audio/wav";
	if (path.endsWith(".ogg")) return "audio/ogg";
	if (path.endsWith(".png")) return "image/png";
	if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
	if (path.endsWith(".svg")) return "image/svg+xml";
	return "application/octet-stream";
};

// Serve static file helper with path safety check
const serveFile = async (
	filePath: string,
	baseDir: string,
): Promise<Response> => {
	// Validate path to prevent directory traversal
	if (!isPathSafe(filePath, baseDir)) {
		return new Response("Forbidden", { status: 403 });
	}

	const file = Bun.file(filePath);
	const exists = await file.exists();

	if (!exists) {
		return new Response("Not Found", { status: 404 });
	}

	return new Response(file, {
		headers: { "Content-Type": getContentType(filePath) },
	});
};

// Start the server
const server = Bun.serve<WebSocketData>({
	port: 3000,

	fetch(req, server) {
		const url = new URL(req.url);
		const pathname = url.pathname;

		// Try to upgrade to WebSocket for /ws path or any connection requesting upgrade
		if (req.headers.get("upgrade") === "websocket") {
			const playerId = crypto.randomUUID();
			const success = server.upgrade(req, {
				data: { playerId },
			});
			if (success) {
				return undefined;
			}
			return new Response("WebSocket upgrade failed", { status: 400 });
		}

		// Serve static files
		if (pathname === "/" || pathname === "/index.html") {
			return serveFile("src/client/index.html", "src/client");
		}

		// Serve bundled JS from dist/
		if (pathname.startsWith("/dist/")) {
			const filePath = pathname.slice(1); // Remove leading /
			return serveFile(filePath, "dist");
		}

		// Serve sounds from public/sounds/
		if (pathname.startsWith("/sounds/")) {
			const filePath = `public${pathname}`;
			return serveFile(filePath, "public/sounds");
		}

		// Serve other public files
		if (pathname.startsWith("/public/")) {
			const filePath = pathname.slice(1); // Remove leading /
			return serveFile(filePath, "public");
		}

		// 404 for everything else
		return new Response("Not Found", { status: 404 });
	},

	websocket: {
		open(ws) {
			const playerId = ws.data.playerId;
			connections.set(playerId, ws);
			console.log(`Client connected: ${playerId}`);
		},

		message(ws, message) {
			const raw = typeof message === "string" ? message : message.toString();
			const parsed = parseClientMessage(raw);
			if (parsed === null) {
				sendError(ws, "Invalid message format");
				return;
			}
			handleMessage(ws, parsed);
		},

		close(ws) {
			const playerId = ws.data.playerId;
			connections.delete(playerId);
			console.log(`Client disconnected: ${playerId}`);

			gameState = removePlayer(gameState, playerId);

			// If no players left, clear timers and reset
			if (gameState.players.length === 0) {
				clearTimers();
				gameState = createInitialState();
			}

			broadcastState();
		},
	},
});

console.log(`Server running on http://localhost:${server.port}`);

// Export for potential testing
export { broadcast, connections };

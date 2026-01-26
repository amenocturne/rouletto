import { resolve } from "node:path";
import type { ServerWebSocket } from "bun";
import type {
	ClientMessage,
	CreateRoomMessage,
	ErrorMessage,
	JoinMessage,
	PlaceBetMessage,
	PlaySoundMessage,
	Room,
	RoomCreatedMessage,
	RoomErrorMessage,
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

// WebSocket data type - stores player ID and room ID for each connection
type WebSocketData = {
	readonly playerId: string;
	readonly roomId: string | null;
};

// Store active WebSocket connections: playerId -> WebSocket
const connections = new Map<string, ServerWebSocket<WebSocketData>>();

// Store rooms: roomId -> Room
const rooms = new Map<string, Room>();

// Store active timers for each room: roomId -> timer
const roomTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Constants
const BETTING_DURATION_MS = 60000; // 60 seconds
const SPIN_DURATION_MS = 5000; // 5 seconds

// Generate short room ID with collision check
const generateRoomId = (): string => {
	let id: string;
	do {
		id = crypto.randomUUID().slice(0, 6).toLowerCase();
	} while (rooms.has(id));
	return id;
};

// Parse and validate client messages
const parseClientMessage = (raw: string): ClientMessage | null => {
	try {
		const msg = JSON.parse(raw);
		// Validate message structure
		if (typeof msg !== "object" || msg === null || !msg.type) return null;
		// Validate each message type
		switch (msg.type) {
			case "createRoom":
				return msg as CreateRoomMessage;
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

// Get all connections in a room
const getConnectionsInRoom = (roomId: string): ServerWebSocket<WebSocketData>[] => {
	const result: ServerWebSocket<WebSocketData>[] = [];
	for (const ws of connections.values()) {
		if (ws.data.roomId === roomId) {
			result.push(ws);
		}
	}
	return result;
};

// Broadcast state to all connected clients in a room
const broadcastState = (roomId: string): void => {
	const room = rooms.get(roomId);
	if (!room) return;

	for (const ws of getConnectionsInRoom(roomId)) {
		const msg: StateMessage = {
			type: "state",
			state: room.gameState,
			playerId: ws.data.playerId,
			isAdmin: ws.data.playerId === room.adminId,
		};
		try {
			ws.send(JSON.stringify(msg));
		} catch {
			// Connection may have closed
		}
	}
};

// Send error message to a specific client
const sendError = (ws: ServerWebSocket<WebSocketData>, message: string): void => {
	const errorMsg: ErrorMessage = { type: "error", message };
	try {
		ws.send(JSON.stringify(errorMsg));
	} catch {
		// Connection may have closed
	}
};

// Send room error message to a specific client
const sendRoomError = (ws: ServerWebSocket<WebSocketData>, message: string): void => {
	const errorMsg: RoomErrorMessage = { type: "roomError", message };
	try {
		ws.send(JSON.stringify(errorMsg));
	} catch {
		// Connection may have closed
	}
};

// Clear timer for a room
const clearRoomTimer = (roomId: string): void => {
	const timer = roomTimers.get(roomId);
	if (timer !== undefined) {
		clearTimeout(timer);
		roomTimers.delete(roomId);
	}
};

// Check if a path is safe (prevents directory traversal attacks)
const isPathSafe = (requestedPath: string, baseDir: string): boolean => {
	const resolvedBase = resolve(baseDir);
	const resolvedPath = resolve(requestedPath);
	return resolvedPath.startsWith(resolvedBase);
};

// Broadcast a message to all connected clients in a room
const broadcastToRoom = (roomId: string, message: ServerMessage): void => {
	const data = JSON.stringify(message);
	for (const ws of getConnectionsInRoom(roomId)) {
		try {
			ws.send(data);
		} catch {
			// Connection may have closed
		}
	}
};

// Update room state
const updateRoomState = (roomId: string, updater: (room: Room) => Room): void => {
	const room = rooms.get(roomId);
	if (!room) return;
	rooms.set(roomId, updater(room));
};

// Handle client messages
const handleMessage = (ws: ServerWebSocket<WebSocketData>, message: ClientMessage): void => {
	const playerId = ws.data.playerId;
	const roomId = ws.data.roomId;

	// Handle createRoom - doesn't require being in a room
	if (message.type === "createRoom") {
		const newRoomId = generateRoomId();
		const newRoom: Room = {
			id: newRoomId,
			adminId: playerId,
			gameState: createInitialState(),
		};
		rooms.set(newRoomId, newRoom);

		// Update WebSocket data with room ID
		(ws.data as { playerId: string; roomId: string | null }).roomId = newRoomId;

		const response: RoomCreatedMessage = { type: "roomCreated", roomId: newRoomId };
		ws.send(JSON.stringify(response));
		console.log(`Room created: ${newRoomId} by player ${playerId}`);
		return;
	}

	// All other messages require being in a room
	if (!roomId) {
		sendError(ws, "You must be in a room first");
		return;
	}

	const room = rooms.get(roomId);
	if (!room) {
		sendRoomError(ws, "Room no longer exists");
		return;
	}

	// For non-join messages, verify player has joined
	if (message.type !== "join") {
		const playerExists = room.gameState.players.some((p) => p.id === playerId);
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
			updateRoomState(roomId, (r) => ({
				...r,
				gameState: addPlayer(r.gameState, player),
			}));
			broadcastState(roomId);
			break;
		}

		case "placeBet": {
			if (!canPlaceBet(room.gameState, playerId)) {
				sendError(ws, "Cannot place bet at this time");
				return;
			}
			updateRoomState(roomId, (r) => ({
				...r,
				gameState: placeBet(r.gameState, playerId, message.targetId),
			}));
			broadcastState(roomId);
			break;
		}

		case "startBetting": {
			if (!canStartBetting(room.gameState, playerId)) {
				sendError(ws, "Only the host can start betting during waiting phase");
				return;
			}
			const bettingEndsAt = Date.now() + BETTING_DURATION_MS;
			updateRoomState(roomId, (r) => ({
				...r,
				gameState: startBetting(r.gameState, bettingEndsAt),
			}));
			broadcastState(roomId);
			break;
		}

		case "spin": {
			if (!canSpin(room.gameState, playerId)) {
				sendError(ws, "Only the host can spin during betting phase");
				return;
			}

			// Transition to spinning phase
			updateRoomState(roomId, (r) => ({
				...r,
				gameState: startSpinning(r.gameState),
			}));

			// Get updated room
			const updatedRoom = rooms.get(roomId);
			if (!updatedRoom) return;

			// Select random winner
			const winnerId = selectRandomWinner(updatedRoom.gameState.players, Math.random());
			if (winnerId === null) {
				sendError(ws, "Cannot spin with no players");
				return;
			}

			// Broadcast spin result (triggers wheel animation on clients)
			const spinResultMsg: SpinResultMessage = {
				type: "spinResult",
				winnerId,
			};
			broadcastToRoom(roomId, spinResultMsg);
			broadcastState(roomId);

			// Broadcast spin sound
			const spinSoundMsg: PlaySoundMessage = { type: "playSound", sound: "spin" };
			broadcastToRoom(roomId, spinSoundMsg);

			// After spin animation completes, set result and broadcast final state
			const timer = setTimeout(() => {
				roomTimers.delete(roomId);

				// Broadcast reveal sound
				const revealSoundMsg: PlaySoundMessage = { type: "playSound", sound: "reveal" };
				broadcastToRoom(roomId, revealSoundMsg);

				// Get current room state
				const currentRoom = rooms.get(roomId);
				if (!currentRoom) return;

				// Check if winner still exists before setting result
				const winnerExists = currentRoom.gameState.players.some((p) => p.id === winnerId);
				if (winnerExists) {
					updateRoomState(roomId, (r) => ({
						...r,
						gameState: setResult(r.gameState, winnerId),
					}));
				} else {
					// Winner disconnected - reset to waiting phase
					updateRoomState(roomId, (r) => ({
						...r,
						gameState: resetGame(r.gameState),
					}));
				}
				broadcastState(roomId);
			}, SPIN_DURATION_MS);
			roomTimers.set(roomId, timer);
			break;
		}

		case "reset": {
			if (!canReset(room.gameState, playerId)) {
				sendError(ws, "Only the host can reset during result phase");
				return;
			}

			// Clear any active timers
			clearRoomTimer(roomId);

			updateRoomState(roomId, (r) => ({
				...r,
				gameState: resetGame(r.gameState),
			}));
			broadcastState(roomId);
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
const serveFile = async (filePath: string, baseDir: string): Promise<Response> => {
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
			// Extract room ID from query params if present
			const roomId = url.searchParams.get("room")?.toLowerCase() ?? null;

			const success = server.upgrade(req, {
				data: { playerId, roomId },
			});
			if (success) {
				return undefined;
			}
			return new Response("WebSocket upgrade failed", { status: 400 });
		}

		// Serve static files
		// Landing page
		if (pathname === "/" || pathname === "/index.html") {
			return serveFile("src/client/index.html", "src/client");
		}

		// Room pages - serve the same HTML, client detects room from URL
		const roomMatch = pathname.match(/^\/room\/([a-z0-9]+)$/i);
		if (roomMatch) {
			return serveFile("src/client/index.html", "src/client");
		}

		// Serve CSS from public/
		if (pathname === "/styles.css") {
			return serveFile("public/styles.css", "public");
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
			const roomId = ws.data.roomId;
			connections.set(playerId, ws);
			console.log(`Client connected: ${playerId}${roomId ? ` to room ${roomId}` : ""}`);

			// If connecting to a room, check if room exists
			if (roomId) {
				const room = rooms.get(roomId);
				if (!room) {
					sendRoomError(ws, "Room not found");
					return;
				}
				// Send initial state to the new connection
				const msg: StateMessage = {
					type: "state",
					state: room.gameState,
					playerId,
					isAdmin: playerId === room.adminId,
				};
				ws.send(JSON.stringify(msg));
			}
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
			const roomId = ws.data.roomId;
			connections.delete(playerId);
			console.log(`Client disconnected: ${playerId}`);

			if (!roomId) return;

			const room = rooms.get(roomId);
			if (!room) return;

			// Remove player from room
			updateRoomState(roomId, (r) => ({
				...r,
				gameState: removePlayer(r.gameState, playerId),
			}));

			// Get updated room
			const updatedRoom = rooms.get(roomId);
			if (!updatedRoom) return;

			// If no players left, clean up the room
			if (updatedRoom.gameState.players.length === 0) {
				clearRoomTimer(roomId);
				rooms.delete(roomId);
				console.log(`Room ${roomId} deleted (empty)`);
				return;
			}

			// If the disconnected player was the admin, reassign admin to first remaining player
			if (updatedRoom.adminId === playerId) {
				const newAdminId = updatedRoom.gameState.players[0].id;
				rooms.set(roomId, { ...updatedRoom, adminId: newAdminId });
				console.log(`Admin reassigned from ${playerId} to ${newAdminId} in room ${roomId}`);
			}

			broadcastState(roomId);
		},
	},
});

console.log(`Server running on http://localhost:${server.port}`);

// Export for potential testing
export { connections, rooms };
